#!/usr/bin/env bash
PATH=/bin:/sbin:/usr/bin:/usr/sbin:/usr/local/bin:/usr/local/sbin:~/bin
export PATH
#=================================================
#       System Required: CentOS/Debian/Ubuntu
#       Description: iptables 出封禁 入放行
#       Version: 1.0.22
#		Blog: 计划中
#=================================================

sh_ver="1.0.22"
Green_font_prefix="\033[32m"
Red_font_prefix="\033[31m"
Green_background_prefix="\033[42;37m"
Red_background_prefix="\033[41;37m"
Font_color_suffix="\033[0m"
Info="${green}[信息]${Font_color_suffix}"
Error="${Red_font_prefix}[错误]${Font_color_suffix}"

checkfile="/root/checkfile.txt"
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

# check root
[[ $EUID -ne 0 ]] && echo -e "${Error} 必须使用root用户运行此脚本！\n" && exit 1

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

shell_run_tips() {
	if [ ${runflag} -eq 0 ]; then
		echo
		echo "本脚本默认接管 控制出入网 权限"
		echo "入网端口仅放行了 SSH端口"
		echo
	fi
}

set_environment() {
	disable_conflicting_firewalls
	install_iptables
	install_tool
	long_save_rules_tool
	rebuild_iptables_rule
	able_ssh_port
}

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
	
	# 处理 nftables
	if command -v nft &> /dev/null; then
		nft_status=$(systemctl is-active nftables 2>/dev/null)
		if [ "${nft_status}" == "active" ]; then
			echo "检测到nftables正在运行，正在停止..."
			systemctl stop nftables
			systemctl disable nftables
			echo "成功禁用nftables"
		fi
	fi
	
	echo "防火墙冲突检查完成"
}

install_iptables() {
	getiptables=$(iptables -V | awk 'NR==1{print  $1}')
	if [ "$release" == "debian" ] || [ "$release" == "ubuntu" ]; then
		if [ -z ${getiptables} ]; then
			apt-get install iptables -y
		fi
	elif [[ "$release" == "centos" ]] && [ -z ${getiptables} ]; then
		yum install iptables -y	
	fi
}
install_tool() {
	getnetstat=$(netstat --version | awk 'NR==1{print  $1}')
	if [ "$release" == "debian" ] || [ "$release" == "ubuntu" ]; then
		if [ -z ${getnetstat} ]; then
			apt install net-tools -y
		fi
	elif [[ "$release" == "centos" ]]; then
		if [ -z ${getnetstat} ]; then
			yum install net-tools -y
		fi
	fi
}
rebuild_iptables_rule() {
	iptables -P INPUT ACCEPT
	iptables -F
	iptables -A INPUT -m ttl --ttl-gt 80 -j ACCEPT
	iptables -A INPUT -p icmp -j ACCEPT
	iptables -A INPUT -i lo -j ACCEPT
	iptables -A INPUT -m state --state RELATED,ESTABLISHED -j ACCEPT
	iptables -P INPUT DROP
}
long_save_rules_tool() {
	if [ "$release" == "debian" ] || [ "$release" == "ubuntu" ]; then
		echo "在Debian/Ubuntu系统中配置iptables持久化..."
		# 确保iptables-persistent已安装
		if ! dpkg -l | grep -q "iptables-persistent"; then
			echo "安装iptables-persistent..."
			DEBIAN_FRONTEND=noninteractive apt-get install -y iptables-persistent
		fi
		# 确保iptables服务启用
		if systemctl list-unit-files | grep -q "netfilter-persistent.service"; then
			systemctl enable netfilter-persistent.service
		fi
	elif [[ "$release" == "centos" ]]; then
		# 检查iptables服务状态
		if ! systemctl list-unit-files | grep -q "iptables.service"; then
			echo "安装iptables-services..."
			yum install iptables-services -y
		fi
		# 确保启用iptables服务
		systemctl enable iptables
		# 如果存在ip6tables服务，也启用它
		if systemctl list-unit-files | grep -q "ip6tables.service"; then
			systemctl enable ip6tables
		fi
	fi
	echo "iptables持久化配置完成"
}
able_ssh_port() {
	s="A"
	get_ssh_port
	set_in_ports
}
var_v4_v6_iptables() {
	v4iptables=$(iptables -V)
	v6iptables=$(ip6tables -V)
	if [[ ! -z ${v4iptables} ]]; then
		v4iptables="iptables"
		if [[ ! -z ${v6iptables} ]]; then
			v6iptables="ip6tables"
		fi
	else
		exit 1
	fi
}

# 查看出网模块
view_all_disable_out() {
	echo
	display_out_port
	display_out_keyworld
	echo
}

# 出网端口模块
disable_want_port_out() {
	s="A"
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
 连续端口段：25:587（25-587之间的所有端口）" && echo
	fi
	read -e -p "(回车默认取消):" PORT
	[[ -z "${PORT}" ]] && echo "已取消..." && display_out_port && exit 0
}
set_out_ports() {
	if [[ -n "$v4iptables" ]] && [[ -n "$v6iptables" ]]; then
		tcp_outport_rules $v4iptables $PORT $s
		udp_outport_rules $v4iptables $PORT $s
		tcp_outport_rules $v6iptables $PORT $s
		udp_outport_rules $v6iptables $PORT $s
	elif [[ -n "$v4iptables" ]]; then
		tcp_outport_rules $v4iptables $PORT $s
		udp_outport_rules $v4iptables $PORT $s
	fi
	save_iptables_v4_v6
}
tcp_outport_rules() {
	[[ "$1" = "$v4iptables" ]] && $1 -t filter -$3 OUTPUT -p tcp -m multiport --dports "$2" -m state --state NEW,ESTABLISHED -j REJECT --reject-with icmp-port-unreachable
	[[ "$1" = "$v6iptables" ]] && $1 -t filter -$3 OUTPUT -p tcp -m multiport --dports "$2" -m state --state NEW,ESTABLISHED -j REJECT --reject-with tcp-reset
}
udp_outport_rules() {
	$1 -t filter -$3 OUTPUT -p udp -m multiport --dports "$2" -j DROP
}

able_want_port_out() {
	s="D"
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
 连续端口段：25:587（25-587之间的所有端口）" && echo
	fi
	read -e -p "(回车默认取消):" PORT
	[[ -z "${PORT}" ]] && echo "已取消..." && display_out_port && exit 0
}

# 出网关键词模块
disable_want_keyworld_out() {
	s="A"
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
able_want_keyworld_out() {
	s="D"
	grep_out_keyword
	[[ -z ${disable_out_keyworld_list} ]] && echo -e "${Error} 检测到未封禁任何 关键词 !" && exit 0
	input_want_keyworld_type "unban"
	set_out_keywords
	echo -e "${Info} 已解封关键词 [ ${key_word} ] !\n"
	while true
	do
		grep_out_keyword
		[[ -z ${disable_out_keyworld_list} ]] && echo -e "${Error} 检测到未封禁任何 关键词 !" && exit 0
		input_want_keyworld_type "unban" "ban_1"
		set_out_keywords
		echo -e "${Info} 已解封关键词 [ ${key_word} ] !\n"
	done
	display_out_keyworld
}
able_all_keyworld_out() {
	grep_out_keyword
	[[ -z ${disable_out_keyworld_text} ]] && echo -e "${Error} 检测到未封禁任何 关键词，请检查 !" && exit 0
	if [[ ! -z "${v6iptables}" ]]; then
		Ban_KEY_WORDS_v6_num=$(echo -e "${disable_out_keyworld_v6_list}"|wc -l)
		for((integer = 1; integer <= ${Ban_KEY_WORDS_v6_num}; integer++))
			do
				${v6iptables} -t mangle -D OUTPUT 1
		done
	fi
	Ban_KEY_WORDS_num=$(echo -e "${disable_out_keyworld_list}"|wc -l)
	for((integer = 1; integer <= ${Ban_KEY_WORDS_num}; integer++))
		do
			${v4iptables} -t mangle -D OUTPUT 1
	done
	save_iptables_v4_v6
	display_out_keyworld
	echo -e "${Info} 已解封所有关键词 !"
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
set_out_keywords() {
	key_word_num=$(echo -e "${key_word}" | wc -l)
	for ((integer = 1; integer <= ${key_word_num}; integer++)); do
		i=$(echo -e "${key_word}" | sed -n "${integer}p")
		out_keyworld_rule $v4iptables "$i" $s
		[[ ! -z "$v6iptables" ]] && out_keyworld_rule $v6iptables "$i" $s
	done
	save_iptables_v4_v6
}
out_keyworld_rule() {
	$1 -t mangle -$3 OUTPUT -m string --string "$2" --algo bm --to 65535 -j DROP
}
input_disable_keyworlds_file() {
	echo -e "请输入欲封禁/解封的 关键词本地文件（请使用绝对路径）" && echo
	read -e -p "(默认 读取脚本同目录下的 key_word.txt ):" key_word
	[[ -z "${key_word}" ]] && key_word="key_word.txt"
	if [[ -e "${key_word}" ]]; then
		key_word=$(cat "${key_word}")
		[[ -z ${key_word} ]] && echo -e "${Error} 文件内容为空 !" && View_ALL && exit 0
	else
		echo -e "${Error} 没有找到文件 ${key_word} !" && display_out_keyworld && exit 0
	fi	
}
input_disable_keyworlds_url() {
	echo -e "请输入欲封禁/解封的 关键词网络文件地址（例如 http://xxx.xx/key_word.txt）" && echo
	read -e -p "(回车默认取消):" key_word
	[[ -z "${key_word}" ]] && echo "已取消..." && View_ALL && exit 0
	key_word=$(wget --no-check-certificate -t3 -T5 -qO- "${key_word}")
	[[ -z ${key_word} ]] && echo -e "${Error} 网络文件内容为空或访问超时 !" && display_out_keyworld && exit 0
}

able_want_keyworld_out() {
	s="D"
	grep_out_keyword
	[[ -z ${disable_out_keyworld_list} ]] && echo -e "${Error} 检测到未封禁任何 关键词 !" && exit 0
	input_want_keyworld_type "unban"
	set_out_keywords
	echo -e "${Info} 已解封关键词 [ ${key_word} ] !\n"
	while true; do
		grep_out_keyword
		[[ -z ${disable_out_keyworld_list} ]] && echo -e "${Error} 检测到未封禁任何 关键词 !" && exit 0
		input_want_keyworld_type "unban" "ban_1"
		set_out_keywords
		echo -e "${Info} 已解封关键词 [ ${key_word} ] !\n"
	done
	view_all_disable_out
}

# 出网细分功能模块
# 封禁BT、PT、SPAM
disable_all_out() {
	disable_btpt
	disable_spam
}

disable_btpt() {
	check_BT
	[[ ! -z ${BT_KEY_WORDS} ]] && echo -e "${Error} 检测到已封禁BT、PT 关键词，无需再次封禁 !" && exit 0
	s="A"
	Set_BT
	echo -e "${Info} 已封禁BT、PT 关键词 !"
}
check_BT() {
	grep_out_keyword
	BT_KEY_WORDS=$(echo -e "$disable_out_keyworld_list" | grep "torrent")
}
Set_BT() {
	key_word=${bt_key_word}
	set_out_keywords
	save_iptables_v4_v6
}

disable_spam() {
	check_SPAM
	[[ ! -z ${SPAM_PORT} ]] && echo -e "${Error} 检测到已封禁SPAM(垃圾邮件) 端口，无需再次封禁 !" && exit 0
	s="A"
	Set_SPAM
	echo -e "${Info} 已封禁SPAM(垃圾邮件) 端口 !"
}
check_SPAM() {
	grep_out_port
	SPAM_PORT=$(echo -e "$disable_outport_list" | grep "${smtp_port}")
}
Set_SPAM() {
	if [[ -n "$v4iptables" ]] && [[ -n "$v6iptables" ]]; then
		Set_SPAM_Code_v4_v6
	elif [[ -n "$v4iptables" ]]; then
		Set_SPAM_Code_v4
	fi
	save_iptables_v4_v6
}
Set_SPAM_Code_v4() {
	for i in ${smtp_port} ${pop3_port} ${imap_port} ${other_port}; do
		tcp_outport_rules $v4iptables "$i" $s
		ucp_outport_rules $v4iptables "$i" $s
	done
}
Set_SPAM_Code_v4_v6() {
	for i in ${smtp_port} ${pop3_port} ${imap_port} ${other_port}; do
		for j in $v4iptables $v6iptables; do
			tcp_outport_rules $j "$i" $s
			udp_outport_rules $j "$i" $s
		done
	done
}

# 解封BT、PT、SPAM
able_all_out() {
	able_btpt
	able_spam
}

able_btpt() {
	check_BT
	[[ -z ${BT_KEY_WORDS} ]] && echo -e "${Error} 检测到未封禁BT、PT 关键词，请检查 !" && exit 0
	s="D"
	Set_BT
	echo -e "${Info} 已解封BT、PT 关键词 !"
}

able_spam() {
	check_SPAM
	[[ -z ${SPAM_PORT} ]] && echo -e "${Error} 检测到未封禁SPAM(垃圾邮件) 端口，请检查 !" && exit 0
	s="D"
	Set_SPAM
	view_all_disable_out
	echo -e "${Info} 已解封SPAM(垃圾邮件) 端口 !"
}

# 入网端口模块
able_want_port_in() {
	display_in_port
	s="A"
	input_able_want_inport
	set_in_ports
	echo -e "${Info} 已放行端口 [ ${PORT} ] !\n"
	able_port_Type_1="1"
	while true
	do
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
 连续端口段：25:587（25-587之间的所有端口）" && echo
	fi
	read -e -p "(回车默认取消):" PORT
	[[ -z "${PORT}" ]] && echo "已取消..." && display_in_port && exit 0
}
disable_want_port_in(){
	display_in_port
	s="D"
	input_disable_want_inport
	set_in_ports
	echo -e "${Info} 已取消放行端口 [ ${PORT} ] !\n"
	able_port_Type_1="1"
	while true
	do
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
 连续端口段：25:587（25-587之间的所有端口）" && echo
	fi
	read -e -p "(回车默认取消):" PORT
	[[ -z "${PORT}" ]] && echo "已取消..." && display_in_port && exit 0
}
set_in_ports() {
	if [[ -n "$v4iptables" ]] && [[ -n "$v6iptables" ]]; then
		tcp_inport_rules $v4iptables $PORT $s
		udp_inport_rules $v4iptables $PORT $s
		tcp_inport_rules $v6iptables $PORT $s
		udp_inport_rules $v6iptables $PORT $s
	elif [[ -n "$v4iptables" ]]; then
		tcp_inport_rules $v4iptables $PORT $s
		udp_inport_rules $v4iptables $PORT $s
	fi
	save_iptables_v4_v6
}
tcp_inport_rules() {
	[[ "$1" = "$v4iptables" ]] && $1 -t filter -$3 INPUT -p tcp -m multiport --dports "$2" -j ACCEPT -m comment --comment "shellsettcp"
	[[ "$1" = "$v6iptables" ]] && $1 -t filter -$3 INPUT -p tcp -m multiport --dports "$2" -j ACCEPT -m comment --comment "shellsettcp"
}
udp_inport_rules() {
	$1 -t filter -$3 INPUT -p udp -m multiport --dports "$2" -j ACCEPT -m comment --comment "shellsetudp";
}

# 入网IP模块
able_in_ips() {
	display_in_ip
	s="A"
	input_able_want_inip
	set_in_ips
	echo -e "${Info} 已放行IP [ ${IP} ] !\n"
	able_ip_Type_1="1"
	while true
	do
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

disable_want_ip_in(){
	display_in_ip
	s="D"
	input_disable_want_inip
	set_in_ips
	echo -e "${Info} 已取消放行IP [ ${IP} ] !\n"
	able_ip_Type_1="1"
	while true
	do
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

set_in_ips() {
	if [[ -n "$v4iptables" ]] && [[ -n "$v6iptables" ]]; then
		ip_inport_rules $v4iptables $IP $s
		ip_inport_rules $v6iptables $IP $s
	elif [[ -n "$v4iptables" ]]; then
		ip_inport_rules $v4iptables $IP $s
	fi
	save_iptables_v4_v6
}

ip_inport_rules() {
	# 处理多个IP或IP段，以逗号分隔
	IFS=',' read -ra IPS <<< "$2"
	for ip in "${IPS[@]}"; do
		# 检查是否是CIDR格式
		if [[ $ip == *"/"* ]]; then
			# 检查是否是IPv4地址（包含小数点）
			if [[ "$1" = "$v4iptables" && $ip == *"."* ]]; then
				$1 -t filter -$3 INPUT -s $ip -j ACCEPT -m comment --comment "shellsetip"
			# 检查是否是IPv6地址（包含冒号）
			elif [[ "$1" = "$v6iptables" && $ip == *":"* ]]; then
				$1 -t filter -$3 INPUT -s $ip -j ACCEPT -m comment --comment "shellsetip"
			fi
		else
			# 检查是否是IPv4地址（包含小数点）
			if [[ "$1" = "$v4iptables" && $ip == *"."* ]]; then
				$1 -t filter -$3 INPUT -s $ip -j ACCEPT -m comment --comment "shellsetip"
			# 检查是否是IPv6地址（包含冒号）
			elif [[ "$1" = "$v6iptables" && $ip == *":"* ]]; then
				$1 -t filter -$3 INPUT -s $ip -j ACCEPT -m comment --comment "shellsetip"
			fi
		fi
	done
}

display_in_ip() {
	grep_in_ip
	if [[ -n ${able_in_ip_list} ]]; then
		echo -e "===============${Red_background_prefix} 当前已放行 IP ${Font_color_suffix}==============="
		echo -e "$able_in_ip_list" && echo && echo -e "==============================================="
	else
		echo -e "===============${Red_background_prefix} 当前未放行任何 IP ${Font_color_suffix}==============="
		echo -e "==============================================="
	fi
}

grep_in_ip() {
	able_in_ip_list=$(iptables -t filter -L INPUT -n | grep "shellsetip" | awk '{print $4}')
}

# 部分调用函数
save_iptables_v4_v6() {
	echo "正在保存iptables规则..."
	
	# CentOS系统使用iptables-save服务保存
	if [[ ${release} == "centos" ]]; then
		if systemctl list-unit-files | grep -q "iptables.service"; then
			service iptables save
			if [[ ! -z "$v6iptables" ]] && systemctl list-unit-files | grep -q "ip6tables.service"; then
				service ip6tables save
			fi
		else
			# 如果没有iptables服务，手动保存规则
			mkdir -p /etc/iptables
			iptables-save > /etc/iptables/rules.v4
			if [[ ! -z "$v6iptables" ]]; then
				ip6tables-save > /etc/iptables/rules.v6
			fi
		fi
	# Debian/Ubuntu系统保存到rules文件
	else
		mkdir -p /etc/iptables
		iptables-save > /etc/iptables/rules.v4
		if [[ ! -z "$v6iptables" ]]; then
			ip6tables-save > /etc/iptables/rules.v6
		fi
		
		# 创建网络接口启动时自动加载规则的脚本
		cat > /etc/network/if-pre-up.d/iptables <<-EOF
		#!/bin/bash
		/sbin/iptables-restore < /etc/iptables/rules.v4
		if [ -f /etc/iptables/rules.v6 ]; then
		  /sbin/ip6tables-restore < /etc/iptables/rules.v6
		fi
		exit 0
		EOF
		
		chmod +x /etc/network/if-pre-up.d/iptables
		
		# 对于使用netplan的系统，确保通过systemd服务加载规则
		if command -v netplan &> /dev/null; then
			cat > /etc/systemd/system/iptables-restore.service <<-EOF
			[Unit]
			Description=Restore iptables firewall rules
			Before=network-pre.target
			Wants=network-pre.target
			
			[Service]
			Type=oneshot
			ExecStart=/sbin/iptables-restore /etc/iptables/rules.v4
			ExecStart=/sbin/ip6tables-restore /etc/iptables/rules.v6
			RemainAfterExit=yes
			
			[Install]
			WantedBy=multi-user.target
			EOF
			
			systemctl daemon-reload
			systemctl enable iptables-restore.service
		fi
	fi
	
	echo "iptables规则保存完成"
}

display_out_port() {
	grep_out_port
	echo -e "===============${Red_background_prefix} 当前已封禁 端口 ${Font_color_suffix}==============="
	echo -e "$disable_outport_list" && echo && echo -e "==============================================="
}

display_out_keyworld() {
	grep_out_keyword
	echo -e "==============${Red_background_prefix} 当前已封禁 关键词 ${Font_color_suffix}=============="
	echo -e "$disable_out_keyworld_list" && echo -e "==============================================="
}

display_in_port() {
	grep_tcp_inport
	grep_udp_inport
	if [[ -n ${able_tcp_inport_list} ]] || [[ -n ${able_udp_inport_list} ]]; then
	echo -e "===============${Red_background_prefix} 当前已放行 端口 ${Font_color_suffix}==============="
	fi
	if [[ -n ${able_tcp_inport_list} ]]; then
		echo
		echo "TCP"
		echo -e "$able_tcp_inport_list" && echo && echo -e "==============================================="
	fi
	if [[ -n ${able_udp_inport_list} ]]; then
		echo
		echo "UDP"
		echo -e "$able_udp_inport_list" && echo && echo -e "==============================================="
	fi
}

display_ssh() {
	get_ssh_port
	echo
	echo "SSH 端口为 ${PORT}"
	echo
}

get_ssh_port() {
	PORT=$(netstat -anp | grep sshd | awk 'NR==1{print  substr($4, 9, length($4)-8)}')
}
grep_out_port() {
	disable_outport_list=$(iptables -t filter -L OUTPUT -nvx --line-numbers | grep "REJECT" | awk '{print $13}')
}
grep_tcp_inport() {
	able_tcp_inport_list=$(iptables -t filter -L INPUT -nvx --line-numbers | grep "shellsettcp" | awk '{print $13}')
}
grep_udp_inport() {
	able_udp_inport_list=$(iptables -t filter -L INPUT -nvx --line-numbers | grep "shellsetudp" | awk '{print $13}')
}

grep_out_keyword() {
	disable_out_keyworld_list=""
	disable_out_keyworld_v6_list=""
	if [[ ! -z ${v6iptables} ]]; then
		disable_out_keyworld_v6_text=$(${v6iptables} -t mangle -L OUTPUT -nvx --line-numbers | grep "DROP")
		disable_out_keyworld_v6_list=$(echo -e "${disable_out_keyworld_v6_text}" | sed -r 's/.*\"(.+)\".*/\1/')
	fi
	disable_out_keyworld_text=$(${v4iptables} -t mangle -L OUTPUT -nvx --line-numbers | grep "DROP")
	disable_out_keyworld_list=$(echo -e "${disable_out_keyworld_text}" | sed -r 's/.*\"(.+)\".*/\1/')
}

diable_blocklist_out() {
	s="A"
	echo -e "正在连接 关键词网络文件地址"
	key_word=$(wget --no-check-certificate -t3 -T5 -qO- "https://raw.githubusercontent.com/Aipblock/saveblocklist/main/block.txt")
	[[ -z ${key_word} ]] && echo -e "${Error} 网络文件内容为空或访问超时 !" && display_out_keyworld && exit 0
	key_word_num=$(echo -e "${key_word}"|wc -l)
	for((integer = 1; integer <= ${key_word_num}; integer++))
		do
			i=$(echo -e "${key_word}"|sed -n "${integer}p")
			set_out_keywords $v4iptables "$i" $s
			[[ ! -z "$v6iptables" ]] && set_out_keywords $v6iptables "$i" $s
	done
	save_iptables_v4_v6
	echo -e "成功执行" && echo
}

clear_rebuild_ipta() {
	rebuild_iptables_rule
	echo "已清空所有规则"
	able_ssh_port
	echo "仅放行了 SSH端口：${PORT}"
}

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

Update_Shell() {
	# 检测网络环境
	check_network_env
	
	# 根据网络环境选择不同的URL
	if [ $IN_CHINA -eq 1 ]; then
		DOWNLOAD_URL="https://gh-proxy.com/raw.githubusercontent.com/Fiftonb/GiPtato/refs/heads/main/iPtato.sh"
		VERSION_URL="https://gh-proxy.com/raw.githubusercontent.com/Fiftonb/GiPtato/refs/heads/main/iPtato.sh"
		echo "使用国内GitHub代理加速更新..."
	else
		DOWNLOAD_URL="https://raw.githubusercontent.com/Fiftonb/GiPtato/refs/heads/main/iPtato.sh"
		VERSION_URL="https://raw.githubusercontent.com/Fiftonb/GiPtato/refs/heads/main/iPtato.sh"
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
			wget -N --no-check-certificate ${DOWNLOAD_URL} -O iPtato.sh.new
			if [ $? -eq 0 ]; then
				mv iPtato.sh.new iPtato.sh
				chmod +x iPtato.sh
				echo -e "脚本已更新为最新版本[ ${sh_new_ver} ] !\n运行 bash iPtato.sh 启动最新版本"
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
    echo -e "  0-21: 对应菜单中的功能"
    echo -e "需要额外参数的功能:"
    echo -e "  4: 指定要封禁的端口，例如: $0 4 80,443"
    echo -e "  5: 指定要封禁的关键词，例如: $0 5 youtube.com"
    echo -e "  9: 指定要解封的端口，例如: $0 9 80,443"
    echo -e "  10: 指定要解封的关键词，例如: $0 10 youtube.com"
    echo -e "  15: 指定要放行的端口，例如: $0 15 80,443"
    echo -e "  16: 指定要取消放行的端口，例如: $0 16 80,443"
    echo -e "  17: 指定要放行的IP，例如: $0 17 1.2.3.4"
    echo -e "  18: 指定要取消放行的IP，例如: $0 18 1.2.3.4"
}

# 非交互式处理端口封禁
non_interactive_port_out() {
    PORT=$1
    if [[ -z "${PORT}" ]]; then
        echo "错误: 未指定端口"
        exit 1
    fi
    s="A"
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
    s="D"
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
    s="A"
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
    s="D"
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
    s="A"
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
    s="D"
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
    s="A"
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
    s="D"
    set_in_ips
    echo -e "${Info} 已取消放行入网IP [ ${IP} ] !\n"
}

check_system
var_v4_v6_iptables
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
echo && echo -e " iptables防火墙 管理脚本 ${Red_font_prefix}[v${sh_ver}]${Font_color_suffix}
  -- 基于逗比脚本修改 在此感谢大佬--
  -- 与某些转发管理面板可能会有冲突 --
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
${Red_font_prefix}增强功能

${Green_font_prefix}19.${Font_color_suffix} 查看 当前SSH端口
${Green_font_prefix}20.${Font_color_suffix} 夺回出入控制(清空所有规则)

————————————
${Green_font_prefix}21.${Font_color_suffix} 升级脚本
${Red_font_prefix}注意:${Font_color_suffix} 本脚本与某些转发管理面板可能会有冲突
————————————
" && echo
shell_run_tips
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
	*)
	echo "请输入正确数字 [0-21]"
	;;
esac