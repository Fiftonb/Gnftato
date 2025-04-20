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

const dataFilePath = path.join(dataDir, 'rules.json');

console.log(`Rule模型使用的数据文件路径: ${dataFilePath}`);

// 确保data目录存在
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
  console.log(`从Rule模型创建的数据目录: ${dataDir}`);
}

// 确保JSON文件存在
if (!fs.existsSync(dataFilePath)) {
  fs.writeFileSync(dataFilePath, JSON.stringify({ rules: [] }, null, 2));
  console.log(`从Rule模型创建的规则数据文件: ${dataFilePath}`);
}

class Rule {
  constructor(data) {
    this._id = data._id || uuidv4();
    this.name = data.name;
    this.server = data.server;
    this.protocol = data.protocol || 'tcp';
    this.sourceIP = data.sourceIP || 'any';
    this.sourcePort = data.sourcePort || 'any';
    this.destinationIP = data.destinationIP || 'any';
    this.destinationPort = data.destinationPort || 'any';
    this.action = data.action || 'ACCEPT';
    this.chain = data.chain || 'INPUT';
    this.priority = data.priority || 0;
    this.enabled = data.enabled !== undefined ? data.enabled : true;
    this.description = data.description || '';
    this.createdAt = data.createdAt || new Date().toISOString();
    this.updatedAt = data.updatedAt || new Date().toISOString();
  }

  // 获取所有规则
  static find(query = {}) {
    try {
      const data = JSON.parse(fs.readFileSync(dataFilePath, 'utf8'));
      
      if (Object.keys(query).length === 0) {
        return Promise.resolve(data.rules);
      }
      
      // 过滤规则
      const filteredRules = data.rules.filter(rule => {
        for (const [key, value] of Object.entries(query)) {
          if (rule[key] !== value) {
            return false;
          }
        }
        return true;
      });
      
      return Promise.resolve(filteredRules);
    } catch (error) {
      return Promise.reject(error);
    }
  }

  // 根据ID查找规则
  static findById(id) {
    try {
      const data = JSON.parse(fs.readFileSync(dataFilePath, 'utf8'));
      const rule = data.rules.find(rule => rule._id === id);
      return Promise.resolve(rule || null);
    } catch (error) {
      return Promise.reject(error);
    }
  }

  // 创建新规则
  static create(ruleData) {
    try {
      const data = JSON.parse(fs.readFileSync(dataFilePath, 'utf8'));
      const newRule = new Rule(ruleData);
      data.rules.push(newRule);
      fs.writeFileSync(dataFilePath, JSON.stringify(data, null, 2));
      return Promise.resolve(newRule);
    } catch (error) {
      return Promise.reject(error);
    }
  }

  // 更新规则信息
  static findByIdAndUpdate(id, updateData) {
    try {
      const data = JSON.parse(fs.readFileSync(dataFilePath, 'utf8'));
      const ruleIndex = data.rules.findIndex(rule => rule._id === id);
      
      if (ruleIndex === -1) {
        return Promise.resolve(null);
      }
      
      const updatedRule = { 
        ...data.rules[ruleIndex], 
        ...updateData, 
        updatedAt: new Date().toISOString() 
      };
      
      data.rules[ruleIndex] = updatedRule;
      fs.writeFileSync(dataFilePath, JSON.stringify(data, null, 2));
      
      return Promise.resolve(updatedRule);
    } catch (error) {
      return Promise.reject(error);
    }
  }

  // 删除规则
  static findByIdAndDelete(id) {
    try {
      const data = JSON.parse(fs.readFileSync(dataFilePath, 'utf8'));
      const ruleIndex = data.rules.findIndex(rule => rule._id === id);
      
      if (ruleIndex === -1) {
        return Promise.resolve(null);
      }
      
      const deletedRule = data.rules[ruleIndex];
      data.rules.splice(ruleIndex, 1);
      fs.writeFileSync(dataFilePath, JSON.stringify(data, null, 2));
      
      return Promise.resolve(deletedRule);
    } catch (error) {
      return Promise.reject(error);
    }
  }
  
  // 根据服务器ID删除所有规则
  static deleteByServerId(serverId) {
    try {
      const data = JSON.parse(fs.readFileSync(dataFilePath, 'utf8'));
      const originalLength = data.rules.length;
      
      data.rules = data.rules.filter(rule => rule.server !== serverId);
      
      const deletedCount = originalLength - data.rules.length;
      
      if (deletedCount > 0) {
        fs.writeFileSync(dataFilePath, JSON.stringify(data, null, 2));
      }
      
      return Promise.resolve({ deletedCount });
    } catch (error) {
      return Promise.reject(error);
    }
  }
}

module.exports = Rule; 