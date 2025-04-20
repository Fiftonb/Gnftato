const jwt = require('jsonwebtoken');
const User = require('../models/User');

// JWT密钥
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

// 验证令牌是否有效的中间件
exports.protect = async (req, res, next) => {
  try {
    let token;

    // 检查Authorization请求头
    if (
      req.headers.authorization &&
      req.headers.authorization.startsWith('Bearer')
    ) {
      // 获取Bearer令牌
      token = req.headers.authorization.split(' ')[1];
    }

    // 如果没有令牌，返回错误
    if (!token) {
      return res.status(401).json({
        success: false,
        message: '请先登录以获取访问权限'
      });
    }

    // 验证令牌
    const decoded = jwt.verify(token, JWT_SECRET);

    // 查找用户
    const currentUser = User.findUserByUsername(decoded.username);

    if (!currentUser) {
      return res.status(401).json({
        success: false,
        message: '此令牌的用户不存在'
      });
    }

    // 将用户信息添加到req对象
    req.user = {
      id: currentUser.id,
      username: currentUser.username
    };

    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        success: false,
        message: '无效的令牌'
      });
    }

    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        message: '令牌已过期'
      });
    }

    res.status(500).json({
      success: false,
      message: '服务器错误',
      error: error.message
    });
  }
}; 