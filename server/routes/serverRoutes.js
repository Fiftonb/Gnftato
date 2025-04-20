const express = require('express');
const serverController = require('../controllers/serverController');
const router = express.Router();
const { protect } = require('../middlewares/authMiddleware');

// 应用认证中间件保护所有路由
router.use(protect);

// 获取所有服务器
router.get('/', serverController.getAllServers);

// 获取单个服务器
router.get('/:id', serverController.getServer);

// 添加服务器
router.post('/', serverController.createServer);

// 更新服务器
router.put('/:id', serverController.updateServer);

// 删除服务器
router.delete('/:id', serverController.deleteServer);

// 服务器连接路由
router.post('/:id/connect', serverController.connectServer);
router.post('/:id/disconnect', serverController.disconnectServer);
router.post('/:id/execute', serverController.executeCommand);
router.get('/:id/status', serverController.checkServerStatus);

// iPtato部署路由
router.post('/:id/deploy', serverController.deployIptato);

module.exports = router; 