const { Client } = require('ssh2');
const fs = require('fs');
const path = require('path');
const crypto = require('node:crypto');
const { pipeline } = require('node:stream');

const shellQuote = value => "'" + String(value).replaceAll("'", "'\"'\"'") + "'";
const { exec } = require('child_process');
const util = require('util');
const Server = require('../models/Server');

// Promisify exec
const execPromise = util.promisify(exec);

// 应急模式标志，当SSH库失败时尝试使用原生命令
const EMERGENCY_MODE = false;

class SSHService {
  constructor() {
    this.connections = {}; // 存储活跃的SSH连接
  }

  /**
   * 连接到服务器
   * @param {string} serverId - 服务器ID
   * @returns {Promise<object>} - 连接结果
   */
  async connect(serverId) {
    try {
      // 查找服务器信息
      const server = await Server.findById(serverId);
      if (!server) {
        throw new Error('服务器未找到');
      }

      // 如果已有连接，先断开
      if (this.connections[serverId]) {
        console.log(`存在旧连接，正在断开，服务器ID: ${serverId}`);
        try {
          this.connections[serverId].end();
        } catch (e) {
          console.error(`断开旧连接出错: ${e.message}`);
        }
        delete this.connections[serverId];
      }

      // 创建SSH连接
      const conn = new Client();

      // 准备连接配置
      const config = {
        host: server.host,
        port: server.port,
        username: server.username,
        keepaliveInterval: 10000, // 每10秒发送一次保活信号
        keepaliveCountMax: 3,    // 最多尝试3次
        readyTimeout: 20000,     // 20秒连接超时时间
        reconnect: true,         // 允许重连
        reconnectTries: 3,       // 尝试重连3次
        reconnectDelay: 5000,    // 5秒后重试
      };

      // 根据认证类型设置认证信息
      if (server.authType === 'password') {
        config.password = server.password;
      } else {
        config.privateKey = server.privateKey;
      }

      // 创建Promise以处理连接
      return new Promise((resolve, reject) => {
        // 连接错误处理
        conn.on('error', (err) => {
          console.error(`SSH连接错误，服务器ID: ${serverId}, 错误: ${err.message}`);
          this._updateServerStatus(serverId, 'error');
          // 清理连接对象
          if (this.connections[serverId] === conn) {
            delete this.connections[serverId];
          }
          reject(err);
        });

        // 准备连接
        conn.on('ready', () => {
          // 存储活跃连接
          this.connections[serverId] = conn;

          // 更新服务器状态
          this._updateServerStatus(serverId, 'online');

          console.log(`SSH连接已就绪，服务器ID: ${serverId}, 主机: ${server.host}`);
          resolve({
            success: true,
            message: '连接成功',
            serverId
          });
        });

        // 连接结束监听
        conn.on('end', () => {
          console.log(`SSH连接已结束，服务器ID: ${serverId}`);
          if (this.connections[serverId] === conn) {
            delete this.connections[serverId];
          }
          this._updateServerStatus(serverId, 'offline');
        });

        // 连接关闭监听
        conn.on('close', (hadError) => {
          console.log(`SSH连接已关闭，服务器ID: ${serverId}, ${hadError ? '有错误' : '无错误'}`);
          if (this.connections[serverId] === conn) {
            delete this.connections[serverId];
          }
          this._updateServerStatus(serverId, hadError ? 'error' : 'offline');
        });

        // 连接超时监听（如果支持）
        if (typeof conn.on === 'function') {
          conn.on('timeout', () => {
            console.log(`SSH连接超时，服务器ID: ${serverId}`);
            if (this.connections[serverId] === conn) {
              delete this.connections[serverId];
            }
            this._updateServerStatus(serverId, 'error');
          });
        }

        // 开始连接
        console.log(`正在建立SSH连接，服务器ID: ${serverId}, 主机: ${server.host}`);
        conn.connect(config);
      });
    } catch (error) {
      console.error(`SSH连接过程中发生异常: ${error.message}`);
      throw error;
    }
  }

  /**
   * 检查SSH连接状态
   * @param {string} serverId - 服务器ID
   * @returns {boolean} - 连接是否有效
   */
  checkConnection(serverId) {
    const conn = this.connections[serverId];
    if (!conn) {
      console.error(`无SSH连接对象，服务器ID: ${serverId}`);
      return false;
    }

    // 检查连接是否正常
    try {
      console.log(`[诊断] 检查连接，服务器ID: ${serverId}`);
      console.log(`[诊断] 连接对象: ${conn ? '存在' : '不存在'}`);

      // 增加更完整的连接检查
      if (!conn._sock) {
        console.error(`[诊断] 连接套接字不存在，服务器ID: ${serverId}`);
        delete this.connections[serverId];
        this._updateServerStatus(serverId, 'error');
        return false;
      }

      console.log(`[诊断] 套接字状态: 可读=${conn._sock.readable}, 可写=${conn._sock.writable}`);

      if (conn._sock && conn._sock.readable && conn._sock.writable) {
        // 增加连接状态检查
        if (conn._state === 'authenticated') {
          console.log(`[诊断] 连接已认证，状态正常`);
          return true;
        } else if (conn._state) {
          console.log(`[诊断] 连接状态: ${conn._state}`);
          // 如果连接不是已认证状态但有状态值，我们尝试假设它有效
          return true;
        }

        console.log(`[诊断] 连接套接字正常，但状态未知`);
        return true;
      } else {
        console.error(`SSH连接异常，服务器ID: ${serverId}`);
        console.error(`[诊断] 套接字状态异常: 可读=${conn._sock?.readable}, 可写=${conn._sock?.writable}`);

        // 清理异常连接
        delete this.connections[serverId];
        this._updateServerStatus(serverId, 'error');
        return false;
      }
    } catch (error) {
      console.error(`检查SSH连接状态出错，服务器ID: ${serverId}`, error);
      console.error(`[诊断] 错误详情: ${error.message}, 堆栈: ${error.stack}`);
      delete this.connections[serverId];
      this._updateServerStatus(serverId, 'error');
      return false;
    }
  }

  /**
   * 使用原生SSH命令执行远程命令（应急模式）
   * @param {string} serverId - 服务器ID
   * @param {string} command - 要执行的命令
   * @returns {Promise<object>} - 命令执行结果
   */
  async executeCommandEmergency(serverId, command) {
    try {
      // 查找服务器信息
      const server = await Server.findById(serverId);
      if (!server) {
        throw new Error('服务器未找到');
      }

      console.log(`[应急模式] 准备在服务器 ${serverId} 上执行命令: ${command}`);

      // 由于不能安全地在命令行中使用密码，这里只支持私钥认证
      // 在生产环境中，应该提示用户在服务器上安装sshpass
      if (server.authType === 'password') {
        console.warn(`[应急模式] 警告：密码认证在应急模式下不完全支持，考虑改用私钥认证`);
        // 使用一个简单的方式尝试执行命令，但可能不安全也可能不工作
        const sshCommand = `SSHPASS=${server.password} ssh -o StrictHostKeyChecking=no -o ConnectTimeout=10 ${server.username}@${server.host} -p ${server.port} "${command.replace(/"/g, '\\"')}"`;
        console.log(`[应急模式] 执行SSH命令 (密码信息已隐藏)`);
      } else {
        // 创建临时私钥文件
        const tmpKeyPath = path.join(__dirname, `../tmp_key_${serverId}`);
        fs.writeFileSync(tmpKeyPath, server.privateKey, { mode: 0o600 });

        const sshCommand = `ssh -o StrictHostKeyChecking=no -o ConnectTimeout=10 -i ${tmpKeyPath} ${server.username}@${server.host} -p ${server.port} "${command.replace(/"/g, '\\"')}"`;
        console.log(`[应急模式] 执行SSH命令: ${sshCommand}`);
      }

      // 提供应急响应，但实际不执行SSH命令
      // 这里我们模拟一个成功的响应，但提示用户手动执行命令
      console.log(`[应急模式] 由于环境限制，无法直接执行SSH命令`);

      return {
        code: 0,
        stdout: "[应急模式] 命令已准备好，但需要手动执行。请使用生成的手动命令功能。",
        stderr: ""
      };
    } catch (error) {
      console.error(`[应急模式] 执行命令过程中发生异常:`, error);
      throw error;
    }
  }

  /**
   * 在服务器上执行命令
   * @param {string} serverId - 服务器ID
   * @param {string} command - 要执行的命令
   * @param {number} retryCount - 当前重试次数
   * @returns {Promise<object>} - 命令执行结果
   */
  async executeCommand(serverId, command, retryCount = 0) {
    // 如果启用了应急模式，直接使用应急方法
    if (EMERGENCY_MODE) {
      return this.executeCommandEmergency(serverId, command);
    }

    // 设置最大重试次数和重试延迟
    const MAX_RETRIES = 3;
    const RETRY_DELAY = 2000; // 2秒

    // 检查连接状态，如果无效则尝试重新连接
    if (!this.checkConnection(serverId) && retryCount === 0) {
      console.log(`SSH连接无效，尝试重新连接，服务器ID: ${serverId}`);
      try {
        await this.connect(serverId);
      } catch (connectError) {
        console.error(`重新连接服务器失败，服务器ID: ${serverId}, 错误: ${connectError.message}`);
        // 连接失败，但我们仍会尝试执行命令，因为checkConnection可能过于严格
      }
    }

    const conn = this.connections[serverId];
    if (!conn && retryCount >= MAX_RETRIES) {
      throw new Error(`SSH连接不存在，服务器ID: ${serverId}，已达到最大重试次数`);
    }

    // 如果连接对象不存在，尝试重新连接并重试命令
    if (!conn) {
      console.log(`SSH连接不存在，尝试重新连接，服务器ID: ${serverId}, 重试次数: ${retryCount + 1}/${MAX_RETRIES}`);
      try {
        await this.connect(serverId);
        // 等待一段时间让连接稳定
        await new Promise(resolve => setTimeout(resolve, 500));
        // 重试执行命令
        return this.executeCommand(serverId, command, retryCount + 1);
      } catch (connectError) {
        console.error(`重新连接服务器失败，服务器ID: ${serverId}, 错误: ${connectError.message}`);
        throw new Error(`执行命令失败: 无法连接到服务器 - ${connectError.message}`);
      }
    }

    try {
      console.log(`准备执行SSH命令，服务器ID: ${serverId}, 命令: ${command}`);

      return new Promise((resolve, reject) => {
        // 设置执行超时
        const timeoutId = setTimeout(() => {
          const timeoutError = new Error(`命令执行超时 (60秒)`);
          console.error(`命令执行超时，服务器ID: ${serverId}, 命令: ${command}`);

          // 如果还有重试次数，尝试重试
          if (retryCount < MAX_RETRIES) {
            console.log(`超时后重试执行命令，重试次数: ${retryCount + 1}/${MAX_RETRIES}`);
            clearTimeout(timeoutId);

            // 延迟一段时间后重试
            setTimeout(async () => {
              try {
                const result = await this.executeCommand(serverId, command, retryCount + 1);
                resolve(result);
              } catch (retryError) {
                reject(retryError);
              }
            }, RETRY_DELAY);
          } else {
            reject(timeoutError);
          }
        }, 60000); // 60秒超时

        conn.exec(command, (err, stream) => {
          if (err) {
            clearTimeout(timeoutId);
            console.error(`执行命令时出错，服务器ID: ${serverId}, 错误: ${err.message}`);

            // 如果还有重试次数，尝试重试
            if (retryCount < MAX_RETRIES) {
              console.log(`错误后重试执行命令，重试次数: ${retryCount + 1}/${MAX_RETRIES}`);

              // 延迟一段时间后重试
              setTimeout(async () => {
                try {
                  const result = await this.executeCommand(serverId, command, retryCount + 1);
                  resolve(result);
                } catch (retryError) {
                  reject(retryError);
                }
              }, RETRY_DELAY);
            } else {
              reject(err);
            }
            return;
          }

          let stdout = '';
          let stderr = '';

          stream.on('data', (data) => {
            stdout += data.toString();
          });

          stream.stderr.on('data', (data) => {
            stderr += data.toString();
          });

          stream.on('end', () => {
            clearTimeout(timeoutId);
          });

          stream.on('close', (code) => {
            clearTimeout(timeoutId);

            if (code !== 0 && retryCount < MAX_RETRIES) {
              // 如果命令失败且有重试次数，尝试重试
              console.log(`命令返回非零状态码(${code})，重试执行命令，重试次数: ${retryCount + 1}/${MAX_RETRIES}`);

              // 延迟一段时间后重试
              setTimeout(async () => {
                try {
                  const result = await this.executeCommand(serverId, command, retryCount + 1);
                  resolve(result);
                } catch (retryError) {
                  reject(retryError);
                }
              }, RETRY_DELAY);
            } else {
              // 返回结果
              resolve({
                code,
                stdout: stdout.trim(),
                stderr: stderr.trim()
              });
            }
          });

          // 处理可能的错误
          stream.on('error', (streamErr) => {
            clearTimeout(timeoutId);
            console.error(`命令流出错，服务器ID: ${serverId}, 错误: ${streamErr.message}`);

            // 如果还有重试次数，尝试重试
            if (retryCount < MAX_RETRIES) {
              console.log(`流错误后重试执行命令，重试次数: ${retryCount + 1}/${MAX_RETRIES}`);

              // 延迟一段时间后重试
              setTimeout(async () => {
                try {
                  const result = await this.executeCommand(serverId, command, retryCount + 1);
                  resolve(result);
                } catch (retryError) {
                  reject(retryError);
                }
              }, RETRY_DELAY);
            } else {
              reject(streamErr);
            }
          });
        });
      });
    } catch (error) {
      console.error(`执行命令过程中发生异常，服务器ID: ${serverId}, 错误: ${error.message}`);
      console.error(error.stack);

      // 如果还有重试次数，尝试重试
      if (retryCount < MAX_RETRIES) {
        console.log(`异常后重试执行命令，重试次数: ${retryCount + 1}/${MAX_RETRIES}`);

        // 延迟一段时间后重试
        await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
        return this.executeCommand(serverId, command, retryCount + 1);
      }

      throw error;
    }
  }

  /**
   * 上传文件到服务器
   * @param {string} serverId - 服务器ID
   * @param {string} localPath - 本地文件路径
   * @param {string} remotePath - 远程文件路径
   * @returns {Promise<object>} - 上传结果
   */
  async uploadFile(serverId, localPath, remotePath) {
    const conn = this.connections[serverId];
    if (!conn) throw new Error('无有效连接，请先连接服务器');

    return new Promise((resolve, reject) => {
      conn.sftp((error, sftp) => {
        if (error) return reject(error);
        let readStream;
        let writeStream;
        let settled = false;
        const finish = error => {
          if (settled) return;
          settled = true;
          if (error) {
            readStream?.destroy();
            writeStream?.destroy();
          }
          try { sftp.end(); } catch (closeError) { error ||= closeError; }
          if (error) reject(error);
          else resolve({ success: true, message: '文件上传成功' });
        };
        sftp.on('error', finish);
        try {
          writeStream = sftp.createWriteStream(remotePath, { mode: 0o600 });
          readStream = fs.createReadStream(localPath);
          // pipeline propagates local read failures and remote write failures.
          pipeline(readStream, writeStream, finish);
        } catch (error) {
          finish(error);
        }
      });
    });
  }

  /**
   * 从服务器下载文件
   * @param {string} serverId - 服务器ID
   * @param {string} remotePath - 远程文件路径
   * @param {string} localPath - 本地文件路径
   * @returns {Promise<object>} - 下载结果
   */
  async downloadFile(serverId, remotePath, localPath) {
    try {
      const conn = this.connections[serverId];

      if (!conn) {
        throw new Error('无有效连接，请先连接服务器');
      }

      return new Promise((resolve, reject) => {
        conn.sftp((err, sftp) => {
          if (err) {
            reject(err);
            return;
          }

          const readStream = sftp.createReadStream(remotePath);
          const writeStream = fs.createWriteStream(localPath);

          writeStream.on('close', () => {
            resolve({
              success: true,
              message: '文件下载成功'
            });
          });

          writeStream.on('error', (err) => {
            reject(err);
          });

          readStream.pipe(writeStream);
        });
      });
    } catch (error) {
      throw error;
    }
  }

  /**
   * 断开服务器连接
   * @param {string} serverId - 服务器ID
   * @returns {Promise<object>} - 断开结果
   */
  async disconnect(serverId) {
    try {
      const conn = this.connections[serverId];

      if (!conn) {
        return {
          success: true,
          message: '无需断开，连接不存在'
        };
      }

      // 断开连接
      conn.end();

      // 删除连接记录
      delete this.connections[serverId];

      // 更新服务器状态
      await this._updateServerStatus(serverId, 'offline');

      return {
        success: true,
        message: '连接已断开'
      };
    } catch (error) {
      throw error;
    }
  }

  /**
   * 断开所有服务器连接
   * @returns {Promise<object>} - 断开结果
   */
  async disconnectAll() {
    try {
      const serverIds = Object.keys(this.connections);

      for (const serverId of serverIds) {
        await this.disconnect(serverId);
      }

      return {
        success: true,
        message: '所有连接已断开',
        count: serverIds.length
      };
    } catch (error) {
      throw error;
    }
  }

  /**
   * 更新服务器状态
   * @param {string} serverId - 服务器ID
   * @param {string} status - 新状态
   * @returns {Promise<void>}
   */
  async _updateServerStatus(serverId, status) {
    try {
      await Server.findByIdAndUpdate(serverId, {
        status: status,
        lastConnection: status === 'online' ? new Date() : undefined,
        updatedAt: new Date()
      });
    } catch (error) {
      console.error('更新服务器状态失败:', error);
    }
  }

  /**
   * 执行命令并提供流式实时输出 - 专为长时间运行脚本设计
   * @param {string} serverId - 服务器ID
   * @param {string} command - 要执行的命令
   * @param {function} streamCallback - 流数据回调函数，接收(line, type)参数
   * @returns {Promise<object>} - 命令执行结果
   */
  async executeCommandWithStream(serverId, command, streamCallback) {
    try {
      console.log(`[流式执行] 准备在服务器 ${serverId} 上执行命令: ${command}`);

      // 检查连接状态
      if (!this.checkConnection(serverId)) {
        console.log(`SSH连接无效，尝试重新连接，服务器ID: ${serverId}`);
        try {
          await this.connect(serverId);
        } catch (connectError) {
          console.error(`重新连接服务器失败，服务器ID: ${serverId}, 错误: ${connectError.message}`);
          if (streamCallback) {
            streamCallback(`重新连接服务器失败: ${connectError.message}`, 'error');
          }
          throw new Error(`无法连接到服务器 - ${connectError.message}`);
        }
      }

      const conn = this.connections[serverId];
      if (!conn) {
        const error = new Error('SSH连接不存在');
        if (streamCallback) {
          streamCallback('SSH连接不存在', 'error');
        }
        throw error;
      }

      return new Promise((resolve, reject) => {
        console.log(`[流式执行] 开始执行命令: ${command}`);

        conn.exec(command, (err, stream) => {
          if (err) {
            console.error(`[流式执行] 创建命令流失败: ${err.message}`);
            if (streamCallback) {
              streamCallback(`创建命令流失败: ${err.message}`, 'error');
            }
            reject(err);
            return;
          }

          let stdout = '';
          let stderr = '';
          let exitCode = -1;

          // 处理标准输出流
          stream.on('data', (data) => {
            const text = data.toString();
            stdout += text;

            // 按行分割并传递给回调函数
            if (streamCallback) {
              const lines = text.split('\n');
              lines.forEach(line => {
                if (line.trim()) {
                  streamCallback(line.trim(), 'log');
                }
              });
            }
          });

          // 处理标准错误流
          stream.stderr.on('data', (data) => {
            const text = data.toString();
            stderr += text;

            // 按行分割并传递给回调函数
            if (streamCallback) {
              const lines = text.split('\n');
              lines.forEach(line => {
                if (line.trim()) {
                  streamCallback(line.trim(), 'error');
                }
              });
            }
          });

          // 命令结束处理
          stream.on('close', (code) => {
            exitCode = code;
            console.log(`[流式执行] 命令执行完成，退出码: ${code}`);
            if (streamCallback) {
              if (code === 0) {
                streamCallback('命令执行完成', 'success');
              } else {
                streamCallback(`命令执行失败，退出码: ${code}`, 'error');
              }
            }

            resolve({
              code: exitCode,
              stdout: stdout,
              stderr: stderr
            });
          });

          // 处理流错误
          stream.on('error', (streamErr) => {
            console.error(`[流式执行] 流错误: ${streamErr.message}`);
            if (streamCallback) {
              streamCallback(`流错误: ${streamErr.message}`, 'error');
            }
            reject(streamErr);
          });
        });
      });
    } catch (error) {
      console.error(`[流式执行] 执行命令异常: ${error.message}`);
      if (streamCallback) {
        streamCallback(`执行命令异常: ${error.message}`, 'error');
      }
      throw error;
    }
  }

  /**
   * 使用WebSocket实时日志输出部署Nftato脚本
   * @param {string} serverId 服务器ID
   * @param {function} logCallback 日志回调函数，用于发送实时日志
   * @returns {Promise<object>} 部署结果
   */
  async deployIptatoWithLogs(serverId, logCallback = () => { }) {
    let temporaryPath;
    try {
      logCallback('正在连接服务器...', 'log');
      const server = await Server.findById(serverId);
      if (!server) throw new Error('找不到服务器信息');
      if (server.status !== 'online') throw new Error('服务器当前离线，无法部署脚本');
      if (!this.checkConnection(serverId)) await this.connect(serverId);
      if (!this.connections[serverId]) throw new Error('无法连接到服务器');
      logCallback('SSH连接成功', 'success');

      const run = async (command, description) => {
        const result = await this.executeCommand(serverId, command);
        if (result.code !== 0) throw new Error(`${description}，退出码: ${result.code}`);
        return result;
      };
      logCallback('正在检查脚本是否已存在...', 'log');
      const existing = await run(
        'if [ -f /root/Nftato.sh ]; then printf root; elif [ -f "$HOME/Nftato.sh" ]; then printf home; else printf missing; fi',
        '检查现有脚本失败'
      );
      const location = existing.stdout.trim();
      if (!['root', 'home', 'missing'].includes(location)) throw new Error('无法确定远程脚本状态');
      let scriptPath = '/root/Nftato.sh';
      if (location !== 'root') {
        const homeResult = await run('printf \'%s\\n\' "$HOME"', '读取远程主目录失败');
        const remoteHome = homeResult.stdout.trim();
        if (!remoteHome.startsWith('/') || /[\r\n\0]/.test(remoteHome)) throw new Error('远程主目录无效');
        scriptPath = path.posix.join(remoteHome, 'Nftato.sh');
      }
      if (location !== 'missing') {
        await run(`if [ ! -x ${shellQuote(scriptPath)} ]; then chmod +x -- ${shellQuote(scriptPath)}; fi`, '设置现有脚本执行权限失败');
        logCallback('脚本已存在，保留现有脚本和防火墙规则', 'success');
        return { success: true, message: '脚本已存在且可执行' };
      }

      // Ship the exact reviewed script included in this application release.
      const localPath = path.resolve(__dirname, '../scripts/Nftato.sh');
      const expectedHash = crypto.createHash('sha256').update(await fs.promises.readFile(localPath)).digest('hex');
      temporaryPath = path.posix.join(path.posix.dirname(scriptPath), `.Nftato.sh.${crypto.randomUUID()}.upload`);
      logCallback('正在通过SFTP上传随应用发布的Nftato脚本...', 'log');
      await this.uploadFile(serverId, localPath, temporaryPath);
      logCallback('正在校验上传文件并安装脚本...', 'log');
      const verifyCommand = `printf '%s  %s\\n' ${shellQuote(expectedHash)} ${shellQuote(temporaryPath)} | sha256sum --check --status`;
      await run(verifyCommand, '上传脚本SHA-256校验失败');
      await run(
        `chmod 700 -- ${shellQuote(temporaryPath)} && mv -- ${shellQuote(temporaryPath)} ${shellQuote(scriptPath)}`,
        '安装上传脚本失败'
      );
      temporaryPath = undefined;

      logCallback('开始自动初始化Nftato规则，这可能需要几分钟...', 'log');
      const scriptResult = await this.executeCommandWithStream(
        serverId,
        `AUTOMATED=yes bash ${shellQuote(scriptPath)} 20`,
        (line, type) => logCallback(line, type)
      );
      if (scriptResult.code !== 0) throw new Error(`脚本执行失败，退出码: ${scriptResult.code}`);
      await run(`test -f ${shellQuote(scriptPath)} && test -x ${shellQuote(scriptPath)}`, '脚本部署验证失败');
      const cacheService = require('./cacheService');
      await cacheService.clearServerRulesCache(serverId);
      logCallback('Nftato脚本已成功部署！', 'success');
      return { success: true, message: '脚本部署成功' };
    } catch (error) {
      logCallback(`部署过程出错: ${error.message}`, 'error');
      return { success: false, error: error.message };
    } finally {
      if (temporaryPath) {
        try {
          await this.executeCommand(serverId, `rm -f -- ${shellQuote(temporaryPath)}`);
        } catch {
          logCallback('未能清理远程上传临时文件', 'error');
        }
      }
    }
  }

  // The REST controller expects object-shaped progress and rejected failures.
  async deployIptato(serverId, progressCallback = () => {}) {
    const result = await this.deployIptatoWithLogs(serverId, (message, type = 'log') => {
      progressCallback({ type, message });
    });
    if (!result.success) throw new Error(result.error || '脚本部署失败');
    return result;
  }

  /**
   * 在服务器上执行Nftato脚本命令
   * @param {string} serverId - 服务器ID
   * @param {string|number} action - 要执行的操作代码
   * @param {string} params - 额外的参数，如端口或IP等
   * @returns {Promise<object>} - 执行结果
   */
  async executeNftato(serverId, action, params = '') {
    try {
      console.log(`[诊断] 准备执行Nftato脚本，服务器ID: ${serverId}, 动作: ${action}${params ? ', 参数: ' + params : ''}`);

      // 首先检查连接状态
      if (!this.checkConnection(serverId)) {
        console.error(`尝试执行脚本时，SSH连接无效，服务器ID: ${serverId}`);
        return {
          success: false,
          output: '',
          error: 'SSH连接无效，请重新连接服务器',
          code: -1
        };
      }

      // 检查脚本是否存在（优先检查/root/目录，其次检查用户主目录）
      console.log(`[诊断] 检查脚本文件是否存在`);
      try {
        const scriptCheck = await this.executeCommand(serverId, 'test -f /root/Nftato.sh && echo "exists in root" || (test -f ~/Nftato.sh && echo "exists in home" || echo "not found")');
        console.log(`[诊断] 脚本检查结果: ${scriptCheck.stdout.trim()}`);

        if (scriptCheck.stdout.includes('not found')) {
          console.error(`脚本未找到，服务器ID: ${serverId}`);
          return {
            success: false,
            output: '',
            error: 'Nftato脚本未找到，请先部署脚本',
            code: -1
          };
        }

        // 确定脚本路径（优先使用root目录）
        let scriptPath = '/root/Nftato.sh';
        if (!scriptCheck.stdout.includes('exists in root')) {
          scriptPath = '~/Nftato.sh';
        }
        console.log(`[诊断] 使用脚本路径: ${scriptPath}`);

        // 检查脚本是否有执行权限
        console.log(`[诊断] 检查脚本执行权限`);
        const permCheck = await this.executeCommand(serverId, `test -x ${scriptPath} && echo "executable" || echo "not executable"`);
        console.log(`[诊断] 权限检查结果: ${permCheck.stdout.trim()}`);

        if (permCheck.stdout.includes('not executable')) {
          console.warn(`脚本权限不正确，尝试修复，服务器ID: ${serverId}`);
          // 自动修复执行权限
          const chmodResult = await this.executeCommand(serverId, `chmod +x ${scriptPath}`);
          console.log(`[诊断] 权限修复结果: 退出码=${chmodResult.code}`);
        }

        // 执行脚本命令
        const command = params ? `bash ${scriptPath} ${action} ${params}` : `bash ${scriptPath} ${action}`;
        console.log(`[诊断] 执行脚本命令: ${command}`);
        const result = await this.executeCommand(serverId, command);
        console.log(`[诊断] 脚本执行完成，退出码: ${result.code}`);

        // 检查执行结果
        if (result.code !== 0) {
          console.error(`脚本执行失败，退出码: ${result.code}，服务器ID: ${serverId}`);
          console.error(`[诊断] 脚本执行失败，标准输出: ${result.stdout.substring(0, 200)}${result.stdout.length > 200 ? '...' : ''}`);
          console.error(`[诊断] 脚本执行失败，错误输出: ${result.stderr}`);

          return {
            success: false,
            output: result.stdout,
            error: result.stderr || '脚本执行失败',
            code: result.code
          };
        }

        console.log(`脚本执行成功，服务器ID: ${serverId}`);
        return {
          success: true,
          output: result.stdout,
          error: result.stderr,
          code: result.code
        };
      } catch (cmdError) {
        console.error(`[诊断] 执行脚本检查命令失败: ${cmdError.message}`);
        return {
          success: false,
          output: '',
          error: `执行脚本检查命令失败: ${cmdError.message}`,
          code: -1
        };
      }
    } catch (error) {
      console.error(`执行脚本异常: ${error.message}`, error);
      console.error(`[诊断] 脚本执行异常堆栈: ${error.stack}`);
      return {
        success: false,
        output: '',
        error: `执行脚本失败: ${error.message}`,
        code: -1
      };
    }
  }

  /**
   * 测试SSH连接
   * @param {Object} serverData - 服务器连接数据
   * @returns {Promise<object>} - 测试结果
   */
  async testConnection(serverData) {
    const conn = new Client();
    
    // 准备连接配置
    const config = {
      host: serverData.host,
      port: serverData.port || 22,
      username: serverData.username,
      readyTimeout: 10000, // 10秒连接超时
    };
    
    // 根据认证类型设置认证信息
    if (serverData.authType === 'password') {
      config.password = serverData.password;
    } else {
      config.privateKey = serverData.privateKey;
    }
    
    console.log(`开始测试连接，主机: ${serverData.host}:${config.port}, 用户: ${serverData.username}`);
    
    // 创建Promise以处理连接
    return new Promise((resolve, reject) => {
      // 连接错误处理
      conn.on('error', (err) => {
        console.error(`测试连接错误: ${err.message}`);
        reject(err);
      });
      
      // 准备连接
      conn.on('ready', () => {
        console.log(`测试连接成功`);
        // 连接成功后立即断开
        conn.end();
        resolve({
          success: true,
          message: '连接测试成功'
        });
      });
      
      // 连接超时处理
      conn.on('timeout', () => {
        console.error(`测试连接超时`);
        reject(new Error('连接超时'));
      });
      
      // 尝试连接
      try {
        conn.connect(config);
      } catch (error) {
        console.error(`连接配置错误: ${error.message}`);
        reject(error);
      }
    });
  }
}

module.exports = new SSHService();
