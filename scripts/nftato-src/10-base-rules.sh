# shellcheck shell=bash
setup_nftables_base() {
    local rules_file web_port
    local web_ports
    read -r -a web_ports <<<"80 443 ${NFTATO_WEB_PORTS//,/ }"

    # 自定义 Web 端口在修改防火墙前校验。80/443 始终作为初始默认值。
    for web_port in "${web_ports[@]}"; do
        if [[ ! "$web_port" =~ ^[0-9]{1,5}$ ]] || ((10#$web_port < 1 || 10#$web_port > 65535)); then
            echo "错误: 无效的 Web 端口: $web_port" >&2
            return 1
        fi
    done
    get_ssh_port
    mkdir -p /etc/nftables /etc/iptables
    touch "$keywords_file"
    rules_file=$(mktemp) || return 1
    {
        reset_nftato_tables
        cat <<EOF
table inet filter {
    chain input {
        type filter hook input priority 0; policy drop;
        ct state established,related accept
        iifname "lo" accept
        ip protocol icmp accept
        ip6 nexthdr icmpv6 accept
        ip ttl gt 80 accept
        tcp dport $PORT accept comment "shellsettcp"
        udp dport $PORT accept comment "shellsetudp"
EOF
        # 单端口规则沿用现有标签，WebUI 可查看并单独取消放行。
        for web_port in $(printf '%s\n' "${web_ports[@]}" | sort -nu); do
            if [ "$web_port" -ne "$PORT" ]; then
                echo "        tcp dport $((10#$web_port)) accept comment \"shellsettcp\""
            fi
        done
        cat <<'EOF'
    }
    chain output {
        type filter hook output priority 0; policy accept;
    }
    chain forward {
        type filter hook forward priority 0; policy drop;
        ct state invalid drop
        # 按接口名匹配，也支持初始化后创建的 Docker bridge，不绑定外网网卡名。
        iifname "docker0" accept comment "nftato-docker-out"
        iifname "br-*" accept comment "nftato-docker-out"
        oifname "docker0" ct state established,related accept comment "nftato-docker-reply"
        oifname "br-*" ct state established,related accept comment "nftato-docker-reply"
    }
}
table inet mangle {
    chain prerouting {
        type filter hook prerouting priority -150;
    }
    chain output {
        type filter hook output priority -150;
    }
}
EOF
    } >"$rules_file"

    if ! nft -f "$rules_file"; then
        rm -f "$rules_file"
        echo "错误: 初始化失败，原有防火墙规则未更改" >&2
        return 1
    fi
    rm -f "$rules_file"
    save_nftables_rules
}

# 获取SSH端口
get_ssh_port() {
    # SSH_CONNECTION 的最后一项是当前连接的服务端端口（兼容 IPv6）。
    PORT=${SSH_CONNECTION##* }
    if [[ ! "$PORT" =~ ^[0-9]{1,5}$ ]] || ((10#$PORT < 1 || 10#$PORT > 65535)); then
        PORT=$(ss -H -ltnp 2>/dev/null | awk '/sshd/ {n=split($4, address, ":"); print address[n]; exit}')
    fi
    if [[ ! "$PORT" =~ ^[0-9]{1,5}$ ]] || ((10#$PORT < 1 || 10#$PORT > 65535)); then
        PORT=$(netstat -lntp 2>/dev/null | awk '/sshd/ {n=split($4, address, ":"); print address[n]; exit}')
    fi
    if [[ ! "$PORT" =~ ^[0-9]{1,5}$ ]] || ((10#$PORT < 1 || 10#$PORT > 65535)); then
        PORT=22
    fi
    PORT=$((10#$PORT))
}

# 放行SSH端口
able_ssh_port() {
    s="add"
    get_ssh_port
    # 清除可能存在的旧规则
    nft -a list chain inet filter input | grep "tcp dport $PORT" | while read -r line; do
        handle=$(echo "$line" | grep -o "handle [0-9]*" | awk '{print $2}')
        if [ -n "$handle" ]; then
            nft delete rule inet filter input handle $handle
        fi
    done

    # 添加新规则
    nft add rule inet filter input tcp dport $PORT accept comment \"shellsettcp\"
    nft add rule inet filter input udp dport $PORT accept comment \"shellsetudp\"

    echo "已放行SSH端口 $PORT"
    save_nftables_rules
}

# 保存nftables规则
save_nftables_rules() {
    echo "正在保存nftables规则..."

    # 只持久化本项目的表，避免在重载时复活 Docker 的旧网络/容器规则。
    local family table saved_rules table_rules
    local service_conf="$nft_conf"
    saved_rules=$(mktemp "${nft_ruleset}.XXXXXX") || return 1
    reset_nftato_tables >"$saved_rules"
    while read -r family table; do
        if nft list table "$family" "$table" >/dev/null 2>&1; then
            if ! table_rules=$(nft list table "$family" "$table"); then
                rm -f "$saved_rules"
                return 1
            fi
            printf '%s\n' "$table_rules" >>"$saved_rules"
        elif [ "$family" = inet ]; then
            echo "错误: 无法读取 $family $table，保留原有规则文件" >&2
            rm -f "$saved_rules"
            return 1
        fi
    done < <(nftato_tables)
    if ! nft -c -f "$saved_rules"; then
        rm -f "$saved_rules"
        return 1
    fi
    mv "$saved_rules" "$nft_ruleset" || return 1

    # 为CentOS特别处理
    if [ "$release" == "centos" ]; then
        service_conf="/etc/sysconfig/nftables.conf"
        # 确保/etc/sysconfig目录存在
        mkdir -p /etc/sysconfig

        # 创建CentOS特定的nftables配置文件
        cat >/etc/sysconfig/nftables.conf <<EOF
# 加载主规则文件
include "$nft_ruleset"
EOF
        chmod 600 /etc/sysconfig/nftables.conf
        # 还原SELinux上下文（如果存在）
        if command -v restorecon &>/dev/null; then
            restorecon -v /etc/sysconfig/nftables.conf || true
        fi
    else
        # 其他发行版的处理
        # 创建nftables配置文件
        cat >$nft_conf <<EOF
#!/usr/sbin/nft -f

include "$nft_ruleset"
EOF
    fi

    # 确保权限正确
    chmod 644 $nft_ruleset

    # 部分发行版的 ExecStop/ExecReload 会全局清空规则，统一使用本项目配置。
    # 当前规则已经生效，保存时无需重启服务。
    if command -v systemctl &>/dev/null; then
        mkdir -p /etc/systemd/system/nftables.service.d
        cat >/etc/systemd/system/nftables.service.d/nftato.conf <<EOF
[Service]
ExecStart=
ExecStart=$(command -v nft) -f $service_conf
ExecReload=
ExecReload=$(command -v nft) -f $service_conf
ExecStop=
EOF
        systemctl daemon-reload || return 1
        systemctl enable nftables || return 1
    fi

    echo "nftables规则保存完成"
}

# 显示SSH端口信息
display_ssh() {
    get_ssh_port
    echo
    echo "SSH 端口为 ${PORT}"
    echo
}

# 出网端口控制函数
# 显示已封禁的出网端口
