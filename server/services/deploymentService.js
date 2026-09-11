'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const Server = require('../models/Server');
const cacheService = require('./cacheService');
const { shellQuote } = require('./nftatoCommandRegistry');

class DeploymentService {
  constructor(sshService, { serverRepository = Server, cache = cacheService } = {}) {
    this.sshService = sshService;
    this.serverRepository = serverRepository;
    this.cache = cache;
  }

  async deploy(serverId, logCallback = () => {}) {
    let temporaryPath;
    try {
      logCallback('正在连接服务器...', 'log');
      const server = await this.serverRepository.findById(serverId);
      if (!server) throw new Error('找不到服务器信息');
      if (!this.sshService.checkConnection(serverId)) await this.sshService.connect(serverId);
      if (!this.sshService.connections[serverId]) throw new Error('无法连接到服务器');
      logCallback('SSH连接成功', 'success');
      const run = async (command, description, readOnly = false) => {
        const result = await this.sshService.executeCommand(serverId, command, { readOnly });
        if (result.code !== 0) throw new Error(`${description}，退出码: ${result.code}`);
        return result;
      };
      const existing = await run('if [ -f /root/Nftato.sh ]; then printf root; elif [ -f "$HOME/Nftato.sh" ]; then printf home; else printf missing; fi', '检查现有脚本失败', true);
      const location = existing.stdout.trim();
      if (!['root', 'home', 'missing'].includes(location)) throw new Error('无法确定远程脚本状态');
      let scriptPath = '/root/Nftato.sh';
      if (location !== 'root') {
        const homeResult = await run('printf \'%s\\n\' "$HOME"', '读取远程主目录失败', true);
        const remoteHome = homeResult.stdout.trim();
        if (!remoteHome.startsWith('/') || /[\r\n\0]/.test(remoteHome)) throw new Error('远程主目录无效');
        scriptPath = path.posix.join(remoteHome, 'Nftato.sh');
      }
      if (location !== 'missing') {
        await run(`if [ ! -x ${shellQuote(scriptPath)} ]; then chmod +x -- ${shellQuote(scriptPath)}; fi`, '设置现有脚本执行权限失败');
        logCallback('脚本已存在，保留现有脚本和防火墙规则', 'success');
        return { success: true, message: '脚本已存在且可执行' };
      }
      const localPath = path.resolve(__dirname, '../scripts/Nftato.sh');
      const expectedHash = crypto.createHash('sha256').update(await fs.promises.readFile(localPath)).digest('hex');
      temporaryPath = path.posix.join(path.posix.dirname(scriptPath), `.Nftato.sh.${crypto.randomUUID()}.upload`);
      logCallback('正在通过SFTP上传随应用发布的Nftato脚本...', 'log');
      await this.sshService.uploadFile(serverId, localPath, temporaryPath);
      await run(`printf '%s  %s\\n' ${shellQuote(expectedHash)} ${shellQuote(temporaryPath)} | sha256sum --check --status`, '上传脚本SHA-256校验失败');
      await run(`chmod 700 -- ${shellQuote(temporaryPath)} && mv -- ${shellQuote(temporaryPath)} ${shellQuote(scriptPath)}`, '安装上传脚本失败');
      temporaryPath = undefined;
      const result = await this.sshService.executeCommandWithStream(serverId, `AUTOMATED=yes bash ${shellQuote(scriptPath)} 20`, (line, type) => logCallback(line, type));
      if (result.code !== 0) throw new Error(`脚本执行失败，退出码: ${result.code}`);
      await run(`test -f ${shellQuote(scriptPath)} && test -x ${shellQuote(scriptPath)}`, '脚本部署验证失败', true);
      await this.cache.clearServerRulesCache(serverId);
      logCallback('Nftato脚本已成功部署！', 'success');
      return { success: true, message: '脚本部署成功' };
    } catch (error) {
      logCallback(`部署过程出错: ${error.message}`, 'error');
      return { success: false, error: error.message, outcomeUnknown: error.outcomeUnknown === true };
    } finally {
      if (temporaryPath) {
        try { await this.sshService.executeCommand(serverId, `rm -f -- ${shellQuote(temporaryPath)}`); }
        catch { logCallback('未能清理远程上传临时文件', 'error'); }
      }
    }
  }
}

module.exports = { DeploymentService };
