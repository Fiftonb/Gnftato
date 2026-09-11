'use strict';

class CommandOutcomeUnknownError extends Error {
  constructor(message, cause) {
    super(message, { cause });
    this.name = 'CommandOutcomeUnknownError';
    this.code = 'COMMAND_OUTCOME_UNKNOWN';
    this.outcomeUnknown = true;
  }
}

const delay = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

class CommandExecutor {
  constructor(connectionManager, { timeoutMs = 60000, readRetries = 2, retryDelayMs = 250 } = {}) {
    this.connectionManager = connectionManager;
    this.timeoutMs = timeoutMs;
    this.readRetries = readRetries;
    this.retryDelayMs = retryDelayMs;
  }

  async execute(serverId, command, options = {}) {
    if (typeof command !== 'string' || !command.trim()) throw new TypeError('命令不能为空');
    const readOnly = options && typeof options === 'object' && options.readOnly === true;
    const retries = readOnly && Number.isInteger(options.retries) ? Math.max(0, options.retries) : (readOnly ? this.readRetries : 0);
    const timeoutMs = options && typeof options === 'object' && Number.isFinite(options.timeoutMs) ? options.timeoutMs : this.timeoutMs;
    let lastError;

    for (let attempt = 0; attempt <= retries; attempt += 1) {
      try {
        if (!this.connectionManager.checkConnection(serverId)) await this.connectionManager.connect(serverId);
        return await this._executeOnce(serverId, command, { timeoutMs, readOnly });
      } catch (error) {
        lastError = error;
        if (!readOnly || error.outcomeUnknown || attempt === retries) throw error;
      }
      await delay(this.retryDelayMs);
    }
    throw lastError;
  }

  _executeOnce(serverId, command, { timeoutMs, readOnly }) {
    const connection = this.connectionManager.getConnection(serverId);
    if (!connection) return Promise.reject(new Error('SSH连接不存在'));
    return new Promise((resolve, reject) => {
      let settled = false;
      let dispatched = false;
      let stream;
      let stdout = '';
      let stderr = '';
      const finish = (error, result) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (error) reject(error);
        else resolve(result);
      };
      const failure = error => {
        if (dispatched && !readOnly) {
          finish(new CommandOutcomeUnknownError(`变更命令执行中断，远程结果未知: ${error.message}`, error));
        } else {
          finish(error);
        }
      };
      const timer = setTimeout(() => {
        try { stream?.close?.(); } catch {}
        try { stream?.destroy?.(); } catch {}
        failure(Object.assign(new Error(`命令执行超时 (${timeoutMs}ms)`), { code: 'COMMAND_TIMEOUT' }));
      }, timeoutMs);

      try {
        connection.exec(command, (error, openedStream) => {
          if (error) return failure(error);
          if (!openedStream || typeof openedStream.on !== 'function') return failure(new Error('SSH命令流无效'));
          dispatched = true;
          stream = openedStream;
          stream.on('data', data => { stdout += data.toString(); });
          stream.stderr?.on('data', data => { stderr += data.toString(); });
          stream.once('error', failure);
          stream.once('close', code => finish(null, { code, stdout: stdout.trim(), stderr: stderr.trim() }));
        });
      } catch (error) {
        failure(error);
      }
    });
  }

  async executeStream(serverId, command, callback = () => {}, options = {}) {
    if (!this.connectionManager.checkConnection(serverId)) await this.connectionManager.connect(serverId);
    const connection = this.connectionManager.getConnection(serverId);
    if (!connection) throw new Error('SSH连接不存在');
    const readOnly = options.readOnly === true;
    const timeoutMs = Number.isFinite(options.timeoutMs) ? options.timeoutMs : 10 * 60 * 1000;
    return new Promise((resolve, reject) => {
      let dispatched = false;
      let stream;
      let settled = false;
      let stdout = '';
      let stderr = '';
      const finish = (error, result) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (error) reject(error);
        else resolve(result);
      };
      const failure = error => finish(dispatched && !readOnly
        ? new CommandOutcomeUnknownError(`变更命令执行中断，远程结果未知: ${error.message}`, error)
        : error);
      const timer = setTimeout(() => {
        try { stream?.close?.(); } catch {}
        try { stream?.destroy?.(); } catch {}
        failure(new Error(`流式命令执行超时 (${timeoutMs}ms)`));
      }, timeoutMs);
      try {
        connection.exec(command, (error, openedStream) => {
          if (error) return failure(error);
          if (!openedStream || typeof openedStream.on !== 'function') return failure(new Error('SSH命令流无效'));
          dispatched = true;
          stream = openedStream;
          stream.on('data', data => {
            const text = data.toString();
            stdout += text;
            for (const line of text.split('\n')) if (line.trim()) callback(line.trim(), 'log');
          });
          stream.stderr?.on('data', data => {
            const text = data.toString();
            stderr += text;
            for (const line of text.split('\n')) if (line.trim()) callback(line.trim(), 'error');
          });
          stream.once('error', failure);
          stream.once('close', code => {
            callback(code === 0 ? '命令执行完成' : `命令执行失败，退出码: ${code}`, code === 0 ? 'success' : 'error');
            finish(null, { code, stdout, stderr });
          });
        });
      } catch (error) {
        failure(error);
      }
    });
  }
}

module.exports = { CommandExecutor, CommandOutcomeUnknownError };
