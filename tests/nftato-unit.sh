#!/usr/bin/env bash
set -euo pipefail

repository_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
test_path=$PATH
cd "$repository_root"

# Load definitions only; the generated script entrypoint is tested separately.
for module in scripts/nftato-src/{00-runtime,10-base-rules,20-outbound,30-inbound,40-ddos,50-cli}.sh; do
    # shellcheck source=/dev/null
    source "$module"
done
PATH=$test_path

[[ "$(resolve_action outbound:block-ports)" == 4 ]]
[[ "$(resolve_action inbound:allow-addresses)" == 17 ]]
[[ "$(resolve_action ddos:status)" == 25 ]]
[[ "$(resolve_action 16)" == 16 ]]

validate_port_list 22
validate_port_list 80,443,8000-8010
validate_port_list 8000:8010
validate_single_port 443
! validate_single_port 80,443
! validate_port_list 0
! validate_port_list 65536
! validate_port_list '80;id'
! validate_port_list 9000-8000
! validate_port_list 80-90-100
! validate_port_list 80:90:100
! validate_port_list '80,'
! validate_port_list ',80'
! validate_port_list '80,,443'

validate_keyword example.com
validate_keyword 'tracker.example/path?q=1'
validate_keyword "John's download path /files/archive?a=1&b=2"
validate_keyword 'a.* literal URL/path;value'
! validate_keyword '   '
! validate_keyword $'example.com\nwhoami'
! validate_keyword $'example.com\twhoami'

validate_ip_or_cidr_list 192.0.2.1
validate_ip_or_cidr_list 192.0.2.0/24
validate_ip_or_cidr_list '2001:db8::1,2001:db8:1::/64'
validate_ip_or_cidr_list '::1'
validate_ip_or_cidr_list '::ffff:192.0.2.1/128'
! validate_ip_or_cidr_list '192.0.2.1;id'
! validate_ip_or_cidr_list '999.999.999.999'
! validate_ip_or_cidr_list '192.0.2.1/33'
! validate_ip_or_cidr_list '2001:db8::1/129'
! validate_ip_or_cidr_list '2001:db8::1::2'
! validate_ip_or_cidr_list '::::'
! validate_ip_or_cidr_list '192.0.2.1,'
! validate_ip_or_cidr_list ',192.0.2.1'
! validate_ip_or_cidr_list '192.0.2.1,,2001:db8::1'

validate_named_invocation outbound:block-ports 443
validate_named_invocation ddos:ip-list 1 192.0.2.1
validate_named_invocation ddos:custom-port 8080 1 400 400 300 24
! validate_named_invocation outbound:block-ports 2>/dev/null
! validate_named_invocation ddos:ip-list 1 2>/dev/null
! validate_named_invocation ddos:custom-port 8080 2>/dev/null
! validate_named_invocation ddos:status unexpected 2>/dev/null

validate_integer_range 1 1 1000000
validate_integer_range 1000000 1 1000000
! validate_integer_range 0 1 1000000
! validate_integer_range 1000001 1 1000000

# Keyword persistence and iptables operations must treat the keyword as one
# literal argument. In particular, regex characters cannot match or remove a
# neighboring record, and spaces/apostrophes/slashes survive add/delete.
keyword_test_dir=$(mktemp -d "${TMPDIR:-/tmp}/nftato-keywords.XXXXXX")
keywords_file="$keyword_test_dir/keywords.txt"
iptables_keyword_log="$keyword_test_dir/iptables-keywords.txt"
keyword_rule_present=0
modprobe() { :; }
lsmod() { printf '%s\n' xt_string; }
save_iptables_rules() { :; }
iptables() {
    local action='' argument previous=''
    for argument in "$@"; do
        if [[ "$previous" == "--string" ]]; then
            printf '%s\t%s\n' "$action" "$argument" >>"$iptables_keyword_log"
        fi
        case "$argument" in
            -A|-C|-D) action=$argument ;;
        esac
        previous=$argument
    done
    case " $* " in
        *' -A '*) keyword_rule_present=1 ;;
        *' -C '*) [[ $keyword_rule_present -eq 1 ]] ;;
        *' -D '*) keyword_rule_present=0 ;;
    esac
}
literal_keyword="a.* path/John's?x=1&y=2"
neighbor_keyword="axxx path/John's?x=1&y=2"
printf '%s\n' "$neighbor_keyword" >"$keywords_file"
key_word=$literal_keyword
s=add
set_out_keywords
grep -Fxq -- "$literal_keyword" "$keywords_file"
grep -Fxq -- "$neighbor_keyword" "$keywords_file"
[[ $(grep -Fxc -- "$literal_keyword" "$keywords_file") -eq 1 ]]
s=delete
set_out_keywords
! grep -Fxq -- "$literal_keyword" "$keywords_file"
grep -Fxq -- "$neighbor_keyword" "$keywords_file"
grep -Fqx -- $'-A\ta.* path/John\'s?x=1&y=2' "$iptables_keyword_log"
grep -Fqx -- $'-C\ta.* path/John\'s?x=1&y=2' "$iptables_keyword_log"
grep -Fqx -- $'-D\ta.* path/John\'s?x=1&y=2' "$iptables_keyword_log"
rm -rf -- "$keyword_test_dir"

bash scripts/build-nftato.sh --check
help_output=$(bash Nftato.sh --help)
[[ "$help_output" == *'outbound:block-ports'* ]]
json_output=$(bash Nftato.sh --json --help)
node -e 'const value = JSON.parse(process.argv[1]); if (!value.success || value.command !== "--help") process.exit(1)' "$json_output"
node - <<'NODE'
const { spawnSync } = require('node:child_process');
const result = spawnSync('bash', ['Nftato.sh', '--json'], { encoding: 'utf8', timeout: 2000 });
if (result.error || result.signal || result.status !== 0) process.exit(1);
const value = JSON.parse(result.stdout);
if (!value.success || value.command !== 'help' || !value.output.includes('使用方法')) process.exit(1);
NODE

# Replace environment/firewall functions in a disposable copy so the real
# entrypoint can be exercised without root privileges or host changes.
entrypoint=$(mktemp "${TMPDIR:-/tmp}/nftato-entrypoint.XXXXXX")
trap 'rm -f -- "$entrypoint"; rm -rf -- "${keyword_test_dir:-}"' EXIT
{
    sed '/^# 主程序/,$d' Nftato.sh
    cat <<'SH'
require_root() { :; }
check_system() { release=debian; }
check_run() { runflag=1; }
check_docker_env() { :; }
check_filtering_mode() { :; }
shell_run_tips() { :; }
view_all_disable_out() { echo INTERACTIVE_ACTION_RAN; }
set_out_ports() { return 7; }
SH
    sed -n '/^# 主程序/,$p' Nftato.sh
} >"$entrypoint"

interactive_output=$(printf '0\n' | bash "$entrypoint")
[[ "$interactive_output" == *'nftables防火墙 管理脚本'* ]]
[[ "$interactive_output" == *'INTERACTIVE_ACTION_RAN'* ]]

set +e
json_failure=$(bash "$entrypoint" --json outbound:block-ports 443)
json_failure_status=$?
missing_argument=$(bash "$entrypoint" --json outbound:block-ports)
missing_argument_status=$?
automated_rejection=$(AUTOMATED=yes bash "$entrypoint" --json ddos:status)
automated_rejection_status=$?
set -e
[[ $json_failure_status -eq 1 ]]
[[ $missing_argument_status -eq 2 ]]
[[ $automated_rejection_status -eq 2 ]]
node -e '
for (const encoded of process.argv.slice(1)) {
  const value = JSON.parse(encoded);
  if (value.success || value.exitCode === 0) process.exit(1);
}
' "$json_failure" "$missing_argument" "$automated_rejection"

printf '%s\n' 'PASS: Nftato build, named commands, validation, interactive compatibility, automation guard and JSON exit status.'
