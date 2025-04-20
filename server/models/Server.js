const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
// 加载根目录的环境变量文件
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

// 使用环境变量中的DATA_DIR或默认路径，处理相对路径
let dataDir;
if (process.env.DATA_DIR) {
  // 处理相对路径，将它转换为相对于项目根目录的绝对路径
  if (process.env.DATA_DIR.startsWith('./')) {
    dataDir = path.join(__dirname, '../..', process.env.DATA_DIR.substring(2));
  } else {
    dataDir = path.resolve(process.env.DATA_DIR);
  }
} else {
  dataDir = path.join(__dirname, '../data');
}

const dataFilePath = path.join(dataDir, 'servers.json');

console.log(`Server模型使用的数据文件路径: ${dataFilePath}`);

// 确保data目录存在
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
  console.log(`从Server模型创建的数据目录: ${dataDir}`);
}

// 确保JSON文件存在
if (!fs.existsSync(dataFilePath)) {
  fs.writeFileSync(dataFilePath, JSON.stringify({ servers: [] }, null, 2));
  console.log(`从Server模型创建的服务器数据文件: ${dataFilePath}`);
}

class Server {
  constructor(data) {
    this._id = data._id || uuidv4();
    this.name = data.name;
    this.host = data.host;
    this.port = data.port || 22;
    this.username = data.username;
    this.authType = data.authType || 'password';
    this.password = data.password;
    this.privateKey = data.privateKey;
    this.status = data.status || 'offline';
    this.lastConnection = data.lastConnection || null;
    this.createdAt = data.createdAt || new Date().toISOString();
    this.updatedAt = data.updatedAt || new Date().toISOString();
  }

  // 获取所有服务器
  static find() {
    try {
      const data = JSON.parse(fs.readFileSync(dataFilePath, 'utf8'));
      return Promise.resolve(data.servers);
    } catch (error) {
      return Promise.reject(error);
    }
  }

  // 根据ID查找服务器
  static findById(id) {
    try {
      const data = JSON.parse(fs.readFileSync(dataFilePath, 'utf8'));
      const server = data.servers.find(server => server._id === id);
      return Promise.resolve(server || null);
    } catch (error) {
      return Promise.reject(error);
    }
  }

  // 创建新服务器
  static create(serverData) {
    try {
      const data = JSON.parse(fs.readFileSync(dataFilePath, 'utf8'));
      const newServer = new Server(serverData);
      data.servers.push(newServer);
      fs.writeFileSync(dataFilePath, JSON.stringify(data, null, 2));
      return Promise.resolve(newServer);
    } catch (error) {
      return Promise.reject(error);
    }
  }

  // 更新服务器信息
  static findByIdAndUpdate(id, updateData) {
    try {
      const data = JSON.parse(fs.readFileSync(dataFilePath, 'utf8'));
      const serverIndex = data.servers.findIndex(server => server._id === id);
      
      if (serverIndex === -1) {
        return Promise.resolve(null);
      }
      
      const updatedServer = { 
        ...data.servers[serverIndex], 
        ...updateData, 
        updatedAt: new Date().toISOString() 
      };
      
      data.servers[serverIndex] = updatedServer;
      fs.writeFileSync(dataFilePath, JSON.stringify(data, null, 2));
      
      return Promise.resolve(updatedServer);
    } catch (error) {
      return Promise.reject(error);
    }
  }

  // 删除服务器
  static findByIdAndDelete(id) {
    try {
      const data = JSON.parse(fs.readFileSync(dataFilePath, 'utf8'));
      const serverIndex = data.servers.findIndex(server => server._id === id);
      
      if (serverIndex === -1) {
        return Promise.resolve(null);
      }
      
      const deletedServer = data.servers[serverIndex];
      data.servers.splice(serverIndex, 1);
      fs.writeFileSync(dataFilePath, JSON.stringify(data, null, 2));
      
      return Promise.resolve(deletedServer);
    } catch (error) {
      return Promise.reject(error);
    }
  }
}

module.exports = Server; 