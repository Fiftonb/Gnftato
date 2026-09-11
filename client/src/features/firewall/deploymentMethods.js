export default {
    async initializeApplication() {
        try {
            this.loading = true;
            this.isInitialized = false;
            this.scriptCheckLoading = true;

            // 步骤1: 获取服务器基本信息和缓存
            if (!this.hasValidServerId) {
                this.$message.error('未指定服务器ID');
                return false;
            }

            // 获取服务器信息
            const serverResponse = await this.getServer(this.serverId);
            if (!serverResponse || !serverResponse.success) {
                throw new Error(serverResponse?.error || '获取服务器信息失败');
            }
            this.server = serverResponse.data;

            // 尝试加载服务器缓存
            const cacheLoaded = await this.loadServerCache();
            if (cacheLoaded) {
                this.commandOutput += '\n已成功加载服务器缓存数据';
            }

            // 步骤2: 如果服务器未连接，尝试连接
            if (!this.server.status || this.server.status !== 'online') {
                this.connecting = true;
                try {
                    await this.connectServer(this.serverId);
                    this.connecting = false;
                } catch (error) {
                    this.connecting = false;
                    // 如果有缓存，可以继续，否则报错
                    if (!cacheLoaded) {
                        throw new Error(`连接服务器失败: ${error.message}`);
                    }
                    this.$message.warning(`连接服务器失败: ${error.message}，将使用缓存数据`);
                }
            }

            // 步骤3: 只有当服务器在线时，才检查脚本状态
            if (this.isServerOnline) {
                try {
                    const scriptResponse = await this.checkScriptExists(this.serverId);
                    if (scriptResponse && scriptResponse.success) {
                        this.scriptExists = scriptResponse.exists;
                    } else {
                        this.scriptExists = false;
                    }
                } catch (error) {
                    console.error('检查脚本状态失败:', error);
                    this.scriptExists = false;
                }
            } else if (cacheLoaded) {
                // 离线且有缓存，假设脚本存在
                this.scriptExists = true;
            } else {
                this.scriptExists = false;
            }

            // 步骤4: 初始化完成
            this.isInitialized = true;
            this.scriptCheckLoading = false;
            this.loading = false;

            // 这是关键改进：只有当服务器在线且脚本存在时，才加载数据
            if (this.isServerOnline && this.scriptExists && !this.initialDataLoaded) {
                // 标记数据已加载，避免重复加载
                this.initialDataLoaded = true;
                // 添加延迟以确保UI更新完成
                setTimeout(() => {
                    this.refreshAllData();
                    // 强制更新UI，确保数据显示正确
                    this.$forceUpdate();
                }, 500);
            } else if (cacheLoaded) {
                // 使用缓存数据
                this.loadCachedData();
                // 强制更新UI，确保缓存数据显示正确
                this.$forceUpdate();
            }

            return true;
        } catch (error) {
            this.loading = false;
            this.connecting = false;
            this.scriptCheckLoading = false;
            this.isInitialized = false;
            this.$message.error(`初始化失败: ${error.message}`);
            console.error("初始化错误:", error);
            return false;
        }
    },

    handleTabClick(tab) {
        if (!this.scriptExists || !this.isServerOnline) {
            console.log('脚本未部署或服务器离线，跳过标签页数据加载');
            return;
        }

        // 根据标签加载对应数据
        if (tab.name === 'inbound' && !this.dataLoaded.inboundPorts) {
            this.refreshSSHPort();
            this.refreshInboundPorts();
            this.refreshInboundIPs();
        } else if (tab.name === 'outbound' && !this.dataLoaded.blockList) {
            this.refreshBlockList();
        } else if (tab.name === 'ddos' && !this.dataLoaded.defenseStatus) {
            this.refreshDefenseStatus();
        }
    },

    handleInvalidServerId() {
        this.commandOutput = '服务器ID无效，请返回服务器列表重新选择服务器';
        this.$message.error('服务器ID无效');
    },

    handleInitializationFailure() {
        this.$message.warning('应用初始化未完成，某些功能可能不可用');
        this.commandOutput += '\n初始化未完成，请检查服务器连接状态或手动初始化';
    },

    handleInitializationError(error) {
        this.$message.error(`初始化出错: ${error.message}`);
        this.commandOutput += `\n初始化过程中出错: ${error.message}`;
        console.error('应用初始化错误:', error);
    },

    async checkInitialization() {
        try {
            if (!this.hasValidServerId) {
                this.commandOutput = '错误：未指定服务器ID，请返回服务器列表选择服务器';
                this.$message.error('未指定服务器ID');
                return false;
            }

            this.resetInitSteps();
            this.isInitialized = false;
            this.initStepActive = 0;

            this.commandOutput = '正在检查服务器状态...';
            this.loading = true;

            // 步骤1: 检查状态
            const serverResponse = await this.getServer(this.serverId);
            if (!serverResponse || !serverResponse.success) {
                throw new Error(serverResponse?.error || '获取服务器信息失败');
            }
            this.server = serverResponse.data;
            this.initializationSteps[0].done = true;
            this.initStepActive = 1;

            // 尝试加载服务器缓存
            const cacheLoaded = await this.loadServerCache();
            if (cacheLoaded) {
                this.commandOutput += '\n已成功加载服务器缓存数据';
            }

            // 步骤2: 仅在服务器未连接且自动连接失败时尝试再次连接
            if (!this.server.status || this.server.status !== 'online') {
                this.commandOutput += '\n服务器未连接，正在尝试连接...';
                this.connecting = true;
                const connectResponse = await this.connectServer(this.serverId);
                this.connecting = false;

                if (!connectResponse || !connectResponse.success) {
                    // 如果连接失败但有缓存数据，仍可继续
                    if (cacheLoaded) {
                        this.$message.warning('服务器连接失败，将使用缓存数据');
                        this.commandOutput += '\n服务器连接失败，将使用缓存数据';
                        this.initializationSteps[1].done = true;
                        this.initStepActive = 2;
                        this.initializationSteps[2].done = true;
                        this.initStepActive = 3;
                        this.initializationSteps[3].done = true;
                        this.isInitialized = true;
                        this.loading = false;
                        return true;
                    } else {
                        throw new Error(connectResponse?.error || '连接服务器失败');
                    }
                }
                this.commandOutput += '\n服务器连接成功';
            } else {
                // 如果服务器已连接，直接标记此步骤为完成
                this.commandOutput += '\n服务器已连接，跳过连接步骤';
                this.initializationSteps[1].done = true;
                this.initStepActive = 2;
            }

            // 步骤3: 检查脚本部署状态 - 仅在缓存不存在或强制检查时执行
            if (!cacheLoaded || this.deploying) {
                this.commandOutput += '\n检查脚本部署情况...';
                this.deploying = true;
                try {
                    const deployResponse = await this.deployIptato(this.serverId);
                    this.deploying = false;

                    if (!deployResponse || !deployResponse.success) {
                        const errorMsg = deployResponse?.error || '脚本部署失败';
                        this.commandOutput += `\n脚本部署失败: ${errorMsg}`;

                        if (errorMsg.includes('500') || errorMsg.includes('内部错误')) {
                            this.commandOutput += '\n服务器内部错误，可能原因：';
                            this.commandOutput += '\n1. 服务器磁盘空间不足';
                            this.commandOutput += '\n2. 服务器防火墙限制了文件上传';
                            this.commandOutput += '\n3. 服务器缺少必要的依赖包';
                            this.commandOutput += '\n\n建议操作：';
                            this.commandOutput += '\n- 检查服务器连接状态';
                            this.commandOutput += '\n- 查看服务器日志获取详细错误信息';
                            this.commandOutput += '\n- 尝试手动连接服务器并安装依赖';
                        }

                        this.$message.error(`脚本部署失败: ${errorMsg}`);
                        throw new Error(errorMsg);
                    }

                    this.commandOutput += '\n脚本部署成功';
                } catch (deployError) {
                    this.deploying = false;
                    this.commandOutput += `\n脚本部署过程中出错: ${deployError.message}`;

                    // 如果有缓存数据，即使部署失败也可以继续
                    if (cacheLoaded) {
                        this.$message.warning('脚本部署失败，将使用缓存数据');
                        this.commandOutput += '\n将使用缓存数据继续';
                    } else {
                        throw deployError;
                    }
                }
            } else {
                // 有缓存数据且服务器在线，跳过部署步骤
                this.commandOutput += '\n使用已有缓存数据，跳过脚本部署检查';
            }

            this.initializationSteps[2].done = true;
            this.initStepActive = 3;

            // 步骤4: 加载规则信息
            this.initializationSteps[3].done = true;
            this.isInitialized = true;
            this.loading = false;

            // 如果服务器在线且某些数据未从缓存加载，则请求这些数据
            if (this.isServerOnline) {
                // 创建需要刷新的数据类型数组
                const dataToRefresh = [];

                if (!this.dataLoaded.blockList) {
                    dataToRefresh.push('blockList');
                }

                if (!this.dataLoaded.sshPortStatus) {
                    dataToRefresh.push('sshPortStatus');
                }

                if (!this.dataLoaded.inboundPorts) {
                    dataToRefresh.push('inboundPorts');
                }

                if (!this.dataLoaded.inboundIPs) {
                    dataToRefresh.push('inboundIPs');
                }

                // 使用统一的刷新方法
                if (dataToRefresh.length > 0) {
                    setTimeout(() => this.refreshSelectedData(dataToRefresh), 500);
                }
            }

            return true;
        } catch (error) {
            this.loading = false;
            this.deploying = false;
            this.connecting = false;
            this.commandOutput += `\n初始化失败: ${error.message}`;
            this.$message.error(`初始化失败: ${error.message}`);
            return false;
        }
    },

    resetInitSteps() {
        this.initializationSteps.forEach(step => step.done = false);
    },

    async deployScript() {
        if (!this.isServerOnline) {
            this.$message.error('服务器离线，无法部署脚本');
            return;
        }

        try {
            this.deploying = true;
            this.deployLogs = [];
            this.deployComplete = false;
            this.deploySuccess = false;

            // 初始化WebSocket连接
            this.initWebSocket();

            // 添加初始日志
            this.deployLogs.push({
                type: 'log',
                message: '正在准备部署Nftato脚本...'
            });

            // 调用带WebSocket支持的部署方法
            const response = await this.deployIptatoWithWebSocket(this.serverId);

            if (!response || !response.success) {
                throw new Error(response?.error || '开始部署过程失败');
            }

            // 部署已开始，日志将通过WebSocket显示
            this.deployLogs.push({
                type: 'log',
                message: '脚本部署已开始，正在执行...'
            });

        } catch (error) {
            this.deployComplete = true;
            this.deploySuccess = false;
            this.deploying = false;

            this.deployLogs.push({
                type: 'error',
                message: `部署失败: ${error.message}`
            });

            this.$message.error(`部署脚本失败: ${error.message}`);

            // 如果WebSocket方法失败，尝试使用普通部署方法
            this.fallbackToNormalDeploy();
        }
    },

    async fallbackToNormalDeploy() {
        if (this.viewDisposed || this.fallbackDeploying || !this.$store.getters.currentUser?.isAdmin) return;
        this.fallbackDeploying = true;
        this.clearTimers();
        this.socket?.disconnect();
        try {
            this.deployLogs.push({
                type: 'log',
                message: '实时部署失败，尝试使用常规部署方法...'
            });

            this.deploying = true;
            const response = await this.deployIptato(this.serverId);

            if (response && response.success) {
                this.deployLogs.push({
                    type: 'success',
                    message: '使用常规方法部署成功'
                });
                this.deploySuccess = true;
                this.scriptExists = true;

                // 刷新数据
                setTimeout(() => {
                    this.clearServerCacheAfterChange();
                    this.refreshAllData();
                }, 1000);
            } else {
                this.deployLogs.push({
                    type: 'error',
                    message: `常规部署也失败: ${response?.error || '未知错误'}`
                });
            }
        } catch (error) {
            this.deployLogs.push({
                type: 'error',
                message: `常规部署错误: ${error.message}`
            });
        } finally {
            this.deployComplete = true;
            this.deploying = false;
        }
    },

    retryDeploy() {
        this.deployLogs = [];
        this.deployComplete = false;
        this.deploySuccess = false;
        this.deployScript();
    },

    async deployIptatoManually() {
        if (!this.hasValidServerId) {
            this.$message.error('未指定服务器ID，无法执行部署操作');
            return;
        }

        try {
            this.deploying = true;
            this.commandOutput = '正在尝试手动部署脚本...\n';

            const response = await this.$store.dispatch('servers/executeCommand', {
                serverId: this.serverId,
                command: 'wget -N --no-check-certificate https://raw.githubusercontent.com/Fiftonb/Gnftato/refs/heads/main/Nftato.sh && chmod +x Nftato.sh && bash Nftato.sh'
            });

            if (response && response.success) {
                this.commandOutput += '手动部署命令执行成功，正在验证安装结果...\n';

                const verifyResponse = await this.$store.dispatch('servers/executeCommand', {
                    serverId: this.serverId,
                    command: 'test -f /root/Nftato.sh && echo "installed" || echo "not found"'
                });

                if (verifyResponse && verifyResponse.success &&
                    verifyResponse.data && verifyResponse.data.stdout &&
                    verifyResponse.data.stdout.includes('installed')) {

                    this.commandOutput += '脚本已成功安装!\n';
                    this.$message.success('脚本手动部署成功');
                    this.initializationSteps[2].done = true;
                    this.initStepActive = 3;

                    await this.clearServerCacheAfterChange();
                    await this.refreshBlockList();
                    await this.refreshSSHPort();
                    await this.refreshInboundPorts();
                    await this.refreshInboundIPs();

                    this.initializationSteps[3].done = true;
                    this.isInitialized = true;
                } else {
                    this.commandOutput += '脚本安装验证失败，请检查服务器环境或联系管理员\n';
                    this.$message.error('脚本安装验证失败');
                }
            } else {
                this.commandOutput += `手动部署失败: ${response?.error || '未知错误'}\n`;
                this.$message.error('手动部署失败');
            }
        } catch (error) {
            this.commandOutput += `手动部署出错: ${error.message}\n`;
            this.$message.error(`手动部署出错: ${error.message}`);
        } finally {
            this.deploying = false;
        }
    },

    async completeInitialization() {
        if (!this.hasValidServerId) {
            this.$message.error('未指定服务器ID，无法完成初始化');
            return;
        }

        try {
            this.loading = true;
            this.commandOutput = '正在加载规则信息...\n';

            await this.clearServerCacheAfterChange();
            await this.refreshBlockList();
            await this.refreshSSHPort();
            await this.refreshInboundPorts();
            await this.refreshInboundIPs();

            this.initializationSteps[3].done = true;
            this.isInitialized = true;
            this.$message.success('初始化完成');
            this.commandOutput += '初始化完成，可以开始管理防火墙规则';
        } catch (error) {
            this.commandOutput += `\n初始化过程中加载规则出错: ${error.message}`;
            this.$message.error(`加载规则失败: ${error.message}`);
        } finally {
            this.loading = false;
        }
    },

    clearCommandOutput() {
        this.commandOutput = '';
    },

    async checkScriptExistence() {
        if (!this.hasValidServerId) {
            this.$message.error('未指定服务器ID，无法检查脚本');
            return;
        }

        try {
            this.debugging = true;
            this.debugInfo = '正在检查脚本存在状态...\n';

            const commands = [
                'ls -la /root/Nftato.sh',
                'ls -la /root/Nftato.sh',
                'find /root -name "*.sh" | grep -i Nftato',
                'find / -name "*.sh" -type f -not -path "*/\\.*" | grep -i Nftato 2>/dev/null'
            ];

            for (const command of commands) {
                this.debugInfo += `\n执行命令: ${command}\n`;
                const response = await this.$store.dispatch('servers/executeCommand', {
                    serverId: this.serverId,
                    command
                });

                if (response && response.success) {
                    const stdout = response.data?.stdout || '';
                    const stderr = response.data?.stderr || '';

                    this.debugInfo += `输出:\n${stdout}\n`;
                    if (stderr) {
                        this.debugInfo += `错误:\n${stderr}\n`;
                    }

                    if (stdout && (stdout.includes('Nftato.sh') || stdout.includes('Nftato.sh'))) {
                        this.debugInfo += '\n检测到脚本存在！但前端应用未能识别。\n';
                        this.debugInfo += '这可能是脚本命名不一致或路径不同导致的问题。\n';
                        this.$message.warning('脚本已存在但应用无法识别，请参考调试信息');
                        break;
                    }
                } else {
                    this.debugInfo += `命令执行失败: ${response?.error || '未知错误'}\n`;
                }
            }

            this.debugInfo += '\n尝试直接执行脚本...\n';
            const execResponse = await this.$store.dispatch('servers/executeCommand', {
                serverId: this.serverId,
                command: 'cd /root && (./Nftato.sh --help || ./Nftato.sh --help || echo "无法执行脚本")'
            });

            if (execResponse && execResponse.success) {
                const stdout = execResponse.data?.stdout || '';
                this.debugInfo += `执行脚本输出:\n${stdout}\n`;

                if (stdout.includes('管理脚本') || stdout.includes('nftables')) {
                    this.debugInfo += '\n脚本可以成功执行！\n';
                    this.debugInfo += '建议使用手动初始化功能完成后续步骤。\n';
                    this.$message.success('脚本可以成功执行，但需要手动初始化');
                }
            } else {
                this.debugInfo += `脚本执行失败: ${execResponse?.error || '未知错误'}\n`;
            }
        } catch (error) {
            this.debugInfo += `\n检查过程出错: ${error.message}\n`;
            this.$message.error(`检查出错: ${error.message}`);
        } finally {
            this.debugging = false;
        }
    },

    async manualInitialize() {
        if (!this.hasValidServerId) {
            this.$message.error('未指定服务器ID，无法初始化');
            return;
        }

        try {
            this.loading = true;
            this.commandOutput = '正在手动初始化...\n';

            this.initializationSteps.forEach(step => step.done = true);
            this.isInitialized = true;

            await this.clearServerCacheAfterChange();
            await this.refreshBlockList();
            await this.refreshSSHPort();
            await this.refreshInboundPorts();
            await this.refreshInboundIPs();

            this.commandOutput += '手动初始化完成，已跳过脚本检查\n';
            this.$message.success('手动初始化完成');
        } catch (error) {
            this.commandOutput += `\n手动初始化失败: ${error.message}\n`;
            this.$message.error(`初始化失败: ${error.message}`);
        } finally {
            this.loading = false;
        }
    },

    async generateManualCommands() {
        if (!this.hasValidServerId) {
            this.$message.error('未指定服务器ID，无法生成命令');
            return;
        }

        try {
            this.debugging = true;
            this.debugInfo = '以下是您可以直接在服务器上执行的命令：\n\n';

            this.debugInfo += '## 1. 部署Nftato脚本\n';
            this.debugInfo += '```\n';
            this.debugInfo += 'cd ~ && wget -N --no-check-certificate https://raw.githubusercontent.com/Fiftonb/Gnftato/refs/heads/main/Nftato.sh && chmod +x Nftato.sh\n';
            this.debugInfo += '```\n\n';

            this.debugInfo += '## 2. 测试Nftato脚本\n';
            this.debugInfo += '```\n';
            this.debugInfo += './Nftato.sh\n';
            this.debugInfo += '```\n\n';

            this.debugInfo += '## 3. 常用操作命令\n';
            this.debugInfo += '```\n';
            this.debugInfo += '# 阻止BT/PT流量\n';
            this.debugInfo += './Nftato.sh 1\n\n';
            this.debugInfo += '# 解封BT/PT流量\n';
            this.debugInfo += './Nftato.sh 11\n\n';
            this.debugInfo += '# 查看当前封禁列表\n';
            this.debugInfo += './Nftato.sh 101\n';
            this.debugInfo += '```\n\n';

            this.debugInfo += '## 使用方法\n';
            this.debugInfo += '1. 通过SSH工具连接到您的服务器\n';
            this.debugInfo += '2. 复制并粘贴上述命令到SSH终端执行\n';
            this.debugInfo += '3. 执行完成后，返回此界面点击"跳过检查直接初始化"按钮\n\n';

            this.debugInfo += '如果您成功执行了这些命令，请点击页面上的"跳过检查直接初始化"按钮，这样可以绕过自动部署和检查过程，直接使用界面管理规则。\n';

            this.$message.success('已生成手动执行命令，请查看调试信息');
        } catch (error) {
            this.debugInfo += `\n生成命令过程出错: ${error.message}\n`;
            this.$message.error(`生成命令出错: ${error.message}`);
        } finally {
            this.debugging = false;
        }
    },

    async deployIptatoScript() {
        if (!this.hasValidServerId) {
            this.$message.error('未指定服务器ID，无法执行部署操作');
            return;
        }

        try {
            this.loadingDeployment = true; // 使用专用loading状态
            this.commandOutput = '正在部署脚本...\n';

            const response = await this.deployIptato(this.serverId);

            if (response && response.success) {
                this.$message.success('脚本部署成功');
                this.commandOutput += '\n脚本部署成功';

                // 部署成功后重新加载规则数据
                await this.clearServerCacheAfterChange();
                await this.refreshAllData();
            } else {
                const errorMsg = response?.error || '脚本部署失败';
                // 根据错误类型提供具体解决方案
                if (errorMsg.includes('网络连接')) {
                    this.commandOutput += '\n网络连接问题，请检查服务器网络设置';
                    this.$message.error('网络连接问题，请检查服务器网络');
                } else if (errorMsg.includes('权限')) {
                    this.commandOutput += '\n权限不足，请确认SSH用户拥有root权限';
                    this.$message.error('权限不足，请确认用户权限');
                } else if (errorMsg.includes('500') || errorMsg.includes('内部错误')) {
                    this.commandOutput += '\n服务器内部错误，可能原因：';
                    this.commandOutput += '\n1. 服务器磁盘空间不足';
                    this.commandOutput += '\n2. 服务器防火墙限制了文件上传';
                    this.commandOutput += '\n3. 服务器缺少必要的依赖包';
                    this.$message.error('服务器内部错误，请查看详细信息');
                } else {
                    this.$message.error(`脚本部署失败: ${errorMsg}`);
                    this.commandOutput += `\n脚本部署失败: ${errorMsg}`;
                }
            }
        } catch (error) {
            this.$message.error(`脚本部署错误: ${error.message}`);
            this.commandOutput += `\n脚本部署错误: ${error.message}`;
        } finally {
            this.loadingDeployment = false;
        }
    },

    async deployIptatoWithWebSocket(serverId) {
        try {
            // 确保WebSocket已连接
            if (!this.socket || !this.socket.connected) {
                const socket = this.socket;
                if (!socket) throw new Error('实时连接未初始化');
                await new Promise((resolve, reject) => {
                    const cleanup = () => {
                        clearTimeout(timer);
                        socket.off('connect', onConnect);
                        socket.off('connect_error', onError);
                    };
                    const onConnect = () => { cleanup(); resolve(); };
                    const onError = error => { cleanup(); reject(error); };
                    const timer = setTimeout(() => onError(new Error('实时连接超时')), 10000);
                    socket.once('connect', onConnect);
                    socket.once('connect_error', onError);
                });
            }

            if (this.viewDisposed || !this.$store.getters.isAuthenticated || !this.socket?.connected) {
                throw new Error('部署会话已关闭');
            }
            console.log('发起WebSocket部署请求，服务器ID:', serverId);
            // 告知服务器开始部署过程
            this.socket.emit('start_deploy', { serverId });

            // 返回一个空的成功响应，真正的进度会通过WebSocket事件传递
            return { success: true };
        } catch (error) {
            console.error('启动WebSocket部署失败:', error);
            return { success: false, error: error.message };
        }
    },

    scrollToBottom() {
        this.$nextTick(() => {
            if (this.$refs.terminalBody) {
                this.$refs.terminalBody.scrollTop = this.$refs.terminalBody.scrollHeight;
            }
        });
    }
};

