const fs = require('fs');
const path = require('path');
const util = require('util');

const readFile = util.promisify(fs.readFile);
const writeFile = util.promisify(fs.writeFile);

const RULES_CACHE_PATH = path.join(__dirname, '../data/rules.json');

/**
 * 读取规则缓存数据
 * @returns {Promise<Object>} 规则缓存数据
 */
const getRulesCache = async () => {
  try {
    const data = await readFile(RULES_CACHE_PATH, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error('读取规则缓存失败:', error);
    // 如果文件不存在或无法解析，返回默认结构
    return { rules: {} };
  }
};

/**
 * 写入规则缓存数据
 * @param {Object} data - 规则缓存数据
 * @returns {Promise<boolean>} 是否写入成功
 */
const saveRulesCache = async (data) => {
  try {
    await writeFile(RULES_CACHE_PATH, JSON.stringify(data, null, 2), 'utf8');
    return true;
  } catch (error) {
    console.error('写入规则缓存失败:', error);
    return false;
  }
};

/**
 * 获取服务器规则缓存
 * @param {string} serverId - 服务器ID
 * @returns {Promise<Object|null>} 服务器规则缓存数据
 */
exports.getServerRulesCache = async (serverId) => {
  try {
    const cache = await getRulesCache();
    return cache.rules[serverId] || null;
  } catch (error) {
    console.error(`获取服务器 ${serverId} 的规则缓存失败:`, error);
    return null;
  }
};

/**
 * 保存服务器规则缓存
 * @param {string} serverId - 服务器ID
 * @param {Object} data - 服务器规则数据
 * @returns {Promise<boolean>} 是否保存成功
 */
exports.saveServerRulesCache = async (serverId, data) => {
  try {
    const cache = await getRulesCache();
    
    if (!cache.rules) {
      cache.rules = {};
    }
    
    cache.rules[serverId] = {
      lastUpdate: new Date().toISOString(),
      data: data
    };
    
    return await saveRulesCache(cache);
  } catch (error) {
    console.error(`保存服务器 ${serverId} 的规则缓存失败:`, error);
    return false;
  }
};

/**
 * 更新服务器数据缓存项
 * @param {string} serverId - 服务器ID
 * @param {string} key - 数据项键名
 * @param {any} value - 数据项值
 * @returns {Promise<boolean>} 是否更新成功
 */
exports.updateServerCacheItem = async (serverId, key, value) => {
  try {
    const cache = await getRulesCache();
    
    if (!cache.rules[serverId]) {
      cache.rules[serverId] = {
        lastUpdate: new Date().toISOString(),
        data: {}
      };
    }
    
    cache.rules[serverId].data[key] = value;
    cache.rules[serverId].lastUpdate = new Date().toISOString();
    
    return await saveRulesCache(cache);
  } catch (error) {
    console.error(`更新服务器 ${serverId} 的缓存项 ${key} 失败:`, error);
    return false;
  }
};

/**
 * 清除服务器规则缓存
 * @param {string} serverId - 服务器ID
 * @returns {Promise<boolean>} 是否清除成功
 */
exports.clearServerRulesCache = async (serverId) => {
  try {
    const cache = await getRulesCache();
    
    if (cache.rules && cache.rules[serverId]) {
      delete cache.rules[serverId];
      return await saveRulesCache(cache);
    }
    
    return true;
  } catch (error) {
    console.error(`清除服务器 ${serverId} 的规则缓存失败:`, error);
    return false;
  }
};

/**
 * 获取服务器缓存最后更新时间
 * @param {string} serverId - 服务器ID
 * @returns {Promise<string|null>} 最后更新时间
 */
exports.getServerCacheLastUpdate = async (serverId) => {
  try {
    const cache = await getRulesCache();
    
    if (cache.rules && cache.rules[serverId]) {
      return cache.rules[serverId].lastUpdate;
    }
    
    return null;
  } catch (error) {
    console.error(`获取服务器 ${serverId} 的缓存更新时间失败:`, error);
    return null;
  }
}; 