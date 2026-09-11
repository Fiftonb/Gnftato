# shellcheck shell=bash
display_out_port() {
    # 检索出网端口封禁规则
    tcp_block_rules=$(nft -a list chain inet filter output | grep "出网端口封禁TCP")
    udp_block_rules=$(nft -a list chain inet filter output | grep "出网端口封禁UDP")
    spam_block_rules=$(nft -a list chain inet filter output | grep "SPAM端口封禁")

    echo -e "===============${Red_background_prefix} 当前已封禁 端口 ${Font_color_suffix}==============="

    if [[ -n "${tcp_block_rules}" ]] || [[ -n "${udp_block_rules}" ]] || [[ -n "${spam_block_rules}" ]]; then
        # 处理TCP规则
        if [[ -n "${tcp_block_rules}" ]]; then
            echo "TCP封禁端口:"
            echo "${tcp_block_rules}" | while read -r line; do
                if [[ $line =~ dport[[:space:]]+([0-9,\-]+) ]]; then
                    echo " ${BASH_REMATCH[1]}"
                elif [[ $line =~ dport[[:space:]]+\{[[:space:]]*(.*)[[:space:]]*\} ]]; then
                    echo " ${BASH_REMATCH[1]}"
                fi
            done
            echo
        fi

        # 处理UDP规则
        if [[ -n "${udp_block_rules}" ]]; then
            echo "UDP封禁端口:"
            echo "${udp_block_rules}" | while read -r line; do
                if [[ $line =~ dport[[:space:]]+([0-9,\-]+) ]]; then
                    echo " ${BASH_REMATCH[1]}"
                elif [[ $line =~ dport[[:space:]]+\{[[:space:]]*(.*)[[:space:]]*\} ]]; then
                    echo " ${BASH_REMATCH[1]}"
                fi
            done
            echo
        fi

        # 处理SPAM封禁规则
        if [[ -n "${spam_block_rules}" ]]; then
            echo "SPAM封禁端口:"
            echo "${spam_block_rules}" | while read -r line; do
                if [[ $line =~ dport[[:space:]]+([0-9,\-]+) ]]; then
                    echo " ${BASH_REMATCH[1]}"
                elif [[ $line =~ dport[[:space:]]+\{[[:space:]]*(.*)[[:space:]]*\} ]]; then
                    echo " ${BASH_REMATCH[1]}"
                fi
            done
            echo
        fi

        echo -e "==============================================="
    else
        echo -e "当前未封禁任何端口" && echo -e "==============================================="
    fi
}

# 封禁指定出网端口
disable_want_port_out() {
    echo -e "请输入要封禁出网的端口"
    PORT=$(auto_read "(回车默认取消):" "")

    if [[ -z "${PORT}" ]]; then
        echo "已取消..." && display_out_port && exit 0
    fi

    s="add"
    set_out_ports
    echo -e "${Info} 已封禁端口 [ ${PORT} ] !\n"
    disable_port_type_1="1"
    while true; do
        input_disable_want_outport
        set_out_ports
        echo -e "${Info} 已封禁端口 [ ${PORT} ] !\n"
    done
    display_out_port
}

input_disable_want_outport() {
    echo -e "请输入欲封禁的 出网端口（单端口/多端口/连续端口段）"
    if [[ ${disable_port_Type_1} != "1" ]]; then
        echo -e "${Green_font_prefix}========出网端口示例说明========${Font_color_suffix}
 单端口：25（单个端口）
 多端口：25,26,465,587（多个端口用英文逗号分割）
 连续端口段：25-587（25-587之间的所有端口）" && echo
    fi
    read -e -p "(回车默认取消):" PORT
    [[ -z "${PORT}" ]] && echo "已取消..." && display_out_port && exit 0
}

# 设置出网端口规则
delete_filter_rule_lines() {
    local rule_lines=${1:-} line handle
    while IFS= read -r line; do
        [[ -n "$line" ]] || continue
        handle=$(grep -o 'handle [0-9]*' <<<"$line" | awk '{print $2}')
        if [[ -n "$handle" ]]; then
            nft delete rule inet filter "${2:?missing chain}" handle "$handle" || return 1
        fi
    done <<<"$rule_lines"
}

set_out_ports() {
    # 转换端口格式，处理连续端口段（从n:m转为n-m）
    PORT=${PORT//:/-}

    # 处理TCP协议
    if [[ "$s" == "add" ]]; then
        nft add rule inet filter output tcp dport { $PORT } reject comment \"出网端口封禁TCP\" || return 1
        nft add rule inet filter output udp dport { $PORT } drop comment \"出网端口封禁UDP\" || return 1
    elif [[ "$s" == "delete" ]]; then
        # 查找并删除匹配的规则
        # 修改搜索模式以确保找到正确的规则
        # 更新后的代码应该是：
        matching_rules=$(nft -a list chain inet filter output | grep "dport.*$PORT" | grep -i "出网端口封禁TCP\|出网端口封禁UDP" || true)
        delete_filter_rule_lines "$matching_rules" output || return 1
    fi

    save_nftables_rules
}

# 解封指定出网端口
able_want_port_out() {
    s="delete"
    input_able_want_outport
    set_out_ports
    echo -e "${Info} 已取消封禁端口 [ ${PORT} ] !\n"
    able_port_type_1="1"
    while true; do
        input_able_want_outport
        set_out_ports
        echo -e "${Info} 已取消封禁端口 [ ${PORT} ] !\n"
    done
    display_out_port
}

input_able_want_outport() {
    echo -e "请输入欲取消封禁的 出网端口（单端口/多端口/连续端口段）"
    if [[ ${able_port_Type_1} != "1" ]]; then
        echo -e "${Green_font_prefix}========出网端口示例说明========${Font_color_suffix}
 单端口：25（单个端口）
 多端口：25,26,465,587（多个端口用英文逗号分割）
 连续端口段：25-587（25-587之间的所有端口）" && echo
    fi
    read -e -p "(回车默认取消):" PORT
    [[ -z "${PORT}" ]] && echo "已取消..." && display_out_port && exit 0
}

# 出网关键词控制函数
# 显示已封禁的关键词
display_out_keyworld() {
    # 从本地文件读取关键词列表
    if [ -f "$keywords_file" ]; then
        out_keyword_list=$(cat "$keywords_file")
    else
        out_keyword_list=""
    fi

    # 从iptables规则中获取实际生效的关键词
    iptables_keywords=$(iptables -t mangle -L OUTPUT -n | grep "STRING match" | sed -r 's/.*STRING match \"([^\"]+)\".*/\1/')

    echo -e "==============${Red_background_prefix} 当前已封禁 关键词 ${Font_color_suffix}=============="
    if [ -n "$out_keyword_list" ] || [ -n "$iptables_keywords" ]; then
        # 显示使用的过滤方式
        if [[ $USE_FILE_ONLY -eq 1 ]]; then
            echo -e "${Yellow_font_prefix}[警告]${Font_color_suffix} 系统不支持实际的关键词过滤，仅显示记录的关键词列表"
            echo -e "$out_keyword_list"
        elif [[ $USE_IPTABLES_FOR_KEYWORDS -eq 1 ]]; then
            echo -e "${Green_font_prefix}[信息]${Font_color_suffix} 使用iptables的string模块进行关键词过滤"

            # 检查文件中的关键词与实际iptables规则是否一致
            if [ -n "$iptables_keywords" ]; then
                echo -e "当前生效的关键词:"
                echo -e "$iptables_keywords"
            else
                echo -e "$out_keyword_list"
                echo -e "${Yellow_font_prefix}[警告]${Font_color_suffix} 关键词记录与实际过滤规则不一致，请重新应用规则"
            fi
        fi
        echo -e "==============================================="
    else
        echo -e "当前未封禁任何关键词" && echo -e "==============================================="
    fi
}

# 封禁指定关键词
disable_want_keyworld_out() {
    s="add"
    input_want_keyworld_type "ban"
    set_out_keywords
    echo -e "${Info} 已封禁关键词 [ ${key_word} ] !\n"
    while true; do
        input_want_keyworld_type "ban" "ban_1"
        set_out_keywords
        echo -e "${Info} 已封禁关键词 [ ${key_word} ] !\n"
    done
    display_out_keyworld
}

input_want_keyworld_type() {
    Type=$1
    Type_1=$2
    if [[ $Type_1 != "ban_1" ]]; then
        echo -e "请选择输入类型：
 1. 手动输入（只支持单个关键词）
 2. 本地文件读取（支持批量读取关键词，每行一个关键词）
 3. 网络地址读取（支持批量读取关键词，每行一个关键词）" && echo
        read -e -p "(默认: 1. 手动输入):" key_word_type
    fi
    [[ -z "${key_word_type}" ]] && key_word_type="1"
    if [[ ${key_word_type} == "1" ]]; then
        if [[ $Type == "ban" ]]; then
            input_disable_want_keyworld
        else
            input_able_want_keyworld
        fi
    elif [[ ${key_word_type} == "2" ]]; then
        input_disable_keyworlds_file
    elif [[ ${key_word_type} == "3" ]]; then
        input_disable_keyworlds_url
    else
        if [[ $Type == "ban" ]]; then
            input_disable_want_keyworld
        else
            input_able_want_keyworld
        fi
    fi
}

input_disable_want_keyworld() {
    echo -e "请输入欲封禁的 关键词（域名等，仅支持单个关键词）"
    if [[ ${Type_1} != "ban_1" ]]; then
        echo -e "${Green_font_prefix}========示例说明========${Font_color_suffix}
 关键词：youtube，即禁止访问任何包含关键词 youtube 的域名。
 关键词：youtube.com，即禁止访问任何包含关键词 youtube.com 的域名（泛域名屏蔽）。
 关键词：www.youtube.com，即禁止访问任何包含关键词 www.youtube.com 的域名（子域名屏蔽）。
 更多效果自行测试（如关键词 .zip 即可禁止下载任何 .zip 后缀的文件）。" && echo
    fi
    read -e -p "(回车默认取消):" key_word
    [[ -z "${key_word}" ]] && echo "已取消..." && display_out_keyworld && exit 0
}

input_able_want_keyworld() {
    echo -e "请输入欲解封的 关键词（根据上面的列表输入完整准确的 关键词）" && echo
    read -e -p "(回车默认取消):" key_word
    [[ -z "${key_word}" ]] && echo "已取消..." && display_out_keyworld && exit 0
}

# 从文件读取关键词
input_disable_keyworlds_file() {
    echo -e "请输入欲封禁/解封的 关键词本地文件（请使用绝对路径）" && echo
    read -e -p "(默认 读取脚本同目录下的 key_word.txt ):" key_word_file
    [[ -z "${key_word_file}" ]] && key_word_file="key_word.txt"
    if [[ -e "${key_word_file}" ]]; then
        key_word=$(cat "${key_word_file}")
        [[ -z ${key_word} ]] && echo -e "${Error} 文件内容为空 !" && View_ALL && exit 0
    else
        echo -e "${Error} 没有找到文件 ${key_word_file} !" && display_out_keyworld && exit 0
    fi
}

# 从URL读取关键词
input_disable_keyworlds_url() {
    echo -e "请输入欲封禁/解封的 关键词网络文件地址（例如 http://xxx.xx/key_word.txt）" && echo
    read -e -p "(回车默认取消):" key_word_url
    [[ -z "${key_word_url}" ]] && echo "已取消..." && display_out_keyworld && exit 0
    key_word=$(wget --no-check-certificate -t3 -T5 -qO- "${key_word_url}")
    [[ -z ${key_word} ]] && echo -e "${Error} 网络文件内容为空或访问超时 !" && display_out_keyworld && exit 0
}

# 设置关键词过滤规则
set_out_keywords() {
    # 强制设置为使用iptables进行关键词过滤
    USE_IPTABLES_FOR_KEYWORDS=1

    # 确保xt_string模块已加载
    modprobe xt_string

    # 检查模块是否加载成功
    if ! lsmod | grep -q "xt_string"; then
        echo "${Red_font_prefix}[错误]${Font_color_suffix} xt_string模块未加载，关键词过滤将不可用"
        USE_FILE_ONLY=1
    else
        USE_FILE_ONLY=0
    fi

    while IFS= read -r i || [[ -n "$i" ]]; do
        if [[ -n "$i" ]]; then
            if [[ "$s" == "add" ]]; then
                # 记录关键词到本地文件以便管理
                # 先检查关键词是否已存在
                if [ -f "$keywords_file" ] && grep -Fxq -- "$i" "$keywords_file"; then
                    echo "关键词【${i}】已在封禁列表中，跳过"
                    continue
                fi

                echo "$i" >>"$keywords_file"

                # 根据可用模块选择过滤实现方式
                if [[ $USE_FILE_ONLY -eq 1 ]]; then
                    # 只添加注释信息，不实际过滤
                    echo "已添加关键词【${i}】到封禁列表（仅记录模式，未实际过滤）"
                else
                    # 使用iptables的string模块在mangle表中添加过滤规则
                    iptables -t mangle -A OUTPUT -m string --string "$i" --algo bm --to 65535 -j DROP || return 1
                    echo "已使用iptables添加关键词【${i}】过滤规则"
                fi
            elif [[ "$s" == "delete" ]]; then
                # 从关键词文件中移除
                if [ -f "$keywords_file" ]; then
                    keyword_file_stage=$(mktemp "${keywords_file}.XXXXXX") || return 1
                    while IFS= read -r saved_keyword || [[ -n "$saved_keyword" ]]; do
                        [[ "$saved_keyword" == "$i" ]] || printf '%s\n' "$saved_keyword" >>"$keyword_file_stage"
                    done <"$keywords_file"
                    if ! mv -f -- "$keyword_file_stage" "$keywords_file"; then
                        rm -f -- "$keyword_file_stage"
                        return 1
                    fi
                fi

                # 使用与添加时完全相同的参数检查并删除规则。关键词始终
                # 作为单独参数传递，因此空格、撇号和 URL 字符不会被解释。
                if [[ $USE_FILE_ONLY -eq 0 ]]; then
                    while iptables -t mangle -C OUTPUT -m string --string "$i" --algo bm --to 65535 -j DROP 2>/dev/null; do
                        iptables -t mangle -D OUTPUT -m string --string "$i" --algo bm --to 65535 -j DROP || return 1
                    done

                    echo "已解除关键词【${i}】的封禁"
                fi
            fi
        fi
    done <<<"$key_word"

    # 保存iptables规则
    save_iptables_rules || return 1
}

# 检测过滤模式并显示状态
check_filtering_mode() {
    # 检查xt_string模块是否加载
    if lsmod | grep -q "xt_string"; then
        USE_IPTABLES_FOR_KEYWORDS=1
        USE_FILE_ONLY=0
    else
        USE_IPTABLES_FOR_KEYWORDS=0
        USE_FILE_ONLY=1
    fi

    # 检查实际使用的规则类型
    iptables_rules=$(iptables -t mangle -L OUTPUT | grep -c "string")

    if [[ $iptables_rules -gt 0 ]]; then
        # 如果检测到iptables规则，强制设置为iptables模式
        USE_IPTABLES_FOR_KEYWORDS=1
        USE_FILE_ONLY=0
    fi

    # 根据实际状态显示信息
    if [[ $USE_FILE_ONLY -eq 1 ]]; then
        echo -e "${Yellow_font_prefix}[警告]${Font_color_suffix} 当前系统不支持实际的关键词过滤，仅记录关键词列表"
        return
    fi

    if [[ $USE_IPTABLES_FOR_KEYWORDS -eq 1 ]]; then
        if lsmod | grep -q "xt_string"; then
            echo -e "${Green_font_prefix}[信息]${Font_color_suffix} 当前使用iptables的string模块进行关键词过滤"
        else
            echo -e "${Yellow_font_prefix}[警告]${Font_color_suffix} 未检测到xt_string模块，关键词过滤可能无法正常工作"
        fi
    fi
}

# 保存iptables规则
save_iptables_rules() {
    if [[ $USE_IPTABLES_FOR_KEYWORDS -eq 1 ]]; then
        echo "保存iptables规则..."
        if [ "$release" == "debian" ] || [ "$release" == "ubuntu" ]; then
            # 确保目录存在
            mkdir -p /etc/iptables || return 1
            iptables-save >/etc/iptables/rules.v4 || return 1

            # 创建网络接口启动时自动加载规则的脚本
            if [ ! -f "/etc/network/if-pre-up.d/iptables" ]; then
                mkdir -p /etc/network/if-pre-up.d || return 1
                cat >/etc/network/if-pre-up.d/iptables <<-EOF
#!/bin/bash
/sbin/iptables-restore < /etc/iptables/rules.v4
exit 0
EOF
                chmod +x /etc/network/if-pre-up.d/iptables || return 1
            fi

            # 对于systemd系统，也创建service文件
            if [ -d "/etc/systemd/system" ]; then
                cat >/etc/systemd/system/iptables-restore.service <<-EOF
[Unit]
Description=Restore iptables rules
Before=network-pre.target
Wants=network-pre.target

[Service]
Type=oneshot
ExecStart=/sbin/iptables-restore < /etc/iptables/rules.v4
RemainAfterExit=yes

[Install]
WantedBy=multi-user.target
EOF
                systemctl daemon-reload || return 1
                systemctl enable iptables-restore.service || return 1
            fi
        elif [ "$release" == "centos" ]; then
            # 检查是否有service命令
            if command -v service &>/dev/null; then
                service iptables save || return 1
            else
                # 如果没有service命令，手动保存
                mkdir -p /etc/sysconfig || return 1
                iptables-save >/etc/sysconfig/iptables || return 1

                # 对于CentOS系统，创建service文件
                if [ -d "/etc/systemd/system" ]; then
                    cat >/etc/systemd/system/iptables-restore.service <<-EOF
[Unit]
Description=Restore iptables rules
Before=network-pre.target
Wants=network-pre.target

[Service]
Type=oneshot
ExecStart=/sbin/iptables-restore < /etc/sysconfig/iptables
RemainAfterExit=yes

[Install]
WantedBy=multi-user.target
EOF
                    systemctl daemon-reload || return 1
                    systemctl enable iptables-restore.service || return 1
                fi
            fi
        fi
        echo "iptables规则已保存，并设置为开机自动加载"
    fi
}

# 解封指定关键词
able_want_keyworld_out() {
    s="delete"
    # 检查是否有封禁的关键词
    iptables_keywords=$(iptables -t mangle -L OUTPUT -n | grep "STRING match")
    keywords_from_file=""
    if [ -f "$keywords_file" ]; then
        keywords_from_file=$(cat "$keywords_file")
    fi

    if [[ -z "$iptables_keywords" ]] && [[ -z "$keywords_from_file" ]]; then
        echo -e "${Error} 检测到未封禁任何 关键词 !" && exit 0
    fi

    input_want_keyworld_type "unban"
    set_out_keywords
    echo -e "${Info} 已解封关键词 [ ${key_word} ] !\n"

    while true; do
        # 重新检查是否还有封禁的关键词
        iptables_keywords=$(iptables -t mangle -L OUTPUT -n | grep "STRING match")
        keywords_from_file=""
        if [ -f "$keywords_file" ]; then
            keywords_from_file=$(cat "$keywords_file")
        fi

        if [[ -z "$iptables_keywords" ]] && [[ -z "$keywords_from_file" ]]; then
            echo -e "${Error} 检测到未封禁任何 关键词 !" && exit 0
        fi

        input_want_keyworld_type "unban" "ban_1"
        set_out_keywords
        echo -e "${Info} 已解封关键词 [ ${key_word} ] !\n"
    done
    display_out_keyworld
}

# 解封所有关键词
able_all_keyworld_out() {
    # 检查是否有封禁的关键词
    if [ -f "$keywords_file" ] && [ -s "$keywords_file" ] || iptables -t mangle -L OUTPUT | grep -q "STRING"; then
        echo "清除所有关键词过滤规则..."

        # 清除所有iptables mangle表中的string匹配规则
        if iptables -t mangle -L OUTPUT | grep -q "STRING"; then
            echo "删除iptables字符串匹配规则..."

            # 使用计数器方式删除规则，直到没有匹配规则为止
            while iptables -t mangle -L OUTPUT | grep -q "STRING"; do
                # 始终删除第一条规则（因为规则号会变化）
                iptables -t mangle -D OUTPUT 1 || return 1
            done

            echo "iptables字符串匹配规则已删除"
        fi

        # 清空关键词文件
        >"$keywords_file"

        # 保存更改后的iptables规则
        save_iptables_rules || return 1

        display_out_keyworld
        echo -e "${Info} 已解封所有关键词 !"
    else
        echo -e "${Error} 检测到未封禁任何 关键词，请检查 !" && exit 0
    fi
}

# 查看所有封禁
view_all_disable_out() {
    echo
    display_out_port
    display_out_keyworld
    echo
}

# 封禁BT/PT/SPAM相关函数
# 封禁所有敏感服务
disable_all_out() {
    disable_btpt || return 1
    disable_spam || return 1
}

# 封禁BT/PT
disable_btpt() {
    # 检查是否已封禁BT/PT
    if [ -f "$keywords_file" ] && grep -q "torrent" "$keywords_file"; then
        echo -e "${Error} 检测到已封禁BT、PT 关键词，无需再次封禁 !" && exit 0
    fi

    s="add"
    set_bt || return 1
    echo -e "${Info} 已封禁BT、PT 关键词 !"
}

# 设置BT/PT封禁规则
set_bt() {
    key_word=${bt_key_word}
    set_out_keywords
}

# 封禁垃圾邮件端口
disable_spam() {
    # 检查是否已封禁SPAM端口
    spam_banned=$(nft list chain inet filter output | grep "${smtp_port}" | wc -l)
    [[ $spam_banned -gt 0 ]] && echo -e "${Error} 检测到已封禁SPAM(垃圾邮件) 端口，无需再次封禁 !" && exit 0

    s="add"
    set_spam || return 1
    echo -e "${Info} 已封禁SPAM(垃圾邮件) 端口 !"
}

# 设置SPAM端口封禁规则
set_spam() {
    # 合并所有SPAM相关端口
    all_spam_ports="${smtp_port},${pop3_port},${imap_port},${other_port}"

    if [[ "$s" == "add" ]]; then
        nft add rule inet filter output tcp dport { $all_spam_ports } reject comment \"SPAM端口封禁TCP\" || return 1
        nft add rule inet filter output udp dport { $all_spam_ports } drop comment \"SPAM端口封禁UDP\" || return 1
    elif [[ "$s" == "delete" ]]; then
        # 删除SPAM相关规则
        matching_rules=$(nft -a list chain inet filter output | grep "SPAM端口封禁" || true)
        delete_filter_rule_lines "$matching_rules" output || return 1
    fi

    save_nftables_rules
}

# 解封BT/PT/SPAM相关函数
# 解封所有封禁
able_all_out() {
    able_btpt || return 1
    able_spam || return 1
}

# 解封BT/PT
able_btpt() {
    # 检查是否已封禁BT/PT
    if [ ! -f "$keywords_file" ] || ! grep -q "torrent" "$keywords_file"; then
        echo -e "${Error} 检测到未封禁BT、PT 关键词，请检查 !" && exit 0
    fi

    s="delete"
    set_bt || return 1
    echo -e "${Info} 已解封BT、PT 关键词 !"
}

# 解封SPAM端口
able_spam() {
    # 检查是否已封禁SPAM端口
    spam_banned=$(nft list chain inet filter output | grep "SPAM端口封禁" | wc -l)
    [[ $spam_banned -eq 0 ]] && echo -e "${Error} 检测到未封禁SPAM(垃圾邮件) 端口，请检查 !" && exit 0

    s="delete"
    set_spam || return 1
    echo -e "${Info} 已解封SPAM(垃圾邮件) 端口 !"
}

# 封禁网络黑名单
diable_blocklist_out() {
    s="add"
    echo -e "正在连接 关键词网络文件地址"
    blocklist=$(wget --no-check-certificate -t3 -T5 -qO- "https://raw.githubusercontent.com/Aipblock/saveblocklist/main/block.txt")

    if [[ -z ${blocklist} ]]; then
        echo -e "${Error} 网络文件内容为空或访问超时 !"
        display_out_keyworld
        return 1
    fi

    # 使用现有的关键词过滤机制处理blocklist中的每一行
    key_word="${blocklist}"
    set_out_keywords || return 1

    echo -e "成功执行" && echo
}

# 入网端口控制函数
# 显示已放行的入网端口
