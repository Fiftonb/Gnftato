const jwt = require('jsonwebtoken');
const User = require('../models/User');

function publicUser(user) {
  return { id: user.id, username: user.username, isAdmin: user.isAdmin === true, createdAt: user.createdAt };
}
function authenticateToken(token) {
  if (typeof token !== 'string' || !token) throw new Error('请先登录以获取访问权限');
  const decoded = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] });
  if (!decoded || typeof decoded !== 'object' || typeof decoded.username !== 'string') throw new Error('无效的令牌');
  const user = User.findUserByUsername(decoded.username);
  if (!user || decoded.id !== user.id || (decoded.ver ?? 0) !== (user.tokenVersion ?? 0)) {
    throw new Error('登录已失效，请重新登录');
  }
  return publicUser(user);
}
function protect(req, res, next) {
  const match = /^Bearer\s+(\S+)$/i.exec(req.headers.authorization || '');
  try {
    req.user = authenticateToken(match && match[1]);
    next();
  } catch (error) {
    res.status(401).json({ success: false, message: '登录已失效，请重新登录' });
  }
}
function requireAdmin(req, res, next) {
  if (!req.user || !req.user.isAdmin) {
    return res.status(403).json({ success: false, message: '此操作需要管理员权限' });
  }
  next();
}
module.exports = { protect, requireAdmin, authenticateToken, publicUser };
