const User = require('../models/User');
const jwt = require('jsonwebtoken');
const { publicUser } = require('../middlewares/authMiddleware');

function generateToken(user) {
  return jwt.sign(
    { id: user.id, username: user.username, ver: user.tokenVersion ?? 0 },
    process.env.JWT_SECRET,
    { algorithm: 'HS256', expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );
}
// Account creation is restricted to administrators by authRoutes.
exports.register = async (req, res) => {
  try {
    const { username, password, isAdmin } = req.body;
    const user = await User.createUser(username, password, { isAdmin: isAdmin === true });
    res.status(201).json({ success: true, message: '用户创建成功', data: { user: publicUser(user) } });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};
exports.login = async (req, res) => {
  try {
    const { username, password } = req.body;
    if (typeof username !== 'string' || typeof password !== 'string' || !username || !password) {
      return res.status(400).json({ success: false, message: '用户名和密码不能为空' });
    }
    const user = await User.validateUser(username, password);
    if (!user) return res.status(401).json({ success: false, message: '用户名或密码错误' });
    res.json({ success: true, message: '登录成功', data: { user: publicUser(user), token: generateToken(user) } });
  } catch (error) {
    res.status(500).json({ success: false, message: '服务器错误' });
  }
};
exports.getCurrentUser = (req, res) => {
  res.json({ success: true, data: { user: req.user } });
};
exports.updatePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    User.validatePassword(newPassword);
    if (!await User.validateUser(req.user.username, currentPassword)) {
      return res.status(401).json({ success: false, message: '当前密码错误' });
    }
    const user = await User.updatePassword(req.user.id, newPassword, req.user.username);
    if (req.app.io) req.app.io.in(`user:${user.id}`).disconnectSockets(true);
    res.json({ success: true, message: '密码更新成功', data: { user: publicUser(user), token: generateToken(user) } });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};
