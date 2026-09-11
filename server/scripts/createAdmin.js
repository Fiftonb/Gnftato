/**
 * Initialize an administrator using ADMIN_USERNAME / ADMIN_PASSWORD.
 * Existing administrators and passwords are never overwritten.
 */
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { loadRuntimeConfig } = require('../config/runtime');

async function createAdmin() {
  const { dataDir } = loadRuntimeConfig();
  const usersFilePath = path.join(dataDir, 'users.json');
  let users = [];
  if (fs.existsSync(usersFilePath)) {
    let database;
    try {
      database = JSON.parse(fs.readFileSync(usersFilePath, 'utf8'));
    } catch {
      throw new Error('无法读取用户数据；请检查 users.json，原文件未修改。');
    }
    if (!database || !Array.isArray(database.users) ||
        database.users.some(user => !user || typeof user !== 'object' ||
          typeof user.username !== 'string')) {
      throw new Error('用户数据格式错误；请检查 users.json，原文件未修改。');
    }
    users = database.users;
  }

  const username = (process.env.ADMIN_USERNAME || 'admin').trim();
  const password = process.env.ADMIN_PASSWORD;
  const existingUser = users.find(user => user.username === username);
  if (existingUser && existingUser.isAdmin === true) {
    console.log(`管理员账户 '${username}' 已存在，保留原密码。`);
    return;
  }

  if (users.some(user => user.isAdmin === true) && !password) {
    console.log('已有管理员账户，保留现有账户和密码。');
    return;
  }
  if (existingUser) {
    throw new Error('ADMIN_USERNAME 已被普通用户占用，未修改该用户权限；请使用未占用的 ADMIN_USERNAME 和 ADMIN_PASSWORD 创建管理员。');
  }
  if (!password) {
    throw new Error('尚无可用管理员。首次启动必须设置 ADMIN_PASSWORD；可通过 ADMIN_USERNAME 指定用户名（默认为 admin）。');
  }
  if (!username || username.length > 64) {
    throw new Error('ADMIN_USERNAME 必须为 1 至 64 个字符。');
  }
  if (password.trim().length < 12 || Buffer.byteLength(password, 'utf8') > 72) {
    throw new Error('ADMIN_PASSWORD 去除首尾空白后至少需要 12 个字符，且 UTF-8 编码不超过 72 字节。');
  }

  const passwordHash = await bcrypt.hash(password, 10);
  users.push({
    id: crypto.randomUUID(),
    username,
    password: passwordHash,
    isAdmin: true,
    tokenVersion: 0,
    createdAt: new Date().toISOString()
  });
  fs.mkdirSync(dataDir, { recursive: true });
  // Atomic replacement keeps existing user data intact if writing fails.
  const temporaryPath = `${usersFilePath}.${process.pid}.tmp`;
  try {
    fs.writeFileSync(temporaryPath, JSON.stringify({ users }, null, 2), { mode: 0o600, flag: 'wx' });
    fs.renameSync(temporaryPath, usersFilePath);
  } finally {
    if (fs.existsSync(temporaryPath)) fs.unlinkSync(temporaryPath);
  }
  console.log(`管理员账户 '${username}' 创建成功；密码不会显示在日志中。`);
}

if (require.main === module) {
  createAdmin().catch(error => {
    console.error('管理员初始化失败:', error.message);
    process.exitCode = 1;
  });
}

module.exports = { createAdmin };
