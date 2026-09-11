export default {
    async showManageIpLists() {
        this.ipListsDialogVisible = true;
        this.ipManageResult = '';
        this.ipListsActiveTab = 'addWhite';
        this.ipToManage = '';
        this.ipDuration = 0;
        
        // 重新检查设备类型，确保对话框样式正确
        this.checkMobileDevice();
        
        // 延迟执行，确保对话框正确显示
        this.$nextTick(() => {
            // 如果有dom元素需要聚焦，可以在这里处理
            const firstInput = document.querySelector('.ip-form-wrapper .el-input__inner');
            if (firstInput) {
                setTimeout(() => {
                    firstInput.focus();
                }, 300);
            }
        });
    },

    async addToWhitelist() {
        if (!this.ipToManage) {
            this.$message.warning('请输入IP地址');
            return;
        }

        // 应用防抖逻辑
        if (this.isIpOperationDebounced(1, this.ipToManage)) {
            return;
        }

        try {
            console.log('[调试] 准备添加IP到白名单:', this.ipToManage);
            await this.manageIP(1);
        } catch (error) {
            console.error('[调试] 添加IP到白名单失败:', error);
            this.$message.error(`添加失败: ${error.message}`);
        }
    },

    async addToBlacklist() {
        if (!this.ipToManage) {
            this.$message.warning('请输入IP地址');
            return;
        }

        // 应用防抖逻辑
        if (this.isIpOperationDebounced(2, this.ipToManage)) {
            return;
        }

        try {
            console.log('[调试] 准备添加IP到黑名单:', this.ipToManage);
            await this.manageIP(2);
        } catch (error) {
            console.error('[调试] 添加IP到黑名单失败:', error);
            this.$message.error(`添加失败: ${error.message}`);
        }
    },

    async removeFromWhitelist() {
        if (!this.ipToManage) {
            this.$message.warning('请输入IP地址');
            return;
        }

        // 应用防抖逻辑
        if (this.isIpOperationDebounced(3, this.ipToManage)) {
            return;
        }

        await this.manageIP(3);
    },

    async removeFromBlacklist() {
        if (!this.ipToManage) {
            this.$message.warning('请输入IP地址');
            return;
        }

        // 应用防抖逻辑
        if (this.isIpOperationDebounced(4, this.ipToManage)) {
            return;
        }

        await this.manageIP(4);
    },

    isIpOperationDebounced(actionType, ip) {
        // 如果操作类型、IP地址与上次相同，且在冷却时间内，则阻止操作
        if (this.ipOperationDebounce.cooldown &&
            this.ipOperationDebounce.lastAction === actionType &&
            this.ipOperationDebounce.lastIp === ip) {
            this.$message.warning('操作过于频繁，请稍后再试');
            return true;
        }

        // 记录当前操作
        this.ipOperationDebounce.lastAction = actionType;
        this.ipOperationDebounce.lastIp = ip;

        // 设置冷却状态
        this.ipOperationDebounce.cooldown = true;

        // 清除之前的定时器（如果有）
        if (this.ipOperationDebounce.timer) {
            clearTimeout(this.ipOperationDebounce.timer);
        }

        // 设置新的定时器
        this.ipOperationDebounce.timer = setTimeout(() => {
            this.ipOperationDebounce.cooldown = false;
        }, this.ipOperationDebounce.timeout);

        return false;
    },

    async manageIP(actionType) {
        try {
            this.loading = true;

            const data = {
                actionType,
                ip: this.ipToManage,
                duration: this.ipDuration || 0
            };

            console.log(`[调试] 准备发送IP操作请求: actionType=${actionType}, ip=${this.ipToManage}, duration=${this.ipDuration || 0}`);
            console.log(`[调试] 服务器ID: ${this.serverId}`);

            // 明确使用$store.dispatch直接调用action，避免冲突
            const response = await this.$store.dispatch('rules/manageIpLists', {
                serverId: this.serverId,
                data
            });

            console.log(`[调试] 收到响应:`, response);

            if (response && response.success) {
                let actionName = '';
                switch (actionType) {
                    case 1:
                        actionName = '添加到白名单';
                        break;
                    case 2:
                        actionName = '添加到黑名单';
                        break;
                    case 3:
                        actionName = '从白名单移除';
                        break;
                    case 4:
                        actionName = '从黑名单移除';
                        break;
                }

                this.$message.success(`IP ${this.ipToManage} ${actionName}成功`);
                this.ipManageResult = response.data || `IP ${this.ipToManage} ${actionName}成功`;

                // 在操作成功后自动刷新防御状态
                await this.refreshDefenseStatus();
            } else {
                this.$message.error(response?.error || 'IP管理操作失败');
                this.ipManageResult = `操作失败: ${response?.error || '未知错误'}`;
            }
        } catch (error) {
            this.$message.error(`IP管理操作错误: ${error.message}`);
            this.ipManageResult = `操作错误: ${error.message}`;
        } finally {
            this.loading = false;
        }
    },

    async setupDdosProtectionAction() {
        try {
            this.loading = true;

            const response = await this.setupDdosProtection(this.serverId);

            if (response && response.success) {
                this.$message.success('DDoS防御规则配置成功');
                this.commandOutput = response.data || 'DDoS防御规则配置成功';
                await this.refreshDefenseStatus();
            } else {
                this.$message.error(response?.error || '配置DDoS防御规则失败');
                this.commandOutput = `配置失败: ${response?.error || '未知错误'}`;
            }
        } catch (error) {
            this.$message.error(`配置DDoS防御规则错误: ${error.message}`);
            this.commandOutput = `配置错误: ${error.message}`;
        } finally {
            this.loading = false;
        }
    },

    async setupCustomPortProtectionAction() {
        if (!this.customDdosPort) {
            this.$message.warning('请输入端口号');
            return;
        }

        try {
            this.loading = true;

            const data = {
                port: this.customDdosPort,
                protoType: this.customDdosProtoType,
                maxConn: this.customDdosMaxConn,
                maxRateMin: this.customDdosMaxRateMin,
                maxRateSec: this.customDdosMaxRateSec,
                banHours: this.customDdosBanHours
            };

            const response = await this.setupCustomPortProtection({
                serverId: this.serverId,
                data
            });

            if (response && response.success) {
                this.$message.success(`端口 ${this.customDdosPort} DDoS防御配置成功`);
                this.commandOutput = response.data || `端口 ${this.customDdosPort} DDoS防御配置成功`;
                await this.refreshDefenseStatus();
            } else {
                this.$message.error(response?.error || '配置自定义端口DDoS防御失败');
                this.commandOutput = `配置失败: ${response?.error || '未知错误'}`;
            }
        } catch (error) {
            this.$message.error(`配置自定义端口DDoS防御错误: ${error.message}`);
            this.commandOutput = `配置错误: ${error.message}`;
        } finally {
            this.loading = false;
        }
    },

    showIpListsDialog() {
        this.showManageIpLists();
    }
};

