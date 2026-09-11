'use strict';

const { Client } = require('ssh2');
const Server = require('../models/Server');

const STATUS = Object.freeze({
  CONNECTING: 'connecting',
  ONLINE: 'online',
  OFFLINE: 'offline',
  ERROR: 'error'
});

class ConnectionManager {
  constructor({ ClientClass = Client, serverRepository = Server } = {}) {
    this.ClientClass = ClientClass;
    this.serverRepository = serverRepository;
    this.connections = Object.create(null);
    this.states = new Map();
    this.pendingConnections = new Map();
  }

  getStatus(serverId) {
    const current = this.states.get(String(serverId));
    if (current) return { ...current };
    return {
      status: STATUS.OFFLINE,
      connected: false,
      valid: false,
      lastConnection: null,
      changedAt: null,
      error: null
    };
  }

  _setStatus(serverId, status, details = {}) {
    const previous = this.getStatus(serverId);
    const next = {
      ...previous,
      ...details,
      status,
      connected: status === STATUS.ONLINE,
      valid: status === STATUS.ONLINE,
      changedAt: new Date().toISOString()
    };
    if (status === STATUS.ONLINE) {
      next.lastConnection = next.changedAt;
      next.error = null;
    }
    this.states.set(String(serverId), next);
    return { ...next };
  }

  getConnection(serverId) {
    return this.connections[String(serverId)] || null;
  }

  has(serverId) {
    return this.checkConnection(serverId);
  }

  checkConnection(serverId) {
    const id = String(serverId);
    const connection = this.connections[id];
    if (!connection) {
      if (!this.pendingConnections.has(id) && this.getStatus(id).status === STATUS.ONLINE) this._setStatus(id, STATUS.OFFLINE);
      return false;
    }
    try {
      const socket = connection._sock;
      const valid = Boolean(socket && socket.readable !== false && socket.writable !== false && !socket.destroyed);
      if (valid) return true;
    } catch (error) {
      this._setStatus(id, STATUS.ERROR, { error: error.message });
    }
    delete this.connections[id];
    if (this.getStatus(id).status !== STATUS.ERROR) this._setStatus(id, STATUS.OFFLINE);
    return false;
  }

  async connect(serverId) {
    const id = String(serverId);
    if (this.checkConnection(id)) {
      return { success: true, message: '服务器已连接', serverId: id, status: this.getStatus(id) };
    }
    if (this.pendingConnections.has(id)) return this.pendingConnections.get(id);

    const pending = this._connect(id).finally(() => this.pendingConnections.delete(id));
    this.pendingConnections.set(id, pending);
    return pending;
  }

  async _connect(serverId) {
    const server = await this.serverRepository.findById(serverId);
    if (!server) throw new Error('服务器未找到');
    await this.disconnect(serverId);
    this._setStatus(serverId, STATUS.CONNECTING);
    const connection = new this.ClientClass();
    const config = {
      host: server.host,
      port: server.port || 22,
      username: server.username,
      keepaliveInterval: 10000,
      keepaliveCountMax: 3,
      readyTimeout: 20000
    };
    if (server.authType === 'password') config.password = server.password;
    else config.privateKey = server.privateKey;

    return new Promise((resolve, reject) => {
      let settled = false;
      const fail = error => {
        const isCurrent = this.connections[serverId] === connection;
        // Events from a superseded connection must not overwrite the status of
        // the current connection.
        if (settled && !isCurrent) return;
        if (isCurrent) delete this.connections[serverId];
        this._setStatus(serverId, STATUS.ERROR, { error: error.message });
        if (settled) return;
        settled = true;
        reject(error);
      };
      connection.once('error', fail);
      connection.once('ready', () => {
        if (settled) return;
        settled = true;
        this.connections[serverId] = connection;
        const status = this._setStatus(serverId, STATUS.ONLINE);
        resolve({ success: true, message: '连接成功', serverId, status });
      });
      connection.on('end', () => {
        if (!settled) return fail(new Error('SSH连接在就绪前结束'));
        if (this.connections[serverId] !== connection) return;
        delete this.connections[serverId];
        this._setStatus(serverId, STATUS.OFFLINE);
      });
      connection.on('close', hadError => {
        if (!settled) return fail(new Error(hadError ? 'SSH连接在认证前异常关闭' : 'SSH连接在就绪前关闭'));
        if (this.connections[serverId] !== connection) return;
        delete this.connections[serverId];
        this._setStatus(serverId, hadError ? STATUS.ERROR : STATUS.OFFLINE, hadError ? { error: 'SSH连接异常关闭' } : {});
      });
      connection.once('timeout', () => fail(new Error('SSH连接超时')));
      try {
        connection.connect(config);
      } catch (error) {
        fail(error);
      }
    });
  }

  async disconnect(serverId) {
    const id = String(serverId);
    const connection = this.connections[id];
    delete this.connections[id];
    if (connection) {
      try { connection.end(); } catch (error) {
        this._setStatus(id, STATUS.ERROR, { error: error.message });
        throw error;
      }
    }
    this._setStatus(id, STATUS.OFFLINE);
    return { success: true, message: connection ? '连接已断开' : '无需断开，连接不存在', status: this.getStatus(id) };
  }

  async disconnectAll() {
    const serverIds = Object.keys(this.connections);
    await Promise.all(serverIds.map(id => this.disconnect(id)));
    return { success: true, message: '所有连接已断开', count: serverIds.length };
  }

  async testConnection(serverData) {
    const connection = new this.ClientClass();
    const config = {
      host: serverData.host,
      port: serverData.port || 22,
      username: serverData.username,
      readyTimeout: 10000
    };
    if (serverData.authType === 'password') config.password = serverData.password;
    else config.privateKey = serverData.privateKey;
    return new Promise((resolve, reject) => {
      let settled = false;
      const done = (error, result) => {
        if (settled) return;
        settled = true;
        try { connection.end(); } catch {}
        if (error) reject(error);
        else resolve(result);
      };
      connection.once('error', error => done(error));
      connection.once('timeout', () => done(new Error('连接超时')));
      connection.once('end', () => done(new Error('SSH连接测试在就绪前结束')));
      connection.once('close', () => done(new Error('SSH连接测试在就绪前关闭')));
      connection.once('ready', () => done(null, { success: true, message: '连接测试成功' }));
      try { connection.connect(config); } catch (error) { done(error); }
    });
  }
}

module.exports = { ConnectionManager, STATUS };
