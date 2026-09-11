import { createFirewallState } from './model.js';

export default {
  '$store.state.auth.token'(token) {
    if (!this.socket) return;
    this.socket.disconnect();
    if (token) this.socket.connect();
    else this.clearTimers();
  },

  activeTab(newTab) {
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
    } else if (newTab === 'ddos' && !this.dataLoaded.defenseStatus) {
      this.refreshDefenseStatus();
    }
  },

  'server.status'(newStatus, oldStatus) {
    if (newStatus === 'online' && oldStatus !== 'online') {
      if (this.scriptExists && !this.initialDataLoaded) {
        this.initialDataLoaded = true;
        setTimeout(() => this.refreshAllData(), 500);
      }
    } else if (newStatus !== 'online' && oldStatus === 'online') {
      this.$message.warning('服务器已离线，无法管理防火墙规则');
    }
  },

  scriptExists(exists) {
    if (exists && this.isServerOnline && !this.initialDataLoaded) {
      this.initialDataLoaded = true;
      setTimeout(() => this.refreshAllData(), 500);
    }
  },

  async serverId(newServerId, oldServerId) {
    if (!oldServerId || newServerId === oldServerId) return;

    const changeToken = this.serverChangeToken + 1;
    this.stopServerStatusCheck();
    this.clearTimers();
    if (this.ipOperationDebounce.timer) clearTimeout(this.ipOperationDebounce.timer);
    if (this.socket) this.socket.disconnect();

    Object.assign(this.$data, createFirewallState());
    this.serverChangeToken = changeToken;

    if (!newServerId) {
      this.handleInvalidServerId();
      return;
    }

    await this.$nextTick();
    this.checkMobileDevice();
    await this.initializeApplication();
    if (!this.viewDisposed && this.serverChangeToken === changeToken) {
      this.startServerStatusCheck();
    }
  }
};
