import { computed, reactive, ref } from 'vue';
import { ElMessage, ElMessageBox, ElNotification } from 'element-plus';
import { connectionErrorMessage, offlineCount, onlineCount } from './serverPresentation.js';
import { createServerStatusMonitor } from './serverStatusMonitor.js';

export function useServerConnections(store, router) {
  const checkingServers = reactive({});
  const connectingServers = reactive({});
  const disconnectingServers = reactive({});
  const errorReasons = reactive({});
  const connectionStateResynced = ref(false);
  const highlightTimers = new Map();
  let disposed = false;

  const servers = computed(() => store.state.servers.servers);
  const loading = computed(() => store.state.servers.loading);
  const hasOnlineServers = computed(() => onlineCount(servers.value) > 0);
  const hasOfflineServers = computed(() => offlineCount(servers.value) > 0);

  function currentServer(id) {
    return store.getters['servers/getServerById'](id);
  }

  function patchServer(id, patch) {
    store.commit('servers/patchServer', { id, patch });
  }

  function markStatusChanged(id) {
    patchServer(id, { statusChanged: true });
    clearTimeout(highlightTimers.get(id));
    highlightTimers.set(id, setTimeout(() => {
      patchServer(id, { statusChanged: false });
      highlightTimers.delete(id);
    }, 2000));
  }

  async function checkServerStatus(server, { detectResync = false, showChange = false } = {}) {
    if (!server?._id || checkingServers[server._id]) return currentServer(server?._id)?.status;

    const oldStatus = currentServer(server._id)?.status || server.status;
    checkingServers[server._id] = true;
    try {
      await store.dispatch('servers/checkStatus', server._id);
      const updated = currentServer(server._id);
      const newStatus = updated?.status || 'offline';

      if (newStatus === 'online') {
        delete errorReasons[server._id];
      } else if (oldStatus === 'online') {
        errorReasons[server._id] = '后端连接检查显示连接已断开';
      }

      if (newStatus !== oldStatus) {
        markStatusChanged(server._id);
        if (detectResync && oldStatus === 'online') connectionStateResynced.value = true;
        if (showChange) ElMessage.info(`服务器 ${server.name} 状态已更新`);
      }
      return newStatus;
    } catch (error) {
      errorReasons[server._id] = connectionErrorMessage(error);
      patchServer(server._id, {
        status: 'error',
        backendConnectionValid: false,
        lastChecked: new Date().toISOString()
      });
      if (oldStatus !== 'error') markStatusChanged(server._id);
      if (detectResync && oldStatus === 'online') connectionStateResynced.value = true;
      return 'error';
    } finally {
      checkingServers[server._id] = false;
    }
  }

  async function checkAllServersStatus(options = {}) {
    const snapshot = [...servers.value];
    return Promise.allSettled(snapshot.map(server => checkServerStatus(server, options)));
  }

  const monitor = createServerStatusMonitor({ refresh: checkAllServersStatus });

  async function fetchServers() {
    try {
      await store.dispatch('servers/getAllServers');
      await checkAllServersStatus({ detectResync: true });
    } catch (error) {
      ElMessage.error(`获取服务器列表失败: ${error.message}`);
    }
  }

  async function handleConnect(server) {
    if (!server?._id || connectingServers[server._id]) return false;

    connectingServers[server._id] = true;
    delete errorReasons[server._id];
    const notification = ElNotification({
      title: '连接中',
      message: `正在连接到服务器 ${server.name}...`,
      duration: 0,
      type: 'info'
    });

    try {
      await store.dispatch('servers/connectServer', server._id);
      let status = currentServer(server._id)?.status;
      if (status !== 'online') status = await checkServerStatus(server);
      if (status !== 'online') throw new Error('后端连接检查未确认服务器在线');

      markStatusChanged(server._id);
      ElMessage.success('服务器连接成功');
      return true;
    } catch (error) {
      const message = connectionErrorMessage(error);
      errorReasons[server._id] = message;
      patchServer(server._id, { status: 'error', lastChecked: new Date().toISOString() });
      ElMessage.error(`连接服务器失败: ${message}`);
      return false;
    } finally {
      notification.close();
      connectingServers[server._id] = false;
    }
  }

  async function handleDisconnect(server) {
    if (!server?._id || disconnectingServers[server._id]) return false;

    disconnectingServers[server._id] = true;
    const notification = ElNotification({
      title: '断开连接中',
      message: `正在断开服务器 ${server.name} 的连接...`,
      duration: 0,
      type: 'warning'
    });

    try {
      await store.dispatch('servers/disconnectServer', server._id);
      delete errorReasons[server._id];
      markStatusChanged(server._id);
      ElMessage.success('服务器断开连接成功');
      return true;
    } catch (error) {
      errorReasons[server._id] = connectionErrorMessage(error);
      ElMessage.error(`断开服务器连接失败: ${error.message}`);
      await checkServerStatus(server);
      return false;
    } finally {
      notification.close();
      disconnectingServers[server._id] = false;
    }
  }

  async function handleReconnect(server) {
    try {
      await store.dispatch('servers/disconnectServer', server._id);
    } catch {
      // A stale or already closed connection is safe to replace.
    }
    return handleConnect(server);
  }

  async function handleConnectionRetry(server) {
    const status = await checkServerStatus(server, { showChange: true });
    if (status === 'online') {
      ElMessage.success(`服务器 ${server.name} 已在线`);
      return;
    }

    try {
      await ElMessageBox.confirm(`服务器 ${server.name} 未连接，是否尝试重新连接？`, '连接确认', {
        confirmButtonText: '重新连接',
        cancelButtonText: '取消',
        type: 'info'
      });
      await handleReconnect(server);
    } catch {
      // The user cancelled the optional reconnect.
    }
  }

  async function handleManageRules(server) {
    let status = currentServer(server._id)?.status;
    if (status !== 'online') status = await checkServerStatus(server);

    if (status !== 'online') {
      try {
        await ElMessageBox.confirm('服务器当前不在线，需要先连接服务器吗?', '提示', {
          confirmButtonText: '连接并管理',
          cancelButtonText: '取消',
          type: 'warning'
        });
        if (!(await handleConnect(server))) return;
      } catch {
        return;
      }
    }
    router.push({ name: 'rules', params: { serverId: server._id } });
  }

  async function batchConnect() {
    const targets = servers.value.filter(server => server.status === 'offline' || server.status === 'error');
    if (!targets.length) return;
    try {
      await ElMessageBox.confirm(`确定要连接全部${targets.length}台离线服务器吗?`, '批量连接', {
        confirmButtonText: '确定', cancelButtonText: '取消', type: 'info'
      });
      for (const server of targets) await handleConnect(server);
      ElMessage.success('批量连接操作已完成');
    } catch {
      // The user cancelled the batch operation.
    }
  }

  async function batchDisconnect() {
    const targets = servers.value.filter(server => server.status === 'online');
    if (!targets.length) return;
    try {
      await ElMessageBox.confirm(`确定要断开全部${targets.length}台在线服务器吗?`, '批量断开', {
        confirmButtonText: '确定', cancelButtonText: '取消', type: 'warning'
      });
      for (const server of targets) await handleDisconnect(server);
      ElMessage.success('批量断开操作已完成');
    } catch {
      // The user cancelled the batch operation.
    }
  }

  async function initialize() {
    disposed = false;
    await fetchServers();
    if (!disposed) monitor.start();
  }

  function cleanup() {
    disposed = true;
    monitor.stop();
    for (const timer of highlightTimers.values()) clearTimeout(timer);
    highlightTimers.clear();
  }

  return {
    batchConnect,
    batchDisconnect,
    checkAllServersStatus,
    checkServerStatus,
    checkingServers,
    connectingServers,
    connectionStateResynced,
    disconnectingServers,
    errorReasons,
    fetchServers,
    handleConnect,
    handleConnectionRetry,
    handleDisconnect,
    handleManageRules,
    handleReconnect,
    hasOfflineServers,
    hasOnlineServers,
    initialize,
    cleanup,
    loading,
    servers
  };
}
