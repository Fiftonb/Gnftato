/**
 * 创建管理员账户的脚本
 * 
 * 用法: node createAdmin.js
 */

const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

// 默认管理员配置
const DEFAULT_ADMIN = {
  username: 'admin',
  password: 'admin123'
};

// 数据目录
let dataDir;
if (process.env.DATA_DIR) {
  if (process.env.DATA_DIR.startsWith('./')) {
    dataDir = path.join(__dirname, '../..', process.env.DATA_DIR.substring(2));
  } else {
    dataDir = path.resolve(process.env.DATA_DIR);
  }
} else {
  dataDir = path.join(__dirname, '../data');
}

// 用户数据文件路径
const usersFilePath = path.join(dataDir, 'users.json');

// 检查并创建数据目录
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
  console.log(`数据目录已创建: ${dataDir}`);
}

// 读取现有用户或创建空数组
let users = [];
if (fs.existsSync(usersFilePath)) {
  try {
    const data = fs.readFileSync(usersFilePath, 'utf8');
    users = JSON.parse(data).users;
  } catch (error) {
    console.error('读取用户数据失败:', error);
    process.exit(1);
  }
}

// 检查是否已存在管理员
const adminExists = users.some(user => user.username === DEFAULT_ADMIN.username);

if (adminExists) {
  console.log(`管理员账户 '${DEFAULT_ADMIN.username}' 已存在，无需创建`);
  process.exit(0);
}

// 创建管理员账户
async function createAdmin() {
  try {
    // 加密密码
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(DEFAULT_ADMIN.password, salt);
    
    // 创建管理员用户
    const admin = {
      id: Date.now().toString(),
      username: DEFAULT_ADMIN.username,
      password: hashedPassword,
      isAdmin: true,
      createdAt: new Date().toISOString()
    };
    
    // 添加到用户列表
    users.push(admin);
    
    // 保存到文件
    fs.writeFileSync(usersFilePath, JSON.stringify({ users }, null, 2));
    
    console.log('管理员账户创建成功!');
    console.log(`用户名: ${DEFAULT_ADMIN.username}`);
    console.log(`密码: ${DEFAULT_ADMIN.password}`);
    console.log('请登录后立即修改默认密码');
  } catch (error) {
    console.error('创建管理员失败:', error);
    process.exit(1);
  }
}

createAdmin(); 