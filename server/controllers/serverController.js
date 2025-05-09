const Server = require('../models/Server');
const sshService = require('../services/sshService');

/**
 * 获取所有服务器
 */
exports.getAllServers = async (req, res) => {
  try {
    const servers = await Server.find();
    
    // 手动过滤敏感字段
    const filteredServers = servers.map(server => {
      const { password, privateKey, ...filtered } = server;
      return filtered;
    });
    
    res.status(200).json({
      success: true,
      data: filteredServers
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: '获取服务器列表失败',
      error: error.message
    });
  }
};

/**
 * 获取单个服务器
 */
exports.getServer = async (req, res) => {
  try {
    const server = await Server.findById(req.params.id);
    
    if (!server) {
      return res.status(404).json({
        success: false,
        message: '服务器未找到'
      });
    }
    
    // 手动过滤敏感字段
    const { password, privateKey, ...filteredServer } = server;
    
    res.status(200).json({
      success: true,
      data: filteredServer
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: '获取服务器信息失败',
      error: error.message
    });
  }
};

/**
 * 创建服务器
 */
exports.createServer = async (req, res) => {
  try {
    const { name, host, port, username, authType, password, privateKey } = req.body;
    
    // 创建服务器
    const server = await Server.create({
      name,
      host,
      port,
      username,
      authType,
      password,
      privateKey
    });
    
    // 手动过滤敏感字段
    const { password: pwd, privateKey: pk, ...filteredServer } = server;
    
    res.status(201).json({
      success: true,
      data: filteredServer,
      message: '服务器添加成功'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: '添加服务器失败',
      error: error.message
    });
  }
};

/**
 * 更新服务器信息
 */
exports.updateServer = async (req, res) => {
  try {
    // 如果不更新敏感信息，移除这些字段
    if (!req.body.password) {
      delete req.body.password;
    }
    if (!req.body.privateKey) {
      delete req.body.privateKey;
    }
    
    const server = await Server.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true }
    );
    
    if (!server) {
      return res.status(404).json({
        success: false,
        message: '服务器未找到'
      });
    }
    
    // 手动过滤敏感字段
    const { password, privateKey, ...filteredServer } = server;
    
    res.status(200).json({
      success: true,
      data: filteredServer,
      message: '服务器信息更新成功'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: '更新服务器信息失败',
      error: error.message
    });
  }
};

/**
 * 删除服务器
 */
exports.deleteServer = async (req, res) => {
  try {
    // 先检查是否有活动连接
    if (sshService.connections[req.params.id]) {
      // 断开连接
      await sshService.disconnect(req.params.id);
    }
    
    const server = await Server.findByIdAndDelete(req.params.id);
    
    if (!server) {
      return res.status(404).json({
        success: false,
        message: '服务器未找到'
      });
    }
    
    res.status(200).json({
      success: true,
      message: '服务器已删除'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: '删除服务器失败',
      error: error.message
    });
  }
};

/**
 * 连接到服务器
 */
exports.connectServer = async (req, res) => {
  try {
    const serverId = req.params.id;
    console.log(`尝试连接服务器，ID: ${serverId}`);
    
    // 检查服务器是否存在
    const server = await Server.findById(serverId);
    if (!server) {
      console.error(`服务器不存在，ID: ${serverId}`);
      return res.status(404).json({
        success: false,
        message: '服务器未找到'
      });
    }

    // 如果已连接，返回成功
    if (sshService.connections[serverId]) {
      // 检查连接是否有效
      if (sshService.checkConnection(serverId)) {
        console.log(`服务器已连接且连接有效，ID: ${serverId}`);
        
        // 确保数据库状态与实际状态一致
        await Server.findByIdAndUpdate(serverId, {
          status: 'online',
          lastConnection: new Date(),
          updatedAt: new Date()
        });
        
        return res.status(200).json({
          success: true,
          message: '服务器已连接',
          serverStatus: 'online'
        });
      } else {
        console.log(`服务器连接无效，尝试重新连接，ID: ${serverId}`);
        // 连接已失效，需要重新连接
      }
    }

    console.log(`开始建立SSH连接，服务器: ${server.name}, 主机: ${server.host}`);
    const result = await sshService.connect(serverId);
    console.log(`SSH连接建立成功，ID: ${serverId}`);
    
    // 增加连接后的状态信息
    const updatedServer = await Server.findById(serverId);
    
    res.status(200).json({
      success: true,
      message: result.message,
      serverStatus: updatedServer.status,
      connectionTime: updatedServer.lastConnection
    });
  } catch (error) {
    console.error(`连接服务器错误:`, error);
    
    // 确保服务器状态为错误
    try {
      await Server.findByIdAndUpdate(req.params.id, {
        status: 'error',
        updatedAt: new Date()
      });
    } catch (updateError) {
      console.error('更新服务器状态出错:', updateError);
    }
    
    res.status(500).json({
      success: false,
      message: '连接服务器失败',
      error: error.message,
      serverStatus: 'error',
      stack: process.env.NODE_ENV === 'production' ? undefined : error.stack
    });
  }
};

/**
 * 断开服务器连接
 */
exports.disconnectServer = async (req, res) => {
  try {
    const result = await sshService.disconnect(req.params.id);
    
    // 获取最新服务器状态
    const updatedServer = await Server.findById(req.params.id);
    
    res.status(200).json({
      success: true,
      message: result.message,
      serverStatus: updatedServer.status
    });
  } catch (error) {
    console.error(`断开服务器错误:`, error);
    
    // 确保服务器状态为离线或错误
    try {
      await Server.findByIdAndUpdate(req.params.id, {
        status: 'error',
        updatedAt: new Date()
      });
    } catch (updateError) {
      console.error('更新服务器状态出错:', updateError);
    }
    
    res.status(500).json({
      success: false,
      message: '断开服务器连接失败',
      error: error.message,
      serverStatus: 'offline'
    });
  }
};

/**
 * 在服务器上执行系统命令
 */
exports.executeCommand = async (req, res) => {
  try {
    const { command } = req.body;
    const serverId = req.params.id;
    
    console.log(`接收到执行命令请求，服务器ID: ${serverId}, 命令: ${command}`);
    
    if (!command) {
      console.error('命令为空');
      return res.status(400).json({
        success: false,
        message: '命令不能为空'
      });
    }
    
    // 检查服务器是否存在
    const server = await Server.findById(serverId);
    if (!server) {
      console.error(`服务器不存在，ID: ${serverId}`);
      return res.status(404).json({
        success: false,
        message: '服务器未找到'
      });
    }
    
    // 检查连接状态
    if (!sshService.connections[serverId]) {
      console.error(`无有效连接，服务器ID: ${serverId}`);
      
      // 尝试重新连接
      try {
        console.log(`尝试重新连接服务器，ID: ${serverId}`);
        await sshService.connect(serverId);
        console.log(`服务器重新连接成功，ID: ${serverId}`);
      } catch (connError) {
        console.error(`重新连接失败: ${connError.message}`);
        return res.status(400).json({
          success: false,
          message: '服务器未连接，请先连接服务器',
          error: connError.message
        });
      }
    }
    
    // 确保连接有效
    if (!sshService.checkConnection(serverId)) {
      console.error(`SSH连接无效，服务器ID: ${serverId}`);
      return res.status(400).json({
        success: false,
        message: 'SSH连接无效，请重新连接服务器'
      });
    }
    
    console.log(`开始执行命令: ${command}`);
    const result = await sshService.executeCommand(serverId, command);
    console.log(`命令执行完成，退出码: ${result.code}`);
    
    res.status(200).json({
      success: true,
      data: {
        stdout: result.stdout,
        stderr: result.stderr,
        code: result.code
      }
    });
  } catch (error) {
    console.error(`执行命令出错: ${error.message}`, error);
    
    // 添加更详细的错误日志
    const errorDetails = {
      message: error.message,
      stack: error.stack,
      name: error.name,
      code: error.code,
      serverId: serverId
    };
    console.error('详细错误信息:', JSON.stringify(errorDetails, null, 2));
    
    res.status(500).json({
      success: false,
      message: '执行命令失败',
      error: error.message,
      errorDetails: process.env.NODE_ENV === 'production' ? undefined : errorDetails,
      stack: process.env.NODE_ENV === 'production' ? undefined : error.stack
    });
  }
};

/**
 * 检测服务器状态
 */
exports.checkServerStatus = async (req, res) => {
  try {
    const serverId = req.params.id;
    const server = await Server.findById(serverId);
    
    if (!server) {
      return res.status(404).json({
        success: false,
        message: '服务器未找到'
      });
    }
    
    // 检查连接状态
    const isConnected = !!sshService.connections[serverId];
    const isConnectionValid = isConnected ? sshService.checkConnection(serverId) : false;
    
    // 如果数据库状态与实际连接状态不符，更新数据库
    let actualStatus = server.status;
    if (isConnectionValid && server.status !== 'online') {
      actualStatus = 'online';
      await Server.findByIdAndUpdate(serverId, {
        status: 'online',
        updatedAt: new Date()
      });
    } else if (!isConnectionValid && server.status === 'online') {
      actualStatus = 'offline';
      await Server.findByIdAndUpdate(serverId, {
        status: 'offline',
        updatedAt: new Date()
      });
    }
    
    res.status(200).json({
      success: true,
      data: {
        status: isConnectionValid ? 'online' : (server.status === 'error' ? 'error' : 'offline'),
        lastConnection: server.lastConnection,
        backendConnected: isConnected, // 后端实际是否有连接对象
        backendConnectionValid: isConnectionValid // 后端连接是否有效
      }
    });
  } catch (error) {
    console.error('检查服务器状态失败:', error);
    res.status(500).json({
      success: false,
      message: '检查服务器状态失败',
      error: error.message
    });
  }
};

/**
 * 部署Nftato脚本到服务器
 */
exports.deployIptato = async (req, res) => {
  // 创建一个独立的响应已发送标记，避免重复发送响应
  let responseSent = false;
  
  try {
    const serverId = req.params.id;
    // 检查服务器是否存在
    const server = await Server.findById(serverId);
    if (!server) {
      return res.status(404).json({
        success: false,
        message: '服务器未找到'
      });
    }

    // 检查服务器是否已连接
    if (!sshService.connections[serverId]) {
      return res.status(400).json({
        success: false,
        message: '服务器未连接，请先连接服务器'
      });
    }

    // 检查是否需要使用WebSocket
    const useWebSocket = req.query.useWebSocket === 'true' || req.body.useWebSocket === true;
    
    if (useWebSocket && req.app.io) {
      // 立即发送初始响应，表示部署已开始
      res.status(200).json({
        success: true,
        message: '脚本部署已开始，请通过WebSocket接收进度',
        useWebSocket: true
      });
      responseSent = true;
      
      // 创建一个WebSocket房间ID，基于serverId和时间戳
      const roomId = `deploy_${serverId}_${Date.now()}`;
      
      // 通知前端WebSocket连接信息
      req.app.io.emit('deploy_start', { 
        serverId, 
        roomId,
        message: '开始部署过程，请等待...'
      });
      
      // 创建进度回调函数，通过WebSocket发送进度
      const progressCallback = (data) => {
        req.app.io.emit(roomId, data);
      };
      
      // 开始部署过程
      try {
        await sshService.deployIptato(serverId, progressCallback);
        // 部署完成，发送最终状态
        req.app.io.emit(roomId, { 
          type: 'complete',
          success: true,
          message: '脚本部署成功完成！'
        });
      } catch (deployError) {
        console.error('部署过程中出错:', deployError);
        // 发送错误信息
        req.app.io.emit(roomId, { 
          type: 'error',
          success: false,
          message: `部署失败: ${deployError.message}`
        });
      } finally {
        // 发送关闭信号
        setTimeout(() => {
          req.app.io.emit(roomId, { type: 'close' });
        }, 1000);
      }
    } else {
      // 常规非WebSocket部署，直接执行并等待结果
      await sshService.deployIptato(serverId);
      
      if (!responseSent) {
        res.status(200).json({
          success: true,
          message: '脚本部署成功'
        });
      }
    }
  } catch (error) {
    console.error('部署脚本错误:', error);
    
    // 添加更详细的错误日志
    const errorDetails = {
      message: error.message,
      stack: error.stack,
      name: error.name,
      code: error.code,
      serverId: req.params.id
    };
    console.error('详细部署脚本错误信息:', JSON.stringify(errorDetails, null, 2));
    
    if (!responseSent) {
      res.status(500).json({
        success: false,
        message: '部署Nftato脚本失败',
        error: error.message,
        errorDetails: process.env.NODE_ENV === 'production' ? undefined : errorDetails
      });
    }
  }
};

/**
 * 获取服务器连接日志
 */
exports.getServerLogs = async (req, res) => {
  try {
    const serverId = req.params.id;
    const server = await Server.findById(serverId);
    
    if (!server) {
      return res.status(404).json({
        success: false,
        message: '服务器未找到'
      });
    }
    
    // 检查连接状态
    const isConnected = !!sshService.connections[serverId];
    const isConnectionValid = isConnected ? sshService.checkConnection(serverId) : false;
    
    // 获取最近的系统日志（提取服务器连接相关的日志条目）
    let logs = [];
    
    // 添加连接状态信息
    logs.push(`[${new Date().toISOString()}] 服务器ID: ${serverId}`);
    logs.push(`[${new Date().toISOString()}] 服务器名称: ${server.name}`);
    logs.push(`[${new Date().toISOString()}] 数据库中状态: ${server.status}`);
    logs.push(`[${new Date().toISOString()}] 后端有连接对象: ${isConnected ? '是' : '否'}`);
    
    if (isConnected) {
      logs.push(`[${new Date().toISOString()}] 连接对象有效: ${isConnectionValid ? '是' : '否'}`);
      
      // 获取连接详细信息
      const conn = sshService.connections[serverId];
      if (conn) {
        logs.push(`[${new Date().toISOString()}] 连接状态: ${conn._state || '未知'}`);
        logs.push(`[${new Date().toISOString()}] 套接字可读: ${conn._sock?.readable ? '是' : '否'}`);
        logs.push(`[${new Date().toISOString()}] 套接字可写: ${conn._sock?.writable ? '是' : '否'}`);
      }
      
      if (isConnectionValid) {
        logs.push(`[${new Date().toISOString()}] 服务器已连接且连接有效`);
      } else {
        logs.push(`[${new Date().toISOString()}] 服务器连接对象存在但可能无效`);
      }
    } else {
      logs.push(`[${new Date().toISOString()}] 当前没有活动的SSH连接`);
    }
    
    // 如果数据库状态为在线但实际连接检查显示不在线
    if (server.status === 'online' && !isConnectionValid) {
      logs.push(`[${new Date().toISOString()}] 状态不一致：数据库显示在线但连接检查显示不在线`);
    }
    
    // 如果数据库状态为离线但实际连接有效
    if ((server.status === 'offline' || server.status === 'error') && isConnectionValid) {
      logs.push(`[${new Date().toISOString()}] 状态不一致：数据库显示${server.status}但连接实际有效`);
    }
    
    // 返回系统日志
    res.status(200).json({
      success: true,
      data: logs.join('\n'),
      connectionStatus: {
        databaseStatus: server.status,
        actualConnected: isConnected,
        connectionValid: isConnectionValid
      }
    });
  } catch (error) {
    console.error('获取服务器日志失败:', error);
    res.status(500).json({
      success: false,
      message: '获取服务器日志失败',
      error: error.message
    });
  }
};

/**
 * 检查Nftato脚本是否已存在于服务器
 */
exports.checkScriptExists = async (req, res) => {
  try {
    const serverId = req.params.id;
    console.log(`检查服务器 ${serverId} 是否已部署Nftato脚本`);
    
    // 检查服务器是否存在
    const server = await Server.findById(serverId);
    if (!server) {
      return res.status(404).json({
        success: false,
        message: '服务器未找到'
      });
    }

    // 检查服务器是否已连接
    if (!sshService.connections[serverId]) {
      return res.status(400).json({
        success: false,
        message: '服务器未连接，请先连接服务器'
      });
    }

    // 检查连接是否有效
    if (!sshService.checkConnection(serverId)) {
      return res.status(400).json({
        success: false,
        message: 'SSH连接无效，请重新连接服务器'
      });
    }

    // 执行检查命令
    const result = await sshService.executeCommand(
      serverId, 
      'test -f ~/Nftato.sh && echo "exists_home" || test -f /root/Nftato.sh && echo "exists_root" || echo "not_found"'
    );

    const scriptExists = result.stdout.includes('exists_home') || result.stdout.includes('exists_root');
    const location = result.stdout.includes('exists_home') ? '~/Nftato.sh' : 
                    result.stdout.includes('exists_root') ? '/root/Nftato.sh' : '';

    // 如果脚本存在，运行升级命令
    let upgradeResult = null;
    if (scriptExists) {
      console.log(`在服务器 ${serverId} 上运行Nftato升级核心脚本命令`);
      try {
        const scriptPath = location === '~/Nftato.sh' ? '~/Nftato.sh' : '/root/Nftato.sh';
        upgradeResult = await sshService.executeCommand(serverId, `bash ${scriptPath} 21`);
        console.log('升级核心脚本结果:', upgradeResult);
      } catch (upgradeError) {
        console.error('运行升级命令失败:', upgradeError);
      }
    }

    res.status(200).json({
      success: true,
      exists: scriptExists,
      location: location,
      message: scriptExists ? 'Nftato脚本已部署' : 'Nftato脚本未部署',
      upgradeResult: upgradeResult ? {
        success: true,
        stdout: upgradeResult.stdout,
        stderr: upgradeResult.stderr
      } : null
    });
  } catch (error) {
    console.error('检查脚本存在状态失败:', error);
    res.status(500).json({
      success: false,
      message: '检查脚本存在状态失败',
      error: error.message
    });
  }
};

/**
 * 测试服务器连接
 */
exports.testConnection = async (req, res) => {
  try {
    // 获取请求中的服务器信息
    const serverData = req.body;
    
    console.log('接收到测试连接请求:', {
      host: serverData.host,
      port: serverData.port,
      username: serverData.username,
      authType: serverData.authType
    });
    
    if (!serverData.host || !serverData.username) {
      return res.status(400).json({
        success: false,
        message: '缺少必要的连接信息'
      });
    }
    
    // 测试连接
    const result = await sshService.testConnection(serverData);
    
    res.status(200).json({
      success: true,
      message: '连接测试成功',
      data: result
    });
  } catch (error) {
    console.error('测试连接失败:', error);
    res.status(400).json({
      success: false,
      message: '连接测试失败: ' + error.message
    });
  }
}; 