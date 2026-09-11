import { io } from 'socket.io-client';
import { markRaw } from 'vue';

export default {
    async testServerConnection() {
        if (!this.hasValidServerId) {
            this.$message.error('未指定服务器ID，无法测试连接');
            return;
        }

        try {
            this.debugging = true;
            this.debugInfo = '正在测试服务器连接...\n';

            this.debugInfo += '1. 检查服务器信息:\n';
            const serverResponse = await this.getServer(this.serverId);
            if (serverResponse && serverResponse.success) {
                this.debugInfo += `服务器信息: ${JSON.stringify(serverResponse.data, null, 2)}\n`;
                this.debugInfo += `连接状态: ${serverResponse.data.status}\n`;
            } else {
                this.debugInfo += `获取服务器信息失败: ${serverResponse?.error || '未知错误'}\n`;
            }

            this.debugInfo += '\n尝试重新连接服务器...\n';
            try {
                const connectResponse = await this.connectServer(this.serverId);
                if (connectResponse && connectResponse.success) {
                    this.debugInfo += '服务器重新连接成功\n';
                } else {
                    this.debugInfo += `服务器重新连接失败: ${connectResponse?.error || '未知错误'}\n`;
                }
            } catch (connError) {
                this.debugInfo += `重新连接出错: ${connError.message}\n`;
            }

            this.debugInfo += '\n2. 执行简单命令测试:\n';
            const commandResponse = await this.$store.dispatch('servers/executeCommand', {
                serverId: this.serverId,
                command: 'uname -a && whoami && pwd'
            });

            if (commandResponse && commandResponse.success) {
                this.debugInfo += `命令输出:\n${commandResponse.data?.stdout || ''}\n`;
                this.debugInfo += `命令成功执行，服务器连接正常\n`;
            } else {
                this.debugInfo += `命令执行失败: ${commandResponse?.error || '未知错误'}\n`;
                this.debugInfo += `服务器连接可能存在问题\n`;
            }

            this.debugInfo += '\n3. 检查前后端连接配置:\n';
            const baseURL = (import.meta.env.VITE_API_URL || import.meta.env.VUE_APP_API_URL) || window.location.origin;
            this.debugInfo += `API基础URL: ${baseURL}\n`;
            this.debugInfo += `当前连接模式: ${import.meta.env.MODE}\n`;

            this.debugInfo += '\n4. 检查网络连接:\n';
            try {
                const pingResponse = await this.$store.dispatch('servers/executeCommand', {
                    serverId: this.serverId,
                    command: 'ping -c 3 8.8.8.8'
                });

                if (pingResponse && pingResponse.success) {
                    this.debugInfo += `ping测试结果:\n${pingResponse.data?.stdout || ''}\n`;
                } else {
                    this.debugInfo += `ping测试失败: ${pingResponse?.error || '未知错误'}\n`;
                }
            } catch (error) {
                this.debugInfo += `ping测试错误: ${error.message}\n`;
            }

            this.$message.info('连接测试完成，请查看调试信息');
        } catch (error) {
            this.debugInfo += `\n测试过程出错: ${error.message}\n`;
            this.$message.error(`测试出错: ${error.message}`);
        } finally {
            this.debugging = false;
        }
    },

    async resetConnectionState() {
        if (!this.hasValidServerId) {
            this.$message.error('未指定服务器ID，无法重置状态');
            return;
        }

        try {
            this.debugging = true;
            this.debugInfo = '正在重置连接状态...\n';

            try {
                this.debugInfo += '尝试断开当前连接...\n';
                const disconnectCommand = await this.$store.dispatch('servers/executeCommand', {
                    serverId: this.serverId,
                    command: 'echo "测试连接状态重置"'
                });

                this.debugInfo += '断开连接测试命令执行结果: ' +
                    (disconnectCommand?.success ? '成功' : '失败') + '\n';
            } catch (disconnectError) {
                this.debugInfo += `断开连接测试出错: ${disconnectError.message}\n`;
            }

            this.debugInfo += '尝试重新连接服务器...\n';

            try {
                const connectResponse = await this.connectServer(this.serverId);
                if (connectResponse && connectResponse.success) {
                    this.debugInfo += '服务器重新连接成功\n';
                } else {
                    this.debugInfo += `服务器重新连接失败: ${connectResponse?.error || '未知错误'}\n`;
                }
            } catch (connError) {
                this.debugInfo += `重新连接出错: ${connError.message}\n`;
            }

            this.resetInitSteps();
            this.isInitialized = false;
            this.initStepActive = 0;

            await this.checkInitialization();
            this.debugInfo += '初始化状态已重置，并重新检查\n';
            this.$message.success('连接状态已重置');
        } catch (error) {
            this.debugInfo += `\n重置过程出错: ${error.message}\n`;
            this.$message.error(`重置出错: ${error.message}`);
        } finally {
            this.debugging = false;
        }
    },

    startServerStatusCheck() {
        this.statusCheckTimer = setInterval(async () => {
            if (this.hasValidServerId) {
                try {
                    const response = await this.getServer(this.serverId);
                    if (response && response.success) {
                        const newStatus = response.data.status;
                        const oldStatus = this.server ? this.server.status : null;

                        this.server = response.data;

                        if (oldStatus !== 'online' && newStatus === 'online') {
                            this.$message.success('服务器已恢复在线状态');
                        }

                        if (oldStatus === 'online' && newStatus !== 'online') {
                            this.$message.warning('服务器已离线，无法管理防火墙规则');
                        }
                    }
                } catch (error) {
                    console.error('检查服务器状态出错:', error);
                }
            }
        }, 30000);
    },

    stopServerStatusCheck() {
        if (this.statusCheckTimer) {
            clearInterval(this.statusCheckTimer);
            this.statusCheckTimer = null;
        }
    },

    async tryConnectServer() {
        if (!this.hasValidServerId) {
            this.$message.error('未指定服务器ID，无法连接服务器');
            return;
        }

        try {
            this.connecting = true;
            this.commandOutput = '正在尝试连接服务器...\n';

            const connectResponse = await this.connectServer(this.serverId);

            if (connectResponse && connectResponse.success) {
                this.$message.success('服务器连接成功');
                this.commandOutput += '\n服务器连接成功';
            } else {
                this.$message.error(connectResponse?.error || '连接服务器失败');
                this.commandOutput += `\n连接服务器失败: ${connectResponse?.error || '未知错误'}`;
            }
        } catch (error) {
            this.$message.error(`连接服务器错误: ${error.message}`);
            this.commandOutput += `\n连接服务器错误: ${error.message}`;
        } finally {
            this.connecting = false;
        }
    },

    async autoResetConnectionState() {
        if (!this.hasValidServerId) return false;

        try {
            this.commandOutput = '正在自动重置连接状态...';
            this.loading = true;

            // 尝试重新连接服务器
            const connectResponse = await this.connectServer(this.serverId);
            if (connectResponse && connectResponse.success) {
                console.log('服务器重新连接成功');
                // 更新服务器状态
                const serverResponse = await this.getServer(this.serverId);
                if (serverResponse && serverResponse.success) {
                    this.server = serverResponse.data;
                }
                return true;
            } else {
                console.warn('服务器重新连接失败，将尝试初始化过程');
                return false;
            }
        } catch (error) {
            console.error('自动重置连接状态失败:', error);
            return false;
        } finally {
            this.loading = false;
        }
    },

    initWebSocket() {
        // 关闭之前可能存在的连接
        if (this.socket) {
            this.socket.disconnect();
        }

        // 创建新连接，确保使用正确的URL
        // 使用相对路径连接到当前域名下的Socket.io
        const wsURL = import.meta.env.VITE_API_URL || import.meta.env.VUE_APP_API_URL || window.location.origin;
        console.log('尝试连接WebSocket:', wsURL);

        this.socket = markRaw(io(wsURL, {
            auth: callback => callback({ token: this.$store.state.auth.token }),
            transports: ['websocket', 'polling'],
            reconnection: true,
            reconnectionAttempts: 10,   // 增加重连次数
            reconnectionDelay: 1000,
            timeout: 20000              // 增加连接超时时间
        }));

        // 设置连接事件监听
        this.socket.on('connect', () => {
            console.log('WebSocket已连接, ID:', this.socket.id);
            this.deployLogs.push({
                type: 'log',
                message: '已建立实时部署连接...'
            });

            // 自动滚动到底部
            this.scrollToBottom();

            // 清除之前的超时计时器
            if (this.connectTimeoutTimer) {
                clearTimeout(this.connectTimeoutTimer);
                this.connectTimeoutTimer = null;
            }
        });

        // 设置连接超时
        this.connectTimeoutTimer = setTimeout(() => {
            if (!this.socket.connected) {
                this.deployLogs.push({
                    type: 'error',
                    message: '连接超时，尝试使用常规部署方法...'
                });
            }
        }, 10000);

        // 添加心跳机制，每30秒发送一次心跳，保持连接活跃
        this.heartbeatInterval = setInterval(() => {
            if (this.socket && this.socket.connected) {
                console.log('发送心跳信号...');
                this.socket.emit('heartbeat', { timestamp: Date.now() });
            }
        }, 30000);

        // 监听部署日志
        this.socket.on('deploy_log', (data) => {
            console.log('收到部署日志:', data);
            if (data && data.message) {
                this.deployLogs.push({
                    type: data.type || 'log',
                    message: data.message
                });

                // 自动滚动到底部
                this.scrollToBottom();

                // 重置无活动计时器
                this.resetInactivityTimer();
            }
        });

        // 监听部署完成事件
        this.socket.on('deploy_complete', (data) => {
            console.log('部署完成:', data);
            this.deployComplete = true;
            this.deploySuccess = data.success;

            // 清除心跳和无活动检测
            this.clearTimers();

            if (data.success) {
                this.scriptExists = true;
                this.deployLogs.push({
                    type: 'success',
                    message: '部署成功完成！'
                });

                // 刷新数据
                setTimeout(() => {
                    this.clearServerCacheAfterChange();
                    this.refreshAllData();

                    // 部署成功后，延迟1.5秒让用户看到成功消息，然后刷新页面或切换视图
                    setTimeout(() => {
                        this.deployLogs.push({
                            type: 'success',
                            message: '正在加载功能界面...'
                        });

                        // 这里有两种选择:
                        // 1. 重新加载整个页面 - 最简单但体验不是最好
                        // 2. 在当前页面切换到功能视图 - 更好的用户体验

                        // 方案2: 切换到功能视图，更新UI状态
                        this.isInitialized = true;
                        this.deploying = false;
                        this.deployDialogVisible = false;   // 关闭部署对话框
                        this.activeTab = 'inbound';         // 切换到入网控制标签

                        // 通知用户切换成功
                        this.$message.success('部署成功，已加载功能界面');

                        // 强制更新组件
                        this.$forceUpdate();
                        
                        // 添加额外的UI强制刷新
                        // 先延迟执行，确保数据已加载
                        setTimeout(() => {
                            // 如果正在显示入网控制标签页，确保数据正确显示
                            if (this.activeTab === 'inbound' && this.isServerOnline && this.scriptExists) {
                                // 添加对SSH端口状态的刷新
                                this.refreshSSHPort();
                                // 尝试重新获取最新数据
                                this.refreshInboundPorts();
                                this.refreshInboundIPs();
                                
                                // 再次强制更新，确保SSH端口状态显示
                                setTimeout(() => {
                                    this.$forceUpdate();
                                }, 300);
                            }
                        }, 800);
                    }, 1500);
                }, 1000);
            } else {
                this.deployLogs.push({
                    type: 'error',
                    message: `部署失败: ${data.error || '未知错误'}`
                });
            }

            this.deploying = false;
            this.scrollToBottom();
        });

        // 监听服务器发送的心跳响应
        this.socket.on('heartbeat_response', () => {
            console.log('收到心跳响应');
        });

        // 监听连接错误
        this.socket.on('connect_error', (error) => {
            if (error.data?.code === 'UNAUTHORIZED' || error.message === '未授权' || /token|认证|登录|jwt|unauthorized/i.test(error.message)) {
                this.clearTimers();
                this.deploying = false;
                this.socket.disconnect();
                this.$store.dispatch('logout');
                this.$router.replace('/login');
                this.$message.error('登录已过期，请重新登录');
                return;
            }
            if (error.data?.code === 'FORBIDDEN' || /管理员|权限|forbidden/i.test(error.message)) {
                this.clearTimers();
                this.deploying = false;
                this.socket.disconnect();
                this.$router.replace('/profile');
                this.$message.error('此操作需要管理员权限');
                return;
            }

            console.error('WebSocket连接错误:', error);
            this.deployLogs.push({
                type: 'error',
                message: `实时连接错误: ${error.message || '连接服务器失败'}`
            });
            this.scrollToBottom();
        });

        // 设置无活动检测，2分钟没有任何日志就提示用户
        this.setupInactivityDetection();
    },

    clearTimers() {
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
            this.heartbeatInterval = null;
        }

        if (this.inactivityTimer) {
            clearTimeout(this.inactivityTimer);
            this.inactivityTimer = null;
        }

        if (this.connectTimeoutTimer) {
            clearTimeout(this.connectTimeoutTimer);
            this.connectTimeoutTimer = null;
        }
    },

    setupInactivityDetection() {
        // 清除之前的定时器
        if (this.inactivityTimer) {
            clearTimeout(this.inactivityTimer);
        }

        // 设置新的定时器 - 2分钟无活动提示
        this.inactivityTimer = setTimeout(() => {
            if (this.deploying && !this.deployComplete) {
                this.deployLogs.push({
                    type: 'warning',
                    message: '已经2分钟没有收到任何日志更新，服务器可能仍在执行操作。部署可能需要较长时间，请耐心等待...'
                });
                this.scrollToBottom();

                // 再次设置无活动检测，检查是否真的卡住了
                this.inactivityTimer = setTimeout(() => {
                    if (this.deploying && !this.deployComplete) {
                        this.deployLogs.push({
                            type: 'warning',
                            message: '长时间未收到任何日志更新，您可以继续等待或尝试刷新页面重试'
                        });
                        this.scrollToBottom();
                    }
                }, 180000); // 再等3分钟
            }
        }, 120000); // 2分钟
    },

    resetInactivityTimer() {
        this.setupInactivityDetection();
    },

    checkMobileDevice() {
        // 检查窗口宽度
        const isMobileWidth = window.innerWidth < 768;
        
        // 检查用户代理信息以识别移动设备
        const userAgent = navigator.userAgent || navigator.vendor || window.opera;
        const isMobileDevice = /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(userAgent.toLowerCase());
        
        // 检查触摸事件支持
        const hasTouchSupport = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
        
        // 综合判断是否为移动设备
        this.isMobile = isMobileWidth || (isMobileDevice && hasTouchSupport);
        
        // 如果对话框当前打开，调整其样式
        if (this.ipListsDialogVisible) {
            this.$nextTick(() => {
                // 强制刷新对话框
                const temp = this.ipListsDialogVisible;
                this.ipListsDialogVisible = false;
                this.$nextTick(() => {
                    this.ipListsDialogVisible = temp;
                });
            });
        }
    }
};

