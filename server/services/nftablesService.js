'use strict';

const net = require('node:net');
const sshService = require('./sshService');
const Server = require('../models/Server');
const { resolveCommand, shellQuote } = require('./nftatoCommandRegistry');

const messages = {
  0: '获取封禁列表', 1: '封禁BT/PT协议', 2: '封禁垃圾邮件端口', 3: '封禁全部',
  4: '封禁自定义端口', 5: '封禁自定义关键词', 6: '解封BT/PT协议', 7: '解封垃圾邮件端口',
  8: '解封全部', 9: '解封自定义端口', 10: '解封自定义关键词', 11: '解封所有关键词',
  13: '获取入网端口', 14: '获取入网IP', 15: '放行入网端口', 16: '取消放行入网端口',
  17: '放行入网IP', 18: '取消放行入网IP', 19: '获取SSH端口', 20: '清空所有规则',
  22: '配置DDoS防御规则', 23: '配置自定义端口DDoS防御', 24: '管理IP黑白名单', 25: '查看防御状态'
};

class NftablesService {
  constructor({ ssh = sshService, serverRepository = Server } = {}) {
    this.ssh = ssh;
    this.serverRepository = serverRepository;
  }

  async _run(serverId, action, parameters) {
    if (!this.ssh.checkConnection(serverId)) return { success: false, data: null, error: '服务器未连接，请先连接服务器' };
    try {
      const result = await this.ssh.executeNftato(serverId, action, parameters);
      return {
        success: result.success,
        data: result.output,
        error: result.error,
        code: result.code,
        outcomeUnknown: result.outcomeUnknown === true,
        command: result.command
      };
    } catch (error) {
      return {
        success: false,
        data: null,
        error: `${messages[action] || '执行Nftato操作'}失败: ${error.message}`,
        outcomeUnknown: error.outcomeUnknown === true
      };
    }
  }

  getBlockList(serverId) { return this._run(serverId, 0); }
  blockBTPT(serverId) { return this._run(serverId, 1); }
  blockSPAM(serverId) { return this._run(serverId, 2); }
  blockAll(serverId) { return this._run(serverId, 3); }
  blockCustomPorts(serverId, ports) { return this._run(serverId, 4, ports); }
  blockCustomKeyword(serverId, keyword) { return this._run(serverId, 5, keyword); }
  unblockBTPT(serverId) { return this._run(serverId, 6); }
  unblockSPAM(serverId) { return this._run(serverId, 7); }
  unblockAll(serverId) { return this._run(serverId, 8); }
  unblockCustomPorts(serverId, ports) { return this._run(serverId, 9, ports); }
  unblockCustomKeyword(serverId, keyword) { return this._run(serverId, 10, keyword); }
  unblockAllKeywords(serverId) { return this._run(serverId, 11); }
  allowInboundPorts(serverId, ports) { return this._run(serverId, 15, ports); }
  allowInboundIPs(serverId, ips) { return this._run(serverId, 17, ips); }
  disallowInboundIPs(serverId, ips) { return this._run(serverId, 18, ips); }
  getSSHPort(serverId) { return this._run(serverId, 19); }
  clearAllRules(serverId) { return this._run(serverId, 20); }
  setupDdosProtection(serverId) { return this._run(serverId, 22); }
  viewDefenseStatus(serverId) { return this._run(serverId, 25); }

  async getInboundPorts(serverId) {
    const result = await this._run(serverId, 13);
    return result.success ? { ...result, data: this._parsePortOutput(result.data || '') } : { ...result, data: { tcp: [], udp: [] } };
  }

  async getInboundIPs(serverId) {
    const result = await this._run(serverId, 14);
    return result.success ? { ...result, data: this._parseIPOutput(result.data || '') } : { ...result, data: [] };
  }

  async disallowInboundPorts(serverId, ports) {
    try {
      const canonical = resolveCommand(16, ports).args[0];
      const server = await this.serverRepository.findById(serverId);
      if (!server) return { success: false, data: null, error: '服务器不存在' };
      const sshPort = Number(server.port || 22);
      const includesSshPort = canonical.split(',').some(segment => {
        const [start, end = start] = segment.split('-').map(Number);
        return sshPort >= start && sshPort <= end;
      });
      if (includesSshPort) return { success: false, data: null, error: `不能取消SSH端口(${sshPort})的放行，这将导致无法连接服务器` };
      return this._run(serverId, 16, canonical);
    } catch (error) {
      return { success: false, data: null, error: error.message, outcomeUnknown: error.outcomeUnknown === true };
    }
  }

  setupCustomPortProtection(serverId, port, protoType = 1, maxConn = 400, maxRateMin = 400, maxRateSec = 300, banHours = 24) {
    return this._run(serverId, 23, [port, protoType, maxConn, maxRateMin, maxRateSec, banHours]);
  }

  async manageIpLists(serverId, actionType, ip, duration) {
    const normalizedAction = Number(actionType);
    const parameters = duration === undefined || duration === null || duration === ''
      ? [normalizedAction, ip]
      : [normalizedAction, ip, duration];
    const result = await this._run(serverId, 24, parameters);
    if (!result.success) return result;
    const verification = await this._verifyIpListOperation(serverId, normalizedAction, ip);
    return verification.success ? result : { ...result, success: false, error: verification.error };
  }

  async _verifyIpListOperation(serverId, actionType, ip) {
    if (![1, 2, 3, 4].includes(actionType) || !net.isIP(String(ip).split('/')[0])) {
      return { success: false, error: 'IP名单操作参数无效' };
    }
    const isIpv6 = String(ip).includes(':');
    const family = isIpv6 ? 'ip6 edge_dft_v6' : 'ip edge_dft_v4';
    const set = actionType === 1 || actionType === 3 ? 'allow_set' : 'deny_set';
    const shouldExist = actionType === 1 || actionType === 2;
    try {
      const result = await this.ssh.executeCommand(
        serverId,
        `nft list set ${family} ${set} | grep -Fq -- ${shellQuote(ip)}`,
        { readOnly: true }
      );
      if ((result.code === 0) === shouldExist) return { success: true };
      return { success: false, error: `操作执行后未能在${set === 'allow_set' ? '白名单' : '黑名单'}中确认IP(${ip})状态` };
    } catch (error) {
      // The mutation already succeeded. A failed observation must not invite an
      // automatic duplicate mutation; report the uncertain verification.
      return { success: false, error: `IP操作已执行，但验证失败: ${error.message}` };
    }
  }

  _parsePortOutput(output) {
    const plain = String(output).replace(/\u001b\[[0-9;]*m/g, '');
    const parse = protocol => {
      const expression = new RegExp(`${protocol}(?:端口| ports?)\\s*[:：]([\\s\\S]*?)(?=(?:TCP|UDP)(?:端口| ports?)\\s*[:：]|={3,}|$)`, 'i');
      const section = plain.match(expression)?.[1] || '';
      return [...new Set((section.match(/\b\d{1,5}\b/g) || []).map(Number).filter(port => port >= 1 && port <= 65535))];
    };
    return { tcp: parse('TCP'), udp: parse('UDP') };
  }

  _parseIPOutput(output) {
    const plain = String(output).replace(/\u001b\[[0-9;]*m/g, '');
    const candidates = plain.match(/[0-9A-Fa-f:.]+(?:\/\d{1,3})?/g) || [];
    return [...new Set(candidates.filter(candidate => {
      const [address, prefix] = candidate.split('/');
      const family = net.isIP(address);
      if (!family) return false;
      if (prefix === undefined) return true;
      const numericPrefix = Number(prefix);
      return Number.isInteger(numericPrefix) && numericPrefix >= 0 && numericPrefix <= (family === 4 ? 32 : 128);
    }))];
  }
}

const nftablesService = new NftablesService();
nftablesService.NftablesService = NftablesService;

module.exports = nftablesService;
