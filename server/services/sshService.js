'use strict';

const { ConnectionManager } = require('./connectionManager');
const { CommandExecutor } = require('./commandExecutor');
const { FileTransferService } = require('./fileTransferService');
const { DeploymentService } = require('./deploymentService');
const { PerServerMutationQueue } = require('./mutationQueue');
const { buildCommand, buildStructuredCommand, resolveCommand, shellQuote } = require('./nftatoCommandRegistry');

class SSHService {
  constructor({ connectionManager, executor, transfer, mutationQueue } = {}) {
    this.connectionManager = connectionManager || new ConnectionManager();
    this.connections = this.connectionManager.connections;
    this.executor = executor || new CommandExecutor(this.connectionManager);
    this.transfer = transfer || new FileTransferService(this.connectionManager);
    this.mutationQueue = mutationQueue || new PerServerMutationQueue();
    this.deployer = new DeploymentService(this);
    this.structuredCliSupport = new Map();
  }

  connect(serverId) { return this.connectionManager.connect(serverId); }
  disconnect(serverId) { return this.connectionManager.disconnect(serverId); }
  disconnectAll() { return this.connectionManager.disconnectAll(); }
  checkConnection(serverId) { return this.connectionManager.checkConnection(serverId); }
  getConnectionStatus(serverId) { return this.connectionManager.getStatus(serverId); }
  testConnection(serverData) { return this.connectionManager.testConnection(serverData); }
  executeCommand(serverId, command, options = {}) { return this.executor.execute(serverId, command, options); }
  executeCommandWithStream(serverId, command, callback, options = {}) {
    return this.executor.executeStream(serverId, command, callback, options);
  }
  uploadFile(serverId, localPath, remotePath) { return this.transfer.upload(serverId, localPath, remotePath); }
  downloadFile(serverId, remotePath, localPath) { return this.transfer.download(serverId, remotePath, localPath); }

  deployIptatoWithLogs(serverId, logCallback = () => {}) {
    return this.mutationQueue.run(serverId, async () => {
      const result = await this.deployer.deploy(serverId, logCallback);
      if (result.success) this.structuredCliSupport.clear();
      return result;
    });
  }

  async deployIptato(serverId, progressCallback = () => {}) {
    const result = await this.deployIptatoWithLogs(serverId, (message, type = 'log') => progressCallback({ type, message }));
    if (!result.success) {
      const error = new Error(result.error || '脚本部署失败');
      if (result.outcomeUnknown) {
        error.outcomeUnknown = true;
        error.code = 'COMMAND_OUTCOME_UNKNOWN';
      }
      throw error;
    }
    return result;
  }

  async _scriptPath(serverId) {
    const result = await this.executeCommand(
      serverId,
      'if [ -f /root/Nftato.sh ]; then printf root; elif [ -f "$HOME/Nftato.sh" ]; then printf home; else printf missing; fi',
      { readOnly: true }
    );
    if (result.code !== 0) throw new Error(result.stderr || '检查Nftato脚本失败');
    const location = result.stdout.trim();
    if (location === 'missing') throw new Error('Nftato脚本未找到，请先部署脚本');
    if (location === 'root') return '/root/Nftato.sh';
    if (location !== 'home') throw new Error('无法确定Nftato脚本位置');
    const home = await this.executeCommand(serverId, 'printf \'%s\\n\' "$HOME"', { readOnly: true });
    const remoteHome = home.stdout.trim();
    if (home.code !== 0 || !remoteHome.startsWith('/') || /[\r\n\0]/.test(remoteHome)) throw new Error('远程主目录无效');
    return require('node:path').posix.join(remoteHome, 'Nftato.sh');
  }

  async executeNftato(serverId, action, parameters) {
    let definition;
    try {
      definition = resolveCommand(action, parameters);
    } catch (error) {
      return { success: false, output: '', error: error.message, code: -1, validationError: true };
    }
    const operation = async () => {
      try {
        if (!this.checkConnection(serverId)) throw new Error('SSH连接无效，请重新连接服务器');
        const scriptPath = await this._scriptPath(serverId);
        const structured = await this._supportsStructuredCli(serverId, scriptPath);
        const built = structured
          ? buildStructuredCommand(scriptPath, definition.commandName, parameters)
          : buildCommand(scriptPath, definition.legacyCode, parameters);
        const result = await this.executeCommand(serverId, built.command, { readOnly: built.readOnly });
        if (structured) {
          const envelope = this._parseStructuredResult(result.stdout);
          const validEnvelope = envelope
            && envelope.command === built.commandName
            && envelope.exitCode === result.code
            && envelope.success === (envelope.exitCode === 0);
          if (!validEnvelope) {
            return {
              success: false,
              output: '',
              error: built.readOnly
                ? 'Nftato返回了无效的结构化结果'
                : 'Nftato变更命令已执行，但返回格式无效，远程结果未知',
              code: result.code,
              outcomeUnknown: !built.readOnly,
              command: built.commandName
            };
          }
          return {
            success: result.code === 0 && envelope.success === true,
            output: typeof envelope.output === 'string' ? envelope.output : '',
            error: result.code === 0 && envelope.success === true ? result.stderr : (result.stderr || envelope.output || '脚本执行失败'),
            code: Number.isInteger(envelope.exitCode) ? envelope.exitCode : result.code,
            command: envelope.command || built.commandName
          };
        }
        return {
          success: result.code === 0,
          output: result.stdout,
          error: result.code === 0 ? result.stderr : (result.stderr || '脚本执行失败'),
          code: result.code,
          command: built.commandName
        };
      } catch (error) {
        return {
          success: false,
          output: '',
          error: error.message,
          code: -1,
          outcomeUnknown: error.outcomeUnknown === true,
          command: definition.commandName
        };
      }
    };
    return definition.readOnly ? operation() : this.mutationQueue.run(serverId, operation);
  }

  async _supportsStructuredCli(serverId, scriptPath) {
    const key = `${serverId}:${scriptPath}`;
    if (this.structuredCliSupport.has(key)) return this.structuredCliSupport.get(key);
    try {
      const probe = await this.executeCommand(
        serverId,
        `grep -Fq -- 'emit_json_result' ${shellQuote(scriptPath)}`,
        { readOnly: true, retries: 0 }
      );
      const supported = probe.code === 0;
      if (supported) this.structuredCliSupport.set(key, true);
      return supported;
    } catch {
      return false;
    }
  }

  _parseStructuredResult(output) {
    if (typeof output !== 'string') return null;
    const lines = output.trim().split('\n').reverse();
    for (const line of lines) {
      try {
        const value = JSON.parse(line);
        if (value && typeof value === 'object'
          && typeof value.success === 'boolean'
          && typeof value.command === 'string'
          && Number.isInteger(value.exitCode)
          && typeof value.output === 'string') return value;
      } catch {}
    }
    return null;
  }
}

const sshService = new SSHService();
sshService.SSHService = SSHService;
sshService.shellQuote = shellQuote;

module.exports = sshService;
