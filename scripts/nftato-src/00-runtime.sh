#!/usr/bin/env bash
PATH=/bin:/sbin:/usr/bin:/usr/sbin:/usr/local/bin:/usr/local/sbin:~/bin
export PATH
#=================================================
#       System Required: CentOS/Debian/Ubuntu
#       Description: nftables 出封禁 入放行
#       Version: 2.0.4
#=================================================

sh_ver="2.0.4"
Green_font_prefix="\033[32m"
Red_font_prefix="\033[31m"
Green_background_prefix="\033[42;37m"
Red_background_prefix="\033[41;37m"
Font_color_suffix="\033[0m"
Info="${Green_font_prefix}[信息]${Font_color_suffix}"
Error="${Red_font_prefix}[错误]${Font_color_suffix}"
Yellow_font_prefix="\033[33m"

# 检查是否在自动化模式下运行
is_automated=0
if [ "${AUTOMATED:-}" = "yes" ] || [ "${AUTOMATED:-}" = "true" ] || [ "${AUTOMATED:-}" = "1" ]; then
    is_automated=1
    [[ "${1:-}" == "--json" ]] || echo -e "${Info} 检测到自动化模式，将跳过交互式操作"
fi

# 读取用户输入，带自动化模式支持
auto_read() {
    local prompt="$1"
    local default="$2"

    # 在自动化模式下使用默认值
    if [ $is_automated -eq 1 ]; then
        echo -e "${Info} 自动化模式：使用默认值 [${default}]"
        echo "$default"
        return
    fi

    # 正常交互模式
    local input
    read -e -p "$prompt" input
    echo "${input:-$default}"
}

# 全局配置变量
checkfile="/root/checkfile_nftato.txt"
nft_conf="/etc/nftables.conf"
nft_ruleset="/etc/nftables/ruleset.nft"
keywords_file="/etc/nftables/keywords.list"
USE_IPTABLES_FOR_KEYWORDS=0 # 是否使用iptables进行关键词过滤
USE_FILE_ONLY=0             # 是否只使用文件记录而不实际过滤

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

# Root is required for firewall operations. The check is performed by the CLI
# entrypoint so `--help` and source-level tests stay side-effect free.
require_root() {
    if [[ $EUID -ne 0 ]]; then
        echo -e "${Error} 必须使用root用户运行此脚本！\n" >&2
        return 1
    fi
}

# 系统检测函数
check_system() {
    if [[ -f /etc/redhat-release ]]; then
        release="centos"
        # CentOS特有的配置路径
        if [ -f /etc/redhat-release ]; then
            nft_centos_conf="/etc/sysconfig/nftables.conf"
        fi
    elif cat /etc/issue | grep -q -E -i "debian"; then
        release="debian"
    elif cat /etc/issue | grep -q -E -i "ubuntu"; then
        release="ubuntu"
    elif cat /etc/issue | grep -q -E -i "centos|red hat|redhat"; then
        release="centos"
        # CentOS特有的配置路径
        nft_centos_conf="/etc/sysconfig/nftables.conf"
    elif cat /proc/version | grep -q -E -i "debian"; then
        release="debian"
    elif cat /proc/version | grep -q -E -i "ubuntu"; then
        release="ubuntu"
    elif cat /proc/version | grep -q -E -i "centos|red hat|redhat"; then
        release="centos"
        # CentOS特有的配置路径
        nft_centos_conf="/etc/sysconfig/nftables.conf"
    fi
    bit=$(uname -m)
}

# 检查脚本是否首次运行
check_run() {
    runflag=0
    if [ ! -e "${checkfile}" ]; then
        set_environment || exit 1
        touch "$checkfile"
        echo "首次运行判断文件生成"
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
        echo "入网默认放行 SSH、80/tcp、443/tcp；已启用 Docker bridge 出站兼容"
        echo
    fi
}

# 环境设置
set_environment() {
    disable_conflicting_firewalls
    install_nftables
    install_tool
    install_nftables_modules

    # iptables 的 FORWARD/NAT 规则可能由 Docker 管理，不能清空或保存为静态快照。
    setup_nftables_base
}

# 禁用冲突的防火墙
disable_conflicting_firewalls() {
    # 处理 firewalld (CentOS/RHEL)
    if command -v firewall-cmd &>/dev/null; then
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
    if command -v ufw &>/dev/null; then
        ufw_status=$(ufw status | grep -i "active")
        if [ -n "${ufw_status}" ]; then
            echo "检测到ufw正在运行，正在停止..."
            ufw disable
            echo "成功禁用ufw"
        fi
    fi

    # 保留 iptables 服务及其规则，避免删除 Docker 的转发、隔离和 NAT 链。

    echo "防火墙冲突检查完成"
}

# 安装nftables
install_nftables() {
    if ! command -v nft &>/dev/null; then
        echo "正在安装nftables..."
        if [ "$release" == "debian" ] || [ "$release" == "ubuntu" ]; then
            apt-get update
            apt-get install -y nftables
        elif [ "$release" == "centos" ]; then
            # CentOS 9使用dnf命令
            if grep -q -E "9\." /etc/redhat-release; then
                dnf install -y nftables
            else
                yum install -y nftables
            fi

            # 确保CentOS目录结构存在
            mkdir -p /etc/nftables
            mkdir -p /etc/sysconfig

            # 关闭firewalld服务（如果存在）
            if systemctl is-active firewalld &>/dev/null; then
                systemctl stop firewalld
                systemctl disable firewalld
                echo "已禁用firewalld服务，使用nftables替代"
            fi
        fi
    fi

    # 确保nftables服务启用
    if [ "$release" == "centos" ]; then
        # CentOS 9可能需要特殊处理
        if grep -q -E "9\." /etc/redhat-release 2>/dev/null; then
            # 查看服务是否存在
            if systemctl list-unit-files | grep -q nftables.service; then
                systemctl enable nftables
            else
                echo "警告: 未找到nftables服务，请手动检查"
            fi
        else
            systemctl enable nftables
        fi
    else
        systemctl enable nftables
    fi

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

# 本项目管理的表；Docker 和其他工具的表不在此列表中。
nftato_tables() {
    printf '%s\n' 'inet filter' 'inet mangle' 'ip edge_dft_v4' 'ip6 edge_dft_v6'
}

# add 已存在的表是幂等操作，随后 delete，可兼容首次安装和旧版 nft。
# 与后续建表放进同一个 nft -f 事务，避免中途丢失 SSH/Web 放行规则。
reset_nftato_tables() {
    local family table
    while read -r family table; do
        echo "add table $family $table"
        echo "delete table $family $table"
    done < <(nftato_tables)
}

# 设置nftables基础结构
