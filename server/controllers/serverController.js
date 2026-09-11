'use strict';

const Server = require('../models/Server');
const sshService = require('../services/sshService');
const { asyncHandler, httpError } = require('./controllerUtils');

const editableFields = new Set(['name', 'host', 'port', 'username', 'authType', 'password', 'privateKey']);
const credentials = server => {
  const { password, privateKey, ...safe } = server;
  return safe;
};
const connectionState = serverId => {
  if (typeof sshService.getConnectionStatus === 'function') {
    sshService.checkConnection(serverId);
    return sshService.getConnectionStatus(serverId);
  }
  const connected = Boolean(sshService.connections[serverId]) && sshService.checkConnection(serverId);
  return { status: connected ? 'online' : 'offline', connected, valid: connected, lastConnection: null, changedAt: null, error: null };
};
const publicServer = server => {
  const state = connectionState(server._id);
  return { ...credentials(server), ...state, lastConnection: state.lastConnection || server.lastConnection || null };
};
const requireServer = async id => {
  const server = await Server.findById(id);
  if (!server) throw httpError(404, '服务器未找到');
  return server;
};

exports.getAllServers = asyncHandler(async (req, res) => {
  const servers = await Server.find();
  res.json({ success: true, data: servers.map(publicServer) });
});

exports.getServer = asyncHandler(async (req, res) => {
  res.json({ success: true, data: publicServer(await requireServer(req.params.id)) });
});

exports.createServer = asyncHandler(async (req, res) => {
  const data = Object.fromEntries(Object.entries(req.body || {}).filter(([key]) => editableFields.has(key)));
  if (!data.name || !data.host || !data.username) throw httpError(400, '服务器名称、主机和用户名不能为空');
  const server = await Server.create(data);
  res.status(201).json({ success: true, data: publicServer(server), message: '服务器添加成功' });
});

exports.updateServer = asyncHandler(async (req, res) => {
  const data = Object.fromEntries(Object.entries(req.body || {}).filter(([key, value]) => editableFields.has(key) && value !== ''));
  const server = await Server.findByIdAndUpdate(req.params.id, data);
  if (!server) throw httpError(404, '服务器未找到');
  res.json({ success: true, data: publicServer(server), message: '服务器信息更新成功' });
});

exports.deleteServer = asyncHandler(async (req, res) => {
  if (sshService.connections[req.params.id]) await sshService.disconnect(req.params.id);
  const server = await Server.findByIdAndDelete(req.params.id);
  if (!server) throw httpError(404, '服务器未找到');
  res.json({ success: true, message: '服务器已删除' });
});

exports.connectServer = asyncHandler(async (req, res) => {
  await requireServer(req.params.id);
  try {
    const result = await sshService.connect(req.params.id);
    const state = connectionState(req.params.id);
    res.json({ success: true, message: result.message, serverStatus: state.status, connectionTime: state.lastConnection, data: state });
  } catch (error) {
    const state = connectionState(req.params.id);
    res.status(500).json({ success: false, message: '连接服务器失败', error: error.message, serverStatus: state.status, data: state });
  }
});

exports.disconnectServer = asyncHandler(async (req, res) => {
  await requireServer(req.params.id);
  try {
    const result = await sshService.disconnect(req.params.id);
    const state = connectionState(req.params.id);
    res.json({ success: true, message: result.message, serverStatus: state.status, data: state });
  } catch (error) {
    const state = connectionState(req.params.id);
    res.status(500).json({ success: false, message: '断开服务器连接失败', error: error.message, serverStatus: state.status, data: state });
  }
});

exports.executeCommand = asyncHandler(async (req, res) => {
  const command = req.body?.command;
  if (typeof command !== 'string' || !command.trim()) throw httpError(400, '命令不能为空');
  if (command.length > 8192 || /[\0\r]/.test(command)) throw httpError(400, '命令内容无效或过长');
  await requireServer(req.params.id);
  if (!sshService.checkConnection(req.params.id)) await sshService.connect(req.params.id);
  // Arbitrary administrator commands are conservatively treated as mutations.
  try {
    const execute = () => sshService.executeCommand(req.params.id, command, { readOnly: false });
    const result = sshService.mutationQueue
      ? await sshService.mutationQueue.run(req.params.id, execute)
      : await execute();
    res.json({ success: true, data: { stdout: result.stdout, stderr: result.stderr, code: result.code } });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: '执行命令失败',
      error: error.message,
      outcomeUnknown: error.outcomeUnknown === true
    });
  }
});

exports.checkServerStatus = asyncHandler(async (req, res) => {
  const server = await requireServer(req.params.id);
  const state = connectionState(req.params.id);
  res.json({
    success: true,
    data: {
      ...state,
      lastConnection: state.lastConnection || server.lastConnection || null,
      backendConnected: state.connected,
      backendConnectionValid: state.valid
    }
  });
});

exports.deployIptato = asyncHandler(async (req, res) => {
  const serverId = req.params.id;
  await requireServer(serverId);
  if (!sshService.checkConnection(serverId)) throw httpError(400, '服务器未连接，请先连接服务器');
  if (req.app.locals.deployingServers.has(serverId)) throw httpError(409, '该服务器已有部署任务正在执行');
  req.app.locals.deployingServers.add(serverId);
  try {
    const useWebSocket = req.query.useWebSocket === 'true' || req.body?.useWebSocket === true;
    if (!useWebSocket || !req.app.io) {
      try {
        await sshService.deployIptato(serverId);
        return res.json({ success: true, message: '脚本部署成功' });
      } catch (error) {
        return res.status(500).json({
          success: false,
          message: '部署Nftato脚本失败',
          error: error.message,
          outcomeUnknown: error.outcomeUnknown === true
        });
      }
    }
    res.json({ success: true, message: '脚本部署已开始，请通过WebSocket接收进度', useWebSocket: true });
    const roomId = `deploy_${serverId}_${Date.now()}`;
    const room = `user:${req.user.id}`;
    req.app.io.to(room).emit('deploy_start', { serverId, roomId, message: '开始部署过程，请等待...' });
    try {
      await sshService.deployIptato(serverId, data => req.app.io.to(room).emit(roomId, data));
      req.app.io.to(room).emit(roomId, { type: 'complete', success: true, message: '脚本部署成功完成！' });
    } catch (error) {
      req.app.io.to(room).emit(roomId, { type: 'error', success: false, message: `部署失败: ${error.message}` });
    } finally {
      setTimeout(() => req.app.io.to(room).emit(roomId, { type: 'close' }), 1000);
    }
  } finally {
    req.app.locals.deployingServers.delete(serverId);
  }
});

exports.getServerLogs = asyncHandler(async (req, res) => {
  const server = await requireServer(req.params.id);
  const state = connectionState(req.params.id);
  const timestamp = new Date().toISOString();
  const logs = [
    `[${timestamp}] 服务器ID: ${req.params.id}`,
    `[${timestamp}] 服务器名称: ${server.name}`,
    `[${timestamp}] 连接状态: ${state.status}`,
    `[${timestamp}] 后端连接有效: ${state.valid ? '是' : '否'}`
  ];
  if (state.error) logs.push(`[${timestamp}] 最近错误: ${state.error}`);
  res.json({ success: true, data: logs.join('\n'), connectionStatus: state });
});

exports.checkScriptExists = asyncHandler(async (req, res) => {
  await requireServer(req.params.id);
  if (!sshService.checkConnection(req.params.id)) throw httpError(400, '服务器未连接，请先连接服务器');
  const result = await sshService.executeCommand(
    req.params.id,
    'if [ -f /root/Nftato.sh ]; then printf root; elif [ -f "$HOME/Nftato.sh" ]; then printf home; else printf missing; fi',
    { readOnly: true }
  );
  const location = result.stdout.trim();
  const exists = location === 'root' || location === 'home';
  res.json({
    success: true,
    exists,
    location: location === 'root' ? '/root/Nftato.sh' : location === 'home' ? '~/Nftato.sh' : '',
    message: exists ? 'Nftato脚本已部署' : 'Nftato脚本未部署',
    upgradeResult: null
  });
});

exports.testConnection = asyncHandler(async (req, res) => {
  if (!req.body?.host || !req.body?.username) throw httpError(400, '缺少必要的连接信息');
  try {
    const result = await sshService.testConnection(req.body);
    res.json({ success: true, message: '连接测试成功', data: result });
  } catch (error) {
    res.status(400).json({ success: false, message: `连接测试失败: ${error.message}` });
  }
});
