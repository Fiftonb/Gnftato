# shellcheck shell=bash
check_network_env() {
    # 检测是否能连接到Google，判断是否在国内网络
    ping -c2 -i0.3 -W1 www.google.com &>/dev/null
    if [ $? -eq 0 ]; then
        # 能连接到Google，可能在国外或使用了代理
        echo "检测到可直接访问国际网络"
        IN_CHINA=0
    else
        # 不能连接到Google，可能在国内
        echo "检测到当前可能处于国内网络环境"
        IN_CHINA=1
    fi
}

# DDoS防御功能相关函数
# 设置HTTP/HTTPS DDoS防御
setup_ddos_protection() {
    echo "正在配置DDoS防御规则..."

    # 检查是否已配置防御规则
    if nft list tables | grep -q "edge_dft_v4"; then
        echo -e "${Yellow_font_prefix}[警告]${Font_color_suffix} 检测到已存在DDoS防御规则，将先清除旧规则"
        nft delete table ip edge_dft_v4 2>/dev/null || return 1
        nft delete table ip6 edge_dft_v6 2>/dev/null || true
    fi

    # 创建IPv4防御表和集合
    nft add table ip edge_dft_v4 || return 1
    nft add set ip edge_dft_v4 allow_set { type ipv4_addr\; flags timeout\; } || return 1
    nft add set ip edge_dft_v4 deny_set { type ipv4_addr\; size 65535\; flags timeout\; } || return 1

    # 创建基础输入链
    nft add chain ip edge_dft_v4 input { type filter hook input priority 0\; policy accept\; } || return 1

    # 添加基本规则
    nft add rule ip edge_dft_v4 input iifname "lo" accept || return 1
    nft add rule ip edge_dft_v4 input ip saddr @allow_set accept || return 1
    nft add rule ip edge_dft_v4 input ip saddr @deny_set drop || return 1

    # 添加SSH防暴力破解规则
    get_ssh_port
    nft add rule ip edge_dft_v4 input tcp dport "$PORT" ct state new limit rate 15/minute log prefix \"New SSH connection: \" counter accept comment \"Avoid brute force on SSH\" || return 1

    # 添加HTTP防御规则
    nft add rule ip edge_dft_v4 input tcp dport http ct count over 100000 counter packets 0 bytes 0 drop comment \"ZZtcp_80_maxConnections_100000ZZ\" || return 1
    nft add rule ip edge_dft_v4 input tcp dport http meter meter-ip-80-max-connections size 65535 { ip saddr ct count over 600 } counter packets 0 bytes 0 drop comment \"ZZtcp_80_maxConnectionsPerIP_600ZZ\" || return 1
    nft add rule ip edge_dft_v4 input tcp dport http ct state new meter meter-ip-80-new-connections-rate size 65535 { ip saddr limit rate over 500/minute burst 603 packets} add @deny_set { ip saddr timeout 24h } comment \"ZZtcp_80_newConnectionsRate_500_86400ZZ\" || return 1
    nft add rule ip edge_dft_v4 input tcp dport http ct state new meter meter-ip-80-new-connections-secondly-rate size 65535 { ip saddr limit rate over 300/second burst 303 packets} add @deny_set { ip saddr timeout 24h } comment \"ZZtcp_80_newConnectionsSecondlyRate_300_86400ZZ\" || return 1

    # 添加HTTPS防御规则
    nft add rule ip edge_dft_v4 input tcp dport https ct count over 100000 counter packets 0 bytes 0 drop comment \"ZZtcp_443_maxConnections_100000ZZ\" || return 1
    nft add rule ip edge_dft_v4 input tcp dport https meter meter-ip-443-max-connections size 65535 { ip saddr ct count over 600 } counter packets 0 bytes 0 drop comment \"ZZtcp_443_maxConnectionsPerIP_600ZZ\" || return 1
    nft add rule ip edge_dft_v4 input tcp dport https ct state new meter meter-ip-443-new-connections-rate size 65535 { ip saddr limit rate over 500/minute burst 603 packets} add @deny_set { ip saddr timeout 24h } comment \"ZZtcp_443_newConnectionsRate_500_86400ZZ\" || return 1
    nft add rule ip edge_dft_v4 input tcp dport https ct state new meter meter-ip-443-new-connections-secondly-rate size 65535 { ip saddr limit rate over 300/second burst 303 packets} add @deny_set { ip saddr timeout 24h } comment \"ZZtcp_443_newConnectionsSecondlyRate_300_86400ZZ\" || return 1

    # 配置IPv6防御规则
    setup_ipv6_ddos_protection || return 1

    save_nftables_rules || return 1
    echo -e "${Green_font_prefix}[成功]${Font_color_suffix} DDoS防御规则已配置完成!"
}

# 设置IPv6 DDoS防御
setup_ipv6_ddos_protection() {
    # 创建IPv6防御表和集合
    nft add table ip6 edge_dft_v6 || return 1
    nft add set ip6 edge_dft_v6 allow_set { type ipv6_addr\; flags timeout\; } || return 1
    nft add set ip6 edge_dft_v6 deny_set { type ipv6_addr\; size 65535\; flags timeout\; } || return 1

    # 创建基础输入链
    nft add chain ip6 edge_dft_v6 input { type filter hook input priority 0\; policy accept\; } || return 1

    # 添加基本规则
    nft add rule ip6 edge_dft_v6 input iifname "lo" accept || return 1
    nft add rule ip6 edge_dft_v6 input ip6 saddr @allow_set accept || return 1
    nft add rule ip6 edge_dft_v6 input ip6 saddr @deny_set drop || return 1

    # 添加SSH防暴力破解规则
    get_ssh_port
    nft add rule ip6 edge_dft_v6 input tcp dport "$PORT" ct state new limit rate 15/minute log prefix \"New SSH connection: \" counter packets 0 bytes 0 accept comment \"Avoid brute force on SSH\" || return 1

    # 添加HTTP防御规则
    nft add rule ip6 edge_dft_v6 input tcp dport http ct count over 100000 counter packets 0 bytes 0 drop comment \"ZZtcp_80_maxConnections_100000ZZ\" || return 1
    nft add rule ip6 edge_dft_v6 input tcp dport http meter meter-ip6-80-max-connections size 65535 { ip6 saddr ct count over 600 } counter packets 0 bytes 0 drop comment \"ZZtcp_80_maxConnectionsPerIP_600ZZ\" || return 1
    nft add rule ip6 edge_dft_v6 input tcp dport http ct state new meter meter-ip6-80-new-connections-rate size 65535 { ip6 saddr limit rate over 500/minute burst 603 packets} add @deny_set { ip6 saddr timeout 24h } comment \"ZZtcp_80_newConnectionsRate_500_86400ZZ\" || return 1
    nft add rule ip6 edge_dft_v6 input tcp dport http ct state new meter meter-ip6-80-new-connections-secondly-rate size 65535 { ip6 saddr limit rate over 300/second burst 303 packets} add @deny_set { ip6 saddr timeout 24h } comment \"ZZtcp_80_newConnectionsSecondlyRate_300_86400ZZ\" || return 1

    # 添加HTTPS防御规则
    nft add rule ip6 edge_dft_v6 input tcp dport https ct count over 100000 counter packets 0 bytes 0 drop comment \"ZZtcp_443_maxConnections_100000ZZ\" || return 1
    nft add rule ip6 edge_dft_v6 input tcp dport https meter meter-ip6-443-max-connections size 65535 { ip6 saddr ct count over 600 } counter packets 0 bytes 0 drop comment \"ZZtcp_443_maxConnectionsPerIP_600ZZ\" || return 1
    nft add rule ip6 edge_dft_v6 input tcp dport https ct state new meter meter-ip6-443-new-connections-rate size 65535 { ip6 saddr limit rate over 500/minute burst 603 packets} add @deny_set { ip6 saddr timeout 24h } comment \"ZZtcp_443_newConnectionsRate_500_86400ZZ\" || return 1
    nft add rule ip6 edge_dft_v6 input tcp dport https ct state new meter meter-ip6-443-new-connections-secondly-rate size 65535 { ip6 saddr limit rate over 300/second burst 303 packets} add @deny_set { ip6 saddr timeout 24h } comment \"ZZtcp_443_newConnectionsSecondlyRate_300_86400ZZ\" || return 1
}

# 自定义端口DDoS防御
setup_custom_port_protection() {
    echo -e "请输入需要防御的端口"
    read -e -p "(例如: 8080):" PORT
    [[ -z "${PORT}" ]] && echo "已取消..." && exit 0

    echo -e "请输入端口协议"
    echo -e "1. TCP"
    echo -e "2. UDP"
    echo -e "3. TCP+UDP"
    read -e -p "(默认: 1. TCP):" PROTO_TYPE
    [[ -z "${PROTO_TYPE}" ]] && PROTO_TYPE="1"

    echo -e "请输入每IP最大连接数"
    read -e -p "(默认: 600):" MAX_CONN
    [[ -z "${MAX_CONN}" ]] && MAX_CONN=600

    echo -e "请输入每IP每分钟最大新连接数"
    read -e -p "(默认: 500):" MAX_RATE_MIN
    [[ -z "${MAX_RATE_MIN}" ]] && MAX_RATE_MIN=500

    echo -e "请输入每IP每秒最大新连接数"
    read -e -p "(默认: 300):" MAX_RATE_SEC
    [[ -z "${MAX_RATE_SEC}" ]] && MAX_RATE_SEC=300

    echo -e "请输入违规IP封禁时长(小时)"
    read -e -p "(默认: 24小时):" BAN_HOURS
    [[ -z "${BAN_HOURS}" ]] && BAN_HOURS=24

    # 检查IPv4表是否存在
    if ! nft list tables | grep -q "edge_dft_v4"; then
        echo -e "${Yellow_font_prefix}[警告]${Font_color_suffix} 未检测到DDoS防御表，将先创建基础防御规则"
        setup_ddos_protection
    fi

    # 计算超时时间
    BAN_TIMEOUT="${BAN_HOURS}h"
    if [ "$BAN_HOURS" -eq "24" ]; then
        BAN_TIMEOUT="23h59m" # 稍微短一点以避免边界情况
    fi

    # 添加IPv4规则
    if [[ "$PROTO_TYPE" == "1" ]] || [[ "$PROTO_TYPE" == "3" ]]; then
        # TCP规则
        nft add rule ip edge_dft_v4 input tcp dport $PORT ct count over 100000 counter packets 0 bytes 0 drop comment \"ZZtcp_${PORT}_maxConnections_100000ZZ\"
        nft add rule ip edge_dft_v4 input tcp dport $PORT meter meter-ip-${PORT}-max-connections size 65535 { ip saddr ct count over $MAX_CONN } counter packets 0 bytes 0 drop comment \"ZZtcp_${PORT}_maxConnectionsPerIP_${MAX_CONN}ZZ\"
        nft add rule ip edge_dft_v4 input tcp dport $PORT ct state new meter meter-ip-${PORT}-new-connections-rate size 65535 { ip saddr limit rate over ${MAX_RATE_MIN}/minute burst $(($MAX_RATE_MIN + 103)) packets} add @deny_set { ip saddr timeout $BAN_TIMEOUT } comment \"ZZtcp_${PORT}_newConnectionsRate_${MAX_RATE_MIN}_${BAN_HOURS}ZZ\"
        nft add rule ip edge_dft_v4 input tcp dport $PORT ct state new meter meter-ip-${PORT}-new-connections-secondly-rate size 65535 { ip saddr limit rate over ${MAX_RATE_SEC}/second burst $(($MAX_RATE_SEC + 3)) packets} add @deny_set { ip saddr timeout $BAN_TIMEOUT } comment \"ZZtcp_${PORT}_newConnectionsSecondlyRate_${MAX_RATE_SEC}_${BAN_HOURS}ZZ\"
    fi

    if [[ "$PROTO_TYPE" == "2" ]] || [[ "$PROTO_TYPE" == "3" ]]; then
        # UDP规则
        nft add rule ip edge_dft_v4 input udp dport $PORT ct count over 100000 counter packets 0 bytes 0 drop comment \"ZZudp_${PORT}_maxConnections_100000ZZ\"
        nft add rule ip edge_dft_v4 input udp dport $PORT meter meter-ip-${PORT}-udp-max-connections size 65535 { ip saddr ct count over $MAX_CONN } counter packets 0 bytes 0 drop comment \"ZZudp_${PORT}_maxConnectionsPerIP_${MAX_CONN}ZZ\"
        nft add rule ip edge_dft_v4 input udp dport $PORT ct state new meter meter-ip-${PORT}-udp-new-connections-rate size 65535 { ip saddr limit rate over ${MAX_RATE_MIN}/minute burst $(($MAX_RATE_MIN + 103)) packets} add @deny_set { ip saddr timeout $BAN_TIMEOUT } comment \"ZZudp_${PORT}_newConnectionsRate_${MAX_RATE_MIN}_${BAN_HOURS}ZZ\"
        nft add rule ip edge_dft_v4 input udp dport $PORT ct state new meter meter-ip-${PORT}-udp-new-connections-secondly-rate size 65535 { ip saddr limit rate over ${MAX_RATE_SEC}/second burst $(($MAX_RATE_SEC + 3)) packets} add @deny_set { ip saddr timeout $BAN_TIMEOUT } comment \"ZZudp_${PORT}_newConnectionsSecondlyRate_${MAX_RATE_SEC}_${BAN_HOURS}ZZ\"
    fi

    # 也为IPv6添加规则
    if [[ "$PROTO_TYPE" == "1" ]] || [[ "$PROTO_TYPE" == "3" ]]; then
        # IPv6 TCP规则
        nft add rule ip6 edge_dft_v6 input tcp dport $PORT ct count over 100000 counter packets 0 bytes 0 drop comment \"ZZtcp_${PORT}_maxConnections_100000ZZ\"
        nft add rule ip6 edge_dft_v6 input tcp dport $PORT meter meter-ip6-${PORT}-max-connections size 65535 { ip6 saddr ct count over $MAX_CONN } counter packets 0 bytes 0 drop comment \"ZZtcp_${PORT}_maxConnectionsPerIP_${MAX_CONN}ZZ\"
        nft add rule ip6 edge_dft_v6 input tcp dport $PORT ct state new meter meter-ip6-${PORT}-new-connections-rate size 65535 { ip6 saddr limit rate over ${MAX_RATE_MIN}/minute burst $(($MAX_RATE_MIN + 103)) packets} add @deny_set { ip6 saddr timeout $BAN_TIMEOUT } comment \"ZZtcp_${PORT}_newConnectionsRate_${MAX_RATE_MIN}_${BAN_HOURS}ZZ\"
        nft add rule ip6 edge_dft_v6 input tcp dport $PORT ct state new meter meter-ip6-${PORT}-new-connections-secondly-rate size 65535 { ip6 saddr limit rate over ${MAX_RATE_SEC}/second burst $(($MAX_RATE_SEC + 3)) packets} add @deny_set { ip6 saddr timeout $BAN_TIMEOUT } comment \"ZZtcp_${PORT}_newConnectionsSecondlyRate_${MAX_RATE_SEC}_${BAN_HOURS}ZZ\"
    fi

    if [[ "$PROTO_TYPE" == "2" ]] || [[ "$PROTO_TYPE" == "3" ]]; then
        # IPv6 UDP规则
        nft add rule ip6 edge_dft_v6 input udp dport $PORT ct count over 100000 counter packets 0 bytes 0 drop comment \"ZZudp_${PORT}_maxConnections_100000ZZ\"
        nft add rule ip6 edge_dft_v6 input udp dport $PORT meter meter-ip6-${PORT}-udp-max-connections size 65535 { ip6 saddr ct count over $MAX_CONN } counter packets 0 bytes 0 drop comment \"ZZudp_${PORT}_maxConnectionsPerIP_${MAX_CONN}ZZ\"
        nft add rule ip6 edge_dft_v6 input udp dport $PORT ct state new meter meter-ip6-${PORT}-udp-new-connections-rate size 65535 { ip6 saddr limit rate over ${MAX_RATE_MIN}/minute burst $(($MAX_RATE_MIN + 103)) packets} add @deny_set { ip6 saddr timeout $BAN_TIMEOUT } comment \"ZZudp_${PORT}_newConnectionsRate_${MAX_RATE_MIN}_${BAN_HOURS}ZZ\"
        nft add rule ip6 edge_dft_v6 input udp dport $PORT ct state new meter meter-ip6-${PORT}-udp-new-connections-secondly-rate size 65535 { ip6 saddr limit rate over ${MAX_RATE_SEC}/second burst $(($MAX_RATE_SEC + 3)) packets} add @deny_set { ip6 saddr timeout $BAN_TIMEOUT } comment \"ZZudp_${PORT}_newConnectionsSecondlyRate_${MAX_RATE_SEC}_${BAN_HOURS}ZZ\"
    fi

    save_nftables_rules
    echo -e "${Green_font_prefix}[成功]${Font_color_suffix} 端口 $PORT 的DDoS防御规则已配置完成!"
}

# 管理IP黑白名单
manage_ip_lists() {
    clear
    echo -e "==========IP黑白名单管理=========="
    echo -e "${Green_font_prefix}1.${Font_color_suffix} 添加IP到白名单"
    echo -e "${Green_font_prefix}2.${Font_color_suffix} 添加IP到黑名单"
    echo -e "${Green_font_prefix}3.${Font_color_suffix} 从白名单移除IP"
    echo -e "${Green_font_prefix}4.${Font_color_suffix} 从黑名单移除IP"
    echo -e "${Green_font_prefix}5.${Font_color_suffix} 查看白名单"
    echo -e "${Green_font_prefix}6.${Font_color_suffix} 查看黑名单"
    echo -e "${Green_font_prefix}0.${Font_color_suffix} 返回主菜单"
    echo -e "=================================="

    read -e -p "请输入数字 [0-6]:" manage_choice
    case "$manage_choice" in
    1) add_to_whitelist ;;
    2) add_to_blacklist ;;
    3) remove_from_whitelist ;;
    4) remove_from_blacklist ;;
    5) view_whitelist ;;
    6) view_blacklist ;;
    0) return ;;
    *) echo "请输入正确数字 [0-6]" ;;
    esac
}

# 添加IP到白名单
add_to_whitelist() {
    # 检查是否已设置防御规则
    if ! nft list tables | grep -q "edge_dft_v4"; then
        echo -e "${Error} 未检测到DDoS防御表，请先配置DDoS防御规则!"
        return
    fi

    echo -e "请输入要添加到白名单的IP地址"
    read -e -p "(例如: 1.2.3.4):" IP
    [[ -z "${IP}" ]] && echo "已取消..." && return

    # 设置超时时间（天）
    echo -e "请输入白名单有效期(天，0表示永久)"
    read -e -p "(默认: 0):" DAYS
    [[ -z "${DAYS}" ]] && DAYS=0

    # 判断IPv4或IPv6
    if [[ "$IP" == *":"* ]]; then
        # IPv6地址
        if [ "$DAYS" -eq 0 ]; then
            nft add element ip6 edge_dft_v6 allow_set { $IP }
        else
            nft add element ip6 edge_dft_v6 allow_set { $IP timeout "${DAYS}d" }
        fi
    else
        # IPv4地址
        if [ "$DAYS" -eq 0 ]; then
            nft add element ip edge_dft_v4 allow_set { $IP }
        else
            nft add element ip edge_dft_v4 allow_set { $IP timeout "${DAYS}d" }
        fi
    fi

    echo -e "${Green_font_prefix}[成功]${Font_color_suffix} IP $IP 已添加到白名单!"
    manage_ip_lists
}

# 添加IP到黑名单
add_to_blacklist() {
    # 检查是否已设置防御规则
    if ! nft list tables | grep -q "edge_dft_v4"; then
        echo -e "${Error} 未检测到DDoS防御表，请先配置DDoS防御规则!"
        return
    fi

    echo -e "请输入要添加到黑名单的IP地址"
    read -e -p "(例如: 1.2.3.4):" IP
    [[ -z "${IP}" ]] && echo "已取消..." && return

    # 设置超时时间（小时）
    echo -e "请输入黑名单有效期(小时，0表示永久)"
    read -e -p "(默认: 22):" HOURS
    [[ -z "${HOURS}" ]] && HOURS=24

    # 判断IPv4或IPv6
    if [[ "$IP" == *":"* ]]; then
        # IPv6地址
        if [ "$HOURS" -eq 0 ]; then
            nft add element ip6 edge_dft_v6 deny_set { $IP }
        else
            nft add element ip6 edge_dft_v6 deny_set { $IP timeout "${HOURS}h" }
        fi
    else
        # IPv4地址
        if [ "$HOURS" -eq 0 ]; then
            nft add element ip edge_dft_v4 deny_set { $IP }
        else
            nft add element ip edge_dft_v4 deny_set { $IP timeout "${HOURS}h" }
        fi
    fi

    echo -e "${Green_font_prefix}[成功]${Font_color_suffix} IP $IP 已添加到黑名单!"
    manage_ip_lists
}

# 从白名单移除IP
remove_from_whitelist() {
    # 检查是否已设置防御规则
    if ! nft list tables | grep -q "edge_dft_v4"; then
        echo -e "${Error} 未检测到DDoS防御表，请先配置DDoS防御规则!"
        return
    fi

    # 显示当前白名单
    view_whitelist_simple

    echo -e "请输入要从白名单移除的IP地址"
    read -e -p "(例如: 1.2.3.4):" IP
    [[ -z "${IP}" ]] && echo "已取消..." && return

    # 判断IPv4或IPv6
    if [[ "$IP" == *":"* ]]; then
        # IPv6地址
        nft delete element ip6 edge_dft_v6 allow_set { $IP }
    else
        # IPv4地址
        nft delete element ip edge_dft_v4 allow_set { $IP }
    fi

    echo -e "${Green_font_prefix}[成功]${Font_color_suffix} IP $IP 已从白名单移除!"
    manage_ip_lists
}

# 从黑名单移除IP
remove_from_blacklist() {
    # 检查是否已设置防御规则
    if ! nft list tables | grep -q "edge_dft_v4"; then
        echo -e "${Error} 未检测到DDoS防御表，请先配置DDoS防御规则!"
        return
    fi

    # 显示当前黑名单
    view_blacklist_simple

    echo -e "请输入要从黑名单移除的IP地址"
    read -e -p "(例如: 1.2.3.4):" IP
    [[ -z "${IP}" ]] && echo "已取消..." && return

    # 判断IPv4或IPv6
    if [[ "$IP" == *":"* ]]; then
        # IPv6地址
        nft delete element ip6 edge_dft_v6 deny_set { $IP }
    else
        # IPv4地址
        nft delete element ip edge_dft_v4 deny_set { $IP }
    fi

    echo -e "${Green_font_prefix}[成功]${Font_color_suffix} IP $IP 已从黑名单移除!"
    manage_ip_lists
}

# 简化版查看白名单
view_whitelist_simple() {
    echo -e "============当前白名单============"
    # 检查IPv4白名单
    ipv4_whitelist=$(nft list set ip edge_dft_v4 allow_set 2>/dev/null)
    if [[ -n "$ipv4_whitelist" ]]; then
        echo -e "IPv4白名单:"
        echo "$ipv4_whitelist" | grep -o '[0-9]\{1,3\}\.[0-9]\{1,3\}\.[0-9]\{1,3\}\.[0-9]\{1,3\}'
    fi

    # 检查IPv6白名单
    ipv6_whitelist=$(nft list set ip6 edge_dft_v6 allow_set 2>/dev/null)
    if [[ -n "$ipv6_whitelist" ]]; then
        echo -e "IPv6白名单:"
        echo "$ipv6_whitelist" | grep -o '[0-9a-fA-F:]\+' | grep ':'
    fi

    echo -e "=================================="
}

# 查看白名单
view_whitelist() {
    # 检查是否已设置防御规则
    if ! nft list tables | grep -q "edge_dft_v4"; then
        echo -e "${Error} 未检测到DDoS防御表，请先配置DDoS防御规则!"
        manage_ip_lists
        return
    fi

    echo -e "============当前白名单============"
    # 检查IPv4白名单
    ipv4_whitelist=$(nft list set ip edge_dft_v4 allow_set 2>/dev/null)
    if [[ -n "$ipv4_whitelist" && "$ipv4_whitelist" == *"elements"* ]]; then
        echo -e "IPv4白名单:"
        echo "$ipv4_whitelist" | grep -A1000 "elements" | grep -v "^[[:space:]]*$" | grep -v "elements"
    else
        echo -e "IPv4白名单为空"
    fi

    # 检查IPv6白名单
    ipv6_whitelist=$(nft list set ip6 edge_dft_v6 allow_set 2>/dev/null)
    if [[ -n "$ipv6_whitelist" && "$ipv6_whitelist" == *"elements"* ]]; then
        echo -e "IPv6白名单:"
        echo "$ipv6_whitelist" | grep -A1000 "elements" | grep -v "^[[:space:]]*$" | grep -v "elements"
    else
        echo -e "IPv6白名单为空"
    fi

    echo -e "=================================="

    read -e -p "按任意键返回..." temp
    manage_ip_lists
}

# 简化版查看黑名单
view_blacklist_simple() {
    echo -e "============当前黑名单============"
    # 检查IPv4黑名单
    ipv4_blacklist=$(nft list set ip edge_dft_v4 deny_set 2>/dev/null)
    if [[ -n "$ipv4_blacklist" ]]; then
        echo -e "IPv4黑名单(前20条):"
        echo "$ipv4_blacklist" | grep -o '[0-9]\{1,3\}\.[0-9]\{1,3\}\.[0-9]\{1,3\}\.[0-9]\{1,3\}' | head -n 20
    fi

    # 检查IPv6黑名单
    ipv6_blacklist=$(nft list set ip6 edge_dft_v6 deny_set 2>/dev/null)
    if [[ -n "$ipv6_blacklist" ]]; then
        echo -e "IPv6黑名单(前20条):"
        echo "$ipv6_blacklist" | grep -o '[0-9a-fA-F:]\+' | grep ':' | head -n 20
    fi

    echo -e "=================================="
}

# 查看黑名单
view_blacklist() {
    # 检查是否已设置防御规则
    if ! nft list tables | grep -q "edge_dft_v4"; then
        echo -e "${Error} 未检测到DDoS防御表，请先配置DDoS防御规则!"
        manage_ip_lists
        return
    fi

    echo -e "请输入要显示的黑名单条数"
    read -e -p "(默认: 50):" COUNT
    [[ -z "${COUNT}" ]] && COUNT=50

    echo -e "============当前黑名单============"
    # 检查IPv4黑名单
    ipv4_blacklist=$(nft list set ip edge_dft_v4 deny_set 2>/dev/null)
    if [[ -n "$ipv4_blacklist" && "$ipv4_blacklist" == *"elements"* ]]; then
        echo -e "IPv4黑名单(前${COUNT}条):"
        echo "$ipv4_blacklist" | grep -A1000 "elements" | grep -v "^[[:space:]]*$" | grep -v "elements" | head -n $COUNT

        # 计算总数
        ipv4_count=$(echo "$ipv4_blacklist" | grep -o '[0-9]\{1,3\}\.[0-9]\{1,3\}\.[0-9]\{1,3\}\.[0-9]\{1,3\}' | wc -l)
        echo -e "IPv4黑名单总IP数: $ipv4_count"
    else
        echo -e "IPv4黑名单为空"
    fi

    # 检查IPv6黑名单
    ipv6_blacklist=$(nft list set ip6 edge_dft_v6 deny_set 2>/dev/null)
    if [[ -n "$ipv6_blacklist" && "$ipv6_blacklist" == *"elements"* ]]; then
        echo -e "IPv6黑名单(前${COUNT}条):"
        echo "$ipv6_blacklist" | grep -A1000 "elements" | grep -v "^[[:space:]]*$" | grep -v "elements" | head -n $COUNT

        # 计算总数
        ipv6_count=$(echo "$ipv6_blacklist" | grep -o '[0-9a-fA-F:]\+' | grep ':' | wc -l)
        echo -e "IPv6黑名单总IP数: $ipv6_count"
    else
        echo -e "IPv6黑名单为空"
    fi

    echo -e "=================================="

    read -e -p "按任意键返回..." temp
    manage_ip_lists
}

# 查看防御状态
view_defense_status() {
    echo -e "============当前防御状态============"

    # 检查edge_dft_v4表是否存在
    if nft list tables | grep -q "edge_dft_v4"; then
        echo -e "${Green_font_prefix}[已启用]${Font_color_suffix} DDoS防御"

        # 获取计数器信息
        http_drop=$(nft list chain ip edge_dft_v4 input 2>/dev/null | grep "drop" | grep "http" | grep -o "packets [0-9]*" | awk '{sum+=$2} END {print sum}')
        https_drop=$(nft list chain ip edge_dft_v4 input 2>/dev/null | grep "drop" | grep "https" | grep -o "packets [0-9]*" | awk '{sum+=$2} END {print sum}')

        # 获取自定义端口计数器信息
        custom_ports=$(nft list chain ip edge_dft_v4 input 2>/dev/null | grep "ZZtcp_" | grep -v "ZZtcp_80_" | grep -v "ZZtcp_443_" | grep -o "ZZtcp_[0-9]*_" | sort | uniq | grep -o "[0-9]*")

        echo -e "已阻止HTTP连接次数: ${http_drop:-0}"
        echo -e "已阻止HTTPS连接次数: ${https_drop:-0}"

        # 显示保护的端口列表
        echo -e "\n${Yellow_font_prefix}=== 当前保护的端口列表 ===${Font_color_suffix}"
        echo -e "标准端口: 80(HTTP), 443(HTTPS)"

        if [[ -n "$custom_ports" ]]; then
            # 将多行端口号转换为单行，用逗号分隔
            formatted_ports=$(echo "$custom_ports" | tr '\n' ',' | sed 's/,$//')
            echo -e "自定义端口: $formatted_ports"
        else
            echo -e "自定义端口: 无"
        fi

        # 显示端口详细配置的简化版本
        echo -e "\n${Yellow_font_prefix}=== 端口保护配置详情 ===${Font_color_suffix}"
        echo -e "格式说明: [端口号] - [连接限制/分钟] [连接限制/秒] [每IP最大连接数] [最大并发连接数] [封禁时长]"

        # 提取HTTP(80)配置
        http_minute_limit=$(nft list chain ip edge_dft_v4 input 2>/dev/null | grep "tcp dport 80" | grep "minute" | grep -o "over [0-9]*/minute" | head -1 | awk '{print $2}' | cut -d '/' -f1)
        http_second_limit=$(nft list chain ip edge_dft_v4 input 2>/dev/null | grep "tcp dport 80" | grep "second" | grep -o "over [0-9]*/second" | head -1 | awk '{print $2}' | cut -d '/' -f1)
        http_ban_time=$(nft list chain ip edge_dft_v4 input 2>/dev/null | grep "tcp dport 80" | grep -E "timeout ([0-9]+[dhm])+" | head -1 | awk '{for(i=1;i<=NF;i++) if($i ~ /timeout/) print $(i+1)}')
        http_conn_limit=$(nft list chain ip edge_dft_v4 input 2>/dev/null | grep "tcp dport 80" | grep "maxConnectionsPerIP" | grep -o "over [0-9]*" | head -1 | awk '{print $2}')
        http_total_conn=$(nft list chain ip edge_dft_v4 input 2>/dev/null | grep "tcp dport 80" | grep "maxConnections" | grep -o "over [0-9]*" | head -1 | awk '{print $2}')

        [[ -z "$http_conn_limit" ]] && http_conn_limit="未设置"
        [[ -z "$http_total_conn" ]] && http_total_conn="未设置"

        echo -e "80(HTTP) - ${http_minute_limit:-未设置}/分钟 ${http_second_limit:-未设置}/秒 ${http_conn_limit} ${http_total_conn} ${http_ban_time:-未设置} (已阻止: ${http_drop:-0})"

        # 提取HTTPS(443)配置
        https_minute_limit=$(nft list chain ip edge_dft_v4 input 2>/dev/null | grep "tcp dport 443" | grep "minute" | grep -o "over [0-9]*/minute" | head -1 | awk '{print $2}' | cut -d '/' -f1)
        https_second_limit=$(nft list chain ip edge_dft_v4 input 2>/dev/null | grep "tcp dport 443" | grep "second" | grep -o "over [0-9]*/second" | head -1 | awk '{print $2}' | cut -d '/' -f1)
        https_ban_time=$(nft list chain ip edge_dft_v4 input 2>/dev/null | grep "tcp dport 443" | grep -E "timeout ([0-9]+[dhm])+" | head -1 | awk '{for(i=1;i<=NF;i++) if($i ~ /timeout/) print $(i+1)}')
        https_conn_limit=$(nft list chain ip edge_dft_v4 input 2>/dev/null | grep "tcp dport 443" | grep "maxConnectionsPerIP" | grep -o "over [0-9]*" | head -1 | awk '{print $2}')
        https_total_conn=$(nft list chain ip edge_dft_v4 input 2>/dev/null | grep "tcp dport 443" | grep "maxConnections" | grep -o "over [0-9]*" | head -1 | awk '{print $2}')

        [[ -z "$https_conn_limit" ]] && https_conn_limit="未设置"
        [[ -z "$https_total_conn" ]] && https_total_conn="未设置"

        echo -e "443(HTTPS) - ${https_minute_limit:-未设置}/分钟 ${https_second_limit:-未设置}/秒 ${https_conn_limit} ${https_total_conn} ${https_ban_time:-未设置} (已阻止: ${https_drop:-0})"

        # 显示自定义端口配置
        if [[ -n "$custom_ports" ]]; then
            for port in $custom_ports; do
                port_drop=$(nft list chain ip edge_dft_v4 input 2>/dev/null | grep "drop" | grep "ZZtcp_${port}_" | grep -o "packets [0-9]*" | awk '{sum+=$2} END {print sum}')

                # 提取端口配置
                port_minute_limit=$(nft list chain ip edge_dft_v4 input 2>/dev/null | grep "tcp dport $port" | grep "minute" | grep -o "over [0-9]*/minute" | head -1 | awk '{print $2}' | cut -d '/' -f1)
                port_second_limit=$(nft list chain ip edge_dft_v4 input 2>/dev/null | grep "tcp dport $port" | grep "second" | grep -o "over [0-9]*/second" | head -1 | awk '{print $2}' | cut -d '/' -f1)
                port_ban_time=$(nft list chain ip edge_dft_v4 input 2>/dev/null | grep "tcp dport $port" | grep -E "timeout ([0-9]+[dhm])+" | head -1 | awk '{for(i=1;i<=NF;i++) if($i ~ /timeout/) print $(i+1)}')
                port_conn_limit=$(nft list chain ip edge_dft_v4 input 2>/dev/null | grep "tcp dport $port" | grep "maxConnectionsPerIP" | grep -o "over [0-9]*" | head -1 | awk '{print $2}')
                port_total_conn=$(nft list chain ip edge_dft_v4 input 2>/dev/null | grep "tcp dport $port" | grep "maxConnections" | grep -o "over [0-9]*" | head -1 | awk '{print $2}')

                [[ -z "$port_conn_limit" ]] && port_conn_limit="未设置"
                [[ -z "$port_total_conn" ]] && port_total_conn="未设置"

                # 检查该端口是否还有UDP保护
                udp_protection=$(nft list chain ip edge_dft_v4 input 2>/dev/null | grep "udp dport $port" | wc -l)
                if [[ $udp_protection -gt 0 ]]; then
                    protocol="TCP+UDP"
                else
                    protocol="TCP"
                fi

                echo -e "${port}(${protocol}) - ${port_minute_limit:-未设置}/分钟 ${port_second_limit:-未设置}/秒 ${port_conn_limit} ${port_total_conn} ${port_ban_time:-未设置} (已阻止: ${port_drop:-0})"
            done
        fi

        # 统计被阻止的总连接数
        total_drop=$(nft list chain ip edge_dft_v4 input 2>/dev/null | grep "drop" | grep -o "packets [0-9]*" | awk '{sum+=$2} END {print sum}')

        echo -e "\n${Yellow_font_prefix}=== 总体防御情况 ===${Font_color_suffix}"
        echo -e "总拦截连接数: ${total_drop:-0}"

        # 显示黑白名单IP数量
        # 使用更准确的正则表达式匹配方法统计IP数量
        whitelist_ipv4=$(nft list set ip edge_dft_v4 allow_set 2>/dev/null | grep -E -o '([0-9]{1,3}\.){3}[0-9]{1,3}( timeout [0-9]+[dhms])?' | wc -l)
        blacklist_ipv4=$(nft list set ip edge_dft_v4 deny_set 2>/dev/null | grep -E -o '([0-9]{1,3}\.){3}[0-9]{1,3}( timeout [0-9]+[dhms])?' | wc -l)

        # IPv6地址匹配也使用更准确的正则表达式
        whitelist_ipv6=$(nft list set ip6 edge_dft_v6 allow_set 2>/dev/null | grep -E -o '([0-9a-fA-F]{1,4}(:|::)){1,7}[0-9a-fA-F]{1,4}( timeout [0-9]+[dhms])?' | wc -l)
        blacklist_ipv6=$(nft list set ip6 edge_dft_v6 deny_set 2>/dev/null | grep -E -o '([0-9a-fA-F]{1,4}(:|::)){1,7}[0-9a-fA-F]{1,4}( timeout [0-9]+[dhms])?' | wc -l)

        echo -e "当前白名单IPv4数量: ${whitelist_ipv4:-0}"
        echo -e "当前白名单IPv6数量: ${whitelist_ipv6:-0}"
        echo -e "当前黑名单IPv4数量: ${blacklist_ipv4:-0}"
        echo -e "当前黑名单IPv6数量: ${blacklist_ipv6:-0}"
    else
        echo -e "${Red_font_prefix}[未启用]${Font_color_suffix} DDoS防御"
        echo -e "请先配置DDoS防御规则!"
    fi

    echo -e "=================================="
}

# 更新脚本
