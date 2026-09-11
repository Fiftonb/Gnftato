export default {
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

    beforeUnmount() {
        this.viewDisposed = true;
        this.stopServerStatusCheck();
        // 清理WebSocket连接
        if (this.socket) {
            this.socket.disconnect();
            this.socket = null;
        }

        // 清理所有定时器
        this.clearTimers();

        // 移除窗口大小变化监听
        window.removeEventListener('resize', this.checkMobileDevice);
    }
};
