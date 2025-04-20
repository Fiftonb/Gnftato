const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { protect } = require('../middlewares/authMiddleware');

// 注册新用户
router.post('/register', authController.register);

// 用户登录
router.post('/login', authController.login);

// 获取当前登录用户信息 (需要身份验证)
router.get('/me', protect, authController.getCurrentUser);

// 更新用户密码 (需要身份验证)
router.put('/update-password', protect, authController.updatePassword);

module.exports = router; 