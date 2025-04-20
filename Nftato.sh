#!/usr/bin/env bash
PATH=/bin:/sbin:/usr/bin:/usr/sbin:/usr/local/bin:/usr/local/sbin:~/bin
export PATH
#=================================================
#       System Required: CentOS/Debian/Ubuntu
#       Description: nftables 出封禁 入放行
#       Version: 1.0.0
#=================================================

sh_ver="1.0.0"
Green_font_prefix="\033[32m"
Red_font_prefix="\033[31m"
Green_background_prefix="\033[42;37m"
Red_background_prefix="\033[41;37m"
Font_color_suffix="\033[0m"
Info="${Green_font_prefix}[信息]${Font_color_suffix}"
Error="${Red_font_prefix}[错误]${Font_color_suffix}"
Yellow_font_prefix="\033[33m"

# 全局配置变量
checkfile="/root/checkfile_nftato.txt"
nft_conf="/etc/nftables.conf"
nft_ruleset="/etc/nftables/ruleset.nft"
keywords_file="/etc/nftables/keywords.list"
USE_IPTABLES_FOR_KEYWORDS=0  # 是否使用iptables进行关键词过滤
USE_FILE_ONLY=0  # 是否只使用文件记录而不实际过滤

# 端口配置
smtp_port="25,26,465,587"
pop3_port="109,110,995"
imap_port="143,218,220,993"
other_port="24,50,57,105,106,158,209,1109,24554,60177,60179"
bt_key_word="torrent
.torrent
peer_id=
announce
info_hash
get_peers
find_node
BitTorrent
announce_peer
BitTorrent protocol
announce.php?passkey=
magnet:
xunlei
sandai
Thunder
XLLiveUD"

# 检查root权限
[[ $EUID -ne 0 ]] && echo -e "${Error} 必须使用root用户运行此脚本！\n" && exit 1

# 系统检测函数
check_system() {
    if [[ -f /etc/redhat-release ]]; then
        release="centos"
    elif cat /etc/issue | grep -q -E -i "debian"; then
        release="debian"
    elif cat /etc/issue | grep -q -E -i "ubuntu"; then
        release="ubuntu"
    elif cat /etc/issue | grep -q -E -i "centos|red hat|redhat"; then
        release="centos"
    elif cat /proc/version | grep -q -E -i "debian"; then
        release="debian"
    elif cat /proc/version | grep -q -E -i "ubuntu"; then
        release="ubuntu"
    elif cat /proc/version | grep -q -E -i "centos|red hat|redhat"; then
        release="centos"
    fi
    bit=$(uname -m)
}

# 检查脚本是否首次运行
check_run() {
    runflag=0
    if [ ! -e "${checkfile}" ]; then
        touch $checkfile
        echo "首次运行判断文件生成"
        set_environment
        echo "初次运行脚本 环境部署完成"
    else
        runflag=1
        echo "文件存在 脚本不是初次运行"
    fi
}

# 检查Docker环境
check_docker_env() {
    # 检测是否在Docker容器中运行
    if [ -f /.dockerenv ] || grep -q docker /proc/1/cgroup; then
        echo
        echo "${Red_font_prefix}[警告]${Font_color_suffix} 检测到当前在Docker容器环境中运行！"
        echo "在Docker环境中，防火墙规则可能会与宿主机产生冲突。"
        echo "建议在宿主机上运行此脚本，或确保Docker网络正确配置。"
        echo
        
        # 检测当前网络模式
        if [ -f /proc/net/route ]; then
            if grep -q "172." /proc/net/route || grep -q "10." /proc/net/route; then
                echo "${Green_font_prefix}[信息]${Font_color_suffix} 检测到容器使用桥接网络或自定义网络。"
                echo "请确保宿主机上的防火墙已正确配置端口映射和访问规则。"
                echo
            elif grep -q "eth0" /proc/net/route && ! grep -q "172." /proc/net/route; then
                echo "${Green_font_prefix}[信息]${Font_color_suffix} 检测到容器可能使用host网络模式。"
                echo "在host网络模式下，容器共享宿主机的网络命名空间，防火墙规则将直接影响宿主机。"
                echo
            fi
        fi
    fi
}

# 首次运行提示
shell_run_tips() {
    if [ ${runflag} -eq 0 ]; then
        echo
        echo "本脚本默认接管 控制出入网 权限"
        echo "入网端口仅放行了 SSH端口"
        echo
    fi
}

# 环境设置
set_environment() {
    disable_conflicting_firewalls
    install_nftables
    install_tool
    install_nftables_modules
    
    # 对iptables进行基本配置
    if [[ $USE_IPTABLES_FOR_KEYWORDS -eq 1 ]]; then
        # 确保iptables规则目录存在
        if [ "$release" == "debian" ] || [ "$release" == "ubuntu" ]; then
            mkdir -p /etc/iptables
        fi
        
        # 如果需要，配置iptables服务
        if [ "$release" == "centos" ] && command -v systemctl &>/dev/null; then
            systemctl enable iptables
            systemctl start iptables
        fi
        
        # 清除所有现有规则
        iptables -F
        iptables -X
        iptables -t nat -F
        iptables -t nat -X
        iptables -t mangle -F
        iptables -t mangle -X
        iptables -P INPUT ACCEPT
        iptables -P FORWARD ACCEPT
        iptables -P OUTPUT ACCEPT
        
        # 保存初始状态
        if [ "$release" == "debian" ] || [ "$release" == "ubuntu" ]; then
            iptables-save > /etc/iptables/rules.v4
            
            # 创建自动加载脚本
            cat > /etc/network/if-pre-up.d/iptables <<-EOF
#!/bin/bash
/sbin/iptables-restore < /etc/iptables/rules.v4
exit 0
EOF
            chmod +x /etc/network/if-pre-up.d/iptables
        elif [ "$release" == "centos" ]; then
            if command -v service &>/dev/null; then
                service iptables save
            else
                mkdir -p /etc/sysconfig
                iptables-save > /etc/sysconfig/iptables
            fi
        fi
    fi
    
    setup_nftables_base
    able_ssh_port
}

# 禁用冲突的防火墙
disable_conflicting_firewalls() {
    # 处理 firewalld (CentOS/RHEL)
    if command -v firewall-cmd &> /dev/null; then
        firestatus="$(firewall-cmd --state 2>/dev/null)"
        if [ "${firestatus}" == "running" ]; then
            echo "检测到firewalld正在运行，正在停止..."
            systemctl stop firewalld.service
            echo "禁止firewalld开机启动"
            systemctl disable firewalld.service
            echo "成功关闭firewalld"
        fi
    fi
    
    # 处理 ufw (Ubuntu/Debian)
    if command -v ufw &> /dev/null; then
        ufw_status=$(ufw status | grep -i "active")
        if [ -n "${ufw_status}" ]; then
            echo "检测到ufw正在运行，正在停止..."
            ufw disable
            echo "成功禁用ufw"
        fi
    fi
    
    # 处理 iptables
    if command -v iptables &> /dev/null; then
        iptables_service=$(systemctl is-active iptables 2>/dev/null)
        if [ "${iptables_service}" == "active" ]; then
            echo "检测到iptables服务正在运行，正在停止..."
            systemctl stop iptables
            systemctl disable iptables
            echo "成功禁用iptables服务"
        fi
        
        # 清空iptables规则
        if command -v iptables-save &> /dev/null; then
            echo "清空现有iptables规则..."
            iptables -F
            iptables -X
            iptables -t nat -F
            iptables -t nat -X
            iptables -t mangle -F
            iptables -t mangle -X
            iptables -P INPUT ACCEPT
            iptables -P FORWARD ACCEPT
            iptables -P OUTPUT ACCEPT
        fi
    fi
    
    echo "防火墙冲突检查完成"
}

# 安装nftables
install_nftables() {
    if ! command -v nft &> /dev/null; then
        echo "正在安装nftables..."
        if [ "$release" == "debian" ] || [ "$release" == "ubuntu" ]; then
            apt-get update
            apt-get install -y nftables
        elif [ "$release" == "centos" ]; then
            yum install -y nftables
        fi
    fi
    
    # 确保nftables服务启用
    systemctl enable nftables
    
    echo "nftables安装完成"
}

# 安装网络工具
install_tool() {
    getnetstat=$(netstat --version 2>/dev/null | awk 'NR==1{print $1}')
    if [ "$release" == "debian" ] || [ "$release" == "ubuntu" ]; then
        if [ -z "${getnetstat}" ]; then
            apt install -y net-tools
        fi
    elif [ "$release" == "centos" ]; then
        if [ -z "${getnetstat}" ]; then
            yum install -y net-tools
        fi
    fi
}

# 安装nftables字符串匹配模块和其他必要模块
install_nftables_modules() {
    echo "检查并安装nftables字符串匹配所需的模块..."
    
    # 测试string匹配是否可用
    if ! nft -e 'add rule inet filter input tcp string match "test" drop' &>/dev/null; then
        echo "nftables string匹配模块不可用，尝试安装所需模块..."
        
        # 检查当前已加载的模块
        if ! lsmod | grep -q "nft_string"; then
            echo "尝试加载nft_string模块..."
            modprobe nft_string || echo "无法直接加载nft_string模块，将尝试安装"
        fi
        
        # 根据发行版安装所需包
        if [ "$release" == "debian" ] || [ "$release" == "ubuntu" ]; then
            echo "安装Debian/Ubuntu所需包..."
            apt-get update
            apt-get install -y linux-modules-extra-$(uname -r) || echo "未找到额外模块包，尝试安装扩展包"
            apt-get install -y kmod xtables-addons-common xtables-addons-dkms
            
            # 如果内核版本较旧，尝试dkms方式
            if ! lsmod | grep -q "nft_string"; then
                echo "尝试通过dkms方式安装模块..."
                apt-get install -y dkms linux-headers-$(uname -r)
            fi
            
        elif [ "$release" == "centos" ]; then
            echo "安装CentOS所需包..."
            yum install -y kernel-modules-extra || echo "未找到额外模块包，尝试单独安装"
            yum install -y kmod-xtables-addons xtables-addons
            
            # 安装必要的开发工具，以便编译模块
            yum groupinstall -y "Development Tools"
            yum install -y kernel-devel-$(uname -r)
        fi
        
        # 尝试再次加载模块
        echo "尝试加载内核模块..."
        modprobe nf_tables
        modprobe nft_counter
        modprobe nf_tables_set
        
        # 特别尝试加载string模块
        modprobe nft_string || echo "警告: 无法加载nft_string模块"
        
        # 检查是否成功加载
        if lsmod | grep -q "nft_string"; then
            echo "nft_string模块已成功加载"
            # 确保使用nftables的string模块
            USE_IPTABLES_FOR_KEYWORDS=0
            USE_FILE_ONLY=0
        else
            echo "警告: nft_string模块未能加载，将使用备选的关键词过滤方法"
            
            # 尝试加载iptables的string模块作为备选
            echo "尝试加载iptables xt_string模块作为备选..."
            modprobe xt_string
            
            if lsmod | grep -q "xt_string"; then
                echo "xt_string模块已加载，将使用iptables进行关键词过滤"
                # 确保iptables可用
                if ! command -v iptables &>/dev/null; then
                    echo "安装iptables..."
                    if [ "$release" == "debian" ] || [ "$release" == "ubuntu" ]; then
                        apt-get install -y iptables iptables-persistent
                    elif [ "$release" == "centos" ]; then
                        yum install -y iptables iptables-services
                        systemctl enable iptables
                        systemctl start iptables
                    fi
                fi
                
                # 设置全局变量标记使用iptables
                USE_IPTABLES_FOR_KEYWORDS=1
                USE_FILE_ONLY=0
                
                # 确保iptables规则目录存在
                if [ "$release" == "debian" ] || [ "$release" == "ubuntu" ]; then
                    mkdir -p /etc/iptables
                fi
            else
                echo "警告: 所有string匹配模块都无法加载，将使用文件记录方式"
                USE_IPTABLES_FOR_KEYWORDS=0
                USE_FILE_ONLY=1
            fi
        fi
    else
        echo "nftables字符串匹配模块已可用"
        USE_IPTABLES_FOR_KEYWORDS=0
        USE_FILE_ONLY=0
    fi
}

# 设置nftables基础结构
setup_nftables_base() {
    # 创建目录
    mkdir -p /etc/nftables
    mkdir -p /etc/iptables
    
    # 确保关键词文件存在
    touch "$keywords_file"
    
    # 清空现有nftables规则
    nft flush ruleset
    
    # 若使用iptables清空filter和nat表规则，但保留mangle表的规则（用于关键词过滤）
    if command -v iptables &>/dev/null; then
        iptables -F
        iptables -X
        iptables -t nat -F
        iptables -t nat -X
        # 不清空mangle表，因为它可能包含关键词过滤规则
        iptables -P INPUT ACCEPT
        iptables -P FORWARD ACCEPT
        iptables -P OUTPUT ACCEPT
    fi
    
    # 创建基本表和链
    nft add table inet filter
    
    # 创建input链
    nft add chain inet filter input { type filter hook input priority 0\; policy drop\; }
    
    # 创建output链
    nft add chain inet filter output { type filter hook output priority 0\; policy accept\; }
    
    # 创建forward链
    nft add chain inet filter forward { type filter hook forward priority 0\; policy drop\; }
    
    # 创建mangle表用于非关键词过滤的mangle操作
    nft add table inet mangle
    nft add chain inet mangle prerouting { type filter hook prerouting priority -150\; }
    nft add chain inet mangle output { type filter hook output priority -150\; }
    
    # 添加基本规则
    # 允许已建立连接和相关流量
    nft add rule inet filter input ct state established,related accept
    
    # 允许本地回环接口
    nft add rule inet filter input iifname "lo" accept
    
    # 允许ICMP
    nft add rule inet filter input ip protocol icmp accept
    nft add rule inet filter input ip6 nexthdr icmpv6 accept
    
    # TTL匹配（等效于iptables的TTL匹配）
    nft add rule inet filter input ip ttl gt 80 accept
    
    # 保存规则
    save_nftables_rules
}

# 获取SSH端口
get_ssh_port() {
    PORT=$(netstat -anp | grep sshd | awk 'NR==1{print substr($4, index($4,":")+1)}')
    if [ -z "$PORT" ]; then
        PORT=22  # 默认SSH端口
    fi
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
    
    # 保存到配置文件
    nft list ruleset > $nft_ruleset
    
    # 创建nftables配置文件
    cat > $nft_conf <<EOF
#!/usr/sbin/nft -f

flush ruleset

include "$nft_ruleset"
EOF
    
    # 确保权限正确
    chmod 644 $nft_conf
    chmod 644 $nft_ruleset
    
    # 启用nftables服务
    systemctl restart nftables
    systemctl enable nftables
    
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
    s="add"
    input_disable_want_outport
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

input_disable_want_outport(){
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
set_out_ports() {
    # 转换端口格式，处理连续端口段（从n:m转为n-m）
    PORT=${PORT//:/-}
    
    # 处理TCP协议
    if [[ "$s" == "add" ]]; then
        nft add rule inet filter output tcp dport { $PORT } reject comment \"出网端口封禁TCP\"
        nft add rule inet filter output udp dport { $PORT } drop comment \"出网端口封禁UDP\"
    elif [[ "$s" == "delete" ]]; then
        # 查找并删除匹配的规则
        nft -a list chain inet filter output | grep "dport { $PORT } reject" | while read -r line; do
            handle=$(echo "$line" | grep -o "handle [0-9]*" | awk '{print $2}')
            if [ -n "$handle" ]; then
                nft delete rule inet filter output handle $handle
            fi
        done
        nft -a list chain inet filter output | grep "dport { $PORT } drop" | while read -r line; do
            handle=$(echo "$line" | grep -o "handle [0-9]*" | awk '{print $2}')
            if [ -n "$handle" ]; then
                nft delete rule inet filter output handle $handle
            fi
        done
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
    
    key_word_num=$(echo -e "${key_word}" | wc -l)
    for ((integer = 1; integer <= ${key_word_num}; integer++)); do
        i=$(echo -e "${key_word}" | sed -n "${integer}p")
        if [[ -n "$i" ]]; then
            if [[ "$s" == "add" ]]; then
                # 记录关键词到本地文件以便管理
                # 先检查关键词是否已存在
                if [ -f "$keywords_file" ] && grep -q "^$i$" "$keywords_file"; then
                    echo "关键词【$i】已在封禁列表中，跳过"
                    continue
                fi
                
                echo "$i" >> "$keywords_file"
                
                # 根据可用模块选择过滤实现方式
                if [[ $USE_FILE_ONLY -eq 1 ]]; then
                    # 只添加注释信息，不实际过滤
                    echo "已添加关键词【$i】到封禁列表（仅记录模式，未实际过滤）"
                else
                    # 使用iptables的string模块在mangle表中添加过滤规则
                    iptables -t mangle -A OUTPUT -m string --string "$i" --algo bm --to 65535 -j DROP
                    echo "已使用iptables添加关键词【$i】过滤规则"
                fi
            elif [[ "$s" == "delete" ]]; then
                # 从关键词文件中移除
                if [ -f "$keywords_file" ]; then
                    sed -i "/^$i$/d" "$keywords_file"
                fi
                
                # 查找并删除匹配的iptables规则
                if [[ $USE_FILE_ONLY -eq 0 ]]; then
                    # 使用临时文件保存当前规则
                    iptables-save > /tmp/iptables_rules.tmp
                    
                    # 修改临时文件，删除包含特定关键词的行
                    sed -i "/\-A OUTPUT \-m string \-\-string \"$i\" \-\-algo bm \-\-to 65535 \-j DROP/d" /tmp/iptables_rules.tmp
                    
                    # 重新加载修改后的规则
                    iptables-restore < /tmp/iptables_rules.tmp
                    
                    # 删除临时文件
                    rm -f /tmp/iptables_rules.tmp
                    
                    echo "已解除关键词【$i】的封禁"
                fi
            fi
        fi
    done
    
    # 保存iptables规则
    save_iptables_rules
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
            mkdir -p /etc/iptables
            iptables-save > /etc/iptables/rules.v4
            
            # 创建网络接口启动时自动加载规则的脚本
            if [ ! -f "/etc/network/if-pre-up.d/iptables" ]; then
                mkdir -p /etc/network/if-pre-up.d
                cat > /etc/network/if-pre-up.d/iptables <<-EOF
#!/bin/bash
/sbin/iptables-restore < /etc/iptables/rules.v4
exit 0
EOF
                chmod +x /etc/network/if-pre-up.d/iptables
            fi
            
            # 对于systemd系统，也创建service文件
            if [ -d "/etc/systemd/system" ]; then
                cat > /etc/systemd/system/iptables-restore.service <<-EOF
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
                systemctl daemon-reload
                systemctl enable iptables-restore.service
            fi
        elif [ "$release" == "centos" ]; then
            # 检查是否有service命令
            if command -v service &>/dev/null; then
                service iptables save
            else
                # 如果没有service命令，手动保存
                mkdir -p /etc/sysconfig
                iptables-save > /etc/sysconfig/iptables
                
                # 对于CentOS系统，创建service文件
                if [ -d "/etc/systemd/system" ]; then
                    cat > /etc/systemd/system/iptables-restore.service <<-EOF
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
                    systemctl daemon-reload
                    systemctl enable iptables-restore.service
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
                iptables -t mangle -D OUTPUT 1
            done
            
            echo "iptables字符串匹配规则已删除"
        fi
        
        # 清空关键词文件
        > "$keywords_file"
        
        # 保存更改后的iptables规则
        save_iptables_rules
        
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
    disable_btpt
    disable_spam
}

# 封禁BT/PT
disable_btpt() {
    # 检查是否已封禁BT/PT
    if [ -f "$keywords_file" ] && grep -q "torrent" "$keywords_file"; then
        echo -e "${Error} 检测到已封禁BT、PT 关键词，无需再次封禁 !" && exit 0
    fi
    
    s="add"
    set_bt
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
    set_spam
    echo -e "${Info} 已封禁SPAM(垃圾邮件) 端口 !"
}

# 设置SPAM端口封禁规则
set_spam() {
    # 合并所有SPAM相关端口
    all_spam_ports="${smtp_port},${pop3_port},${imap_port},${other_port}"
    
    if [[ "$s" == "add" ]]; then
        nft add rule inet filter output tcp dport { $all_spam_ports } reject comment \"SPAM端口封禁TCP\"
        nft add rule inet filter output udp dport { $all_spam_ports } drop comment \"SPAM端口封禁UDP\"
    elif [[ "$s" == "delete" ]]; then
        # 删除SPAM相关规则
        nft -a list chain inet filter output | grep "SPAM端口封禁" | while read -r line; do
            handle=$(echo "$line" | grep -o "handle [0-9]*" | awk '{print $2}')
            if [ -n "$handle" ]; then
                nft delete rule inet filter output handle $handle
            fi
        done
    fi
    
    save_nftables_rules
}

# 解封BT/PT/SPAM相关函数
# 解封所有封禁
able_all_out() {
    able_btpt
    able_spam
}

# 解封BT/PT
able_btpt() {
    # 检查是否已封禁BT/PT
    if [ ! -f "$keywords_file" ] || ! grep -q "torrent" "$keywords_file"; then
        echo -e "${Error} 检测到未封禁BT、PT 关键词，请检查 !" && exit 0
    fi
    
    s="delete"
    set_bt
    echo -e "${Info} 已解封BT、PT 关键词 !"
}

# 解封SPAM端口
able_spam() {
    # 检查是否已封禁SPAM端口
    spam_banned=$(nft list chain inet filter output | grep "SPAM端口封禁" | wc -l)
    [[ $spam_banned -eq 0 ]] && echo -e "${Error} 检测到未封禁SPAM(垃圾邮件) 端口，请检查 !" && exit 0
    
    s="delete"
    set_spam
    echo -e "${Info} 已解封SPAM(垃圾邮件) 端口 !"
}

# 封禁网络黑名单
diable_blocklist_out() {
    s="add"
    echo -e "正在连接 关键词网络文件地址"
    blocklist=$(wget --no-check-certificate -t3 -T5 -qO- "https://raw.githubusercontent.com/Aipblock/saveblocklist/main/block.txt")
    
    if [[ -z ${blocklist} ]]; then
        echo -e "${Error} 网络文件内容为空或访问超时 !" && display_out_keyworld && exit 0
    fi
    
    # 使用现有的关键词过滤机制处理blocklist中的每一行
    key_word="${blocklist}"
    set_out_keywords
    
    echo -e "成功执行" && echo
}

# 入网端口控制函数
# 显示已放行的入网端口
display_in_port() {
    # 检索TCP和UDP放行规则
    tcp_rules=$(nft -a list chain inet filter input | grep "shellsettcp")
    udp_rules=$(nft -a list chain inet filter input | grep "shellsetudp")
    
    if [[ -n ${tcp_rules} ]] || [[ -n ${udp_rules} ]]; then
        echo -e "===============${Red_background_prefix} 当前已放行 端口 ${Font_color_suffix}==============="
    fi
    
    if [[ -n ${tcp_rules} ]]; then
        echo
        echo "TCP端口:"
        echo "${tcp_rules}" | while read -r line; do
            if [[ $line =~ dport[[:space:]]+([0-9,\-]+) ]]; then
                echo " ${BASH_REMATCH[1]}"
            elif [[ $line =~ dport[[:space:]]+\{[[:space:]]*(.*)[[:space:]]*\} ]]; then
                echo " ${BASH_REMATCH[1]}"
            fi
        done
        echo && echo -e "==============================================="
    fi
    
    if [[ -n ${udp_rules} ]]; then
        echo
        echo "UDP端口:"
        echo "${udp_rules}" | while read -r line; do
            if [[ $line =~ dport[[:space:]]+([0-9,\-]+) ]]; then
                echo " ${BASH_REMATCH[1]}"
            elif [[ $line =~ dport[[:space:]]+\{[[:space:]]*(.*)[[:space:]]*\} ]]; then
                echo " ${BASH_REMATCH[1]}"
            fi
        done
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

input_able_want_inport(){
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
disable_want_port_in(){
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

input_disable_want_inport(){
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
        nft add rule inet filter input tcp dport { $PORT } accept comment \"shellsettcp\"
        nft add rule inet filter input udp dport { $PORT } accept comment \"shellsetudp\"
    elif [[ "$s" == "delete" ]]; then
        # 删除TCP规则
        nft -a list chain inet filter input | grep "tcp dport { $PORT }" | grep "shellsettcp" | while read -r line; do
            handle=$(echo "$line" | grep -o "handle [0-9]*" | awk '{print $2}')
            if [ -n "$handle" ]; then
                nft delete rule inet filter input handle $handle
            fi
        done
        
        # 删除UDP规则
        nft -a list chain inet filter input | grep "udp dport { $PORT }" | grep "shellsetudp" | while read -r line; do
            handle=$(echo "$line" | grep -o "handle [0-9]*" | awk '{print $2}')
            if [ -n "$handle" ]; then
                nft delete rule inet filter input handle $handle
            fi
        done
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

input_able_want_inip(){
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
disable_want_ip_in(){
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

input_disable_want_inip(){
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
    IFS=',' read -ra IPS <<< "$IP"
    
    for ip in "${IPS[@]}"; do
        if [[ "$s" == "add" ]]; then
            # 判断IPv4或IPv6
            if [[ $ip == *":"* ]]; then
                # IPv6地址
                nft add rule inet filter input ip6 saddr $ip accept comment \"shellsetip\"
            else
                # IPv4地址
                nft add rule inet filter input ip saddr $ip accept comment \"shellsetip\"
            fi
        elif [[ "$s" == "delete" ]]; then
            # 删除匹配的规则
            if [[ $ip == *":"* ]]; then
                # IPv6地址
                nft -a list chain inet filter input | grep "ip6 saddr $ip" | grep "shellsetip" | while read -r line; do
                    handle=$(echo "$line" | grep -o "handle [0-9]*" | awk '{print $2}')
                    if [ -n "$handle" ]; then
                        nft delete rule inet filter input handle $handle
                    fi
                done
            else
                # IPv4地址
                nft -a list chain inet filter input | grep "ip saddr $ip" | grep "shellsetip" | while read -r line; do
                    handle=$(echo "$line" | grep -o "handle [0-9]*" | awk '{print $2}')
                    if [ -n "$handle" ]; then
                        nft delete rule inet filter input handle $handle
                    fi
                done
            fi
        fi
    done
    
    save_nftables_rules
}

# 清空重建规则
clear_rebuild_ipta() {
    # 清空所有规则
    nft flush ruleset
    
    # 重新设置基础结构
    setup_nftables_base
    
    echo "已清空所有规则"
    
    # 放行SSH端口
    able_ssh_port
    
    echo "仅放行了 SSH端口：${PORT}"
}

# 检查网络环境
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
        nft delete table ip edge_dft_v4 2>/dev/null
        nft delete table ip6 edge_dft_v6 2>/dev/null
    fi
    
    # 创建IPv4防御表和集合
    nft add table ip edge_dft_v4
    nft add set ip edge_dft_v4 allow_set { type ipv4_addr\; flags timeout\; }
    nft add set ip edge_dft_v4 deny_set { type ipv4_addr\; size 65535\; flags timeout\; }
    
    # 创建基础输入链
    nft add chain ip edge_dft_v4 input { type filter hook input priority 0\; policy accept\; }
    
    # 添加基本规则
    nft add rule ip edge_dft_v4 input iifname "lo" accept
    nft add rule ip edge_dft_v4 input ip saddr @allow_set accept
    nft add rule ip edge_dft_v4 input ip saddr @deny_set drop
    
    # 添加SSH防暴力破解规则
    get_ssh_port
    nft add rule ip edge_dft_v4 input tcp dport $PORT ct state new limit rate 15/minute log prefix \"New SSH connection: \" counter accept comment \"Avoid brute force on SSH\"
    
    # 添加HTTP防御规则
    nft add rule ip edge_dft_v4 input tcp dport http ct count over 100000 counter packets 0 bytes 0 drop comment \"ZZtcp_80_maxConnections_100000ZZ\"
    nft add rule ip edge_dft_v4 input tcp dport http meter meter-ip-80-max-connections size 65535 { ip saddr ct count over 400 } counter packets 0 bytes 0 drop comment \"ZZtcp_80_maxConnectionsPerIP_400ZZ\"
    nft add rule ip edge_dft_v4 input tcp dport http ct state new meter meter-ip-80-new-connections-rate size 65535 { ip saddr limit rate over 400/minute burst 503 packets} add @deny_set { ip saddr timeout 23h30m } comment \"ZZtcp_80_newConnectionsRate_400_84600ZZ\"
    nft add rule ip edge_dft_v4 input tcp dport http ct state new meter meter-ip-80-new-connections-secondly-rate size 65535 { ip saddr limit rate over 300/second burst 303 packets} add @deny_set { ip saddr timeout 23h30m } comment \"ZZtcp_80_newConnectionsSecondlyRate_300_84600ZZ\"
    
    # 添加HTTPS防御规则
    nft add rule ip edge_dft_v4 input tcp dport https ct count over 100000 counter packets 0 bytes 0 drop comment \"ZZtcp_443_maxConnections_100000ZZ\"
    nft add rule ip edge_dft_v4 input tcp dport https meter meter-ip-443-max-connections size 65535 { ip saddr ct count over 400 } counter packets 0 bytes 0 drop comment \"ZZtcp_443_maxConnectionsPerIP_400ZZ\"
    nft add rule ip edge_dft_v4 input tcp dport https ct state new meter meter-ip-443-new-connections-rate size 65535 { ip saddr limit rate over 400/minute burst 503 packets} add @deny_set { ip saddr timeout 23h30m } comment \"ZZtcp_443_newConnectionsRate_400_84600ZZ\"
    nft add rule ip edge_dft_v4 input tcp dport https ct state new meter meter-ip-443-new-connections-secondly-rate size 65535 { ip saddr limit rate over 300/second burst 303 packets} add @deny_set { ip saddr timeout 23h30m } comment \"ZZtcp_443_newConnectionsSecondlyRate_300_84600ZZ\"
    
    # 配置IPv6防御规则
    setup_ipv6_ddos_protection
    
    save_nftables_rules
    echo -e "${Green_font_prefix}[成功]${Font_color_suffix} DDoS防御规则已配置完成!"
}

# 设置IPv6 DDoS防御
setup_ipv6_ddos_protection() {
    # 创建IPv6防御表和集合
    nft add table ip6 edge_dft_v6
    nft add set ip6 edge_dft_v6 allow_set { type ipv6_addr\; flags timeout\; }
    nft add set ip6 edge_dft_v6 deny_set { type ipv6_addr\; size 65535\; flags timeout\; }
    
    # 创建基础输入链
    nft add chain ip6 edge_dft_v6 input { type filter hook input priority 0\; policy accept\; }
    
    # 添加基本规则
    nft add rule ip6 edge_dft_v6 input iifname "lo" accept
    nft add rule ip6 edge_dft_v6 input ip6 saddr @allow_set accept
    nft add rule ip6 edge_dft_v6 input ip6 saddr @deny_set drop
    
    # 添加SSH防暴力破解规则
    get_ssh_port
    nft add rule ip6 edge_dft_v6 input tcp dport $PORT ct state new limit rate 15/minute log prefix \"New SSH connection: \" counter packets 0 bytes 0 accept comment \"Avoid brute force on SSH\"
    
    # 添加HTTP防御规则
    nft add rule ip6 edge_dft_v6 input tcp dport http ct count over 100000 counter packets 0 bytes 0 drop comment \"ZZtcp_80_maxConnections_100000ZZ\"
    nft add rule ip6 edge_dft_v6 input tcp dport http meter meter-ip6-80-max-connections size 65535 { ip6 saddr ct count over 400 } counter packets 0 bytes 0 drop comment \"ZZtcp_80_maxConnectionsPerIP_400ZZ\"
    nft add rule ip6 edge_dft_v6 input tcp dport http ct state new meter meter-ip6-80-new-connections-rate size 65535 { ip6 saddr limit rate over 400/minute burst 503 packets} add @deny_set { ip6 saddr timeout 23h30m } comment \"ZZtcp_80_newConnectionsRate_400_84600ZZ\"
    nft add rule ip6 edge_dft_v6 input tcp dport http ct state new meter meter-ip6-80-new-connections-secondly-rate size 65535 { ip6 saddr limit rate over 300/second burst 303 packets} add @deny_set { ip6 saddr timeout 23h30m } comment \"ZZtcp_80_newConnectionsSecondlyRate_300_84600ZZ\"
    
    # 添加HTTPS防御规则
    nft add rule ip6 edge_dft_v6 input tcp dport https ct count over 100000 counter packets 0 bytes 0 drop comment \"ZZtcp_443_maxConnections_100000ZZ\"
    nft add rule ip6 edge_dft_v6 input tcp dport https meter meter-ip6-443-max-connections size 65535 { ip6 saddr ct count over 400 } counter packets 0 bytes 0 drop comment \"ZZtcp_443_maxConnectionsPerIP_400ZZ\"
    nft add rule ip6 edge_dft_v6 input tcp dport https ct state new meter meter-ip6-443-new-connections-rate size 65535 { ip6 saddr limit rate over 400/minute burst 503 packets} add @deny_set { ip6 saddr timeout 23h30m } comment \"ZZtcp_443_newConnectionsRate_400_84600ZZ\"
    nft add rule ip6 edge_dft_v6 input tcp dport https ct state new meter meter-ip6-443-new-connections-secondly-rate size 65535 { ip6 saddr limit rate over 300/second burst 303 packets} add @deny_set { ip6 saddr timeout 23h30m } comment \"ZZtcp_443_newConnectionsSecondlyRate_300_84600ZZ\"
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
    read -e -p "(默认: 400):" MAX_CONN
    [[ -z "${MAX_CONN}" ]] && MAX_CONN=400
    
    echo -e "请输入每IP每分钟最大新连接数"
    read -e -p "(默认: 400):" MAX_RATE_MIN
    [[ -z "${MAX_RATE_MIN}" ]] && MAX_RATE_MIN=400
    
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
        BAN_TIMEOUT="23h30m"  # 稍微短一点以避免边界情况
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
    read -e -p "(默认: 24):" HOURS
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
        
        # 显示自定义端口阻止情况
        if [[ -n "$custom_ports" ]]; then
            echo -e "\n自定义端口防御统计:"
            for port in $custom_ports; do
                port_drop=$(nft list chain ip edge_dft_v4 input 2>/dev/null | grep "drop" | grep "ZZtcp_${port}_" | grep -o "packets [0-9]*" | awk '{sum+=$2} END {print sum}')
                echo -e "端口 $port 已阻止连接次数: ${port_drop:-0}"
            done
        fi
        
        # 显示黑白名单IP数量
        whitelist_ipv4=$(nft list set ip edge_dft_v4 allow_set 2>/dev/null | grep -c '[0-9]\{1,3\}\.[0-9]\{1,3\}\.[0-9]\{1,3\}\.[0-9]\{1,3\}')
        blacklist_ipv4=$(nft list set ip edge_dft_v4 deny_set 2>/dev/null | grep -c '[0-9]\{1,3\}\.[0-9]\{1,3\}\.[0-9]\{1,3\}\.[0-9]\{1,3\}')
        
        whitelist_ipv6=$(nft list set ip6 edge_dft_v6 allow_set 2>/dev/null | grep -c ':')
        blacklist_ipv6=$(nft list set ip6 edge_dft_v6 deny_set 2>/dev/null | grep -c ':')
        
        echo -e "\n当前白名单IPv4数量: ${whitelist_ipv4:-0}"
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
    sh_new_ver=$(wget --no-check-certificate -qO- -t2 -T3 "${VERSION_URL}" | grep 'sh_ver="' | awk -F "=" '{print $NF}' | sed 's/\"//g' | head -1)
    [[ -z ${sh_new_ver} ]] && echo -e "${Error} 无法连接到更新服务器，请检查网络或稍后再试！" && exit 0
    
    # 比较版本
    if [[ "${sh_new_ver}" != "${sh_ver}" ]]; then
        echo -e "检测到新版本[ ${sh_new_ver} ]，当前版本[ ${sh_ver} ]"
        echo -e "是否更新？[Y/n]"
        read -e -p "(默认: y):" yn
        [[ -z "${yn}" ]] && yn="y"
        if [[ ${yn} == [Yy] ]]; then
            wget -N --no-check-certificate ${DOWNLOAD_URL} -O Nftato.sh.new
            if [ $? -eq 0 ]; then
                mv Nftato.sh.new Nftato.sh
                chmod +x Nftato.sh
                echo -e "脚本已更新为最新版本[ ${sh_new_ver} ] !\n运行 bash Nftato.sh 启动最新版本"
            else
                echo -e "${Error} 下载新版本失败，请稍后再试"
            fi
        else
            echo "已取消更新，继续使用当前版本[ ${sh_ver} ]"
        fi
    else
        echo -e "当前已经是最新版本[ ${sh_new_ver} ]"
    fi
    exit 0
}

# 使用方法帮助
usage() {
    echo -e "使用方法: $0 [参数] [额外参数]"
    echo -e "参数说明:"
    echo -e "  0-25: 对应菜单中的功能"
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
    PORT=$1
    if [[ -z "${PORT}" ]]; then
        echo "错误: 未指定端口"
        exit 1
    fi
    s="add"
    set_out_ports
    echo -e "${Info} 已封禁端口 [ ${PORT} ] !\n"
}

# 非交互式处理端口解封
non_interactive_port_unban() {
    PORT=$1
    if [[ -z "${PORT}" ]]; then
        echo "错误: 未指定端口"
        exit 1
    fi
    s="delete"
    set_out_ports
    echo -e "${Info} 已解封端口 [ ${PORT} ] !\n"
}

# 非交互式处理关键词封禁
non_interactive_keyword_ban() {
    key_word=$1
    if [[ -z "${key_word}" ]]; then
        echo "错误: 未指定关键词"
        exit 1
    fi
    s="add"
    set_out_keywords
    echo -e "${Info} 已封禁关键词 [ ${key_word} ] !\n"
}

# 非交互式处理关键词解封
non_interactive_keyword_unban() {
    key_word=$1
    if [[ -z "${key_word}" ]]; then
        echo "错误: 未指定关键词"
        exit 1
    fi
    s="delete"
    set_out_keywords
    echo -e "${Info} 已解封关键词 [ ${key_word} ] !\n"
}

# 非交互式处理入网端口放行
non_interactive_inport_allow() {
    PORT=$1
    if [[ -z "${PORT}" ]]; then
        echo "错误: 未指定端口"
        exit 1
    fi
    s="add"
    set_in_ports
    echo -e "${Info} 已放行入网端口 [ ${PORT} ] !\n"
}

# 非交互式处理入网端口取消放行
non_interactive_inport_disallow() {
    PORT=$1
    if [[ -z "${PORT}" ]]; then
        echo "错误: 未指定端口"
        exit 1
    fi
    s="delete"
    set_in_ports
    echo -e "${Info} 已取消放行入网端口 [ ${PORT} ] !\n"
}

# 非交互式处理入网IP放行
non_interactive_inip_allow() {
    IP=$1
    if [[ -z "${IP}" ]]; then
        echo "错误: 未指定IP"
        exit 1
    fi
    s="add"
    set_in_ips
    echo -e "${Info} 已放行入网IP [ ${IP} ] !\n"
}

# 非交互式处理入网IP取消放行
non_interactive_inip_disallow() {
    IP=$1
    if [[ -z "${IP}" ]]; then
        echo "错误: 未指定IP"
        exit 1
    fi
    s="delete"
    set_in_ips
    echo -e "${Info} 已取消放行入网IP [ ${IP} ] !\n"
}

# 非交互式配置DDoS防御规则
non_interactive_ddos_protection() {
    setup_ddos_protection
}

# 非交互式配置自定义端口DDoS防御
non_interactive_custom_port_protection() {
    PORT=$1
    PROTO_TYPE=$2
    MAX_CONN=$3
    MAX_RATE_MIN=$4
    MAX_RATE_SEC=$5
    BAN_HOURS=$6
    
    if [[ -z "${PORT}" ]]; then
        echo "错误: 未指定端口"
        echo "用法: $0 23 <端口> [协议类型] [每IP最大连接数] [每分钟最大连接] [每秒最大连接] [封禁时长]"
        echo "例如: $0 23 8080 1 400 400 300 24"
        echo "协议类型: 1=TCP, 2=UDP, 3=TCP+UDP，默认为1(TCP)"
        exit 1
    fi
    
    # 设置默认值
    [[ -z "${PROTO_TYPE}" ]] && PROTO_TYPE="1"
    [[ -z "${MAX_CONN}" ]] && MAX_CONN=400
    [[ -z "${MAX_RATE_MIN}" ]] && MAX_RATE_MIN=400
    [[ -z "${MAX_RATE_SEC}" ]] && MAX_RATE_SEC=300
    [[ -z "${BAN_HOURS}" ]] && BAN_HOURS=24
    
    # 检查IPv4表是否存在
    if ! nft list tables | grep -q "edge_dft_v4"; then
        echo "未检测到DDoS防御表，先创建基础防御规则"
        setup_ddos_protection
    fi
    
    # 计算超时时间
    BAN_TIMEOUT="${BAN_HOURS}h"
    if [ "$BAN_HOURS" -eq "24" ]; then
        BAN_TIMEOUT="23h30m"  # 稍微短一点以避免边界情况
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
    echo -e "${Green_font_prefix}[成功]${Font_color_suffix} 已为端口 $PORT 配置DDoS防御规则!"
}

# 非交互式管理IP黑白名单
non_interactive_ip_list_manage() {
    ACTION=$1
    IP=$2
    DURATION=$3
    
    if [[ -z "${ACTION}" ]]; then
        echo "错误: 未指定操作类型"
        echo "用法: $0 24 <操作类型> <IP地址> [有效期]"
        echo "操作类型: 1=添加白名单, 2=添加黑名单, 3=从白名单移除, 4=从黑名单移除"
        echo "例如: $0 24 1 1.2.3.4 7 (添加IP 1.2.3.4到白名单，有效期7天)"
        echo "      $0 24 2 1.2.3.4 24 (添加IP 1.2.3.4到黑名单，有效期24小时)"
        exit 1
    fi
    
    if [[ -z "${IP}" ]]; then
        echo "错误: 未指定IP地址"
        exit 1
    fi
    
    # 检查是否已设置防御规则
    if ! nft list tables | grep -q "edge_dft_v4"; then
        echo -e "${Error} 未检测到DDoS防御表，请先配置DDoS防御规则!"
        setup_ddos_protection
    fi
    
    case "$ACTION" in
        "1") # 添加白名单
            [[ -z "${DURATION}" ]] && DURATION=0
            # 判断IPv4或IPv6
            if [[ "$IP" == *":"* ]]; then
                # IPv6地址
                if [ "$DURATION" -eq 0 ]; then
                    nft add element ip6 edge_dft_v6 allow_set { $IP }
                else
                    nft add element ip6 edge_dft_v6 allow_set { $IP timeout "${DURATION}d" }
                fi
            else
                # IPv4地址
                if [ "$DURATION" -eq 0 ]; then
                    nft add element ip edge_dft_v4 allow_set { $IP }
                else
                    nft add element ip edge_dft_v4 allow_set { $IP timeout "${DURATION}d" }
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
                    nft add element ip6 edge_dft_v6 deny_set { $IP }
                else
                    nft add element ip6 edge_dft_v6 deny_set { $IP timeout "${DURATION}h" }
                fi
            else
                # IPv4地址
                if [ "$DURATION" -eq 0 ]; then
                    nft add element ip edge_dft_v4 deny_set { $IP }
                else
                    nft add element ip edge_dft_v4 deny_set { $IP timeout "${DURATION}h" }
                fi
            fi
            echo -e "${Green_font_prefix}[成功]${Font_color_suffix} IP $IP 已添加到黑名单!"
            ;;
        "3") # 从白名单移除
            # 判断IPv4或IPv6
            if [[ "$IP" == *":"* ]]; then
                # IPv6地址
                nft delete element ip6 edge_dft_v6 allow_set { $IP }
            else
                # IPv4地址
                nft delete element ip edge_dft_v4 allow_set { $IP }
            fi
            echo -e "${Green_font_prefix}[成功]${Font_color_suffix} IP $IP 已从白名单移除!"
            ;;
        "4") # 从黑名单移除
            # 判断IPv4或IPv6
            if [[ "$IP" == *":"* ]]; then
                # IPv6地址
                nft delete element ip6 edge_dft_v6 deny_set { $IP }
            else
                # IPv4地址
                nft delete element ip edge_dft_v4 deny_set { $IP }
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
show_main_menu() {
    clear
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
${Green_font_prefix}20.${Font_color_suffix} 夺回出入控制(清空所有规则)

————————————
${Green_font_prefix}21.${Font_color_suffix} 升级脚本
${Red_font_prefix}注意:${Font_color_suffix} 本脚本使用nftables，支持自动安装关键词过滤模块
————————————
" && echo
    shell_run_tips
}

# 主程序
check_system
check_run
check_docker_env
action=$1
extra_param=$2

if [[ ! -z $action ]]; then
    # 支持数字参数，直接执行对应功能
    case "$action" in
        0)
        view_all_disable_out
        exit 0
        ;;
        1)
        disable_btpt
        exit 0
        ;;
        2)
        disable_spam
        exit 0
        ;;
        3)
        disable_all_out
        exit 0
        ;;
        4)
        if [[ -z $extra_param ]]; then
            disable_want_port_out
        else
            non_interactive_port_out "$extra_param"
        fi
        exit 0
        ;;
        5)
        if [[ -z $extra_param ]]; then
            disable_want_keyworld_out
        else
            non_interactive_keyword_ban "$extra_param"
        fi
        exit 0
        ;;
        6)
        able_btpt
        exit 0
        ;;
        7)
        able_spam
        exit 0
        ;;
        8)
        able_all_out
        exit 0
        ;;
        9)
        if [[ -z $extra_param ]]; then
            able_want_port_out
        else
            non_interactive_port_unban "$extra_param"
        fi
        exit 0
        ;;
        10)
        if [[ -z $extra_param ]]; then
            able_want_keyworld_out
        else
            non_interactive_keyword_unban "$extra_param"
        fi
        exit 0
        ;;
        11)
        able_all_keyworld_out
        exit 0
        ;;
        12)
        diable_blocklist_out
        exit 0
        ;;
        13)
        display_in_port
        exit 0
        ;;
        14)
        display_in_ip
        exit 0
        ;;
        15)
        if [[ -z $extra_param ]]; then
            able_want_port_in
        else
            non_interactive_inport_allow "$extra_param"
        fi
        exit 0
        ;;
        16)
        if [[ -z $extra_param ]]; then
            disable_want_port_in
        else
            non_interactive_inport_disallow "$extra_param"
        fi
        exit 0
        ;;
        17)
        if [[ -z $extra_param ]]; then
            able_in_ips
        else
            non_interactive_inip_allow "$extra_param"
        fi
        exit 0
        ;;
        18)
        if [[ -z $extra_param ]]; then
            disable_want_ip_in
        else
            non_interactive_inip_disallow "$extra_param"
        fi
        exit 0
        ;;
        19)
        display_ssh
        exit 0
        ;;
        20)
        clear_rebuild_ipta
        exit 0
        ;;
        21)
        Update_Shell
        exit 0
        ;;
        22)
        setup_ddos_protection
        exit 0
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
        exit 0
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
        exit 0
        ;;
        25)
        view_defense_status
        exit 0
        ;;
        "help"|"-h"|"--help")
        usage
        exit 0
        ;;
        # 兼容旧的字符串参数
        "banbt") disable_btpt && exit 0 ;;
        "banspam") disable_spam && exit 0 ;;
        "banall") disable_all_out && exit 0 ;;
        "unbanbt") able_btpt && exit 0 ;;
        "unbanspam") able_spam && exit 0 ;;
        "unbanall") able_all_out && exit 0 ;;
        *)
        echo "无效的参数: $action"
        usage
        exit 1
        ;;
    esac
fi

show_main_menu
read -e -p " 请输入数字 [0-21]:" num
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
