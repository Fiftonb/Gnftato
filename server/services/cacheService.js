const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { getDataDir } = require('../config/runtime');

const RULES_CACHE_PATH = path.join(getDataDir(), 'rules-cache.json');
const LEGACY_RULES_PATH = path.join(getDataDir(), 'rules.json');
const forbiddenKeys = new Set(['__proto__', 'constructor', 'prototype']);
let pendingWrites = Promise.resolve();

function safeKey(value) {
  return typeof value === 'string' && value.length > 0 && !forbiddenKeys.has(value);
}

async function getRulesCache() {
  try {
    const source = fs.existsSync(RULES_CACHE_PATH) ? RULES_CACHE_PATH : LEGACY_RULES_PATH;
    const data = JSON.parse(await fs.promises.readFile(source, 'utf8'));
    // Legacy rule records used an array; caches use an object keyed by server ID.
    return data && data.rules && typeof data.rules === 'object' && !Array.isArray(data.rules)
      ? data : { rules: {} };
  } catch (error) {
    if (error.code !== 'ENOENT') console.error('读取规则缓存失败:', error);
    return { rules: {} };
  }
}

async function saveRulesCache(data) {
  const temporaryPath = `${RULES_CACHE_PATH}.${process.pid}.${randomUUID()}.tmp`;
  try {
    await fs.promises.mkdir(path.dirname(RULES_CACHE_PATH), { recursive: true });
    await fs.promises.writeFile(temporaryPath, JSON.stringify(data, null, 2), {
      encoding: 'utf8', mode: 0o600, flag: 'wx'
    });
    await fs.promises.rename(temporaryPath, RULES_CACHE_PATH);
    return true;
  } finally {
    await fs.promises.unlink(temporaryPath).catch(error => {
      if (error.code !== 'ENOENT') console.error('清理临时缓存文件失败:', error);
    });
  }
}

// The entire read/modify/write operation must be serialized: parallel rule
// refreshes otherwise read the same snapshot and overwrite each other's fields.
function updateCache(mutate) {
  const operation = pendingWrites.then(async () => {
    const cache = await getRulesCache();
    if (mutate(cache) === false) return true;
    return saveRulesCache(cache);
  });
  // A failed write must not prevent subsequent refreshes from being persisted.
  pendingWrites = operation.catch(() => {});
  return operation.catch(error => {
    console.error('更新规则缓存失败:', error);
    return false;
  });
}

exports.getServerRulesCache = async serverId => {
  if (!safeKey(serverId)) return null;
  await pendingWrites;
  const cache = await getRulesCache();
  return Object.hasOwn(cache.rules, serverId) ? cache.rules[serverId] : null;
};

exports.saveServerRulesCache = async (serverId, data) => {
  if (!safeKey(serverId)) return false;
  return updateCache(cache => {
    cache.rules[serverId] = { lastUpdate: new Date().toISOString(), data };
  });
};

exports.updateServerCacheItem = async (serverId, key, value) => {
  if (!safeKey(serverId) || !safeKey(key)) return false;
  return updateCache(cache => {
    if (!Object.hasOwn(cache.rules, serverId) || !cache.rules[serverId] ||
        typeof cache.rules[serverId] !== 'object') {
      cache.rules[serverId] = { data: {} };
    }
    const entry = cache.rules[serverId];
    if (!entry.data || typeof entry.data !== 'object' || Array.isArray(entry.data)) entry.data = {};
    entry.data[key] = value;
    entry.lastUpdate = new Date().toISOString();
  });
};

exports.clearServerRulesCache = async serverId => {
  if (!safeKey(serverId)) return false;
  return updateCache(cache => {
    if (!Object.hasOwn(cache.rules, serverId)) return false;
    delete cache.rules[serverId];
  });
};

exports.getServerCacheLastUpdate = async serverId => {
  const cache = await exports.getServerRulesCache(serverId);
  return cache?.lastUpdate || null;
};
