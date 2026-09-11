#!/usr/bin/env bash
# Run only in a disposable privileged Linux container (see tests/README.md).
set -eo pipefail
[[ -f /.dockerenv ]] || { echo 'Run this test in the documented disposable container.' >&2; exit 1; }
cd /workspace
cmp Nftato.sh server/scripts/Nftato.sh
# Load definitions without root checks, installation, or the interactive entrypoint.
source <(sed '/^# 主程序/,$d' Nftato.sh | sed '/^\[\[ \$EUID /d')
release=debian
NFTATO_WEB_PORTS='3001,8443'
SSH_CONNECTION='2001:db8::1 51000 2001:db8::2 2222'
systemctl() { printf '%s\n' "$*" >>/tmp/systemctl.calls; }

# A router namespace is the container itself. Three separate namespaces model
# an external host and containers on default / user-defined Docker bridges.
for namespace in wan default custom; do
    ip netns add "$namespace"
    ip -n "$namespace" link set lo up
done
ip link add uplink type veth peer name wan0
ip link set wan0 netns wan
ip addr add 192.0.2.1/24 dev uplink
ip -6 addr add 2001:db8:1::1/64 dev uplink nodad
ip link set uplink up
ip -n wan addr add 192.0.2.2/24 dev wan0
ip -n wan -6 addr add 2001:db8:1::2/64 dev wan0 nodad
ip -n wan link set wan0 up
for entry in 'docker0 default 18' 'br-test custom 19'; do
    read -r bridge namespace subnet <<<"$entry"
    ip link add "$bridge" type bridge
    ip addr add "172.$subnet.0.1/24" dev "$bridge"
    ip -6 addr add "2001:db8:${subnet}::1/64" dev "$bridge" nodad
    ip link set "$bridge" up
    ip link add "v-$namespace" type veth peer name eth0
    ip link set eth0 netns "$namespace"
    ip link set "v-$namespace" master "$bridge"
    ip link set "v-$namespace" up
    ip -n "$namespace" addr add "172.$subnet.0.2/24" dev eth0
    ip -n "$namespace" -6 addr add "2001:db8:${subnet}::2/64" dev eth0 nodad
    ip -n "$namespace" link set eth0 up
    ip -n "$namespace" route add default via "172.$subnet.0.1"
    ip -n "$namespace" -6 route add default via "2001:db8:${subnet}::1"
    ip -n wan -6 route add "2001:db8:${subnet}::/64" via 2001:db8:1::1
done
sysctl -qw net.ipv4.ip_forward=1
sysctl -qw net.ipv6.conf.all.forwarding=1
# Model Docker's iptables backend with real NAT and a user isolation rule.
iptables -N DOCKER-USER
iptables -A FORWARD -j DOCKER-USER
iptables -A DOCKER-USER -i docker0 -o br-test -j DROP
iptables -t nat -N DOCKER
iptables -t nat -A POSTROUTING -s 172.18.0.0/15 -o uplink -j MASQUERADE
# Also preserve the native nftables backend's table names and an unrelated table.
nft add table ip docker-bridges
nft add table ip6 docker-bridges
nft add table inet unrelated
snapshot_docker() { iptables-save | sed -E '/^#/d; s/\[[0-9]+:[0-9]+\]/[0:0]/g'; nft list table ip docker-bridges; nft list table ip6 docker-bridges; nft list table inet unrelated; }
snapshot_docker >/tmp/docker.before

# Fail if initialization tries to stop/flush/save iptables or restart services.
disable_conflicting_firewalls
setup_nftables_base
snapshot_docker >/tmp/docker.after
cmp /tmp/docker.before /tmp/docker.after
! grep -Eq 'restart|stop|start' /tmp/systemctl.calls
! grep -Eq 'DOCKER|docker-bridges|unrelated|flush ruleset' "$nft_ruleset" "$nft_conf"
grep -q '^ExecStop=$' /etc/systemd/system/nftables.service.d/nftato.conf

# HTTP listeners in each namespace let us test packet flow without the internet.
start_http() {
    local namespace=$1 port=$2 attempt
    local prefix=()
    [ "$namespace" = host ] || prefix=(ip netns exec "$namespace")
    "${prefix[@]}" python3 /workspace/tests/http-fixture.py "$port" >"/tmp/http-$namespace-$port.log" 2>&1 &
    for attempt in {1..100}; do
        if "${prefix[@]}" curl --noproxy '*' -fsS --max-time 0.2 "http://127.0.0.1:$port/" >/dev/null 2>&1; then
            return
        fi
        sleep 0.1
    done
    cat "/tmp/http-$namespace-$port.log" >&2
    echo "HTTP fixture failed to start: $namespace:$port" >&2
    exit 1
}
for port in 80 443 2222 3001 8443 9999; do start_http host "$port"; done
for namespace in wan default custom; do start_http "$namespace" 8080; done
fetch() { ip netns exec "$1" curl --noproxy '*' -fsS --connect-timeout 1 --max-time 2 "http://$2:$3/" >/dev/null 2>&1; }
blocked() { if fetch "$@"; then echo "Unexpected connection: $*" >&2; exit 1; fi; }
for port in 80 443 2222 3001 8443; do fetch wan 192.0.2.1 "$port"; done
blocked wan 192.0.2.1 9999
for port in 80 443 2222; do fetch wan '[2001:db8:1::1]' "$port"; done
blocked wan '[2001:db8:1::1]' 9999
# Host egress, container egress + stateful reply, and Docker isolation.
curl --noproxy '*' -fsS --max-time 2 http://192.0.2.2:8080/ >/dev/null
fetch default 192.0.2.2 8080
fetch custom 192.0.2.2 8080
fetch default '[2001:db8:1::2]' 8080
fetch custom '[2001:db8:1::2]' 8080
blocked wan '[2001:db8:18::2]' 8080
blocked default 172.19.0.2 8080
ip -n wan route add 172.18.0.0/15 via 192.0.2.1
blocked wan 172.18.0.2 8080
blocked wan 172.19.0.2 8080

# Ordinary save/reload must preserve user edits, not re-open removed web ports.
handle=$(nft -a list chain inet filter input | awk '/tcp dport 80 / {print $NF}')
nft delete rule inet filter input handle "$handle"
save_nftables_rules
nft -f "$nft_conf"
blocked wan 192.0.2.1 80
fetch custom 192.0.2.2 8080
snapshot_docker >/tmp/docker.after
cmp /tmp/docker.before /tmp/docker.after

# Rebuild restores documented defaults; repeated loads neither duplicate rules
# nor restore a Docker network that was deleted after saving.
clear_rebuild_ipta
nft list table inet filter >/tmp/filter.before
nft delete table ip docker-bridges
nft -f "$nft_conf"
nft -f "$nft_conf"
! nft list table ip docker-bridges 2>/dev/null
nft list table inet filter >/tmp/filter.after
cmp /tmp/filter.before /tmp/filter.after
fetch wan 192.0.2.1 80
fetch default 192.0.2.2 8080
fetch custom 192.0.2.2 8080
blocked wan 192.0.2.1 9999
blocked wan 172.19.0.2 8080

# Invalid configuration and failed transactions must not change live rules.
for value in 0 65536 '-1' '80; accept' '8080,,bad' '*'; do
    NFTATO_WEB_PORTS=$value
    if setup_nftables_base; then echo "Accepted invalid port: $value" >&2; exit 1; fi
    nft list table inet filter >/tmp/filter.after
    cmp /tmp/filter.before /tmp/filter.after
done
NFTATO_WEB_PORTS=3001
nft() { if [ "$1" = -f ]; then return 1; fi; command nft "$@"; }
if setup_nftables_base; then echo 'Ignored failed nft transaction' >&2; exit 1; fi
unset -f nft
nft list table inet filter >/tmp/filter.after
cmp /tmp/filter.before /tmp/filter.after

# IPv6 listeners must be parsed correctly when SSH_CONNECTION is unavailable.
SSH_CONNECTION=''
ss() { echo 'LISTEN 0 128 [::]:2200 [::]:* users:(("sshd",pid=1,fd=3))'; }
get_ssh_port
[ "$PORT" = 2200 ]
unset -f ss
SSH_CONNECTION='192.0.2.2 50000 192.0.2.1 443'
NFTATO_WEB_PORTS='080,00443,3001,3001'
setup_nftables_base
[ "$(nft list chain inet filter input | grep -c 'tcp dport 443 ')" = 1 ]
[ "$(nft list chain inet filter input | grep -c 'tcp dport 3001 ')" = 1 ]

# Exercise the actual automated entrypoint (first run + reinitialization),
# stubbing only package installation and service management.
{
    sed '/^# 主程序/,$d' Nftato.sh
    cat <<'SH'
checkfile=/tmp/nftato-first-run
check_system() { release=debian; }
check_docker_env() { :; }
install_nftables() { :; }
install_tool() { :; }
install_nftables_modules() { USE_IPTABLES_FOR_KEYWORDS=1; }
systemctl() { :; }
nft() {
    if [ "$1" = -f ]; then
        echo apply >>/tmp/nftato-applies
        [ "$NFTATO_TEST_FAIL" != 1 ] || return 1
    fi
    command nft "$@"
}
SH
    sed -n '/^# 主程序/,$p' Nftato.sh
} >/tmp/nftato-entrypoint.sh
if AUTOMATED=yes NFTATO_TEST_FAIL=1 bash /tmp/nftato-entrypoint.sh; then
    echo 'Failed first-run initialization returned success' >&2
    exit 1
fi
[ ! -e /tmp/nftato-first-run ]
for iteration in 1 2; do
    : >/tmp/nftato-applies
    AUTOMATED=yes bash /tmp/nftato-entrypoint.sh
    [ -e /tmp/nftato-first-run ]
    [ "$(wc -l </tmp/nftato-applies)" -eq 1 ]
done
fetch custom 192.0.2.2 8080

# Both distribution entrypoints must load scoped, repeatable snapshots.
release=centos
save_nftables_rules
nft -f /etc/sysconfig/nftables.conf
nft -f /etc/sysconfig/nftables.conf
fetch custom 192.0.2.2 8080
# The standalone CentOS initializer must retain Docker networking too.
nft add table ip docker-bridges
snapshot_docker >/tmp/docker.before
export -f systemctl
bash intcentos.sh >/tmp/intcentos.log 2>&1
snapshot_docker >/tmp/docker.after
cmp /tmp/docker.before /tmp/docker.after
nft -f /etc/sysconfig/nftables.conf
fetch wan 192.0.2.1 80
fetch wan 192.0.2.1 443
fetch custom 192.0.2.2 8080
blocked wan 172.19.0.2 8080
printf '%s\n' 'PASS: web/SSH access, Docker egress/replies/isolation, inbound blocking, NAT preservation, save/reload/rebuild, error handling.'
