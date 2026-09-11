export function createFirewallState() {
    return {
        activeTab: 'inbound',
        loading: false,
        loadingAction: false,
        deploying: false,
        connecting: false,
        loadingPorts: false,
        loadingIPs: false,
        loadingSSHPort: false,
        loadingBlockList: false,
        loadingDefenseStatus: false,
        loadingDeployment: false,
        loadingRefreshAll: false,
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
        serverChangeToken: 0,
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
        initialDataLoaded: false,
        dataLoaded: {
            blockList: false,
            sshPortStatus: false,
            inboundPorts: false,
            inboundIPs: false,
            defenseStatus: false
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
            enabled: true,
            maxRetries: 2,
            delay: 1000,
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
        viewDisposed: false,
        fallbackDeploying: false,
        deployDialogVisible: false,
        deployRoomId: null,
        deployComplete: false,
        deploySuccess: false,
        connectTimeoutTimer: null,
        heartbeatInterval: null,
        inactivityTimer: null,
        isMobile: false, // 添加移动设备检测标志
    };
}

export const firewallComputed = {
    server: {
        get() {
            if (!this.serverId) return null;
            return this.$store.getters['servers/getServerById'](this.serverId) || null;
        },
        set(server) {
            if (server?._id) this.$store.commit('servers/upsertServer', server);
        }
    },

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

    isServerAvailable() {
        return this.server && ['online', 'connecting'].includes(this.server.status);
    },

    isServerTransitioning() {
        return this.server && ['connecting', 'disconnecting'].includes(this.server.status);
    }
};
