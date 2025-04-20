const express = require('express');
const rulesController = require('../controllers/rulesController');
const router = express.Router();
const { protect } = require('../middlewares/authMiddleware');

// 应用认证中间件保护所有路由
router.use(protect);

// 规则缓存路由
router.get('/:serverId/cache', rulesController.getServerRulesCache);
router.get('/:serverId/cache/last-update', rulesController.getCacheLastUpdate);
router.delete('/:serverId/cache', rulesController.clearServerCache);
router.put('/:serverId/cache/:key', rulesController.updateCacheItem);

// 出网控制路由
router.get('/:serverId/blocklist', rulesController.getBlockList);
router.post('/:serverId/block/bt-pt', rulesController.blockBTPT);
router.post('/:serverId/block/spam', rulesController.blockSPAM);
router.post('/:serverId/block/all', rulesController.blockAll);
router.post('/:serverId/block/ports', rulesController.blockCustomPorts);
router.post('/:serverId/block/keyword', rulesController.blockCustomKeyword);
router.post('/:serverId/unblock/bt-pt', rulesController.unblockBTPT);
router.post('/:serverId/unblock/spam', rulesController.unblockSPAM);
router.post('/:serverId/unblock/all', rulesController.unblockAll);
router.post('/:serverId/unblock/ports', rulesController.unblockCustomPorts);
router.post('/:serverId/unblock/keyword', rulesController.unblockCustomKeyword);
router.post('/:serverId/unblock/all-keywords', rulesController.unblockAllKeywords);

// 入网控制路由
router.get('/:serverId/inbound/ports', rulesController.getInboundPorts);
router.get('/:serverId/inbound/ips', rulesController.getInboundIPs);
router.post('/:serverId/inbound/allow/ports', rulesController.allowInboundPorts);
router.post('/:serverId/inbound/disallow/ports', rulesController.disallowInboundPorts);
router.post('/:serverId/inbound/allow/ips', rulesController.allowInboundIPs);
router.post('/:serverId/inbound/disallow/ips', rulesController.disallowInboundIPs);

// DDoS防御路由
router.post('/:serverId/ddos/protection', rulesController.setupDdosProtection);
router.post('/:serverId/ddos/custom-port', rulesController.setupCustomPortProtection);
router.post('/:serverId/ddos/ip-lists', rulesController.manageIpLists);
router.get('/:serverId/ddos/status', rulesController.viewDefenseStatus);

// 增强功能路由
router.get('/:serverId/ssh-port', rulesController.getSSHPort);
router.post('/:serverId/clear-all', rulesController.clearAllRules);

module.exports = router; 