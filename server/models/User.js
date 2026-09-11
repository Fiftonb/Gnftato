const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const bcrypt = require('bcryptjs');
const { getDataDir } = require('../config/runtime');

class User {
  constructor() {
    const dataDir = getDataDir();
    fs.mkdirSync(dataDir, { recursive: true });
    this.usersFilePath = path.join(dataDir, 'users.json');
    if (!fs.existsSync(this.usersFilePath)) this.saveUsers([]);
  }
  getUsers() {
    const data = JSON.parse(fs.readFileSync(this.usersFilePath, 'utf8'));
    if (!Array.isArray(data.users)) throw new Error('用户数据格式错误');
    return data.users;
  }
  saveUsers(users) {
    const temporaryFile = `${this.usersFilePath}.${process.pid}.tmp`;
    fs.writeFileSync(temporaryFile, JSON.stringify({ users }, null, 2), { mode: 0o600 });
    fs.renameSync(temporaryFile, this.usersFilePath);
  }
  findUserByUsername(username) {
    return this.getUsers().find(user => user.username === username);
  }
  validatePassword(password) {
    if (typeof password !== 'string' || password.trim().length < 12 || Buffer.byteLength(password, 'utf8') > 72) {
      throw new Error('新密码至少 12 个字符，且 UTF-8 长度不能超过 72 字节');
    }
  }
  async createUser(username, password, options = {}) {
    if (typeof username !== 'string' || !username.trim() || username.length > 100) {
      throw new Error('用户名不能为空且不能超过 100 个字符');
    }
    this.validatePassword(password);
    const hashedPassword = await bcrypt.hash(password, 10);
    // Re-read after hashing so concurrent creations cannot overwrite each other.
    const users = this.getUsers();
    if (users.some(user => user.username === username)) throw new Error('用户名已存在');
    const user = {
      id: randomUUID(), username, password: hashedPassword,
      isAdmin: options.isAdmin === true, tokenVersion: 0,
      createdAt: new Date().toISOString()
    };
    users.push(user);
    this.saveUsers(users);
    const { password: _, ...safeUser } = user;
    return safeUser;
  }
  async validateUser(username, password) {
    // Existing hashes may predate the new password policy; keep legacy logins working.
    if (typeof username !== 'string' || typeof password !== 'string') return null;
    const user = this.findUserByUsername(username);
    if (!user || !await bcrypt.compare(password, user.password)) return null;
    const { password: _, ...safeUser } = user;
    return safeUser;
  }
  async updatePassword(userId, newPassword, username) {
    if (typeof username !== 'string' || !username) throw new Error('用户名不能为空');
    this.validatePassword(newPassword);
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    const users = this.getUsers();
    // Legacy timestamp IDs can collide; the authenticated username disambiguates them.
    const user = users.find(entry => entry.id === userId && entry.username === username);
    if (!user) throw new Error('用户不存在');
    user.password = hashedPassword;
    user.tokenVersion = (user.tokenVersion ?? 0) + 1;
    user.updatedAt = new Date().toISOString();
    this.saveUsers(users);
    return user;
  }
}
module.exports = new User();
