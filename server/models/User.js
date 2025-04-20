const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');

class User {
  constructor() {
    // 获取用户数据文件路径
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
    
    this.usersFilePath = path.join(dataDir, 'users.json');
    
    // 如果用户数据文件不存在，创建一个空的
    if (!fs.existsSync(this.usersFilePath)) {
      fs.writeFileSync(this.usersFilePath, JSON.stringify({ users: [] }, null, 2));
    }
  }

  // 获取所有用户
  getUsers() {
    const data = fs.readFileSync(this.usersFilePath, 'utf8');
    return JSON.parse(data).users;
  }

  // 保存用户数据
  saveUsers(users) {
    fs.writeFileSync(this.usersFilePath, JSON.stringify({ users }, null, 2));
  }

  // 通过用户名查找用户
  findUserByUsername(username) {
    const users = this.getUsers();
    return users.find(user => user.username === username);
  }

  // 创建新用户
  async createUser(username, password) {
    // 检查用户名是否已存在
    if (this.findUserByUsername(username)) {
      throw new Error('用户名已存在');
    }

    const users = this.getUsers();
    
    // 加密密码
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);
    
    // 创建新用户
    const newUser = {
      id: Date.now().toString(),
      username,
      password: hashedPassword,
      createdAt: new Date().toISOString()
    };
    
    users.push(newUser);
    this.saveUsers(users);
    
    // 返回不含密码的用户信息
    const { password: _, ...userWithoutPassword } = newUser;
    return userWithoutPassword;
  }

  // 验证用户登录
  async validateUser(username, password) {
    const user = this.findUserByUsername(username);
    
    if (!user) {
      return null;
    }
    
    const isMatch = await bcrypt.compare(password, user.password);
    
    if (!isMatch) {
      return null;
    }
    
    // 返回不含密码的用户信息
    const { password: _, ...userWithoutPassword } = user;
    return userWithoutPassword;
  }

  // 更新用户密码
  async updatePassword(userId, newPassword) {
    const users = this.getUsers();
    const userIndex = users.findIndex(user => user.id === userId);
    
    if (userIndex === -1) {
      throw new Error('用户不存在');
    }
    
    // 加密新密码
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(newPassword, salt);
    
    // 更新用户密码
    users[userIndex].password = hashedPassword;
    users[userIndex].updatedAt = new Date().toISOString();
    
    // 保存更新
    this.saveUsers(users);
    
    return true;
  }
}

module.exports = new User(); 