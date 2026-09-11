# shellcheck shell=bash
show_main_menu() {
    echo && echo -e " nftables防火墙 管理脚本 ${Red_font_prefix}[v${sh_ver}]${Font_color_suffix}
  -- 参考iPtato.sh脚本实现 --
  -- 使用nftables --
    
$(check_filtering_mode)

————————————
  ${Red_font_prefix}出网方向功能
  ${Green_font_prefix}0.${Font_color_suffix} 查看 当前封禁列表
  ${Green_font_prefix}1.${Font_color_suffix} 封禁 BT、PT
  ${Green_font_prefix}2.${Font_color_suffix} 封禁 SPAM(垃圾邮件)
  ${Green_font_prefix}3.${Font_color_suffix} 封禁 BT、PT、SPAM
  ${Green_font_prefix}4.${Font_color_suffix} 封禁 自定义  端口
  ${Green_font_prefix}5.${Font_color_suffix} 封禁 自定义关键词
  ${Green_font_prefix}6.${Font_color_suffix} 解封 BT、PT
  ${Green_font_prefix}7.${Font_color_suffix} 解封 SPAM(垃圾邮件)
  ${Green_font_prefix}8.${Font_color_suffix} 解封 BT、PT+SPAM
  ${Green_font_prefix}9.${Font_color_suffix} 解封 自定义  端口
 ${Green_font_prefix}10.${Font_color_suffix} 解封 自定义关键词
 ${Green_font_prefix}11.${Font_color_suffix} 解封 所有  关键词
 ${Green_font_prefix}12.${Font_color_suffix} 封禁 Blocklists

————————————
 ${Red_font_prefix}入网方向功能

${Green_font_prefix}13.${Font_color_suffix} 查看 当前放行端口
${Green_font_prefix}14.${Font_color_suffix} 查看 当前放行IP

${Green_font_prefix}15.${Font_color_suffix} 放行 自定义  端口
${Green_font_prefix}16.${Font_color_suffix} 删除 已放行  端口
${Green_font_prefix}17.${Font_color_suffix} 放行 自定义 IP
${Green_font_prefix}18.${Font_color_suffix} 删除 已放行 IP

————————————
${Red_font_prefix}DDoS防御功能

${Green_font_prefix}22.${Font_color_suffix} 配置 DDoS防御规则
${Green_font_prefix}23.${Font_color_suffix} 自定义端口 DDoS防御
${Green_font_prefix}24.${Font_color_suffix} 管理 IP黑白名单
${Green_font_prefix}25.${Font_color_suffix} 查看 当前防御状态

————————————
${Red_font_prefix}增强功能

${Green_font_prefix}19.${Font_color_suffix} 查看 当前SSH端口
${Green_font_prefix}20.${Font_color_suffix} 重建 Gnftato 规则(保留 Docker 规则)

————————————
${Green_font_prefix}21.${Font_color_suffix} 升级脚本
${Red_font_prefix}注意:${Font_color_suffix} 本脚本使用nftables，支持自动安装关键词过滤模块
————————————
" && echo
    shell_run_tips
}

# 主程序
if [[ "${1:-}" == "--json" ]]; then
    if [[ $# -eq 1 ]]; then
        json_command=help
        json_output=$(NFTATO_JSON_CHILD=1 bash "$0" --help 2>&1)
    else
        json_command=$2
        json_output=$(NFTATO_JSON_CHILD=1 bash "$0" "${@:2}" 2>&1)
    fi
    json_status=$?
    emit_json_result "$json_command" "$json_status" "$json_output"
    exit "$json_status"
fi

requested_action=${1:-}
action=$(resolve_action "$requested_action")
extra_param=${2:-}

# Help must be available without root privileges or environment changes.
if [[ "$action" == "help" || "$action" == "-h" || "$action" == "--help" ]]; then
    usage
    exit 0
fi

validate_named_invocation "$@" || exit 2
if [[ $is_automated -eq 1 && -n "$requested_action" && "$action" != "20" ]]; then
    echo "错误: AUTOMATED 模式仅支持初始化或 rules:rebuild（20）" >&2
    exit 2
fi

require_root || exit 1
check_system
check_run
check_docker_env

# 检查是否在自动化模式下运行
if [ $is_automated -eq 1 ]; then
    echo -e "${Info} 自动化模式：开始初始化环境"
    # 在自动模式下，直接执行初始化
    if [ "$runflag" -eq 1 ]; then
        setup_nftables_base || exit 1
    fi
    echo -e "${Info} 自动化模式：初始化完成，防火墙已设置"
    exit 0
fi

if [[ ! -z $action ]]; then
    # 支持数字参数，直接执行对应功能
    case "$action" in
    0)
        view_all_disable_out
        exit $?
        ;;
    1)
        disable_btpt
        exit $?
        ;;
    2)
        disable_spam
        exit $?
        ;;
    3)
        disable_all_out
        exit $?
        ;;
    4)
        if [[ -z $extra_param ]]; then
            disable_want_port_out
        else
            non_interactive_port_out "$extra_param"
        fi
        exit $?
        ;;
    5)
        if [[ -z $extra_param ]]; then
            disable_want_keyworld_out
        else
            non_interactive_keyword_ban "$extra_param"
        fi
        exit $?
        ;;
    6)
        able_btpt
        exit $?
        ;;
    7)
        able_spam
        exit $?
        ;;
    8)
        able_all_out
        exit $?
        ;;
    9)
        if [[ -z $extra_param ]]; then
            able_want_port_out
        else
            # 注意：此函数已修复，现在能正确解封端口
            # 之前问题：grep匹配模式太严格，无法匹配实际nft规则中的端口格式
            # 修复方案：使用更灵活的正则表达式匹配端口号并查找对应的规则句柄
            non_interactive_port_unban "$extra_param"
        fi
        exit $?
        ;;
    10)
        if [[ -z $extra_param ]]; then
            able_want_keyworld_out
        else
            non_interactive_keyword_unban "$extra_param"
        fi
        exit $?
        ;;
    11)
        able_all_keyworld_out
        exit $?
        ;;
    12)
        diable_blocklist_out
        exit $?
        ;;
    13)
        display_in_port
        exit $?
        ;;
    14)
        display_in_ip
        exit $?
        ;;
    15)
        if [[ -z $extra_param ]]; then
            able_want_port_in
        else
            non_interactive_inport_allow "$extra_param"
        fi
        exit $?
        ;;
    16)
        if [[ -z $extra_param ]]; then
            disable_want_port_in
        else
            non_interactive_inport_disallow "$extra_param"
        fi
        exit $?
        ;;
    17)
        if [[ -z $extra_param ]]; then
            able_in_ips
        else
            non_interactive_inip_allow "$extra_param"
        fi
        exit $?
        ;;
    18)
        if [[ -z $extra_param ]]; then
            disable_want_ip_in
        else
            non_interactive_inip_disallow "$extra_param"
        fi
        exit $?
        ;;
    19)
        display_ssh
        exit $?
        ;;
    20)
        clear_rebuild_ipta
        exit $?
        ;;
    21)
        Update_Shell
        exit $?
        ;;
    22)
        setup_ddos_protection
        exit $?
        ;;
    23)
        if [[ -z $extra_param ]]; then
            setup_custom_port_protection
        else
            port=$extra_param
            proto_type=$3
            max_conn=$4
            max_rate_min=$5
            max_rate_sec=$6
            ban_hours=$7
            non_interactive_custom_port_protection "$port" "$proto_type" "$max_conn" "$max_rate_min" "$max_rate_sec" "$ban_hours"
        fi
        exit $?
        ;;
    24)
        if [[ -z $extra_param ]]; then
            manage_ip_lists
        else
            action_type=$extra_param
            ip=$3
            duration=$4
            non_interactive_ip_list_manage "$action_type" "$ip" "$duration"
        fi
        exit $?
        ;;
    25)
        view_defense_status
        exit $?
        ;;
    "help" | "-h" | "--help")
        usage
        exit 0
        ;;
    # 兼容旧的字符串参数
    "banbt") disable_btpt; exit $? ;;
    "banspam") disable_spam; exit $? ;;
    "banall") disable_all_out; exit $? ;;
    "unbanbt") able_btpt; exit $? ;;
    "unbanspam") able_spam; exit $? ;;
    "unbanall") able_all_out; exit $? ;;
    *)
        echo "无效的参数: $action"
        usage
        exit 1
        ;;
    esac
fi

if [ $is_automated -eq 1 ]; then
    # 在自动模式下，跳过菜单直接退出
    exit 0
else
    # 只在非自动模式下显示菜单
    show_main_menu
    read -e -p " 请输入数字 [0-25]:" num
    # ... 现有代码 ...
    case "$num" in
    0)
        view_all_disable_out
        ;;
    1)
        disable_btpt
        ;;
    2)
        disable_spam
        ;;
    3)
        disable_all_out
        ;;
    4)
        disable_want_port_out
        ;;
    5)
        disable_want_keyworld_out
        ;;
    6)
        able_btpt
        ;;
    7)
        able_spam
        ;;
    8)
        able_all_out
        ;;
    9)
        able_want_port_out
        ;;
    10)
        able_want_keyworld_out
        ;;
    11)
        able_all_keyworld_out
        ;;
    12)
        diable_blocklist_out
        ;;
    13)
        display_in_port
        ;;
    14)
        display_in_ip
        ;;
    15)
        able_want_port_in
        ;;
    16)
        disable_want_port_in
        ;;
    17)
        able_in_ips
        ;;
    18)
        disable_want_ip_in
        ;;
    19)
        display_ssh
        ;;
    20)
        clear_rebuild_ipta
        ;;
    21)
        Update_Shell
        ;;
    22)
        setup_ddos_protection
        ;;
    23)
        setup_custom_port_protection
        ;;
    24)
        manage_ip_lists
        ;;
    25)
        view_defense_status
        ;;
    *)
        echo "请输入正确数字 [0-25]"
        ;;
    esac

fi
