# shellcheck shell=bash
display_in_port() {
    # 检索入网端口规则
    tcp_rules=$(nft -a list chain inet filter input | grep "dport" | grep "tcp" | grep "shellsettcp")
    udp_rules=$(nft -a list chain inet filter input | grep "dport" | grep "udp" | grep "shellsetudp")

    echo -e "===============${Red_background_prefix} 当前已放行 端口 ${Font_color_suffix}==============="

    if [[ -n ${tcp_rules} ]]; then
        echo
        echo "TCP端口:"
        # 提取端口并去重
        echo "${tcp_rules}" | while read -r line; do
            if [[ $line =~ dport[[:space:]]+([0-9,\-]+) ]]; then
                port="${BASH_REMATCH[1]}"
                echo " $port"
            elif [[ $line =~ dport[[:space:]]+\{[[:space:]]*(.*)[[:space:]]*\} ]]; then
                port="${BASH_REMATCH[1]}"
                echo " $port"
            fi
        done | sort -u # 排序并去重
        echo && echo -e "==============================================="
    fi

    if [[ -n ${udp_rules} ]]; then
        echo
        echo "UDP端口:"
        # 提取端口并去重
        echo "${udp_rules}" | while read -r line; do
            if [[ $line =~ dport[[:space:]]+([0-9,\-]+) ]]; then
                port="${BASH_REMATCH[1]}"
                echo " $port"
            elif [[ $line =~ dport[[:space:]]+\{[[:space:]]*(.*)[[:space:]]*\} ]]; then
                port="${BASH_REMATCH[1]}"
                echo " $port"
            fi
        done | sort -u # 排序并去重
        echo && echo -e "==============================================="
    fi

    if [[ -z ${tcp_rules} ]] && [[ -z ${udp_rules} ]]; then
        echo -e "当前未放行任何入网端口（除SSH端口外）" && echo -e "==============================================="
    fi
}

# 放行入网端口
able_want_port_in() {
    display_in_port
    s="add"
    input_able_want_inport
    set_in_ports
    echo -e "${Info} 已放行端口 [ ${PORT} ] !\n"
    able_port_Type_1="1"
    while true; do
        input_able_want_inport
        set_in_ports
        echo -e "${Info} 已放行端口 [ ${PORT} ] !\n"
    done
}

input_able_want_inport() {
    echo -e "请输入欲放行的 入网端口（单端口/多端口/连续端口段）"
    if [[ ${able_port_Type_1} != "1" ]]; then
        echo -e "${Green_font_prefix}========入网端口示例说明========${Font_color_suffix}
 单端口：25（单个端口）
 多端口：25,26,465,587（多个端口用英文逗号分割）
 连续端口段：25-587（25-587之间的所有端口）" && echo
    fi
    read -e -p "(回车默认取消):" PORT
    [[ -z "${PORT}" ]] && echo "已取消..." && display_in_port && exit 0
}

# 取消放行入网端口
disable_want_port_in() {
    display_in_port
    s="delete"
    input_disable_want_inport
    set_in_ports
    echo -e "${Info} 已取消放行端口 [ ${PORT} ] !\n"
    able_port_Type_1="1"
    while true; do
        input_disable_want_inport
        set_in_ports
        echo -e "${Info} 已取消放行端口 [ ${PORT} ] !\n"
    done
}

input_disable_want_inport() {
    echo -e "请输入欲取消的 入网端口（单端口/多端口/连续端口段）"
    if [[ ${able_port_Type_1} != "1" ]]; then
        echo -e "${Green_font_prefix}========入网端口示例说明========${Font_color_suffix}
 单端口：25（单个端口）
 多端口：25,26,465,587（多个端口用英文逗号分割）
 连续端口段：25-587（25-587之间的所有端口）" && echo
    fi
    read -e -p "(回车默认取消):" PORT
    [[ -z "${PORT}" ]] && echo "已取消..." && display_in_port && exit 0
}

# 设置入网端口规则
set_in_ports() {
    # 转换端口格式，处理连续端口段（从n:m转为n-m）
    PORT=${PORT//:/-}

    if [[ "$s" == "add" ]]; then
        # 检查该端口是否已存在
        existing_tcp=$(nft -a list chain inet filter input | grep "tcp dport { $PORT }" | grep "shellsettcp")
        existing_udp=$(nft -a list chain inet filter input | grep "udp dport { $PORT }" | grep "shellsetudp")

        if [[ -n "$existing_tcp" && -n "$existing_udp" ]]; then
            echo -e "${Yellow_font_prefix}[警告]${Font_color_suffix} 端口 $PORT 已在放行列表中，跳过添加"
            return
        fi

        # 添加新规则
        nft add rule inet filter input tcp dport { $PORT } accept comment \"shellsettcp\" || return 1
        nft add rule inet filter input udp dport { $PORT } accept comment \"shellsetudp\" || return 1
    elif [[ "$s" == "delete" ]]; then
        # 先列出所有包含该端口的规则
        tcp_rules=$(nft -a list chain inet filter input | grep -E "tcp dport (\\{[^}]*${PORT}[^}]*\\}|${PORT})" | grep "shellsettcp")
        udp_rules=$(nft -a list chain inet filter input | grep -E "udp dport (\\{[^}]*${PORT}[^}]*\\}|${PORT})" | grep "shellsetudp")

        # 如果没有找到规则，提示用户
        if [[ -z "$tcp_rules" && -z "$udp_rules" ]]; then
            echo -e "${Yellow_font_prefix}[警告]${Font_color_suffix} 未找到端口 $PORT 的规则，无需删除"
            return
        fi

        # 删除TCP规则
        delete_filter_rule_lines "$tcp_rules" input || return 1

        # 删除UDP规则
        delete_filter_rule_lines "$udp_rules" input || return 1
    fi

    save_nftables_rules
}

# 入网IP控制函数
# 显示已放行的IP
display_in_ip() {
    # 检索放行IP规则
    ip_rules=$(nft -a list chain inet filter input | grep "shellsetip")

    if [[ -n ${ip_rules} ]]; then
        echo -e "===============${Red_background_prefix} 当前已放行 IP ${Font_color_suffix}==============="

        # 处理IPv4规则
        ipv4_rules=$(echo "$ip_rules" | grep "ip saddr")
        if [[ -n "$ipv4_rules" ]]; then
            echo "IPv4地址:"
            echo "$ipv4_rules" | while read -r line; do
                if [[ $line =~ ip[[:space:]]+saddr[[:space:]]+([0-9./]+) ]]; then
                    echo " ${BASH_REMATCH[1]}"
                fi
            done
            echo
        fi

        # 处理IPv6规则
        ipv6_rules=$(echo "$ip_rules" | grep "ip6 saddr")
        if [[ -n "$ipv6_rules" ]]; then
            echo "IPv6地址:"
            echo "$ipv6_rules" | while read -r line; do
                if [[ $line =~ ip6[[:space:]]+saddr[[:space:]]+([0-9a-fA-F:./]+) ]]; then
                    echo " ${BASH_REMATCH[1]}"
                fi
            done
            echo
        fi

        echo -e "==============================================="
    else
        echo -e "===============${Red_background_prefix} 当前未放行任何 IP ${Font_color_suffix}==============="
        echo -e "==============================================="
    fi
}

# 放行入网IP
able_in_ips() {
    display_in_ip
    s="add"
    input_able_want_inip
    set_in_ips
    echo -e "${Info} 已放行IP [ ${IP} ] !\n"
    able_ip_Type_1="1"
    while true; do
        input_able_want_inip
        set_in_ips
        echo -e "${Info} 已放行IP [ ${IP} ] !\n"
    done
}

input_able_want_inip() {
    echo -e "请输入欲放行的 入网IP（单IP/多IP段）"
    if [[ ${able_ip_Type_1} != "1" ]]; then
        echo -e "${Green_font_prefix}========入网IP示例说明========${Font_color_suffix}
 单IP：192.168.1.1（单个IP）
 多IP：192.168.1.1,10.10.10.1（多个IP用英文逗号分割）
 IP段：192.168.1.0/24（使用CIDR表示法）" && echo
    fi
    read -e -p "(回车默认取消):" IP
    [[ -z "${IP}" ]] && echo "已取消..." && display_in_ip && exit 0
}

# 取消放行入网IP
disable_want_ip_in() {
    display_in_ip
    s="delete"
    input_disable_want_inip
    set_in_ips
    echo -e "${Info} 已取消放行IP [ ${IP} ] !\n"
    able_ip_Type_1="1"
    while true; do
        input_disable_want_inip
        set_in_ips
        echo -e "${Info} 已取消放行IP [ ${IP} ] !\n"
    done
}

input_disable_want_inip() {
    echo -e "请输入欲取消放行的 入网IP（单IP/多IP段）"
    if [[ ${able_ip_Type_1} != "1" ]]; then
        echo -e "${Green_font_prefix}========入网IP示例说明========${Font_color_suffix}
 单IP：192.168.1.1（单个IP）
 多IP：192.168.1.1,10.10.10.1（多个IP用英文逗号分割）
 IP段：192.168.1.0/24（使用CIDR表示法）" && echo
    fi
    read -e -p "(回车默认取消):" IP
    [[ -z "${IP}" ]] && echo "已取消..." && display_in_ip && exit 0
}

# 设置入网IP规则
set_in_ips() {
    # 处理多个IP，以逗号分隔
    IFS=',' read -ra IPS <<<"$IP"

    for ip in "${IPS[@]}"; do
        if [[ "$s" == "add" ]]; then
            # 判断IPv4或IPv6
            if [[ $ip == *":"* ]]; then
                # IPv6地址
                nft add rule inet filter input ip6 saddr "$ip" accept comment \"shellsetip\" || return 1
            else
                # IPv4地址
                nft add rule inet filter input ip saddr "$ip" accept comment \"shellsetip\" || return 1
            fi
        elif [[ "$s" == "delete" ]]; then
            # 删除匹配的规则
            if [[ $ip == *":"* ]]; then
                # IPv6地址
                matching_rules=$(nft -a list chain inet filter input | grep -F "ip6 saddr $ip" | grep "shellsetip" || true)
                delete_filter_rule_lines "$matching_rules" input || return 1
            else
                # IPv4地址
                matching_rules=$(nft -a list chain inet filter input | grep -F "ip saddr $ip" | grep "shellsetip" || true)
                delete_filter_rule_lines "$matching_rules" input || return 1
            fi
        fi
    done

    save_nftables_rules
}

# 清空重建规则
clear_rebuild_ipta() {
    setup_nftables_base || return 1
    echo "已重建 Gnftato 规则，保留 Docker 及其他工具管理的表"
    echo "已放行 SSH端口：${PORT}、80/tcp、443/tcp 及指定的 Web 端口"

}

# 检查网络环境
