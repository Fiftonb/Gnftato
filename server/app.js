const express = require('express');
const cors = require('cors');
const path = require('node:path');
const fs = require('node:fs');
const http = require('node:http');
const { Server: SocketServer } = require('socket.io');
const { loadRuntimeConfig } = require('./config/runtime');

function createApplication() {
  const { dataDir } = loadRuntimeConfig();
  for (const [name, data] of Object.entries({ servers: [], rules: [], users: [] })) {
    const file = path.join(dataDir, `${name}.json`);
    if (!fs.existsSync(file)) fs.writeFileSync(file, JSON.stringify({ [name]: data }, null, 2), { mode: 0o600 });
  }
  const { authenticateToken } = require('./middlewares/authMiddleware');
  const sshService = require('./services/sshService');
  const app = express();
  app.disable('x-powered-by');
  const server = http.createServer(app);
  const configuredOrigins = (process.env.CORS_ORIGIN || '').split(',').map(value => value.trim()).filter(Boolean);
  const corsOptions = {
    origin: configuredOrigins.includes('*') ? '*' : (configuredOrigins.length ? configuredOrigins : false),
    credentials: false,
    optionsSuccessStatus: 200
  };
  app.use(cors(corsOptions));
  app.use(express.json({ limit: '100kb' }));
  app.use(express.urlencoded({ extended: false, limit: '100kb', parameterLimit: 100 }));
  app.use(express.static(path.join(__dirname, 'public'), { dotfiles: 'deny' }));

  const io = new SocketServer(server, { cors: corsOptions, maxHttpBufferSize: 100 * 1024 });
  app.io = io;
  app.locals.deployingServers = new Set();

  function authorizeSocket(socket) {
    const user = authenticateToken(socket.data.token);
    if (!user.isAdmin) throw new Error('此操作需要管理员权限');
    socket.data.user = user;
    return user;
  }
  io.use((socket, next) => {
    try {
      socket.data.token = socket.handshake.auth && socket.handshake.auth.token;
      authorizeSocket(socket);
      next();
    } catch (error) {
      const failure = new Error('登录已失效或无管理员权限');
      failure.data = { code: 'UNAUTHORIZED' };
      next(failure);
    }
  });
  io.on('connection', socket => {
    socket.join(`user:${socket.data.user.id}`);
    function checkSession() {
      try {
        authorizeSocket(socket);
        return true;
      } catch (error) {
        socket.emit('deploy_complete', { success: false, error: '登录已失效或无管理员权限' });
        socket.emit('auth_error', { message: '登录已失效，请重新登录' });
        socket.disconnect(true);
        return false;
      }
    }
    socket.on('heartbeat', () => {
      if (checkSession()) socket.emit('heartbeat_response', { timestamp: Date.now() });
    });
    socket.on('start_deploy', async data => {
      if (!checkSession()) return;
      const serverId = data && data.serverId;
      if (typeof serverId !== 'string' || !serverId.trim() || serverId.length > 128) {
        socket.emit('deploy_complete', { success: false, error: '缺少或无效的服务器ID参数' });
        return;
      }
      if (app.locals.deployingServers.has(serverId)) {
        socket.emit('deploy_complete', { success: false, error: '该服务器已有部署任务正在执行' });
        return;
      }
      app.locals.deployingServers.add(serverId);
      try {
        const logCallback = (message, type = 'log') => {
          if (socket.connected && checkSession() && typeof message === 'string' && message.trim()) {
            socket.emit('deploy_log', { type, message: message.trim() });
          }
        };
        logCallback(`开始为服务器 ${serverId} 部署Nftato脚本...`);
        const result = await sshService.deployIptatoWithLogs(serverId, logCallback);
        if (socket.connected && checkSession()) {
          socket.emit('deploy_complete', { success: result.success, error: result.error });
        }
      } catch (error) {
        if (socket.connected) socket.emit('deploy_complete', { success: false, error: error.message });
      } finally {
        app.locals.deployingServers.delete(serverId);
      }
    });
  });

  app.use('/api/auth', require('./routes/authRoutes'));
  app.use('/api/servers', require('./routes/serverRoutes'));
  app.use('/api/rules', require('./routes/rulesRoutes'));
  app.use('/api', (req, res) => res.status(404).json({ success: false, message: '接口不存在' }));
  app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public/index.html')));
  app.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    const status = error.status === 413 ? 413 : error.status === 400 ? 400 : 500;
    res.status(status).json({ success: false, message: status === 500 ? '服务器内部错误' : '请求内容无效或过大' });
  });
  return { app, server, io };
}

if (require.main === module) {
  try {
    const { server } = createApplication();
    const port = Number(process.env.PORT || 3001);
    const host = process.env.HOST || '0.0.0.0';
    server.listen(port, host, () => console.log(`服务器运行在 http://${host}:${server.address().port}`));
  } catch (error) {
    console.error(`启动失败: ${error.message}`);
    process.exitCode = 1;
  }
}

module.exports = { createApplication };
