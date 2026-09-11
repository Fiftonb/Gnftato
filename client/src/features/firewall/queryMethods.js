export default {
    async refreshAllData() {
        if (!this.hasValidServerId) {
            this.$message.error('未指定服务器ID，无法刷新数据');
            return;
        }

        try {
            this.loading = true;

            // 并行执行所有刷新任务
            await Promise.all([
                this.refreshBlockList(),
                this.refreshSSHPort(),
                this.refreshInboundPorts(),
                this.refreshInboundIPs()
            ]);

            this.$message.success('数据刷新成功');
        } catch (error) {
            this.$message.error(`刷新数据失败: ${error.message}`);
        } finally {
            this.loading = false;
        }
    },

    async refreshSSHPort() {
        // 如果脚本不存在或服务器离线，直接返回
        if (!this.scriptExists || !this.isServerOnline) {
            console.log('脚本未部署或服务器离线，跳过加载SSH端口');
            return;
        }

        if (!this.hasValidServerId) {
            this.$message.error('未指定服务器ID，无法获取SSH端口');
            return;
        }

        const now = Date.now();
        if (this.dataCache.sshPortStatus &&
            (now - this.cacheTimestamps.sshPortStatus) < this.cacheTTL.sshPortStatus) {
            this.sshPortStatus = this.dataCache.sshPortStatus;
            console.log('使用缓存的SSH端口数据');
            return;
        }

        let retries = 0;
        const maxRetries = this.retryConfig.maxRetries;

        while (retries <= maxRetries) {
            try {
                this.loadingSSHPort = true;
                const response = await this.getSSHPort(this.serverId);

                if (response && response.success) {
                    this.sshPortStatus = response.data || '无SSH端口数据';
                    this.dataCache.sshPortStatus = this.sshPortStatus;
                    this.cacheTimestamps.sshPortStatus = now;
                    this.dataLoaded.sshPortStatus = true;

                    // 更新服务器缓存
                    await this.updateServerCacheItem('sshPortStatus', this.sshPortStatus);

                    try {
                        const sshData = response.data;
                        if (sshData && typeof sshData === 'string') {
                            const portMatch = sshData.match(/SSH端口\s*[:：]\s*(\d+)/i) ||
                                sshData.match(/端口\s*[:：]\s*(\d+)/i) ||
                                sshData.match(/port\s*[:：]\s*(\d+)/i);
                            if (portMatch && portMatch[1]) {
                                this.sshPort = parseInt(portMatch[1], 10);
                                console.log(`已识别SSH端口: ${this.sshPort}`);
                            }
                        }
                    } catch (parseError) {
                        console.error('解析SSH端口数据出错:', parseError);
                        if (this.server && this.server.port) {
                            this.sshPort = this.server.port;
                            console.log(`使用服务器配置的端口: ${this.sshPort}`);
                        }
                    }
                    break; // 成功则退出循环
                } else {
                    if (retries < maxRetries && this.retryConfig.enabled) {
                        retries++;
                        this.commandOutput += `\n获取SSH端口失败，第${retries}次重试...`;
                        await new Promise(resolve => setTimeout(resolve, this.retryConfig.delay));
                    } else {
                        this.$message.warning(response?.error || '获取SSH端口失败');
                        this.sshPortStatus = '获取SSH端口失败';
                        break;
                    }
                }
            } catch (error) {
                if (retries < maxRetries && this.retryConfig.enabled) {
                    retries++;
                    this.commandOutput += `\n获取SSH端口错误，第${retries}次重试...`;
                    await new Promise(resolve => setTimeout(resolve, this.retryConfig.delay));
                } else {
                    this.$message.error(`获取SSH端口错误: ${error.message}`);
                    this.sshPortStatus = `获取失败: ${error.message}`;
                    break;
                }
            } finally {
                if (retries >= maxRetries || !this.retryConfig.enabled) {
                    this.loadingSSHPort = false;
                }
            }
        }

        this.loadingSSHPort = false;
    },

    async refreshInboundPorts() {
        // 如果脚本不存在或服务器离线，直接返回
        if (!this.scriptExists || !this.isServerOnline) {
            console.log('脚本未部署或服务器离线，跳过加载入网端口');
            this.dataCache.inboundPorts = { tcp: [], udp: [] };
            return;
        }

        if (!this.hasValidServerId) {
            this.$message.error('未指定服务器ID，无法获取入网端口');
            this.dataCache.inboundPorts = { tcp: [], udp: [] };
            return;
        }

        // 检查缓存是否有效
        const now = Date.now();
        if (this.dataCache.inboundPorts &&
            (now - this.cacheTimestamps.inboundPorts) < this.cacheTTL.inboundPorts) {
            console.log('使用缓存的入网端口数据');
            return;
        }

        let retries = 0;
        const maxRetries = this.retryConfig.maxRetries;

        while (retries <= maxRetries) {
            try {
                this.loadingPorts = true;
                const response = await this.getInboundPorts(this.serverId);

                if (response && response.success) {
                    // 获取原始端口数据
                    const portsData = response.data || {};

                    // 存储原始格式到dataCache
                    if (Array.isArray(portsData)) {
                        // 兼容处理：后端返回了数组格式(旧数据)，转换为原始格式
                        const portNumbers = portsData.map(item => item.port);
                        this.dataCache.inboundPorts = {
                            tcp: portNumbers,
                            udp: portNumbers
                        };

                        // 更新服务器缓存为标准格式
                        try {
                            if (this.hasValidServerId) {
                                await this.updateServerCacheItem('inboundPorts', this.dataCache.inboundPorts);
                            }
                        } catch (cacheError) {
                            console.error('更新服务器缓存失败:', cacheError);
                        }
                    } else if (portsData.tcp || portsData.udp) {
                        // 原始格式，直接存储
                        this.dataCache.inboundPorts = portsData;
                    } else {
                        // 初始化空数据
                        this.dataCache.inboundPorts = { tcp: [], udp: [] };
                    }

                    this.cacheTimestamps.inboundPorts = now;
                    this.dataLoaded.inboundPorts = true;
                    break;
                } else {
                    if (retries < maxRetries && this.retryConfig.enabled) {
                        retries++;
                        this.commandOutput += `\n获取入网端口失败，第${retries}次重试...`;
                        await new Promise(resolve => setTimeout(resolve, this.retryConfig.delay));
                    } else {
                        this.$message.warning(response?.error || '获取入网端口失败');
                        this.dataCache.inboundPorts = { tcp: [], udp: [] };
                        break;
                    }
                }
            } catch (error) {
                if (retries < maxRetries && this.retryConfig.enabled) {
                    retries++;
                    this.commandOutput += `\n获取入网端口错误，第${retries}次重试...`;
                    await new Promise(resolve => setTimeout(resolve, this.retryConfig.delay));
                } else {
                    this.$message.error(`获取入网端口错误: ${error.message}`);
                    this.dataCache.inboundPorts = { tcp: [], udp: [] };
                    break;
                }
            } finally {
                if (retries >= maxRetries || !this.retryConfig.enabled) {
                    this.loadingPorts = false;
                }
            }
        }

        this.loadingPorts = false;
    },

    async refreshInboundIPs() {
        // 如果脚本不存在或服务器离线，直接返回
        if (!this.scriptExists || !this.isServerOnline) {
            console.log('脚本未部署或服务器离线，跳过加载入网IP');
            // 确保设置为空数组
            this.inboundIPs = [];
            return;
        }

        if (!this.hasValidServerId) {
            this.$message.error('未指定服务器ID，无法获取入网IP');
            // 确保设置为空数组
            this.inboundIPs = [];
            return;
        }

        // 标记缓存状态
        console.log('缓存inboundIPs已失效');

        const now = Date.now();
        if (this.dataCache.inboundIPs &&
            Array.isArray(this.dataCache.inboundIPs) &&
            (now - this.cacheTimestamps.inboundIPs) < this.cacheTTL.inboundIPs) {
            // 确保克隆数组而不是引用
            this.inboundIPs = [...this.dataCache.inboundIPs];
            console.log('使用缓存的入网IP数据');
            return;
        }

        let retries = 0;
        const maxRetries = this.retryConfig.maxRetries;

        while (retries <= maxRetries) {
            try {
                this.loadingIPs = true;
                const response = await this.getInboundIPs(this.serverId);

                if (response && response.success) {
                    // 确保响应数据是数组，并处理不同的数据格式
                    const ipsData = response.data || [];

                    // 检查数据类型并确保转换为数组格式
                    if (Array.isArray(ipsData)) {
                        // 如果是数组但元素不是对象，转换为对象格式
                        this.inboundIPs = ipsData.map(ip =>
                            typeof ip === 'string' ? { ip } : ip
                        );
                    } else if (ipsData && typeof ipsData === 'object') {
                        // 处理可能的特殊格式，转换为数组
                        this.inboundIPs = [];
                        try {
                            // 尝试从对象中提取IP
                            if (Object.keys(ipsData).length > 0) {
                                const extractedIPs = [];

                                for (const key in ipsData) {
                                    if (typeof ipsData[key] === 'string') {
                                        extractedIPs.push({ ip: ipsData[key] });
                                    } else if (Array.isArray(ipsData[key])) {
                                        ipsData[key].forEach(ip => {
                                            if (typeof ip === 'string') {
                                                extractedIPs.push({ ip });
                                            } else if (typeof ip === 'object' && ip.ip) {
                                                extractedIPs.push(ip);
                                            }
                                        });
                                    }
                                }

                                this.inboundIPs = extractedIPs;
                            }
                        } catch (parseError) {
                            console.error('解析IP数据出错:', parseError);
                            this.inboundIPs = [];
                        }
                    } else {
                        this.inboundIPs = [];
                    }

                    // 验证所有项都是合法的对象
                    this.inboundIPs = this.inboundIPs.filter(item =>
                        item && typeof item === 'object' && typeof item.ip === 'string'
                    );

                    // 更新缓存时创建新数组
                    this.dataCache.inboundIPs = [...this.inboundIPs];
                    this.cacheTimestamps.inboundIPs = now;
                    this.dataLoaded.inboundIPs = true;

                    // 更新服务器缓存
                    try {
                        if (this.hasValidServerId) {
                            await this.updateServerCacheItem('inboundIPs', this.inboundIPs);
                        }
                    } catch (cacheError) {
                        console.error('更新服务器缓存失败:', cacheError);
                    }
                    break;
                } else {
                    if (retries < maxRetries && this.retryConfig.enabled) {
                        retries++;
                        this.commandOutput += `\n获取入网IP失败，第${retries}次重试...`;
                        await new Promise(resolve => setTimeout(resolve, this.retryConfig.delay));
                    } else {
                        this.$message.warning(response?.error || '获取入网IP失败');
                        this.inboundIPs = [];
                        break;
                    }
                }
            } catch (error) {
                if (retries < maxRetries && this.retryConfig.enabled) {
                    retries++;
                    this.commandOutput += `\n获取入网IP错误，第${retries}次重试...`;
                    await new Promise(resolve => setTimeout(resolve, this.retryConfig.delay));
                } else {
                    this.$message.error(`获取入网IP错误: ${error.message}`);
                    this.inboundIPs = [];
                    break;
                }
            } finally {
                if (retries >= maxRetries || !this.retryConfig.enabled) {
                    this.loadingIPs = false;
                }
            }
        }

        this.loadingIPs = false;

        // 强制为数组类型
        if (!Array.isArray(this.inboundIPs)) {
            this.inboundIPs = [];
        }

        // 改进的强制重新渲染逻辑
        const currentData = [...this.inboundIPs];
        // 先清空，然后在下一个渲染周期重新赋值
        this.$nextTick(() => {
            this.inboundIPs = [];
            this.$nextTick(() => {
                this.inboundIPs = currentData;
            });
        });
    },

    async refreshBlockList() {
        // 如果脚本不存在或服务器离线，直接返回
        if (!this.scriptExists || !this.isServerOnline) {
            console.log('脚本未部署或服务器离线，跳过加载阻止列表');
            return;
        }

        if (!this.hasValidServerId) {
            this.$message.error('未指定服务器ID，无法获取阻止列表');
            return;
        }

        const now = Date.now();
        if (this.dataCache.blockList &&
            (now - this.cacheTimestamps.blockList) < this.cacheTTL.blockList) {
            this.blockList = this.dataCache.blockList;
            console.log('使用缓存的阻止列表数据');
            return;
        }

        let retries = 0;
        const maxRetries = this.retryConfig.maxRetries;

        while (retries <= maxRetries) {
            try {
                this.loadingBlockList = true;
                const response = await this.getBlockList(this.serverId);

                if (response && response.success) {
                    this.blockList = response.data || '无阻止列表数据';
                    this.dataCache.blockList = this.blockList;
                    this.cacheTimestamps.blockList = now;
                    this.dataLoaded.blockList = true;

                    // 更新服务器缓存
                    await this.updateServerCacheItem('blockList', this.blockList);
                    break;
                } else {
                    if (retries < maxRetries && this.retryConfig.enabled) {
                        retries++;
                        this.commandOutput += `\n获取阻止列表失败，第${retries}次重试...`;
                        await new Promise(resolve => setTimeout(resolve, this.retryConfig.delay));
                    } else {
                        this.$message.warning(response?.error || '获取阻止列表失败');
                        this.blockList = '获取阻止列表失败';
                        break;
                    }
                }
            } catch (error) {
                if (retries < maxRetries && this.retryConfig.enabled) {
                    retries++;
                    this.commandOutput += `\n获取阻止列表错误，第${retries}次重试...`;
                    await new Promise(resolve => setTimeout(resolve, this.retryConfig.delay));
                } else {
                    this.$message.error(`获取阻止列表错误: ${error.message}`);
                    this.blockList = `获取失败: ${error.message}`;
                    break;
                }
            } finally {
                if (retries >= maxRetries || !this.retryConfig.enabled) {
                    this.loadingBlockList = false;
                }
            }
        }

        this.loadingBlockList = false;
    },

    async refreshDefenseStatus() {
        if (!this.hasValidServerId) {
            this.$message.error('未指定服务器ID，无法获取防御状态');
            return;
        }

        try {
            this.loadingDefenseStatus = true;
            const response = await this.getDefenseStatus(this.serverId);

            if (response && response.success) {
                this.defenseStatus = response.data || '未启用';
                this.dataLoaded.defenseStatus = true;
            } else {
                this.$message.warning(response?.error || '获取防御状态失败');
                this.defenseStatus = '未知';
            }
        } catch (error) {
            this.$message.error(`获取防御状态错误: ${error.message}`);
            this.defenseStatus = '错误';
        } finally {
            this.loadingDefenseStatus = false;
        }
    },

    async refreshSelectedData(dataTypes = []) {
        if (!this.hasValidServerId) {
            this.$message.error('未指定服务器ID，无法刷新数据');
            return;
        }

        if (!dataTypes || dataTypes.length === 0) {
            return;
        }

        try {
            const refreshTasks = [];

            if (dataTypes.includes('blockList')) {
                refreshTasks.push(this.refreshBlockList());
            }

            if (dataTypes.includes('sshPortStatus')) {
                refreshTasks.push(this.refreshSSHPort());
            }

            if (dataTypes.includes('inboundPorts')) {
                refreshTasks.push(this.refreshInboundPorts());
            }

            if (dataTypes.includes('inboundIPs')) {
                refreshTasks.push(this.refreshInboundIPs());
            }

            await Promise.all(refreshTasks);

            // 强制重新渲染表格
            this.$nextTick(() => {
                // 创建临时变量，触发视图更新
                if (dataTypes.includes('inboundPorts')) {
                    const temp = [...this.inboundPorts];
                    this.inboundPorts = [];
                    this.$nextTick(() => {
                        this.inboundPorts = temp;
                    });
                }

                if (dataTypes.includes('inboundIPs')) {
                    const temp = [...this.inboundIPs];
                    this.inboundIPs = [];
                    this.$nextTick(() => {
                        this.inboundIPs = temp;
                    });
                }
            });
        } catch (error) {
            console.error(`刷新选定数据失败: ${error.message}`);
        }
    }
};

