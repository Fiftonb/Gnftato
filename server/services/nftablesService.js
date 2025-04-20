const sshService = require('./sshService');

class NftablesService {
  /**
   * 获取脚本路径
   * @param {string} serverId - 服务器ID
   * @returns {Promise<string>} - 脚本路径
   */
  async _getScriptPath(serverId) {
    try {
      console.log(`[诊断] 获取脚本路径，服务器ID: ${serverId}`);
      
      // 检查脚本位置，首先检查/root/目录，其次检查用户主目录
      const scriptCheck = await sshService.executeCommand(serverId, 'test -f /root/Nftato.sh && echo "root" || (test -f ~/Nftato.sh && echo "home" || echo "not found")');
      
      console.log(`[诊断] 脚本路径检查结果: ${scriptCheck.stdout.trim()}, 退出码: ${scriptCheck.code}`);
      
      if (scriptCheck.stdout.includes('not found')) {
        console.error(`[诊断] 未找到Nftato脚本，尝试部署脚本`);
        
        // 尝试一次自动部署
        try {
          console.log(`[诊断] 自动部署Nftato脚本`);
          await sshService.deployIptato(serverId);
          
          // 再次检查脚本位置，优先检查/root/目录
          const recheck = await sshService.executeCommand(serverId, 'test -f /root/Nftato.sh && echo "root" || (test -f ~/Nftato.sh && echo "home" || echo "not found")');
          console.log(`[诊断] 部署后再次检查，结果: ${recheck.stdout.trim()}`);
          
          if (recheck.stdout.includes('not found')) {
            throw new Error('即使尝试部署后仍未找到Nftato脚本');
          }
          
          return recheck.stdout.includes('root') ? '/root/Nftato.sh' : '~/Nftato.sh';
        } catch (deployError) {
          console.error(`[诊断] 自动部署失败: ${deployError.message}`);
          throw new Error(`未找到Nftato脚本且自动部署失败: ${deployError.message}`);
        }
      }
      
      const scriptPath = scriptCheck.stdout.includes('root') ? '/root/Nftato.sh' : '~/Nftato.sh';
      console.log(`[诊断] 使用脚本路径: ${scriptPath}`);
      return scriptPath;
    } catch (error) {
      console.error(`[诊断] 获取脚本路径失败: ${error.message}`);
      console.error(`[诊断] 错误堆栈: ${error.stack}`);
      
      // 出错时默认返回可能的路径，优先使用/root/路径
      console.warn(`[警告] 由于获取脚本路径出错，默认使用/root/Nftato.sh路径`);
      return '/root/Nftato.sh';
    }
  }

  /**
   * 检查前置条件
   * @param {string} serverId - 服务器ID
   * @returns {Promise<object>} - 检查结果
   */
  async _checkPrerequisites(serverId) {
    try {
      // 检查SSH连接
      const connection = sshService.connections[serverId];
      if (!connection) {
        return {
          success: false,
          error: '服务器未连接，请先连接服务器'
        };
      }
      
      // 检查脚本是否存在（优先检查/root/目录，其次检查用户主目录）
      const scriptCheck = await sshService.executeCommand(serverId, 'test -f /root/Nftato.sh && echo "exists in root" || (test -f ~/Nftato.sh && echo "exists in home" || echo "not found")');
      if (scriptCheck.stdout.includes('not found')) {
        return {
          success: false,
          error: 'Nftato脚本未部署，请先部署脚本'
        };
      }
      
      console.log(`[诊断] 前置检查：脚本位置 ${scriptCheck.stdout.trim()}`);
      
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: `检查前置条件失败: ${error.message}`
      };
    }
  }

  /**
   * 获取服务器上的当前封禁列表
   * @param {string} serverId - 服务器ID
   * @returns {Promise<object>} - 封禁列表结果
   */
  async getBlockList(serverId) {
    try {
      // 检查前置条件
      const prereqCheck = await this._checkPrerequisites(serverId);
      if (!prereqCheck.success) {
        return prereqCheck;
      }
      
      const result = await sshService.executeIptato(serverId, 0);
      return {
        success: result.success,
        data: result.output,
        error: result.error
      };
    } catch (error) {
      return {
        success: false,
        data: null,
        error: `获取封禁列表失败: ${error.message}`
      };
    }
  }

  /**
   * 封禁BT/PT协议
   * @param {string} serverId - 服务器ID
   * @returns {Promise<object>} - 操作结果
   */
  async blockBTPT(serverId) {
    try {
      // 检查前置条件
      const prereqCheck = await this._checkPrerequisites(serverId);
      if (!prereqCheck.success) {
        return prereqCheck;
      }
      
      const result = await sshService.executeIptato(serverId, 1);
      return {
        success: result.success,
        data: result.output,
        error: result.error
      };
    } catch (error) {
      return {
        success: false,
        data: null,
        error: `封禁BT/PT协议失败: ${error.message}`
      };
    }
  }

  /**
   * 封禁垃圾邮件端口
   * @param {string} serverId - 服务器ID
   * @returns {Promise<object>} - 操作结果
   */
  async blockSPAM(serverId) {
    try {
      // 检查前置条件
      const prereqCheck = await this._checkPrerequisites(serverId);
      if (!prereqCheck.success) {
        return prereqCheck;
      }
      
      const result = await sshService.executeIptato(serverId, 2);
      return {
        success: result.success,
        data: result.output,
        error: result.error
      };
    } catch (error) {
      return {
        success: false,
        data: null,
        error: `封禁垃圾邮件端口失败: ${error.message}`
      };
    }
  }

  /**
   * 封禁BT/PT和垃圾邮件
   * @param {string} serverId - 服务器ID
   * @returns {Promise<object>} - 操作结果
   */
  async blockAll(serverId) {
    try {
      // 检查前置条件
      const prereqCheck = await this._checkPrerequisites(serverId);
      if (!prereqCheck.success) {
        return prereqCheck;
      }
      
      const result = await sshService.executeIptato(serverId, 3);
      return {
        success: result.success,
        data: result.output,
        error: result.error
      };
    } catch (error) {
      return {
        success: false,
        data: null,
        error: `封禁全部失败: ${error.message}`
      };
    }
  }

  /**
   * 封禁自定义端口
   * @param {string} serverId - 服务器ID
   * @param {string} ports - 要封禁的端口
   * @returns {Promise<object>} - 操作结果
   */
  async blockCustomPorts(serverId, ports) {
    try {
      const result = await this._executeIptatoCommand(serverId, 4, ports);
      
      return {
        success: result.success,
        data: result.output,
        error: result.error
      };
    } catch (error) {
      return {
        success: false,
        data: null,
        error: `封禁自定义端口失败: ${error.message}`
      };
    }
  }

  /**
   * 封禁自定义关键词
   * @param {string} serverId - 服务器ID
   * @param {string} keyword - 要封禁的关键词
   * @returns {Promise<object>} - 操作结果
   */
  async blockCustomKeyword(serverId, keyword) {
    try {
      const result = await this._executeIptatoCommand(serverId, 5, keyword);
      
      return {
        success: result.success,
        data: result.output,
        error: result.error
      };
    } catch (error) {
      return {
        success: false,
        data: null,
        error: `封禁自定义关键词失败: ${error.message}`
      };
    }
  }

  /**
   * 解封BT/PT协议
   * @param {string} serverId - 服务器ID
   * @returns {Promise<object>} - 操作结果
   */
  async unblockBTPT(serverId) {
    try {
      // 检查前置条件
      const prereqCheck = await this._checkPrerequisites(serverId);
      if (!prereqCheck.success) {
        return prereqCheck;
      }
      
      const result = await sshService.executeIptato(serverId, 6);
      return {
        success: result.success,
        data: result.output,
        error: result.error
      };
    } catch (error) {
      return {
        success: false,
        data: null,
        error: `解封BT/PT协议失败: ${error.message}`
      };
    }
  }

  /**
   * 解封垃圾邮件端口
   * @param {string} serverId - 服务器ID
   * @returns {Promise<object>} - 操作结果
   */
  async unblockSPAM(serverId) {
    try {
      // 检查前置条件
      const prereqCheck = await this._checkPrerequisites(serverId);
      if (!prereqCheck.success) {
        return prereqCheck;
      }
      
      const result = await sshService.executeIptato(serverId, 7);
      return {
        success: result.success,
        data: result.output,
        error: result.error
      };
    } catch (error) {
      return {
        success: false,
        data: null,
        error: `解封垃圾邮件端口失败: ${error.message}`
      };
    }
  }

  /**
   * 解封BT/PT和垃圾邮件
   * @param {string} serverId - 服务器ID
   * @returns {Promise<object>} - 操作结果
   */
  async unblockAll(serverId) {
    try {
      // 检查前置条件
      const prereqCheck = await this._checkPrerequisites(serverId);
      if (!prereqCheck.success) {
        return prereqCheck;
      }
      
      const result = await sshService.executeIptato(serverId, 8);
      return {
        success: result.success,
        data: result.output,
        error: result.error
      };
    } catch (error) {
      return {
        success: false,
        data: null,
        error: `解封BT/PT和垃圾邮件失败: ${error.message}`
      };
    }
  }

  /**
   * 解封自定义端口
   * @param {string} serverId - 服务器ID
   * @param {string} ports - 要解封的端口
   * @returns {Promise<object>} - 操作结果
   */
  async unblockCustomPorts(serverId, ports) {
    try {
      const result = await this._executeIptatoCommand(serverId, 9, ports);
      
      return {
        success: result.success,
        data: result.output,
        error: result.error
      };
    } catch (error) {
      return {
        success: false,
        data: null,
        error: `解封自定义端口失败: ${error.message}`
      };
    }
  }

  /**
   * 解封自定义关键词
   * @param {string} serverId - 服务器ID
   * @param {string} keyword - 要解封的关键词
   * @returns {Promise<object>} - 操作结果
   */
  async unblockCustomKeyword(serverId, keyword) {
    try {
      const result = await this._executeIptatoCommand(serverId, 10, keyword);
      
      return {
        success: result.success,
        data: result.output,
        error: result.error
      };
    } catch (error) {
      return {
        success: false,
        data: null,
        error: `解封自定义关键词失败: ${error.message}`
      };
    }
  }

  /**
   * 解封所有关键词
   * @param {string} serverId - 服务器ID
   * @returns {Promise<object>} - 操作结果
   */
  async unblockAllKeywords(serverId) {
    try {
      // 检查前置条件
      const prereqCheck = await this._checkPrerequisites(serverId);
      if (!prereqCheck.success) {
        return prereqCheck;
      }
      
      const result = await sshService.executeIptato(serverId, 11);
      return {
        success: result.success,
        data: result.output,
        error: result.error
      };
    } catch (error) {
      return {
        success: false,
        data: null,
        error: `解封所有关键词失败: ${error.message}`
      };
    }
  }

  /**
   * 获取当前放行的入网端口
   * @param {string} serverId - 服务器ID
   * @returns {Promise<object>} - 操作结果
   */
  async getInboundPorts(serverId) {
    try {
      // 检查前置条件
      const prereqCheck = await this._checkPrerequisites(serverId);
      if (!prereqCheck.success) {
        return prereqCheck;
      }
      
      const result = await sshService.executeIptato(serverId, 13);
      
      // 处理结果
      if (result.success) {
        const output = result.output || '';
        
        // 检查是否明确表示没有端口
        if (output.includes('当前未放行任何端口') || 
            output.includes('No allowed ports')) {
          console.log(`[诊断] 检测到空端口列表`);
          return {
            success: true,
            data: { tcp: [], udp: [] },
            error: null
          };
        }
        
        // 解析输出
        const parsedData = this._parsePortOutput(output);
        console.log(`[诊断] 解析端口列表结果: TCP=${parsedData.tcp.length}个, UDP=${parsedData.udp.length}个`);
        
        return {
          success: true,
          data: parsedData,
          error: null
        };
      }
      
      return {
        success: result.success,
        data: { tcp: [], udp: [] },
        error: result.error
      };
    } catch (error) {
      console.error(`获取入网端口失败: ${error.message}`);
      return {
        success: false,
        data: { tcp: [], udp: [] },
        error: `获取入网端口失败: ${error.message}`
      };
    }
  }

  /**
   * 获取当前放行的入网IP
   * @param {string} serverId - 服务器ID
   * @returns {Promise<object>} - 操作结果
   */
  async getInboundIPs(serverId) {
    try {
      // 检查前置条件
      const prereqCheck = await this._checkPrerequisites(serverId);
      if (!prereqCheck.success) {
        return prereqCheck;
      }
      
      const result = await sshService.executeIptato(serverId, 14);
      
      // 处理结果
      if (result.success) {
        const output = result.output || '';
        
        // 检查是否明确表示没有IP
        if (output.includes('当前未放行任何 IP') || 
            output.includes('No allowed IPs')) {
          console.log(`[诊断] 检测到空IP列表`);
          return {
            success: true,
            data: [],
            error: null
          };
        }
        
        // 解析输出
        const parsedData = this._parseIPOutput(output);
        console.log(`[诊断] 解析IP列表结果: ${parsedData.length}个IP`);
        
        return {
          success: true,
          data: parsedData,
          error: null
        };
      }
      
      return {
        success: result.success,
        data: [],
        error: result.error
      };
    } catch (error) {
      console.error(`获取入网IP失败: ${error.message}`);
      return {
        success: false,
        data: [],
        error: `获取入网IP失败: ${error.message}`
      };
    }
  }

  /**
   * 放行入网端口
   * @param {string} serverId - 服务器ID
   * @param {string} ports - 要放行的端口
   * @returns {Promise<object>} - 操作结果
   */
  async allowInboundPorts(serverId, ports) {
    try {
      const result = await this._executeIptatoCommand(serverId, 15, ports);
      
      return {
        success: result.success,
        data: result.output,
        error: result.error
      };
    } catch (error) {
      return {
        success: false,
        data: null,
        error: `放行入网端口失败: ${error.message}`
      };
    }
  }

  /**
   * 取消放行入网端口
   * @param {string} serverId - 服务器ID
   * @param {string} ports - 要取消放行的端口
   * @returns {Promise<object>} - 操作结果
   */
  async disallowInboundPorts(serverId, ports) {
    try {
      const result = await this._executeIptatoCommand(serverId, 16, ports);
      
      return {
        success: result.success,
        data: result.output,
        error: result.error
      };
    } catch (error) {
      return {
        success: false,
        data: null,
        error: `取消放行入网端口失败: ${error.message}`
      };
    }
  }

  /**
   * 放行入网IP
   * @param {string} serverId - 服务器ID
   * @param {string} ips - 要放行的IP
   * @returns {Promise<object>} - 操作结果
   */
  async allowInboundIPs(serverId, ips) {
    try {
      const result = await this._executeIptatoCommand(serverId, 17, ips);
      
      return {
        success: result.success,
        data: result.output,
        error: result.error
      };
    } catch (error) {
      return {
        success: false,
        data: null,
        error: `放行入网IP失败: ${error.message}`
      };
    }
  }

  /**
   * 取消放行入网IP
   * @param {string} serverId - 服务器ID
   * @param {string} ips - 要取消放行的IP
   * @returns {Promise<object>} - 操作结果
   */
  async disallowInboundIPs(serverId, ips) {
    try {
      const result = await this._executeIptatoCommand(serverId, 18, ips);
      
      return {
        success: result.success,
        data: result.output,
        error: result.error
      };
    } catch (error) {
      return {
        success: false,
        data: null,
        error: `取消放行入网IP失败: ${error.message}`
      };
    }
  }

  /**
   * 查看当前SSH端口
   * @param {string} serverId - 服务器ID
   * @returns {Promise<object>} - 操作结果
   */
  async getSSHPort(serverId) {
    try {
      // 检查前置条件
      const prereqCheck = await this._checkPrerequisites(serverId);
      if (!prereqCheck.success) {
        return prereqCheck;
      }
      
      const result = await sshService.executeIptato(serverId, 19);
      return {
        success: result.success,
        data: result.output,
        error: result.error
      };
    } catch (error) {
      return {
        success: false,
        data: null,
        error: `获取SSH端口失败: ${error.message}`
      };
    }
  }

  /**
   * 清空所有规则
   * @param {string} serverId - 服务器ID
   * @returns {Promise<object>} - 操作结果
   */
  async clearAllRules(serverId) {
    try {
      // 检查前置条件
      const prereqCheck = await this._checkPrerequisites(serverId);
      if (!prereqCheck.success) {
        return prereqCheck;
      }
      
      const result = await sshService.executeIptato(serverId, 20);
      return {
        success: result.success,
        data: result.output,
        error: result.error
      };
    } catch (error) {
      return {
        success: false,
        data: null,
        error: `清空所有规则失败: ${error.message}`
      };
    }
  }

  /**
   * 执行Nftato命令
   * @param {string} serverId - 服务器ID
   * @param {number} action - 要执行的操作代码
   * @param {string} params - 要传递的参数
   * @returns {Promise<object>} - 执行结果
   */
  async _executeIptatoCommand(serverId, action, params = '') {
    try {
      console.log(`[诊断] 准备执行Nftato命令，服务器ID: ${serverId}, 动作: ${action}, 参数: ${params}`);
      
      // 检查前置条件
      const prereqCheck = await this._checkPrerequisites(serverId);
      if (!prereqCheck.success) {
        console.log(`[诊断] 前置条件检查失败: ${prereqCheck.error}`);
        return prereqCheck;
      }
      
      // 设置操作超时
      const timeout = setTimeout(() => {
        console.error(`[诊断] 操作超时，服务器ID: ${serverId}, 动作: ${action}`);
      }, 15000); // 15秒警告
      
      try {
        let result;
        
        // 优先使用sshService的executeIptato方法
        if (!params) {
          console.log(`[诊断] 使用executeIptato执行命令，动作: ${action}`);
          result = await sshService.executeIptato(serverId, action);
        } else {
          // 对于需要参数的命令，获取脚本路径并执行
          console.log(`[诊断] 获取脚本路径并执行命令`);
          const scriptPath = await this._getScriptPath(serverId);
          console.log(`[诊断] 获取到脚本路径: ${scriptPath}`);
          
          result = await sshService.executeCommand(serverId, `bash ${scriptPath} ${action} "${params}"`);
          
          // 格式化返回结果，保持一致性
          result = {
            success: result.code === 0,
            output: result.stdout,
            error: result.stderr,
            code: result.code
          };
        }
        
        clearTimeout(timeout);
        console.log(`[诊断] 命令执行完成，结果: ${result.success ? '成功' : '失败'}`);
        
        return result;
      } catch (commandError) {
        clearTimeout(timeout);
        console.error(`[诊断] 执行命令过程中发生错误: ${commandError.message}`);
        console.error(`[诊断] 错误堆栈: ${commandError.stack}`);
        
        return {
          success: false,
          output: '',
          error: `执行命令失败: ${commandError.message}`,
          code: -1
        };
      }
    } catch (error) {
      console.error(`[诊断] _executeIptatoCommand方法异常: ${error.message}`);
      console.error(`[诊断] 异常堆栈: ${error.stack}`);
      
      return {
        success: false,
        output: '',
        error: `执行Nftato命令失败: ${error.message}`,
        code: -1
      };
    }
  }

  /**
   * 解析端口列表输出
   * @param {string} output - 脚本原始输出
   * @returns {Object} - 解析后的结构化数据
   */
  _parsePortOutput(output) {
    try {
      // 移除ANSI颜色代码
      output = output.replace(/\u001b\[\d+(;\d+)?m/g, '');
      
      // 初始化结果
      const result = {
        tcp: [],
        udp: []
      };
      
      // 提取TCP部分
      const tcpMatch = output.match(/TCP\s+([\s\S]*?)(?=\n={3,}|\nUDP)/);
      if (tcpMatch && tcpMatch[1]) {
        // 提取数字
        const tcpPorts = tcpMatch[1].match(/\d+/g);
        if (tcpPorts) {
          result.tcp = tcpPorts.map(port => parseInt(port, 10));
        }
      }
      
      // 提取UDP部分
      const udpMatch = output.match(/UDP\s+([\s\S]*?)(?=\n={3,}|$)/);
      if (udpMatch && udpMatch[1]) {
        // 提取数字
        const udpPorts = udpMatch[1].match(/\d+/g);
        if (udpPorts) {
          result.udp = udpPorts.map(port => parseInt(port, 10));
        }
      }
      
      return result;
    } catch (error) {
      console.error(`[诊断] 解析端口输出失败: ${error.message}`);
      return { tcp: [], udp: [] };
    }
  }
  
  /**
   * 解析IP列表输出
   * @param {string} output - 脚本原始输出
   * @returns {Array} - 解析后的IP列表
   */
  _parseIPOutput(output) {
    try {
      // 移除ANSI颜色代码
      output = output.replace(/\u001b\[\d+(;\d+)?m/g, '');
      
      // 提取所有IP地址
      const ipAddresses = output.match(/\d+\.\d+\.\d+\.\d+/g) || [];
      
      return ipAddresses;
    } catch (error) {
      console.error(`[诊断] 解析IP输出失败: ${error.message}`);
      return [];
    }
  }
}

module.exports = new NftablesService(); 