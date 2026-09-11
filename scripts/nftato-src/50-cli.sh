# shellcheck shell=bash
Update_Shell() {
    # 检测网络环境
    check_network_env

    # 根据网络环境选择不同的URL
    if [ $IN_CHINA -eq 1 ]; then
        DOWNLOAD_URL="https://gh-proxy.com/raw.githubusercontent.com/Fiftonb/Gnftato/refs/heads/main/Nftato.sh"
        VERSION_URL="https://gh-proxy.com/raw.githubusercontent.com/Fiftonb/Gnftato/refs/heads/main/Nftato.sh"
        echo "使用国内GitHub代理加速更新..."
    else
        DOWNLOAD_URL="https://raw.githubusercontent.com/Fiftonb/Gnftato/refs/heads/main/Nftato.sh"
        VERSION_URL="https://raw.githubusercontent.com/Fiftonb/Gnftato/refs/heads/main/Nftato.sh"
        echo "使用GitHub直接更新..."
    fi

    # 获取最新版本号
    sh_new_ver=$(wget -qO- -t2 -T3 "${VERSION_URL}" | grep 'sh_ver="' | awk -F "=" '{print $NF}' | sed 's/\"//g' | head -1)
    if [[ -z ${sh_new_ver} ]]; then
        echo -e "${Error} 无法连接到更新服务器，请检查网络或稍后再试！"
        return 1
    fi

    # 比较版本
    if [[ "${sh_new_ver}" != "${sh_ver}" ]]; then
        echo -e "检测到新版本[ ${sh_new_ver} ]，当前版本[ ${sh_ver} ]"
        yn="y"
        echo -e "自动确认更新"
        if [[ ${yn} == [Yy] ]]; then
            if wget -q "${DOWNLOAD_URL}" -O Nftato.sh.new && bash -n Nftato.sh.new; then
                mv Nftato.sh.new Nftato.sh || return 1
                chmod +x Nftato.sh || return 1
                echo -e "脚本已更新为最新版本[ ${sh_new_ver} ] !\n运行 bash Nftato.sh 启动最新版本"
            else
                rm -f Nftato.sh.new
                echo -e "${Error} 下载新版本失败，请稍后再试"
                return 1
            fi
        else
            echo "已取消更新，继续使用当前版本[ ${sh_ver} ]"
        fi
    else
        echo -e "当前已经是最新版本[ ${sh_new_ver} ]"
    fi
    return 0
}

# Translate the public, descriptive command names to the historical numeric
# protocol. Numeric values remain supported for older panels and bookmarks.
resolve_action() {
    case "${1:-}" in
        outbound:list) echo 0 ;;
        outbound:block-bt) echo 1 ;;
        outbound:block-spam) echo 2 ;;
        outbound:block-all) echo 3 ;;
        outbound:block-ports) echo 4 ;;
        outbound:block-keyword) echo 5 ;;
        outbound:unblock-bt) echo 6 ;;
        outbound:unblock-spam) echo 7 ;;
        outbound:unblock-all) echo 8 ;;
        outbound:unblock-ports) echo 9 ;;
        outbound:unblock-keyword) echo 10 ;;
        outbound:unblock-keywords) echo 11 ;;
        outbound:blocklists) echo 12 ;;
        inbound:list-ports) echo 13 ;;
        inbound:list-addresses) echo 14 ;;
        inbound:allow-ports) echo 15 ;;
        inbound:remove-ports) echo 16 ;;
        inbound:allow-addresses) echo 17 ;;
        inbound:remove-addresses) echo 18 ;;
        ssh:port) echo 19 ;;
        rules:rebuild) echo 20 ;;
        self:update) echo 21 ;;
        ddos:setup) echo 22 ;;
        ddos:custom-port) echo 23 ;;
        ddos:ip-list) echo 24 ;;
        ddos:status) echo 25 ;;
        banbt) echo 1 ;;
        banspam) echo 2 ;;
        banall) echo 3 ;;
        unbanbt) echo 6 ;;
        unbanspam) echo 7 ;;
        unbanall) echo 8 ;;
        ''|help|-h|--help) echo "${1:-}" ;;
        * ) echo "$1" ;;
    esac
}

validate_port_list() {
    local value=${1:-} item first last
    local -a items
    [[ -n "$value" && ${#value} -le 1024 ]] || return 1
    [[ "$value" != ,* && "$value" != *, && "$value" != *,,* ]] || return 1
    IFS=',' read -r -a items <<< "$value"
    for item in "${items[@]}"; do
        [[ "$item" =~ ^([0-9]{1,5})([:-]([0-9]{1,5}))?$ ]] || return 1
        first=${BASH_REMATCH[1]}
        last=${BASH_REMATCH[3]:-${BASH_REMATCH[1]}}
        ((10#$first >= 1 && 10#$first <= 65535)) || return 1
        ((10#$last >= 1 && 10#$last <= 65535 && 10#$first <= 10#$last)) || return 1
    done
}

validate_single_port() {
    local value=${1:-}
    [[ "$value" =~ ^[0-9]{1,5}$ ]] && ((10#$value >= 1 && 10#$value <= 65535))
}

validate_keyword() {
    local value=${1:-}
    [[ -n "$value" && ${#value} -le 256 ]] || return 1
    # The value is passed to iptables as one quoted argument and compared to
    # the on-disk list literally. Allow printable URL/text characters while
    # rejecting control characters that could create extra records or output.
    [[ "$value" != *$'\n'* && "$value" != *$'\r'* && "$value" != *$'\t'* ]] || return 1
    [[ "$value" =~ [^[:space:]] ]] || return 1
    [[ "$value" =~ ^[[:print:]]+$ ]]
}

validate_ipv4_address() {
    local address=${1:-} octet
    local -a octets
    IFS='.' read -r -a octets <<< "$address"
    [[ ${#octets[@]} -eq 4 ]] || return 1
    for octet in "${octets[@]}"; do
        [[ "$octet" =~ ^[0-9]{1,3}$ ]] || return 1
        ((10#$octet >= 0 && 10#$octet <= 255)) || return 1
    done
}

validate_ipv6_address() {
    local address=${1:-} ipv4_part left right side group compressed=0 group_count=0
    local -a groups
    [[ "$address" == *:* ]] || return 1

    # An embedded IPv4 tail consumes two IPv6 groups.
    if [[ "$address" == *.* ]]; then
        ipv4_part=${address##*:}
        validate_ipv4_address "$ipv4_part" || return 1
        address="${address%:*}:0:0"
    fi
    [[ "$address" =~ ^[0-9A-Fa-f:]+$ ]] || return 1

    if [[ "$address" == *::* ]]; then
        compressed=1
        left=${address%%::*}
        right=${address#*::}
        [[ "$right" != *::* ]] || return 1
        [[ -z "$left" || "$left" != *: ]] || return 1
        [[ -z "$right" || "$right" != :* ]] || return 1
    else
        left=$address
        right=''
        [[ "$left" != :* && "$left" != *: ]] || return 1
    fi

    for side in "$left" "$right"; do
        [[ -n "$side" ]] || continue
        IFS=':' read -r -a groups <<< "$side"
        for group in "${groups[@]}"; do
            [[ "$group" =~ ^[0-9A-Fa-f]{1,4}$ ]] || return 1
            group_count=$((group_count + 1))
        done
    done

    if [[ $compressed -eq 1 ]]; then
        ((group_count < 8))
    else
        ((group_count == 8))
    fi
}

validate_ip_or_cidr() {
    local value=${1:-} address prefix max_prefix
    [[ -n "$value" && "$value" != */*/* ]] || return 1
    if [[ "$value" == */* ]]; then
        address=${value%/*}
        prefix=${value##*/}
        [[ "$prefix" =~ ^[0-9]{1,3}$ ]] || return 1
    else
        address=$value
        prefix=''
    fi

    if [[ "$address" == *:* ]]; then
        validate_ipv6_address "$address" || return 1
        max_prefix=128
    else
        validate_ipv4_address "$address" || return 1
        max_prefix=32
    fi
    [[ -z "$prefix" ]] || ((10#$prefix >= 0 && 10#$prefix <= max_prefix))
}

validate_ip_or_cidr_list() {
    local value=${1:-} item
    local -a items
    [[ -n "$value" && ${#value} -le 1024 ]] || return 1
    [[ "$value" != ,* && "$value" != *, && "$value" != *,,* ]] || return 1
    IFS=',' read -r -a items <<< "$value"
    for item in "${items[@]}"; do
        validate_ip_or_cidr "$item" || return 1
    done
}

validate_integer_range() {
    local value=${1:-} minimum=$2 maximum=$3
    [[ "$value" =~ ^[0-9]{1,10}$ ]] || return 1
    ((10#$value >= minimum && 10#$value <= maximum))
}

validate_named_invocation() {
    local command_name=${1:-}
    shift || true
    case "$command_name" in
        outbound:list|outbound:block-bt|outbound:block-spam|outbound:block-all|\
        outbound:unblock-bt|outbound:unblock-spam|outbound:unblock-all|outbound:unblock-keywords|\
        outbound:blocklists|inbound:list-ports|inbound:list-addresses|ssh:port|rules:rebuild|\
        self:update|ddos:setup|ddos:status)
            [[ $# -eq 0 ]] || { echo "错误: 命名动作 $command_name 不接受参数" >&2; return 1; }
            ;;
        outbound:block-ports|outbound:block-keyword|outbound:unblock-ports|outbound:unblock-keyword|\
        inbound:allow-ports|inbound:remove-ports|inbound:allow-addresses|inbound:remove-addresses)
            [[ $# -eq 1 && -n "${1:-}" ]] || { echo "错误: 命名动作 $command_name 需要且仅接受一个参数" >&2; return 1; }
            ;;
        ddos:custom-port)
            [[ $# -eq 6 ]] || { echo "错误: 命名动作 $command_name 需要六个参数" >&2; return 1; }
            ;;
        ddos:ip-list)
            [[ $# -ge 2 && $# -le 3 && -n "${1:-}" && -n "${2:-}" ]] || { echo "错误: 命名动作 $command_name 需要操作类型、IP地址及可选有效期" >&2; return 1; }
            ;;
    esac
}

require_valid() {
    local validator=$1 message=$2
    shift 2
    if ! "$validator" "$@"; then
        echo "错误: $message" >&2
        return 1
    fi
}

json_escape() {
    local value=${1:-}
    value=${value//\\/\\\\}
    value=${value//\"/\\\"}
    value=${value//$'\e'/\\u001b}
    value=${value//$'\t'/\\t}
    value=${value//$'\r'/\\r}
    value=${value//$'\n'/\\n}
    printf '%s' "$value"
}

emit_json_result() {
    local command_name=$1 status=$2 output=${3:-}
    printf '{"success":%s,"command":"%s","exitCode":%d,"output":"%s"}\n' \
        "$([[ "$status" -eq 0 ]] && printf true || printf false)" \
        "$(json_escape "$command_name")" "$status" "$(json_escape "$output")"
}

# 使用方法帮助
usage() {
    echo -e "使用方法: $0 [--json] <命令|0-25> [参数]"
    echo -e "参数说明:"
    echo -e "  0-25: 对应菜单中的功能"
    echo -e "  推荐使用命名命令，例如:"
    echo -e "    $0 outbound:block-ports 25,465"
    echo -e "    $0 inbound:allow-ports 80,443"
    echo -e "    $0 inbound:allow-addresses 192.0.2.10"
    echo -e "    $0 ddos:status"
    echo -e "需要额外参数的功能:"
    echo -e "  4: 指定要封禁的端口，例如: $0 4 80,443"
    echo -e "  5: 指定要封禁的关键词，例如: $0 5 youtube.com"
    echo -e "  9: 指定要解封的端口，例如: $0 9 80,443"
    echo -e "  10: 指定要解封的关键词，例如: $0 10 youtube.com"
    echo -e "  15: 指定要放行的端口，例如: $0 15 80,443"
    echo -e "  16: 指定要取消放行的端口，例如: $0 16 80,443"
    echo -e "  17: 指定要放行的IP，例如: $0 17 1.2.3.4"
    echo -e "  18: 指定要取消放行的IP，例如: $0 18 1.2.3.4"
    echo -e "  22: 配置DDoS防御规则，例如: $0 22"
    echo -e "  23: 自定义端口DDoS防御，例如: $0 23 8080 1 400 400 300 24"
    echo -e "      参数: <端口> [协议类型] [每IP最大连接数] [每分钟最大连接] [每秒最大连接] [封禁时长]"
    echo -e "      协议类型: 1=TCP, 2=UDP, 3=TCP+UDP，默认为1(TCP)"
    echo -e "  24: 管理IP黑白名单，例如: $0 24 <操作类型> <IP地址> [有效期]"
    echo -e "      操作类型: 1=添加白名单, 2=添加黑名单, 3=从白名单移除, 4=从黑名单移除"
    echo -e "      例如: $0 24 1 1.2.3.4 7 (添加IP到白名单，有效期7天)"
    echo -e "            $0 24 2 1.2.3.4 24 (添加IP到黑名单，有效期24小时)"
    echo -e "  25: 查看当前防御状态，例如: $0 25"
}

# 非交互式处理端口封禁
non_interactive_port_out() {
    PORT=${1:-}
    require_valid validate_port_list "端口格式无效" "$PORT" || return 1
    s="add"
    set_out_ports || return 1
    echo -e "${Info} 已封禁端口 [ ${PORT} ] !\n"
}

# 非交互式处理端口解封
non_interactive_port_unban() {
    PORT=${1:-}
    require_valid validate_port_list "端口格式无效" "$PORT" || return 1
    s="delete"
    set_out_ports || return 1
    echo -e "${Info} 已解封端口 [ ${PORT} ] !\n"
}

# 非交互式处理关键词封禁
non_interactive_keyword_ban() {
    key_word=${1:-}
    require_valid validate_keyword "关键词必须是最多 256 字符的可打印文本" "$key_word" || return 1
    s="add"
    set_out_keywords || return 1
    echo -e "${Info} 已封禁关键词 [ ${key_word} ] !\n"
}

# 非交互式处理关键词解封
non_interactive_keyword_unban() {
    key_word=${1:-}
    require_valid validate_keyword "关键词必须是最多 256 字符的可打印文本" "$key_word" || return 1
    s="delete"
    set_out_keywords || return 1
    echo -e "${Info} 已解封关键词 [ ${key_word} ] !\n"
}

# 非交互式处理入网端口放行
non_interactive_inport_allow() {
    PORT=${1:-}
    require_valid validate_port_list "端口格式无效" "$PORT" || return 1
    s="add"
    set_in_ports || return 1
    echo -e "${Info} 已放行入网端口 [ ${PORT} ] !\n"
}

# 非交互式处理入网端口取消放行
non_interactive_inport_disallow() {
    PORT=${1:-}
    require_valid validate_port_list "端口格式无效" "$PORT" || return 1
    s="delete"
    set_in_ports || return 1
    echo -e "${Info} 已取消放行入网端口 [ ${PORT} ] !\n"
}

# 非交互式处理入网IP放行
non_interactive_inip_allow() {
    IP=${1:-}
    require_valid validate_ip_or_cidr_list "IP 或 CIDR 格式无效" "$IP" || return 1
    s="add"
    set_in_ips || return 1
    echo -e "${Info} 已放行入网IP [ ${IP} ] !\n"
}

# 非交互式处理入网IP取消放行
non_interactive_inip_disallow() {
    IP=${1:-}
    require_valid validate_ip_or_cidr_list "IP 或 CIDR 格式无效" "$IP" || return 1
    s="delete"
    set_in_ips || return 1
    echo -e "${Info} 已取消放行入网IP [ ${IP} ] !\n"
}

# 非交互式配置DDoS防御规则
non_interactive_ddos_protection() {
    setup_ddos_protection || return 1
}

# 非交互式配置自定义端口DDoS防御
non_interactive_custom_port_protection() {
    PORT=${1:-}
    PROTO_TYPE=${2:-}
    MAX_CONN=${3:-}
    MAX_RATE_MIN=${4:-}
    MAX_RATE_SEC=${5:-}
    BAN_HOURS=${6:-}

    if [[ -z "${PORT}" ]]; then
        echo "错误: 未指定端口"
        echo "用法: $0 23 <端口> [协议类型] [每IP最大连接数] [每分钟最大连接] [每秒最大连接] [封禁时长]"
        echo "例如: $0 23 8080 1 400 400 300 22"
        echo "协议类型: 1=TCP, 2=UDP, 3=TCP+UDP，默认为1(TCP)"
        return 1
    fi

    # 设置默认值
    [[ -z "${PROTO_TYPE}" ]] && PROTO_TYPE="1"
    [[ -z "${MAX_CONN}" ]] && MAX_CONN=400
    [[ -z "${MAX_RATE_MIN}" ]] && MAX_RATE_MIN=400
    [[ -z "${MAX_RATE_SEC}" ]] && MAX_RATE_SEC=300
    [[ -z "${BAN_HOURS}" ]] && BAN_HOURS=24

    require_valid validate_single_port "DDoS 端口格式无效" "$PORT" || return 1
    [[ "$PROTO_TYPE" =~ ^[123]$ ]] || { echo "错误: 协议类型必须是 1、2 或 3" >&2; return 1; }
    require_valid validate_integer_range "每IP最大连接数必须在1-1000000之间" "$MAX_CONN" 1 1000000 || return 1
    require_valid validate_integer_range "每分钟速率必须在1-1000000之间" "$MAX_RATE_MIN" 1 1000000 || return 1
    require_valid validate_integer_range "每秒速率必须在1-1000000之间" "$MAX_RATE_SEC" 1 1000000 || return 1
    require_valid validate_integer_range "封禁小时必须在1-87600之间" "$BAN_HOURS" 1 87600 || return 1

    # 检查IPv4表是否存在
    if ! nft list tables | grep -q "edge_dft_v4"; then
        echo "未检测到DDoS防御表，先创建基础防御规则"
        setup_ddos_protection || return 1
    fi

    # 计算超时时间
    BAN_TIMEOUT="${BAN_HOURS}h"
    if [ "$BAN_HOURS" -eq "24" ]; then
        BAN_TIMEOUT="23h59m" # 稍微短一点以避免边界情况
    fi

    # 添加IPv4规则
    if [[ "$PROTO_TYPE" == "1" ]] || [[ "$PROTO_TYPE" == "3" ]]; then
        # TCP规则
        nft add rule ip edge_dft_v4 input tcp dport "$PORT" ct count over 100000 counter packets 0 bytes 0 drop comment \"ZZtcp_${PORT}_maxConnections_100000ZZ\" || return 1
        nft add rule ip edge_dft_v4 input tcp dport "$PORT" meter meter-ip-${PORT}-max-connections size 65535 { ip saddr ct count over "$MAX_CONN" } counter packets 0 bytes 0 drop comment \"ZZtcp_${PORT}_maxConnectionsPerIP_${MAX_CONN}ZZ\" || return 1
        nft add rule ip edge_dft_v4 input tcp dport "$PORT" ct state new meter meter-ip-${PORT}-new-connections-rate size 65535 { ip saddr limit rate over "${MAX_RATE_MIN}/minute" burst "$((MAX_RATE_MIN + 103))" packets} add @deny_set { ip saddr timeout "$BAN_TIMEOUT" } comment \"ZZtcp_${PORT}_newConnectionsRate_${MAX_RATE_MIN}_${BAN_HOURS}ZZ\" || return 1
        nft add rule ip edge_dft_v4 input tcp dport "$PORT" ct state new meter meter-ip-${PORT}-new-connections-secondly-rate size 65535 { ip saddr limit rate over "${MAX_RATE_SEC}/second" burst "$((MAX_RATE_SEC + 3))" packets} add @deny_set { ip saddr timeout "$BAN_TIMEOUT" } comment \"ZZtcp_${PORT}_newConnectionsSecondlyRate_${MAX_RATE_SEC}_${BAN_HOURS}ZZ\" || return 1
    fi

    if [[ "$PROTO_TYPE" == "2" ]] || [[ "$PROTO_TYPE" == "3" ]]; then
        # UDP规则
        nft add rule ip edge_dft_v4 input udp dport "$PORT" ct count over 100000 counter packets 0 bytes 0 drop comment \"ZZudp_${PORT}_maxConnections_100000ZZ\" || return 1
        nft add rule ip edge_dft_v4 input udp dport "$PORT" meter meter-ip-${PORT}-udp-max-connections size 65535 { ip saddr ct count over "$MAX_CONN" } counter packets 0 bytes 0 drop comment \"ZZudp_${PORT}_maxConnectionsPerIP_${MAX_CONN}ZZ\" || return 1
        nft add rule ip edge_dft_v4 input udp dport "$PORT" ct state new meter meter-ip-${PORT}-udp-new-connections-rate size 65535 { ip saddr limit rate over "${MAX_RATE_MIN}/minute" burst "$((MAX_RATE_MIN + 103))" packets} add @deny_set { ip saddr timeout "$BAN_TIMEOUT" } comment \"ZZudp_${PORT}_newConnectionsRate_${MAX_RATE_MIN}_${BAN_HOURS}ZZ\" || return 1
        nft add rule ip edge_dft_v4 input udp dport "$PORT" ct state new meter meter-ip-${PORT}-udp-new-connections-secondly-rate size 65535 { ip saddr limit rate over "${MAX_RATE_SEC}/second" burst "$((MAX_RATE_SEC + 3))" packets} add @deny_set { ip saddr timeout "$BAN_TIMEOUT" } comment \"ZZudp_${PORT}_newConnectionsSecondlyRate_${MAX_RATE_SEC}_${BAN_HOURS}ZZ\" || return 1
    fi

    # 也为IPv6添加规则
    if [[ "$PROTO_TYPE" == "1" ]] || [[ "$PROTO_TYPE" == "3" ]]; then
        # IPv6 TCP规则
        nft add rule ip6 edge_dft_v6 input tcp dport "$PORT" ct count over 100000 counter packets 0 bytes 0 drop comment \"ZZtcp_${PORT}_maxConnections_100000ZZ\" || return 1
        nft add rule ip6 edge_dft_v6 input tcp dport "$PORT" meter meter-ip6-${PORT}-max-connections size 65535 { ip6 saddr ct count over "$MAX_CONN" } counter packets 0 bytes 0 drop comment \"ZZtcp_${PORT}_maxConnectionsPerIP_${MAX_CONN}ZZ\" || return 1
        nft add rule ip6 edge_dft_v6 input tcp dport "$PORT" ct state new meter meter-ip6-${PORT}-new-connections-rate size 65535 { ip6 saddr limit rate over "${MAX_RATE_MIN}/minute" burst "$((MAX_RATE_MIN + 103))" packets} add @deny_set { ip6 saddr timeout "$BAN_TIMEOUT" } comment \"ZZtcp_${PORT}_newConnectionsRate_${MAX_RATE_MIN}_${BAN_HOURS}ZZ\" || return 1
        nft add rule ip6 edge_dft_v6 input tcp dport "$PORT" ct state new meter meter-ip6-${PORT}-new-connections-secondly-rate size 65535 { ip6 saddr limit rate over "${MAX_RATE_SEC}/second" burst "$((MAX_RATE_SEC + 3))" packets} add @deny_set { ip6 saddr timeout "$BAN_TIMEOUT" } comment \"ZZtcp_${PORT}_newConnectionsSecondlyRate_${MAX_RATE_SEC}_${BAN_HOURS}ZZ\" || return 1
    fi

    if [[ "$PROTO_TYPE" == "2" ]] || [[ "$PROTO_TYPE" == "3" ]]; then
        # IPv6 UDP规则
        nft add rule ip6 edge_dft_v6 input udp dport "$PORT" ct count over 100000 counter packets 0 bytes 0 drop comment \"ZZudp_${PORT}_maxConnections_100000ZZ\" || return 1
        nft add rule ip6 edge_dft_v6 input udp dport "$PORT" meter meter-ip6-${PORT}-udp-max-connections size 65535 { ip6 saddr ct count over "$MAX_CONN" } counter packets 0 bytes 0 drop comment \"ZZudp_${PORT}_maxConnectionsPerIP_${MAX_CONN}ZZ\" || return 1
        nft add rule ip6 edge_dft_v6 input udp dport "$PORT" ct state new meter meter-ip6-${PORT}-udp-new-connections-rate size 65535 { ip6 saddr limit rate over "${MAX_RATE_MIN}/minute" burst "$((MAX_RATE_MIN + 103))" packets} add @deny_set { ip6 saddr timeout "$BAN_TIMEOUT" } comment \"ZZudp_${PORT}_newConnectionsRate_${MAX_RATE_MIN}_${BAN_HOURS}ZZ\" || return 1
        nft add rule ip6 edge_dft_v6 input udp dport "$PORT" ct state new meter meter-ip6-${PORT}-udp-new-connections-secondly-rate size 65535 { ip6 saddr limit rate over "${MAX_RATE_SEC}/second" burst "$((MAX_RATE_SEC + 3))" packets} add @deny_set { ip6 saddr timeout "$BAN_TIMEOUT" } comment \"ZZudp_${PORT}_newConnectionsSecondlyRate_${MAX_RATE_SEC}_${BAN_HOURS}ZZ\" || return 1
    fi

    save_nftables_rules || return 1
    echo -e "${Green_font_prefix}[成功]${Font_color_suffix} 已为端口 $PORT 配置DDoS防御规则!"
}

# 非交互式管理IP黑白名单
non_interactive_ip_list_manage() {
    ACTION=${1:-}
    IP=${2:-}
    DURATION=${3:-}

    if [[ -z "${ACTION}" ]]; then
        echo "错误: 未指定操作类型"
        echo "用法: $0 24 <操作类型> <IP地址> [有效期]"
        echo "操作类型: 1=添加白名单, 2=添加黑名单, 3=从白名单移除, 4=从黑名单移除"
        echo "例如: $0 24 1 1.2.3.4 7 (添加IP 1.2.3.4到白名单，有效期7天)"
        echo "      $0 24 2 1.2.3.4 24 (添加IP 1.2.3.4到黑名单，有效期24小时)"
        return 1
    fi

    if [[ -z "${IP}" ]]; then
        echo "错误: 未指定IP地址"
        return 1
    fi

    [[ "$ACTION" =~ ^[1-4]$ ]] || { echo "错误: 无效的操作类型" >&2; return 1; }
    require_valid validate_ip_or_cidr_list "IP 或 CIDR 格式无效" "$IP" || return 1
    if [[ -n "$DURATION" ]]; then
        require_valid validate_integer_range "有效期必须在0-87600之间" "$DURATION" 0 87600 || return 1
    fi

    # 检查是否已设置防御规则
    if ! nft list tables | grep -q "edge_dft_v4"; then
        echo -e "${Error} 未检测到DDoS防御表，请先配置DDoS防御规则!"
        setup_ddos_protection || return 1
    fi

    case "$ACTION" in
    "1") # 添加白名单
        [[ -z "${DURATION}" ]] && DURATION=0
        # 判断IPv4或IPv6
        if [[ "$IP" == *":"* ]]; then
            # IPv6地址
            if [ "$DURATION" -eq 0 ]; then
                nft add element ip6 edge_dft_v6 allow_set { "$IP" } || return 1
            else
                nft add element ip6 edge_dft_v6 allow_set { "$IP" timeout "${DURATION}d" } || return 1
            fi
        else
            # IPv4地址
            if [ "$DURATION" -eq 0 ]; then
                nft add element ip edge_dft_v4 allow_set { "$IP" } || return 1
            else
                nft add element ip edge_dft_v4 allow_set { "$IP" timeout "${DURATION}d" } || return 1
            fi
        fi
        echo -e "${Green_font_prefix}[成功]${Font_color_suffix} IP $IP 已添加到白名单!"
        ;;
    "2") # 添加黑名单
        [[ -z "${DURATION}" ]] && DURATION=24
        # 判断IPv4或IPv6
        if [[ "$IP" == *":"* ]]; then
            # IPv6地址
            if [ "$DURATION" -eq 0 ]; then
                nft add element ip6 edge_dft_v6 deny_set { "$IP" } || return 1
            else
                nft add element ip6 edge_dft_v6 deny_set { "$IP" timeout "${DURATION}h" } || return 1
            fi
        else
            # IPv4地址
            if [ "$DURATION" -eq 0 ]; then
                nft add element ip edge_dft_v4 deny_set { "$IP" } || return 1
            else
                nft add element ip edge_dft_v4 deny_set { "$IP" timeout "${DURATION}h" } || return 1
            fi
        fi
        echo -e "${Green_font_prefix}[成功]${Font_color_suffix} IP $IP 已添加到黑名单!"
        ;;
    "3") # 从白名单移除
        # 判断IPv4或IPv6
        if [[ "$IP" == *":"* ]]; then
            # IPv6地址
            nft delete element ip6 edge_dft_v6 allow_set { "$IP" } || return 1
        else
            # IPv4地址
            nft delete element ip edge_dft_v4 allow_set { "$IP" } || return 1
        fi
        echo -e "${Green_font_prefix}[成功]${Font_color_suffix} IP $IP 已从白名单移除!"
        ;;
    "4") # 从黑名单移除
        # 判断IPv4或IPv6
        if [[ "$IP" == *":"* ]]; then
            # IPv6地址
            nft delete element ip6 edge_dft_v6 deny_set { "$IP" } || return 1
        else
            # IPv4地址
            nft delete element ip edge_dft_v4 deny_set { "$IP" } || return 1
        fi
        echo -e "${Green_font_prefix}[成功]${Font_color_suffix} IP $IP 已从黑名单移除!"
        ;;
    *)
        echo "错误: 无效的操作类型"
        echo "操作类型: 1=添加白名单, 2=添加黑名单, 3=从白名单移除, 4=从黑名单移除"
        exit 1
        ;;
    esac
}

# 主菜单显示函数
