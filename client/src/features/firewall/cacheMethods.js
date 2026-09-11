export default {
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

    isCacheValid(cacheKey) {
        const now = Date.now();
        return this.dataCache[cacheKey] &&
            (now - this.cacheTimestamps[cacheKey]) < this.cacheTTL[cacheKey];
    },

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
    }
};

