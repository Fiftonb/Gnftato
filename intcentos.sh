#!/bin/bash
set -e

echo "开始配置CentOS 9 nftables防火墙..."

# 获取SSH端口
SSH_PORT=$(ss -tlnp | grep sshd | awk '{print $4}' | awk -F ':' '{print $NF}' | head -1)
[ -z "$SSH_PORT" ] && SSH_PORT=22
echo "检测到SSH端口: $SSH_PORT"

# 配置nftables
echo "配置nftables规则..."

# 创建规则文件 - 关键是使用正确的CentOS 9路径
mkdir -p /etc/nftables
cat > /etc/nftables/main.nft << EOF
#!/usr/sbin/nft -f

# 清空现有规则
flush ruleset

# 基本防火墙规则
table inet filter {
    chain input {
        type filter hook input priority 0; policy drop;
        
        # 允许本地回环
        iifname "lo" accept
        
        # 允许已建立连接
        ct state established,related accept
        
        # 允许ICMP
        ip protocol icmp accept
        ip6 nexthdr icmpv6 accept
        
        # 允许SSH
        tcp dport ${SSH_PORT} accept
    }
    
    chain forward {
        type filter hook forward priority 0; policy drop;
    }
    
    chain output {
        type filter hook output priority 0; policy accept;
    }
}
EOF

# 创建正确的配置文件 - CentOS 9中使用/etc/sysconfig/nftables.conf
cat > /etc/sysconfig/nftables.conf << EOF
# 加载主规则文件
include "/etc/nftables/main.nft"
EOF

echo "应用nftables规则..."
nft -f /etc/nftables/main.nft

# 设置正确的文件权限和SELinux上下文
chmod 600 /etc/nftables/main.nft
chmod 600 /etc/sysconfig/nftables.conf
restorecon -v /etc/nftables/main.nft || true
restorecon -v /etc/sysconfig/nftables.conf || true

# 重启nftables服务
systemctl restart nftables

# 确保服务开机启动
systemctl enable nftables

echo "检查nftables规则..."
nft list ruleset

echo "防火墙配置完成"
echo "已放行SSH端口 ${SSH_PORT}"
echo "出站流量不受限制"