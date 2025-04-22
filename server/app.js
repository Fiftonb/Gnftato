const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const http = require('http');
const socketIO = require('socket.io');

// 尝试加载环境变量
const dotenvPath = path.join(__dirname, '../.env');
if (fs.existsSync(dotenvPath)) {
  // 如果.env文件存在，使用dotenv加载
  require('dotenv').config({ path: dotenvPath });
  console.log('已从.env文件加载环境变量');
} else {
  // 如果.env文件不存在，尝试从config.json加载
  const configPath = path.join(__dirname, 'config.json');
  if (fs.existsSync(configPath)) {
    try {
      const config = require(configPath);
      console.log('从config.json加载环境变量');
      // 将配置项添加到process.env
      Object.keys(config).forEach(key => {
        process.env[key] = config[key];
      });
    } catch (error) {
      console.error('加载config.json时出错:', error);
    }
  } else {
    console.warn('警告: 找不到.env文件或config.json文件，将使用默认环境变量');
  }
}

// 打印环境变量
console.log('===== 服务器配置 =====');
console.log(`NODE_ENV: ${process.env.NODE_ENV}`);
console.log(`PORT: ${process.env.PORT || 3001}`);
console.log(`CORS_ORIGIN: ${process.env.CORS_ORIGIN}`);
console.log(`STABLE_MODE: ${process.env.STABLE_MODE}`);
console.log('======================');

// 导入路由
const serverRoutes = require('./routes/serverRoutes');
const rulesRoutes = require('./routes/rulesRoutes');
const authRoutes = require('./routes/authRoutes');

// 创建Express应用
const app = express();

// 创建HTTP服务器
const server = http.createServer(app);

// CORS配置
const corsOptions = {
  origin: process.env.CORS_ORIGIN === '*' 
    ? true // 允许所有来源
    : (process.env.CORS_ORIGIN || 'http://localhost:8080').split(','),
  credentials: true,
  optionsSuccessStatus: 200
};
console.log(`CORS配置: ${process.env.CORS_ORIGIN === '*' ? '允许所有来源' : '允许来源 ' + corsOptions.origin}`);

// 中间件
app.use(cors(corsOptions));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 静态文件服务
app.use(express.static(path.join(__dirname, 'public')));

// 使用环境变量中的DATA_DIR或默认路径，处理相对路径
let dataDir;
if (process.env.DATA_DIR) {
  // 处理相对路径，将它转换为相对于项目根目录的绝对路径
  if (process.env.DATA_DIR.startsWith('./')) {
    dataDir = path.join(__dirname, '..', process.env.DATA_DIR.substring(2));
  } else {
    dataDir = path.resolve(process.env.DATA_DIR);
  }
} else {
  dataDir = path.join(__dirname, 'data');
}

console.log(`使用的数据目录: ${dataDir}`);

// 检查并创建数据目录
if (!fs.existsSync(dataDir)) {
  // 使用recursive确保所有必要的父目录也会被创建
  fs.mkdirSync(dataDir, { recursive: true });
  console.log(`数据目录已创建: ${dataDir}`);
}

// 检查并创建服务器数据文件
const serversDataPath = path.join(dataDir, 'servers.json');
if (!fs.existsSync(serversDataPath)) {
  fs.writeFileSync(serversDataPath, JSON.stringify({ servers: [] }, null, 2));
  console.log(`服务器数据文件已创建: ${serversDataPath}`);
}

// 检查并创建规则数据文件
const rulesDataPath = path.join(dataDir, 'rules.json');
if (!fs.existsSync(rulesDataPath)) {
  fs.writeFileSync(rulesDataPath, JSON.stringify({ rules: [] }, null, 2));
  console.log(`规则数据文件已创建: ${rulesDataPath}`);
}

// 检查并创建用户数据文件
const usersDataPath = path.join(dataDir, 'users.json');
if (!fs.existsSync(usersDataPath)) {
  fs.writeFileSync(usersDataPath, JSON.stringify({ users: [] }, null, 2));
  console.log(`用户数据文件已创建: ${usersDataPath}`);
}

// 检查并创建脚本目录
const scriptsDir = path.join(__dirname, 'scripts');
if (!fs.existsSync(scriptsDir)) {
  fs.mkdirSync(scriptsDir, { recursive: true });
}

// 检查并复制脚本文件
const sourceScriptPath = path.join(__dirname, '../Nftato.sh');
const targetScriptPath = path.join(scriptsDir, 'Nftato.sh');
if (fs.existsSync(sourceScriptPath) && !fs.existsSync(targetScriptPath)) {
  fs.copyFileSync(sourceScriptPath, targetScriptPath);
}

// 创建Socket.IO实例
const io = socketIO(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// 将io实例添加到app对象，以便在路由中访问
app.io = io;

// WebSocket连接处理
io.on('connection', (socket) => {
  console.log('新的WebSocket连接:', socket.id);
  
  // 处理部署请求
  socket.on('start_deploy', async (data) => {
    console.log('收到部署请求:', data);
    const { serverId } = data;
    
    if (!serverId) {
      socket.emit('deploy_log', { 
        type: 'error', 
        message: '缺少服务器ID参数' 
      });
      socket.emit('deploy_complete', { success: false, error: '缺少服务器ID参数' });
      return;
    }
    
    try {
      // 引入SSH服务
      const sshService = require('./services/sshService');
      
      // 发送初始日志
      socket.emit('deploy_log', { 
        type: 'log', 
        message: `开始为服务器 ${serverId} 部署Nftato脚本...` 
      });
      
      // 创建日志回调函数
      const logCallback = (message, type = 'log') => {
        if (typeof message === 'string' && message.trim()) {
          socket.emit('deploy_log', { type, message: message.trim() });
        }
      };
      
      // 开始部署过程
      console.log('开始部署进程...');
      const result = await sshService.deployIptatoWithLogs(serverId, logCallback);
      console.log('部署结果:', result);
      
      // 发送完成信号
      socket.emit('deploy_complete', { 
        success: result.success,
        error: result.error
      });
      
    } catch (error) {
      console.error('部署过程出错:', error);
      socket.emit('deploy_log', { 
        type: 'error', 
        message: `部署出错: ${error.message}` 
      });
      socket.emit('deploy_complete', { 
        success: false, 
        error: error.message 
      });
    }
  });
  
  // 处理断开连接
  socket.on('disconnect', () => {
    console.log('WebSocket连接断开:', socket.id);
  });
});

// API路由
app.use('/api/auth', authRoutes);
app.use('/api/servers', serverRoutes);
app.use('/api/rules', rulesRoutes);

// 前端路由处理
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/index.html'));
});

// 错误处理中间件
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    success: false,
    message: '服务器内部错误',
    error: err.message
  });
});

// 启动服务器
const PORT = process.env.PORT || 3001;
const HOST = process.env.HOST || '0.0.0.0';
server.listen(PORT, HOST, () => {
  console.log(`服务器运行在 http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}`);
  console.log(`WebSocket服务已启动`);
  if (HOST === '0.0.0.0') {
    console.log(`在Docker或远程环境中，可通过服务器IP访问：http://服务器IP:${PORT}`);
  }
}); 