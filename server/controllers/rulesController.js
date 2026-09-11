'use strict';

const nftablesService = require('../services/nftablesService');
const cacheService = require('../services/cacheService');
const { asyncHandler, sendResult, httpError } = require('./controllerUtils');

const cacheKeys = new Set(['blockList', 'inboundPorts', 'inboundIPs', 'sshPortStatus', 'defenseStatus']);
const required = (body, key, message) => {
  const value = body?.[key];
  if (value === undefined || value === null || value === '') throw httpError(400, message);
  return value;
};
const action = (method, args = req => [req.params.serverId]) => asyncHandler(async (req, res) => {
  sendResult(res, await nftablesService[method](...args(req)));
});
const cachedQuery = (method, key) => asyncHandler(async (req, res) => {
  const result = await nftablesService[method](req.params.serverId);
  if (result.success) await cacheService.updateServerCacheItem(req.params.serverId, key, result.data);
  sendResult(res, result);
});

exports.getServerRulesCache = asyncHandler(async (req, res) => {
  const cache = await cacheService.getServerRulesCache(req.params.serverId);
  if (!cache) throw httpError(404, '服务器规则缓存不存在');
  res.json({ success: true, data: cache });
});

exports.getCacheLastUpdate = asyncHandler(async (req, res) => {
  const lastUpdate = await cacheService.getServerCacheLastUpdate(req.params.serverId);
  if (!lastUpdate) throw httpError(404, '服务器规则缓存不存在');
  res.json({ success: true, data: { lastUpdate } });
});

exports.clearServerCache = asyncHandler(async (req, res) => {
  const success = await cacheService.clearServerRulesCache(req.params.serverId);
  res.json({ success, message: success ? '缓存清除成功' : '缓存清除失败' });
});

// Compatibility endpoint for the current UI. Only known derived cache fields
// and bounded JSON values are accepted; clients cannot create arbitrary keys.
exports.updateCacheItem = asyncHandler(async (req, res) => {
  const key = req.params.key;
  if (!cacheKeys.has(key)) throw httpError(400, '缓存键名无效');
  const value = required(req.body, 'value', '缓存值不能为空');
  if (Buffer.byteLength(JSON.stringify(value), 'utf8') > 64 * 1024) throw httpError(413, '缓存值过大');
  const success = await cacheService.updateServerCacheItem(req.params.serverId, key, value);
  res.json({ success, message: success ? `缓存项 ${key} 更新成功` : `缓存项 ${key} 更新失败` });
});

exports.getBlockList = cachedQuery('getBlockList', 'blockList');
exports.getInboundPorts = cachedQuery('getInboundPorts', 'inboundPorts');
exports.getInboundIPs = cachedQuery('getInboundIPs', 'inboundIPs');
exports.getSSHPort = cachedQuery('getSSHPort', 'sshPortStatus');
exports.viewDefenseStatus = cachedQuery('viewDefenseStatus', 'defenseStatus');

exports.blockBTPT = action('blockBTPT');
exports.blockSPAM = action('blockSPAM');
exports.blockAll = action('blockAll');
exports.unblockBTPT = action('unblockBTPT');
exports.unblockSPAM = action('unblockSPAM');
exports.unblockAll = action('unblockAll');
exports.unblockAllKeywords = action('unblockAllKeywords');
exports.setupDdosProtection = action('setupDdosProtection');
exports.clearAllRules = action('clearAllRules');

exports.blockCustomPorts = action('blockCustomPorts', req => [req.params.serverId, required(req.body, 'ports', '端口不能为空')]);
exports.unblockCustomPorts = action('unblockCustomPorts', req => [req.params.serverId, required(req.body, 'ports', '端口不能为空')]);
exports.allowInboundPorts = action('allowInboundPorts', req => [req.params.serverId, required(req.body, 'ports', '端口不能为空')]);
exports.disallowInboundPorts = action('disallowInboundPorts', req => [req.params.serverId, required(req.body, 'ports', '端口不能为空')]);
exports.blockCustomKeyword = action('blockCustomKeyword', req => [req.params.serverId, required(req.body, 'keyword', '关键词不能为空')]);
exports.unblockCustomKeyword = action('unblockCustomKeyword', req => [req.params.serverId, required(req.body, 'keyword', '关键词不能为空')]);
exports.allowInboundIPs = action('allowInboundIPs', req => [req.params.serverId, required(req.body, 'ips', 'IP不能为空')]);
exports.disallowInboundIPs = action('disallowInboundIPs', req => [req.params.serverId, required(req.body, 'ips', 'IP不能为空')]);

exports.setupCustomPortProtection = action('setupCustomPortProtection', req => [
  req.params.serverId,
  required(req.body, 'port', '端口不能为空'),
  req.body?.protoType ?? 1,
  req.body?.maxConn ?? 400,
  req.body?.maxRateMin ?? 400,
  req.body?.maxRateSec ?? 300,
  req.body?.banHours ?? 24
]);

exports.manageIpLists = action('manageIpLists', req => [
  req.params.serverId,
  required(req.body, 'actionType', '操作类型不能为空'),
  required(req.body, 'ip', 'IP地址不能为空'),
  req.body?.duration
]);
