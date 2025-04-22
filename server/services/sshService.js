const { Client } = require('ssh2');
const fs = require('fs');
const path = require('path');
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

          const readStream = fs.createReadStream(localPath);
          const writeStream = sftp.createWriteStream(remotePath);

          writeStream.on('close', () => {
            resolve({
              success: true,
              message: '文件上传成功'
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
   * 在服务器上部署Nftato脚本
   * @param {string} serverId - 服务器ID
   * @param {function} [progressCallback] - 实时进度回调函数，用于WebSocket推送进度
   * @returns {Promise<object>} - 执行结果
   */
  async deployIptato(serverId, progressCallback = null) {
    try {
      // 查找服务器信息，用于日志记录
      const server = await Server.findById(serverId);
      if (!server) {
        console.error(`服务器不存在，ID: ${serverId}`);
        throw new Error('服务器未找到');
      }
      
      const logProgress = (message) => {
        console.log(message);
        // 如果提供了回调函数，则推送进度信息
        if (typeof progressCallback === 'function') {
          progressCallback({
            type: 'log',
            message: message
          });
        }
      };
      
      logProgress(`开始在服务器 ${server.name} (${server.host}) 上部署Nftato脚本`);
      
      // 检查用户是否有root权限
      logProgress(`检查用户权限...`);
      const checkSudo = await this.executeCommand(serverId, 'sudo -n true 2>/dev/null && echo "has_sudo" || echo "no_sudo"');
      const hasSudo = checkSudo.stdout.includes('has_sudo');
      logProgress(`用户${hasSudo ? '有' : '没有'}sudo权限`);
      
      // 首先检测网络环境
      logProgress(`检测网络环境...`);
      const checkNetworkCommand = 'ping -c2 -i0.3 -W1 www.google.com &>/dev/null && echo "global" || echo "china"';
      logProgress(`执行命令: ${checkNetworkCommand}`);
      
      const networkEnv = await this.executeCommand(serverId, checkNetworkCommand);
      let downloadUrl = '';
      
      // 根据网络环境选择下载URL
      if (networkEnv.stdout.includes('china')) {
        logProgress('检测到国内网络环境，使用代理下载...');
        downloadUrl = 'https://gh-proxy.com/raw.githubusercontent.com/Fiftonb/Gnftato/refs/heads/main/Nftato.sh';
      } else {
        logProgress('检测到可直接访问国际网络，使用原始URL下载...');
        downloadUrl = 'https://raw.githubusercontent.com/Fiftonb/Gnftato/refs/heads/main/Nftato.sh';
      }
      
      // 构建下载命令，添加重试机制
      const downloadCommand = `cd ~ && wget -N --no-check-certificate --tries=3 --timeout=15 ${downloadUrl} -O Nftato.sh && chmod +x Nftato.sh`;
      logProgress(`开始下载脚本: ${downloadCommand}`);
      
      // 执行下载命令
      logProgress(`正在下载脚本文件...`);
      const result = await this.executeCommand(serverId, downloadCommand);
      
      if (result.code !== 0) {
        logProgress(`下载脚本时发生错误，退出码: ${result.code}`);
        logProgress(`标准错误: ${result.stderr}`);
        
        // 如果失败，尝试使用备用URL
        logProgress('尝试使用备用方法下载...');
        const fallbackCommand = networkEnv.stdout.includes('china') 
          ? `cd ~ && curl -o Nftato.sh https://cdn.jsdelivr.net/gh/Fiftonb/Gnftato@main/Nftato.sh && chmod +x Nftato.sh`
          : `cd ~ && curl -o Nftato.sh https://raw.githubusercontent.com/Fiftonb/Gnftato/refs/heads/main/Nftato.sh && chmod +x Nftato.sh`;
          
        logProgress(`执行备用下载命令: ${fallbackCommand}`);
        const fallbackResult = await this.executeCommand(serverId, fallbackCommand);
        
        if (fallbackResult.code !== 0) {
          logProgress(`备用下载也失败，退出码: ${fallbackResult.code}`);
          logProgress(`标准错误: ${fallbackResult.stderr}`);
          throw new Error(`下载脚本失败: ${fallbackResult.stderr || '未知错误'}`);
        }
      }
      
      // 验证脚本是否下载成功到用户目录
      logProgress(`验证脚本下载...`);
      const checkResult = await this.executeCommand(serverId, 'test -f ~/Nftato.sh && echo "exists" || echo "not found"');
      if (checkResult.stdout.includes('not found')) {
        logProgress(`脚本下载验证失败，找不到脚本文件`);
        throw new Error('脚本文件未成功下载到用户目录');
      }
      
      logProgress(`脚本已成功下载到用户目录`);
      
      // 如果有sudo权限，也复制到/root/目录
      if (hasSudo) {
        logProgress(`尝试将脚本复制到/root/目录`);
        await this.executeCommand(serverId, 'sudo cp ~/Nftato.sh /root/Nftato.sh && sudo chmod +x /root/Nftato.sh');
        
        // 验证脚本是否成功复制到/root/
        const rootCheck = await this.executeCommand(serverId, 'test -f /root/Nftato.sh && echo "exists" || echo "not found"');
        if (rootCheck.stdout.includes('exists')) {
          logProgress(`脚本已成功复制到/root/目录`);
        } else {
          logProgress(`无法复制脚本到/root/目录，将使用用户目录的脚本`);
        }
      }
      
      // 验证至少一个位置的脚本权限
      logProgress(`验证脚本执行权限...`);
      const permResult = await this.executeCommand(serverId, '(test -x ~/Nftato.sh && echo "home executable") || (test -x /root/Nftato.sh && echo "root executable") || echo "not executable"');
      if (permResult.stdout.includes('not executable')) {
        logProgress(`脚本权限不正确，尝试修复`);
        await this.executeCommand(serverId, 'chmod +x ~/Nftato.sh');
        if (hasSudo) {
          await this.executeCommand(serverId, 'sudo chmod +x /root/Nftato.sh');
        }
      }
      
      logProgress(`脚本已成功部署到服务器 ${server.name}!`);
      
      return {
        success: true,
        message: 'Nftato脚本已成功部署到服务器'
      };
    } catch (error) {
      console.error(`部署脚本时发生错误:`, error);
      
      // 如果提供了回调函数，推送错误信息
      if (typeof progressCallback === 'function') {
        progressCallback({
          type: 'error',
          message: `部署失败: ${error.message}`
        });
      }
      
      throw error;
    }
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
}

module.exports = new SSHService(); 