export default {
    async blockSPAM() {
        if (!this.hasValidServerId) {
            this.$message.error('未指定服务器ID，无法执行阻止操作');
            return;
        }

        try {
            this.loading = true;
            const response = await this.blockSPAMAction(this.serverId);

            if (response && response.success) {
                this.$message.success('成功阻止垃圾邮件流量');
                this.invalidateCache('blockList');
                // 不再调用clearServerCacheAfterChange，而是只刷新blockList
                await this.refreshBlockList();
            } else {
                this.$message.error(response?.error || '阻止垃圾邮件失败');
            }
        } catch (error) {
            this.$message.error(`阻止垃圾邮件错误: ${error.message}`);
        } finally {
            this.loading = false;
        }
    },

    async blockCustomPorts() {
        if (!this.hasValidServerId) {
            this.$message.error('未指定服务器ID，无法执行阻止操作');
            return;
        }

        if (!this.customPorts) {
            this.$message.warning('请输入要阻止的端口');
            return;
        }

        try {
            this.loading = true;
            this.loadingAction = true;
            const response = await this.blockCustomPortsAction({
                serverId: this.serverId,
                ports: this.customPorts
            });

            if (response && response.success) {
                this.$message.success(`成功阻止端口: ${this.customPorts}`);
                this.customPorts = '';
                this.invalidateCache('blockList');
                // 仅刷新相关数据
                await this.refreshSelectedData(['blockList']);
            } else {
                this.$message.error(response?.error || '阻止自定义端口失败');
            }
        } catch (error) {
            this.$message.error(`阻止自定义端口错误: ${error.message}`);
        } finally {
            this.loading = false;
            this.loadingAction = false;
        }
    },

    async unblockSPAM() {
        if (!this.hasValidServerId) {
            this.$message.error('未指定服务器ID，无法执行取消阻止操作');
            return;
        }

        try {
            this.loading = true;
            const response = await this.unblockSPAMAction(this.serverId);

            if (response && response.success) {
                this.$message.success('成功取消阻止垃圾邮件流量');
                this.invalidateCache('blockList');
                // 不再调用clearServerCacheAfterChange，而是只刷新blockList
                await this.refreshBlockList();
            } else {
                this.$message.error(response?.error || '取消阻止垃圾邮件失败');
            }
        } catch (error) {
            this.$message.error(`取消阻止垃圾邮件错误: ${error.message}`);
        } finally {
            this.loading = false;
        }
    },

    async unblockCustomPorts() {
        if (!this.hasValidServerId) {
            this.$message.error('未指定服务器ID，无法执行取消阻止操作');
            return;
        }

        if (!this.customUnblockPorts) {
            this.$message.warning('请输入要取消阻止的端口');
            return;
        }

        try {
            this.loading = true;
            this.loadingAction = true;
            const response = await this.unblockCustomPortsAction({
                serverId: this.serverId,
                ports: this.customUnblockPorts
            });

            if (response && response.success) {
                this.$message.success(`成功取消阻止端口: ${this.customUnblockPorts}`);
                this.customUnblockPorts = '';
                this.invalidateCache('blockList');
                // 仅刷新相关数据
                await this.refreshSelectedData(['blockList']);
            } else {
                this.$message.error(response?.error || '取消阻止自定义端口失败');
            }
        } catch (error) {
            this.$message.error(`取消阻止自定义端口错误: ${error.message}`);
        } finally {
            this.loading = false;
            this.loadingAction = false;
        }
    },

    async allowPort() {
        if (!this.hasValidServerId) {
            this.$message.error('未指定服务器ID，无法执行允许入网操作');
            return;
        }

        if (!this.portToAllow) {
            this.$message.warning('请输入要允许的端口');
            return;
        }

        try {
            this.loadingPorts = true; // 使用专用loading状态
            this.loadingAction = true; // 同时设置操作状态
            const response = await this.allowInboundPortsAction({
                serverId: this.serverId,
                ports: this.portToAllow
            });

            if (response && response.success) {
                this.$message.success(`成功允许入网端口: ${this.portToAllow}`);
                this.portToAllow = '';
                this.invalidateCache('inboundPorts');
                // 直接刷新端口数据，不使用refreshSelectedData
                await this.refreshInboundPorts();
            } else {
                this.$message.error(response?.error || '允许入网端口失败');
            }
        } catch (error) {
            this.$message.error(`允许入网端口错误: ${error.message}`);
        } finally {
            this.loadingPorts = false;
            this.loadingAction = false;
        }
    },

    async executeDisallowPort(port) {
        try {
            this.loadingPorts = true;
            this.loadingAction = true;

            const response = await this.disallowInboundPortsAction({
                serverId: this.serverId,
                ports: port.toString()
            });

            if (response && response.success) {
                this.$message.success(`成功取消放行端口: ${port}`);

                // 手动更新本地缓存数据
                if (this.dataCache.inboundPorts) {
                    // 从tcp和udp数组中移除该端口
                    if (this.dataCache.inboundPorts.tcp) {
                        this.dataCache.inboundPorts.tcp = this.dataCache.inboundPorts.tcp.filter(p => p !== port);
                    }
                    if (this.dataCache.inboundPorts.udp) {
                        this.dataCache.inboundPorts.udp = this.dataCache.inboundPorts.udp.filter(p => p !== port);
                    }

                    // 更新缓存时间戳以触发计算属性重新计算
                    this.cacheTimestamps.inboundPorts = Date.now();
                }
            } else {
                this.$message.error(response?.error || '取消放行入网端口失败');
                console.error('取消放行端口失败:', response?.error);
            }
        } catch (error) {
            this.$message.error(`取消放行端口错误: ${error.message}`);
            console.error('取消放行端口错误:', error);
        } finally {
            this.loadingPorts = false;
            this.loadingAction = false;
        }
    },

    async allowIP() {
        if (!this.hasValidServerId) {
            this.$message.error('未指定服务器ID，无法执行允许入网操作');
            return;
        }

        if (!this.ipToAllow) {
            this.$message.warning('请输入要允许的IP地址');
            return;
        }

        try {
            this.loadingIPs = true;
            this.loadingAction = true;
            const response = await this.allowInboundIPsAction({
                serverId: this.serverId,
                ips: this.ipToAllow
            });

            if (response && response.success) {
                this.$message.success(`成功允许入网IP: ${this.ipToAllow}`);
                this.ipToAllow = '';
                this.invalidateCache('inboundIPs');
                // 直接刷新IP数据，不使用refreshSelectedData
                await this.refreshInboundIPs();
            } else {
                this.$message.error(response?.error || '允许入网IP失败');
            }
        } catch (error) {
            this.$message.error(`允许入网IP错误: ${error.message}`);
        } finally {
            this.loadingIPs = false;
            this.loadingAction = false;
        }
    },

    async disallowIP(ip) {
        if (!this.hasValidServerId) {
            this.$message.error('未指定服务器ID，无法执行取消放行操作');
            return;
        }

        const ipAddress = typeof ip === 'object' ? ip.ip : ip;

        if (!ipAddress) {
            this.$message.error('无效的IP地址');
            return;
        }

        try {
            this.loadingIPs = true;
            this.loadingAction = true;
            const response = await this.disallowInboundIPsAction({
                serverId: this.serverId,
                ips: ipAddress
            });

            if (response && response.success) {
                this.$message.success(`成功取消放行IP: ${ipAddress}`);
                this.invalidateCache('inboundIPs');
                // 直接刷新IP数据，不使用refreshSelectedData
                await this.refreshInboundIPs();
            } else {
                this.$message.error(response?.error || '取消放行IP失败');
            }
        } catch (error) {
            this.$message.error(`取消放行IP错误: ${error.message}`);
        } finally {
            this.loadingIPs = false;
            this.loadingAction = false;
        }
    },

    confirmClearRules() {
        if (!this.hasValidServerId) {
            this.$message.error('未指定服务器ID，无法执行清除规则操作');
            return;
        }

        this.$confirm('此操作将清空所有防火墙规则，是否继续?', '警告', {
            confirmButtonText: '确定',
            cancelButtonText: '取消',
            type: 'warning'
        }).then(() => {
            this.clearAllRules();
        }).catch(() => {
            this.$message({
                type: 'info',
                message: '已取消清空操作'
            });
        });
    },

    async clearAllRules() {
        if (!this.hasValidServerId) {
            this.$message.error('未指定服务器ID，无法执行清除规则操作');
            return;
        }

        try {
            this.loading = true;
            this.loadingAction = true;
            const response = await this.clearAllRulesAction(this.serverId);

            if (response && response.success) {
                this.$message.success('成功清除所有规则');
                // 清空所有缓存
                await this.clearServerCacheAfterChange();
                // 刷新所有数据
                await this.refreshAllData();
            } else {
                this.$message.error(response?.error || '清除所有规则失败');
            }
        } catch (error) {
            this.$message.error(`清除所有规则错误: ${error.message}`);
        } finally {
            this.loading = false;
            this.loadingAction = false;
        }
    },

    async executeTestCommand() {
        if (!this.hasValidServerId) {
            this.commandOutput = '错误：未指定服务器ID，无法执行命令';
            this.$message.error('未指定服务器ID');
            return;
        }

    },

    async disallowPort(port) {
        if (!this.hasValidServerId) {
            this.$message.error('未指定服务器ID，无法执行取消放行操作');
            return;
        }

        if (this.isSshPort(port)) {
            this.$message.error('不能取消SSH端口的放行，这可能导致无法连接服务器');
            return;
        }

        // 对关键端口增加二次确认
        if (this.isCriticalPort(port) && !this.isSshPort(port)) {
            this.$confirm(`端口${port}是常用服务端口，取消放行可能影响服务器某些功能。确定要继续吗?`, '警告', {
                confirmButtonText: '确定',
                cancelButtonText: '取消',
                type: 'warning'
            }).then(() => {
                this.executeDisallowPort(port);
            }).catch(() => {
                this.$message.info('已取消操作');
            });
        } else {
            // 不是关键端口，直接执行
            this.executeDisallowPort(port);
        }
    },

    isSshPort(port) {
        if (this.sshPort && this.sshPort === parseInt(port, 10)) {
            return true;
        }

        if (this.server && this.server.port === parseInt(port, 10)) {
            return true;
        }

        // 由于SSH默认是22端口，也认为它是SSH端口
        return parseInt(port, 10) === 22;
    },

    isCriticalPort(port) {
        return this.criticalPorts.includes(parseInt(port, 10));
    }
};

