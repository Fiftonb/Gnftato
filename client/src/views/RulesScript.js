import { mapActions, mapGetters } from 'vuex';
import io from 'socket.io-client';
import RulesForward from './extensions/RulesForward';

export default {
    name: 'RulesScript',
    mixins: [RulesForward],
    props: {
        serverId: {
            type: String,
            required: true
        }
    },
    data() {
        return {
            activeTab: 'inbound',
            loading: false,
            deploying: false,
            connecting: false,
            loadingPorts: false,
            loadingIPs: false,
            loadingSSHPort: false,
            loadingBlockList: false,
            loadingDefenseStatus: false,
            loadingDeployment: false,
            loadingRefreshAll: false,
            server: null,
            blockList: '',
            sshPortStatus: '',
            sshPort: null,
            inboundPorts: [],
            inboundIPs: [],
            commandOutput: '',
            customPorts: '',
            customKeyword: '',
            customUnblockPorts: '',
            portToAllow: '',
            ipToAllow: '',
            isInitialized: false,
            initStepActive: 0,
            initializationSteps: [
                { name: '检查状态', done: false },
                { name: '连接服务器', done: false },
                { name: '部署脚本', done: false },
                { name: '加载规则', done: false }
            ],
            ipTabs: [
                { label: '添加IP白名单', value: 'addWhite' },
                { label: '添加IP黑名单', value: 'addBlack' },
                { label: '从白名单移除', value: 'removeWhite' },
                { label: '从黑名单移除', value: 'removeBlack' }
            ],
            debugging: false,
            debugInfo: '',
            statusCheckTimer: null,
            dataCache: {
                blockList: null,
                sshPortStatus: null,
                inboundPorts: null,
                inboundIPs: null
            },
            cacheTTL: {
                blockList: 60 * 1000, // 1分钟
                sshPortStatus: 60 * 1000,
                inboundPorts: 60 * 1000,
                inboundIPs: 60 * 1000
            },
            cacheTimestamps: {
                blockList: 0,
                sshPortStatus: 0,
                inboundPorts: 0,
                inboundIPs: 0
            },
            dataLoaded: {
                blockList: false,
                sshPortStatus: false,
                inboundPorts: false,
                inboundIPs: false
            },
            serverCacheAvailable: false,
            serverCacheLastUpdate: null,
            defenseStatus: '',
            customDdosPort: '',
            customDdosProtoType: 1,
            customDdosMaxConn: 500,
            customDdosMaxRateMin: 500,
            customDdosMaxRateSec: 250,
            customDdosBanHours: 24,
            ipListsDialogVisible: false,
            ipListsActiveTab: 'addWhite',
            ipToManage: '',
            ipDuration: 0,
            ipManageResult: '',
            // 添加操作重试配置
            retryConfig: {
                maxRetries: 2,
                retryDelay: 1000
            },
            // 添加关键端口列表
            criticalPorts: [22, 80, 443, 3306, 6379, 8080, 8443, 27017, 5432],
            // 添加防抖控制
            ipOperationDebounce: {
                timer: null,
                lastIp: '',
                lastAction: null,
                cooldown: false,
                timeout: 2000 // 2秒防抖时间
            },

            // 添加以下新的数据属性
            scriptExists: false,
            scriptCheckLoading: true,
            deployLogs: [],
            socket: null,
            deployRoomId: null,
            deployComplete: false,
            deploySuccess: false,
            connectTimeoutTimer: null,
            heartbeatInterval: null,
            inactivityTimer: null,
            isMobile: false, // 添加移动设备检测标志
        };
    },
    computed: {
        ...mapGetters('servers', ['getLoading']),
        hasValidServerId() {
            return this.serverId && this.serverId.length > 0;
        },
        isServerOnline() {
            return this.server && this.server.status === 'online';
        },
        formattedPorts() {
            // 如果dataCache中没有inboundPorts或结构不正确，返回空数组
            const portsData = this.dataCache.inboundPorts;
            if (!portsData) return [];

            // 如果是旧格式（数组），直接返回
            if (Array.isArray(portsData)) return portsData;

            // 从原始格式 {tcp: [], udp: []} 生成表格数据
            if (portsData.tcp || portsData.udp) {
                const tcpPorts = Array.isArray(portsData.tcp) ? portsData.tcp : [];
                const udpPorts = Array.isArray(portsData.udp) ? portsData.udp : [];

                // 合并去重
                const uniquePorts = [...new Set([...tcpPorts, ...udpPorts])];

                // 生成表格数据格式
                return uniquePorts.map(port => ({
                    port,
                    protocol: 'TCP/UDP'
                }));
            }

            return [];
        },
        // 添加更细致的服务器状态文本
        serverStatusText() {
            if (!this.server) return '未知';
            switch (this.server.status) {
                case 'online': return '在线';
                case 'offline': return '离线';
                case 'connecting': return '连接中';
                case 'disconnecting': return '断开中';
                default: return '未知状态';
            }
        },
        // 添加更灵活的服务器可用状态判断
        isServerAvailable() {
            return this.server && ['online', 'connecting'].includes(this.server.status);
        },
        // 添加判断服务器是否正在过渡状态
        isServerTransitioning() {
            return this.server && ['connecting', 'disconnecting'].includes(this.server.status);
        }
    },
    beforeRouteEnter(to, from, next) {
        if (!to.params.serverId) {
            next(vm => {
                vm.$message.error('未指定服务器ID，请先选择服务器');
                vm.$router.push('/servers');
            });
        } else {
            // 添加一个标记，表示已经通过路由进入了
            to.params._fromRouterEnter = true;

            next(vm => {
                // 从服务器列表页面进入时，记录来源并在初始化后进行额外的UI刷新
                const fromServersList = from.name === 'servers';

                // 等待Vue实例初始化完成
                vm.$nextTick(async () => {
                    await vm.initializeApplication();

                    // 如果是从服务器列表页面进入，添加额外的UI强制刷新
                    if (fromServersList && vm.isInitialized) {
                        // 先延迟执行，确保数据已加载
                        setTimeout(() => {
                            // 强制更新UI组件
                            vm.$forceUpdate();

                            // 如果正在显示入网控制标签页，确保数据正确显示
                            if (vm.activeTab === 'inbound' && vm.isServerOnline && vm.scriptExists) {
                                // 添加对SSH端口状态的刷新
                                vm.refreshSSHPort();
                                // 尝试重新获取最新数据
                                vm.refreshInboundPorts();
                                vm.refreshInboundIPs();

                                // 再次强制更新，确保SSH端口状态显示
                                setTimeout(() => {
                                    vm.$forceUpdate();
                                }, 300);
                            }
                        }, 800);
                    }
                });
            });
        }
    },
    created() {
        this.activeTab = 'inbound';

        if (this.hasValidServerId) {
            // 如果是通过直接导航来到此页面而不是通过路由跳转，才需要初始化
            // 路由跳转的情况已在beforeRouteEnter中处理
            if (!this.$route.params._fromRouterEnter) {
                this.$nextTick(async () => {
                    await this.initializeApplication();
                });
            }

            this.startServerStatusCheck();
        } else {
            this.handleInvalidServerId();
        }
    },
    mounted() {
        // 检测是否为移动设备
        this.checkMobileDevice();
        // 监听窗口大小变化
        window.addEventListener('resize', this.checkMobileDevice);
    },
    beforeDestroy() {
        // 清理WebSocket连接
        if (this.socket) {
            this.socket.disconnect();
            this.socket = null;
        }

        // 清理所有定时器
        this.clearTimers();

        // 移除窗口大小变化监听
        window.removeEventListener('resize', this.checkMobileDevice);
    },
    methods: {
        ...mapActions('servers', [
            'getServer',
            'deployIptato',
            'connectServer',
            'testSSHConnection',
            'checkScriptExists',
            'resetConnectionStatus'
        ]),
        ...mapActions('rules', [
            'getBlockList',
            'blockSPAMAction',
            'blockCustomPortsAction', ,
            'unblockSPAMAction',
            'unblockCustomPortsAction',
            'getInboundPorts',
            'getInboundIPs',
            'allowInboundPortsAction',
            'disallowInboundPortsAction',
            'allowInboundIPsAction',
            'disallowInboundIPsAction',
            'getSSHPort',
            'clearAllRulesAction',
            'getServerCache',
            'getCacheLastUpdate',
            'clearServerCache',
            'updateCacheItem',
            'setupDdosProtection',
            'setupCustomPortProtection',
            'manageIpLists',
            'getDefenseStatus'
        ]),
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
                if (this.isServerOnline && this.scriptExists && !this.dataLoaded) {
                    // 标记数据已加载，避免重复加载
                    this.dataLoaded = true;
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

        // 确保刷新所有数据的方法只在脚本存在时调用
        refreshAllData() {
            // 如果脚本不存在或服务器离线，直接返回
            if (!this.scriptExists || !this.isServerOnline) {
                console.log('脚本未部署或服务器离线，跳过加载数据');
                return;
            }

            // 获取当前激活的标签页相关数据
            if (this.activeTab === 'inbound') {
                this.refreshSSHPort();
                this.refreshInboundPorts();
                this.refreshInboundIPs();
            } else if (this.activeTab === 'outbound') {
                this.refreshBlockList();
            } else if (this.activeTab === 'ddos') {
                this.refreshDefenseStatus();
            }
        },

        // 在所有数据加载方法中添加脚本检查
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
            // 如果脚本不存在或服务器离线，直接返回
            if (!this.scriptExists || !this.isServerOnline) {
                console.log('脚本未部署或服务器离线，跳过加载防御状态');
                return;
            }

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

        // 修改标签页切换时的行为
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

        // 如果WebSocket部署失败，回退到普通部署方法
        async fallbackToNormalDeploy() {
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

        // 修改重试部署方法
        retryDeploy() {
            this.deployLogs = [];
            this.deployComplete = false;
            this.deploySuccess = false;
            this.deployScript();
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
                const baseURL = process.env.VUE_APP_API_URL || window.location.origin;
                this.debugInfo += `API基础URL: ${baseURL}\n`;
                this.debugInfo += `当前连接模式: ${process.env.NODE_ENV}\n`;

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
        invalidateCache(cacheKey) {
            if (!cacheKey) return;

            try {
                // 重置缓存时间戳
                this.cacheTimestamps[cacheKey] = 0;

                // 根据不同的缓存类型设置初始值
                if (cacheKey === 'inboundPorts' || cacheKey === 'inboundIPs') {
                    // 对于数组类型的缓存，确保重置为空数组
                    this.dataCache[cacheKey] = [];
                    // 同时可能需要重置相应的数据对象，确保UI显示正确
                    if (cacheKey === 'inboundPorts') {
                        // 不会在这里重置数据对象，让刷新方法来处理
                    } else if (cacheKey === 'inboundIPs') {
                        // 不会在这里重置数据对象，让刷新方法来处理
                    }
                } else {
                    // 其他类型的缓存设置为null
                    this.dataCache[cacheKey] = null;
                }

                console.log(`缓存${cacheKey}已失效`);
            } catch (error) {
                console.error(`重置缓存${cacheKey}时出错:`, error);
                // 确保即使出错，缓存也被标记为无效
                this.cacheTimestamps[cacheKey] = 0;
                if (cacheKey === 'inboundPorts' || cacheKey === 'inboundIPs') {
                    this.dataCache[cacheKey] = [];
                } else {
                    this.dataCache[cacheKey] = null;
                }
            }
        },
        async loadServerCache() {
            if (!this.hasValidServerId) {
                return false;
            }

            try {
                const updateResponse = await this.getCacheLastUpdate(this.serverId);
                if (!updateResponse.success) {
                    console.log('服务器缓存不存在或无法访问');
                    return false;
                }

                this.serverCacheLastUpdate = updateResponse.data.lastUpdate;
                this.serverCacheAvailable = true;

                const cacheResponse = await this.getServerCache(this.serverId);
                if (!cacheResponse.success) {
                    return false;
                }

                const cache = cacheResponse.data;

                // 加载并更新缓存数据
                if (cache.data.blockList) {
                    this.blockList = cache.data.blockList;
                    this.dataCache.blockList = cache.data.blockList;
                    this.cacheTimestamps.blockList = Date.now();
                    this.dataLoaded.blockList = true;
                }

                if (cache.data.sshPortStatus) {
                    this.sshPortStatus = cache.data.sshPortStatus;
                    this.dataCache.sshPortStatus = cache.data.sshPortStatus;
                    this.cacheTimestamps.sshPortStatus = Date.now();
                    this.dataLoaded.sshPortStatus = true;

                    try {
                        const sshData = cache.data.sshPortStatus;
                        if (sshData && typeof sshData === 'string') {
                            const portMatch = sshData.match(/SSH端口\s*[:：]\s*(\d+)/i) ||
                                sshData.match(/端口\s*[:：]\s*(\d+)/i) ||
                                sshData.match(/port\s*[:：]\s*(\d+)/i);
                            if (portMatch && portMatch[1]) {
                                this.sshPort = parseInt(portMatch[1], 10);
                            }
                        }
                    } catch (parseError) {
                        console.error('解析SSH端口数据出错:', parseError);
                        if (this.server && this.server.port) {
                            this.sshPort = this.server.port;
                            console.log(`使用服务器配置的端口: ${this.sshPort}`);
                        }
                    }
                }

                if (cache.data.inboundPorts) {
                    // 直接存储原始格式，无需转换
                    const portsData = cache.data.inboundPorts;

                    // 确保数据格式为原始格式
                    if (Array.isArray(portsData)) {
                        // 如果是数组格式，转换为原始格式
                        const portNumbers = portsData.map(item => item.port);
                        this.dataCache.inboundPorts = {
                            tcp: portNumbers,
                            udp: portNumbers
                        };
                    } else if (portsData.tcp || portsData.udp) {
                        // 原始格式，直接存储
                        this.dataCache.inboundPorts = portsData;
                    } else {
                        // 兜底处理
                        this.dataCache.inboundPorts = { tcp: [], udp: [] };
                    }

                    this.cacheTimestamps.inboundPorts = Date.now();
                    this.dataLoaded.inboundPorts = true;
                }

                if (cache.data.inboundIPs) {
                    this.inboundIPs = Array.isArray(cache.data.inboundIPs)
                        ? cache.data.inboundIPs.map(ip => typeof ip === 'string' ? { ip } : ip)
                        : [];
                    this.dataCache.inboundIPs = this.inboundIPs;
                    this.cacheTimestamps.inboundIPs = Date.now();
                    this.dataLoaded.inboundIPs = true;
                }

                console.log('已成功加载服务器缓存数据');
                this.commandOutput = '已加载缓存数据';
                return true;
            } catch (error) {
                console.error('加载服务器缓存失败:', error);
                return false;
            }
        },
        async clearServerCacheAfterChange() {
            if (!this.hasValidServerId) return;

            try {
                // 后端服务器缓存清理
                await this.clearServerCache(this.serverId);
                this.serverCacheAvailable = false;
                this.serverCacheLastUpdate = null;

                // 前端缓存清理
                Object.keys(this.cacheTimestamps).forEach(key => {
                    this.cacheTimestamps[key] = 0;
                    this.dataCache[key] = null;
                });

                console.log('服务器和前端缓存已清除');
            } catch (error) {
                console.error('清除服务器缓存失败:', error);
            }
        },
        async updateServerCacheItem(cacheKey, data) {
            if (!this.hasValidServerId) return;

            try {
                // 先从本地缓存中获取最新数据
                const cacheResponse = await this.getServerCache(this.serverId);
                if (cacheResponse && cacheResponse.success) {
                    const cache = cacheResponse.data;

                    // 构建更新后的数据结构
                    const updateData = { ...cache.data };

                    // 确保updateData.data存在
                    if (!updateData.data) {
                        updateData.data = {};
                    }

                    updateData.data[cacheKey] = data;

                    // 调用后端API更新缓存项
                    const response = await this.$store.dispatch('rules/updateCacheItem', {
                        serverId: this.serverId,
                        key: cacheKey,
                        value: data
                    });

                    if (response && response.success) {
                        console.log(`服务器缓存项 ${cacheKey} 已更新`);
                    } else {
                        console.warn(`更新服务器缓存项 ${cacheKey} 失败`);
                    }
                }
            } catch (error) {
                console.error(`更新服务器缓存项 ${cacheKey} 出错:`, error);
            }

            // 同时更新前端本地缓存
            this.invalidateCache(cacheKey);
        },
        // 添加自动重置连接状态方法，与用户手动点击重置按钮调用的方法区分开
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
                this.loadingPorts = true;
                this.loadingAction = true;
                const response = await this.allowInboundPortsAction({
                    serverId: this.serverId,
                    ports: this.portToAllow
                });

                if (response && response.success) {
                    this.$message.success(`成功允许入网端口: ${this.portToAllow}`);

                    // 手动更新本地缓存
                    const newPorts = this.portToAllow.split(',').map(p => parseInt(p.trim(), 10)).filter(p => !isNaN(p));

                    if (this.dataCache.inboundPorts) {
                        // 确保tcp/udp数组存在
                        if (!this.dataCache.inboundPorts.tcp) {
                            this.dataCache.inboundPorts.tcp = [];
                        }
                        if (!this.dataCache.inboundPorts.udp) {
                            this.dataCache.inboundPorts.udp = [];
                        }

                        // 添加新端口并去重
                        this.dataCache.inboundPorts.tcp = [...new Set([...this.dataCache.inboundPorts.tcp, ...newPorts])];
                        this.dataCache.inboundPorts.udp = [...new Set([...this.dataCache.inboundPorts.udp, ...newPorts])];

                        // 更新缓存时间戳以触发计算属性重新计算
                        this.cacheTimestamps.inboundPorts = Date.now();
                    }

                    this.portToAllow = '';
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
                const baseURL = process.env.VUE_APP_API_URL || window.location.origin;
                this.debugInfo += `API基础URL: ${baseURL}\n`;
                this.debugInfo += `当前连接模式: ${process.env.NODE_ENV}\n`;

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
        invalidateCache(cacheKey) {
            if (!cacheKey) return;

            try {
                // 重置缓存时间戳
                this.cacheTimestamps[cacheKey] = 0;

                // 根据不同的缓存类型设置初始值
                if (cacheKey === 'inboundPorts' || cacheKey === 'inboundIPs') {
                    // 对于数组类型的缓存，确保重置为空数组
                    this.dataCache[cacheKey] = [];
                    // 同时可能需要重置相应的数据对象，确保UI显示正确
                    if (cacheKey === 'inboundPorts') {
                        // 不会在这里重置数据对象，让刷新方法来处理
                    } else if (cacheKey === 'inboundIPs') {
                        // 不会在这里重置数据对象，让刷新方法来处理
                    }
                } else {
                    // 其他类型的缓存设置为null
                    this.dataCache[cacheKey] = null;
                }

                console.log(`缓存${cacheKey}已失效`);
            } catch (error) {
                console.error(`重置缓存${cacheKey}时出错:`, error);
                // 确保即使出错，缓存也被标记为无效
                this.cacheTimestamps[cacheKey] = 0;
                if (cacheKey === 'inboundPorts' || cacheKey === 'inboundIPs') {
                    this.dataCache[cacheKey] = [];
                } else {
                    this.dataCache[cacheKey] = null;
                }
            }
        },
        async loadServerCache() {
            if (!this.hasValidServerId) {
                return false;
            }

            try {
                const updateResponse = await this.getCacheLastUpdate(this.serverId);
                if (!updateResponse.success) {
                    console.log('服务器缓存不存在或无法访问');
                    return false;
                }

                this.serverCacheLastUpdate = updateResponse.data.lastUpdate;
                this.serverCacheAvailable = true;

                const cacheResponse = await this.getServerCache(this.serverId);
                if (!cacheResponse.success) {
                    return false;
                }

                const cache = cacheResponse.data;

                // 加载并更新缓存数据
                if (cache.data.blockList) {
                    this.blockList = cache.data.blockList;
                    this.dataCache.blockList = cache.data.blockList;
                    this.cacheTimestamps.blockList = Date.now();
                    this.dataLoaded.blockList = true;
                }

                if (cache.data.sshPortStatus) {
                    this.sshPortStatus = cache.data.sshPortStatus;
                    this.dataCache.sshPortStatus = cache.data.sshPortStatus;
                    this.cacheTimestamps.sshPortStatus = Date.now();
                    this.dataLoaded.sshPortStatus = true;

                    try {
                        const sshData = cache.data.sshPortStatus;
                        if (sshData && typeof sshData === 'string') {
                            const portMatch = sshData.match(/SSH端口\s*[:：]\s*(\d+)/i) ||
                                sshData.match(/端口\s*[:：]\s*(\d+)/i) ||
                                sshData.match(/port\s*[:：]\s*(\d+)/i);
                            if (portMatch && portMatch[1]) {
                                this.sshPort = parseInt(portMatch[1], 10);
                            }
                        }
                    } catch (parseError) {
                        console.error('解析SSH端口数据出错:', parseError);
                        if (this.server && this.server.port) {
                            this.sshPort = this.server.port;
                            console.log(`使用服务器配置的端口: ${this.sshPort}`);
                        }
                    }
                }

                if (cache.data.inboundPorts) {
                    // 直接存储原始格式，无需转换
                    const portsData = cache.data.inboundPorts;

                    // 确保数据格式为原始格式
                    if (Array.isArray(portsData)) {
                        // 如果是数组格式，转换为原始格式
                        const portNumbers = portsData.map(item => item.port);
                        this.dataCache.inboundPorts = {
                            tcp: portNumbers,
                            udp: portNumbers
                        };
                    } else if (portsData.tcp || portsData.udp) {
                        // 原始格式，直接存储
                        this.dataCache.inboundPorts = portsData;
                    } else {
                        // 兜底处理
                        this.dataCache.inboundPorts = { tcp: [], udp: [] };
                    }

                    this.cacheTimestamps.inboundPorts = Date.now();
                    this.dataLoaded.inboundPorts = true;
                }

                if (cache.data.inboundIPs) {
                    this.inboundIPs = Array.isArray(cache.data.inboundIPs)
                        ? cache.data.inboundIPs.map(ip => typeof ip === 'string' ? { ip } : ip)
                        : [];
                    this.dataCache.inboundIPs = this.inboundIPs;
                    this.cacheTimestamps.inboundIPs = Date.now();
                    this.dataLoaded.inboundIPs = true;
                }

                console.log('已成功加载服务器缓存数据');
                this.commandOutput = '已加载缓存数据';
                return true;
            } catch (error) {
                console.error('加载服务器缓存失败:', error);
                return false;
            }
        },
        async clearServerCacheAfterChange() {
            if (!this.hasValidServerId) return;

            try {
                // 后端服务器缓存清理
                await this.clearServerCache(this.serverId);
                this.serverCacheAvailable = false;
                this.serverCacheLastUpdate = null;

                // 前端缓存清理
                Object.keys(this.cacheTimestamps).forEach(key => {
                    this.cacheTimestamps[key] = 0;
                    this.dataCache[key] = null;
                });

                console.log('服务器和前端缓存已清除');
            } catch (error) {
                console.error('清除服务器缓存失败:', error);
            }
        },
        async updateServerCacheItem(cacheKey, data) {
            if (!this.hasValidServerId) return;

            try {
                // 先从本地缓存中获取最新数据
                const cacheResponse = await this.getServerCache(this.serverId);
                if (cacheResponse && cacheResponse.success) {
                    const cache = cacheResponse.data;

                    // 构建更新后的数据结构
                    const updateData = { ...cache.data };

                    // 确保updateData.data存在
                    if (!updateData.data) {
                        updateData.data = {};
                    }

                    updateData.data[cacheKey] = data;

                    // 调用后端API更新缓存项
                    const response = await this.$store.dispatch('rules/updateCacheItem', {
                        serverId: this.serverId,
                        key: cacheKey,
                        value: data
                    });

                    if (response && response.success) {
                        console.log(`服务器缓存项 ${cacheKey} 已更新`);
                    } else {
                        console.warn(`更新服务器缓存项 ${cacheKey} 失败`);
                    }
                }
            } catch (error) {
                console.error(`更新服务器缓存项 ${cacheKey} 出错:`, error);
            }

            // 同时更新前端本地缓存
            this.invalidateCache(cacheKey);
        },
        // 添加自动重置连接状态方法，与用户手动点击重置按钮调用的方法区分开
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
                const baseURL = process.env.VUE_APP_API_URL || window.location.origin;
                this.debugInfo += `API基础URL: ${baseURL}\n`;
                this.debugInfo += `当前连接模式: ${process.env.NODE_ENV}\n`;

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
        invalidateCache(cacheKey) {
            if (!cacheKey) return;

            try {
                // 重置缓存时间戳
                this.cacheTimestamps[cacheKey] = 0;

                // 根据不同的缓存类型设置初始值
                if (cacheKey === 'inboundPorts' || cacheKey === 'inboundIPs') {
                    // 对于数组类型的缓存，确保重置为空数组
                    this.dataCache[cacheKey] = [];
                    // 同时可能需要重置相应的数据对象，确保UI显示正确
                    if (cacheKey === 'inboundPorts') {
                        // 不会在这里重置数据对象，让刷新方法来处理
                    } else if (cacheKey === 'inboundIPs') {
                        // 不会在这里重置数据对象，让刷新方法来处理
                    }
                } else {
                    // 其他类型的缓存设置为null
                    this.dataCache[cacheKey] = null;
                }

                console.log(`缓存${cacheKey}已失效`);
            } catch (error) {
                console.error(`重置缓存${cacheKey}时出错:`, error);
                // 确保即使出错，缓存也被标记为无效
                this.cacheTimestamps[cacheKey] = 0;
                if (cacheKey === 'inboundPorts' || cacheKey === 'inboundIPs') {
                    this.dataCache[cacheKey] = [];
                } else {
                    this.dataCache[cacheKey] = null;
                }
            }
        },
        async loadServerCache() {
            if (!this.hasValidServerId) {
                return false;
            }

            try {
                const updateResponse = await this.getCacheLastUpdate(this.serverId);
                if (!updateResponse.success) {
                    console.log('服务器缓存不存在或无法访问');
                    return false;
                }

                this.serverCacheLastUpdate = updateResponse.data.lastUpdate;
                this.serverCacheAvailable = true;

                const cacheResponse = await this.getServerCache(this.serverId);
                if (!cacheResponse.success) {
                    return false;
                }

                const cache = cacheResponse.data;

                // 加载并更新缓存数据
                if (cache.data.blockList) {
                    this.blockList = cache.data.blockList;
                    this.dataCache.blockList = cache.data.blockList;
                    this.cacheTimestamps.blockList = Date.now();
                    this.dataLoaded.blockList = true;
                }

                if (cache.data.sshPortStatus) {
                    this.sshPortStatus = cache.data.sshPortStatus;
                    this.dataCache.sshPortStatus = cache.data.sshPortStatus;
                    this.cacheTimestamps.sshPortStatus = Date.now();
                    this.dataLoaded.sshPortStatus = true;

                    try {
                        const sshData = cache.data.sshPortStatus;
                        if (sshData && typeof sshData === 'string') {
                            const portMatch = sshData.match(/SSH端口\s*[:：]\s*(\d+)/i) ||
                                sshData.match(/端口\s*[:：]\s*(\d+)/i) ||
                                sshData.match(/port\s*[:：]\s*(\d+)/i);
                            if (portMatch && portMatch[1]) {
                                this.sshPort = parseInt(portMatch[1], 10);
                            }
                        }
                    } catch (parseError) {
                        console.error('解析SSH端口数据出错:', parseError);
                        if (this.server && this.server.port) {
                            this.sshPort = this.server.port;
                            console.log(`使用服务器配置的端口: ${this.sshPort}`);
                        }
                    }
                }

                if (cache.data.inboundPorts) {
                    // 直接存储原始格式，无需转换
                    const portsData = cache.data.inboundPorts;

                    // 确保数据格式为原始格式
                    if (Array.isArray(portsData)) {
                        // 如果是数组格式，转换为原始格式
                        const portNumbers = portsData.map(item => item.port);
                        this.dataCache.inboundPorts = {
                            tcp: portNumbers,
                            udp: portNumbers
                        };
                    } else if (portsData.tcp || portsData.udp) {
                        // 原始格式，直接存储
                        this.dataCache.inboundPorts = portsData;
                    } else {
                        // 兜底处理
                        this.dataCache.inboundPorts = { tcp: [], udp: [] };
                    }

                    this.cacheTimestamps.inboundPorts = Date.now();
                    this.dataLoaded.inboundPorts = true;
                }

                if (cache.data.inboundIPs) {
                    this.inboundIPs = Array.isArray(cache.data.inboundIPs)
                        ? cache.data.inboundIPs.map(ip => typeof ip === 'string' ? { ip } : ip)
                        : [];
                    this.dataCache.inboundIPs = this.inboundIPs;
                    this.cacheTimestamps.inboundIPs = Date.now();
                    this.dataLoaded.inboundIPs = true;
                }

                console.log('已成功加载服务器缓存数据');
                this.commandOutput = '已加载缓存数据';
                return true;
            } catch (error) {
                console.error('加载服务器缓存失败:', error);
                return false;
            }
        },
        async clearServerCacheAfterChange() {
            if (!this.hasValidServerId) return;

            try {
                // 后端服务器缓存清理
                await this.clearServerCache(this.serverId);
                this.serverCacheAvailable = false;
                this.serverCacheLastUpdate = null;

                // 前端缓存清理
                Object.keys(this.cacheTimestamps).forEach(key => {
                    this.cacheTimestamps[key] = 0;
                    this.dataCache[key] = null;
                });

                console.log('服务器和前端缓存已清除');
            } catch (error) {
                console.error('清除服务器缓存失败:', error);
            }
        },
        async updateServerCacheItem(cacheKey, data) {
            if (!this.hasValidServerId) return;

            try {
                // 先从本地缓存中获取最新数据
                const cacheResponse = await this.getServerCache(this.serverId);
                if (cacheResponse && cacheResponse.success) {
                    const cache = cacheResponse.data;

                    // 构建更新后的数据结构
                    const updateData = { ...cache.data };

                    // 确保updateData.data存在
                    if (!updateData.data) {
                        updateData.data = {};
                    }

                    updateData.data[cacheKey] = data;

                    // 调用后端API更新缓存项
                    const response = await this.$store.dispatch('rules/updateCacheItem', {
                        serverId: this.serverId,
                        key: cacheKey,
                        value: data
                    });

                    if (response && response.success) {
                        console.log(`服务器缓存项 ${cacheKey} 已更新`);
                    } else {
                        console.warn(`更新服务器缓存项 ${cacheKey} 失败`);
                    }
                }
            } catch (error) {
                console.error(`更新服务器缓存项 ${cacheKey} 出错:`, error);
            }

            // 同时更新前端本地缓存
            this.invalidateCache(cacheKey);
        },
        // 添加自动重置连接状态方法，与用户手动点击重置按钮调用的方法区分开
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

        // 添加防抖检查方法
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

        // 修改DDoS防御相关方法
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
        },
        isCriticalPort(port) {
            return this.criticalPorts.includes(parseInt(port, 10));
        },
        // 执行取消放行端口的实际操作
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
        // 添加统一刷新所有数据的方法
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
        // 添加一个选择性刷新方法
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
        },
        // 修改缓存验证方法
        isCacheValid(cacheKey) {
            const now = Date.now();
            return this.dataCache[cacheKey] &&
                (now - this.cacheTimestamps[cacheKey]) < this.cacheTTL[cacheKey];
        },
        // 添加WebSocket初始化方法
        initWebSocket() {
            // 关闭之前可能存在的连接
            if (this.socket) {
                this.socket.disconnect();
            }

            // 创建新连接，确保使用正确的URL
            // 使用相对路径连接到当前域名下的Socket.io
            const wsURL = window.location.origin;
            console.log('尝试连接WebSocket:', wsURL);

            this.socket = io(wsURL, {
                transports: ['websocket', 'polling'],
                reconnection: true,
                reconnectionAttempts: 10,   // 增加重连次数
                reconnectionDelay: 1000,
                timeout: 20000              // 增加连接超时时间
            });

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
                    this.fallbackToNormalDeploy();
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

        // 清除所有计时器
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

        // 设置无活动检测
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

        // 重置无活动定时器
        resetInactivityTimer() {
            this.setupInactivityDetection();
        },

        // 实现WebSocket部署方法
        async deployIptatoWithWebSocket(serverId) {
            try {
                // 确保WebSocket已连接
                if (!this.socket || !this.socket.connected) {
                    await new Promise(resolve => {
                        this.socket.on('connect', resolve);
                        setTimeout(resolve, 3000); // 超时保护
                    });
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

        // 辅助方法：滚动终端到底部
        scrollToBottom() {
            this.$nextTick(() => {
                if (this.$refs.terminalBody) {
                    this.$refs.terminalBody.scrollTop = this.$refs.terminalBody.scrollHeight;
                }
            });
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

        // 如果WebSocket部署失败，回退到普通部署方法
        async fallbackToNormalDeploy() {
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

        // 修改重试部署方法
        retryDeploy() {
            this.deployLogs = [];
            this.deployComplete = false;
            this.deploySuccess = false;
            this.deployScript();
        },

        // 添加缓存加载方法
        loadCachedData() {
            // 使用已加载的缓存数据更新视图
            if (this.dataCache.blockList) {
                this.blockList = this.dataCache.blockList;
            }

            if (this.dataCache.sshPortStatus) {
                this.sshPortStatus = this.dataCache.sshPortStatus;

                try {
                    if (typeof this.dataCache.sshPortStatus === 'string') {
                        const portMatch = this.dataCache.sshPortStatus.match(/SSH端口\s*[:：]\s*(\d+)/i) ||
                            this.dataCache.sshPortStatus.match(/端口\s*[:：]\s*(\d+)/i) ||
                            this.dataCache.sshPortStatus.match(/port\s*[:：]\s*(\d+)/i);
                        if (portMatch && portMatch[1]) {
                            this.sshPort = parseInt(portMatch[1], 10);
                        }
                    }
                } catch (e) {
                    console.error('解析SSH端口出错:', e);
                }
            }

            if (this.dataCache.inboundPorts) {
                this.inboundPorts = this.dataCache.inboundPorts;
            }

            if (this.dataCache.inboundIPs) {
                this.inboundIPs = this.dataCache.inboundIPs;
            }

            console.log('已加载缓存数据');
            this.commandOutput = '已加载缓存数据';
        },

        // 检测是否为移动设备
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
        },
    },
    watch: {
        activeTab(newTab, oldTab) {
            if (newTab === 'outbound' && !this.dataLoaded.blockList) {
                this.refreshBlockList();
            } else if (newTab === 'inbound') {
                if (!this.dataLoaded.sshPortStatus) {
                    this.refreshSSHPort();
                }
                if (!this.dataLoaded.inboundPorts) {
                    setTimeout(() => this.refreshInboundPorts(), 500);
                }
                if (!this.dataLoaded.inboundIPs) {
                    setTimeout(() => this.refreshInboundIPs(), 1000);
                }
            } else if (newTab === 'ddos') {
                if (!this.dataLoaded.defenseStatus) {
                    this.refreshDefenseStatus();
                }
            }
        },
        // 添加服务器状态监控
        'server.status': function (newStatus, oldStatus) {
            if (newStatus === 'online' && oldStatus !== 'online') {
                // 服务器刚刚上线，刷新所有数据
                this.refreshAllData();
            } else if (newStatus !== 'online' && oldStatus === 'online') {
                // 服务器刚刚离线，显示提示
                this.$message.warning('服务器已离线，无法管理防火墙规则');
            }
        },
        // 当脚本状态变化时，可能需要更新UI和数据
        scriptExists(newValue) {
            if (newValue && this.isServerOnline && !this.dataLoaded) {
                // 脚本从不存在变为存在时，加载数据
                this.dataLoaded = true;
                setTimeout(() => {
                    this.refreshAllData();
                }, 500);
            }
        },
        // 当服务器状态变化时，也需要更新
        'server.status'(newValue) {
            if (newValue === 'online' && this.scriptExists && !this.dataLoaded) {
                // 服务器从离线变为在线时，且脚本存在，加载数据
                this.dataLoaded = true;
                setTimeout(() => {
                    this.refreshAllData();
                }, 500);
            }
        }
    }
};