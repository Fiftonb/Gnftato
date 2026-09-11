'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

function isolatedCache(t, legacyRules) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gnftato-cache-'));
  const previousDataDir = process.env.DATA_DIR;
  const legacyFile = path.join(dataDir, 'rules.json');
  fs.writeFileSync(legacyFile, JSON.stringify({ rules: legacyRules }));
  process.env.DATA_DIR = dataDir;
  const filename = require.resolve('../services/cacheService');
  delete require.cache[filename];
  const service = require('../services/cacheService');
  t.after(() => {
    delete require.cache[filename];
    if (previousDataDir === undefined) delete process.env.DATA_DIR;
    else process.env.DATA_DIR = previousDataDir;
    fs.rmSync(dataDir, { recursive: true, force: true });
  });
  return { service, legacyFile, cacheFile: path.join(dataDir, 'rules-cache.json') };
}

test('cache writes honor DATA_DIR and preserve legacy rule records', async t => {
  const setup = isolatedCache(t, [{ _id: 'saved-rule', serverId: 'fixture', name: 'preserved rule' }]);
  const originalRules = fs.readFileSync(setup.legacyFile, 'utf8');
  assert.equal(await setup.service.getServerRulesCache('fixture'), null);
  assert.equal(await setup.service.updateServerCacheItem('fixture', 'blockList', 'fixture rules'), true);
  const cached = await setup.service.getServerRulesCache('fixture');
  assert.equal(cached.data.blockList, 'fixture rules');
  assert.equal(typeof cached.lastUpdate, 'string');
  assert.ok(fs.existsSync(setup.cacheFile));
  assert.equal(fs.readFileSync(setup.legacyFile, 'utf8'), originalRules);
});

test('legacy object-shaped caches migrate on write without changing the original file', async t => {
  const setup = isolatedCache(t, {
    first: { lastUpdate: '2020-01-01T00:00:00.000Z', data: { blockList: 'legacy cache' } },
    second: { lastUpdate: '2020-01-02T00:00:00.000Z', data: { inboundPorts: '22,443' } }
  });
  const originalRules = fs.readFileSync(setup.legacyFile, 'utf8');
  assert.equal((await setup.service.getServerRulesCache('first')).data.blockList, 'legacy cache');
  assert.equal(await setup.service.updateServerCacheItem('first', 'sshPortStatus', '22'), true);
  assert.equal((await setup.service.getServerRulesCache('first')).data.blockList, 'legacy cache');
  assert.equal((await setup.service.getServerRulesCache('second')).data.inboundPorts, '22,443');
  assert.equal(fs.readFileSync(setup.legacyFile, 'utf8'), originalRules);
  assert.equal(await setup.service.clearServerRulesCache('first'), true);
  assert.equal(await setup.service.getServerRulesCache('first'), null);
  assert.equal((await setup.service.getServerRulesCache('second')).data.inboundPorts, '22,443');
});

test('cache keys cannot alter object prototypes', async t => {
  const setup = isolatedCache(t, {});
  for (const dangerousKey of ['__proto__', 'constructor', 'prototype']) {
    assert.ok(!await setup.service.updateServerCacheItem('fixture', dangerousKey, { polluted: true }));
    assert.ok(!await setup.service.updateServerCacheItem(dangerousKey, 'polluted', true));
    assert.equal(await setup.service.getServerRulesCache(dangerousKey), null);
  }
  assert.equal({}.polluted, undefined);
});

test('concurrent refreshes preserve every field and every server cache', async t => {
  const setup = isolatedCache(t, {});
  const keys = ['blockList', 'inboundPorts', 'inboundIPs', 'sshPortStatus', 'defenseStatus'];
  const updates = await Promise.all(['first', 'second'].flatMap(serverId => keys.map(key =>
    setup.service.updateServerCacheItem(serverId, key, `${serverId}:${key}`))));
  assert.ok(updates.every(Boolean));
  for (const serverId of ['first', 'second']) {
    const cached = await setup.service.getServerRulesCache(serverId);
    assert.deepEqual(cached.data, Object.fromEntries(keys.map(key => [key, `${serverId}:${key}`])));
  }
  assert.equal(fs.statSync(setup.cacheFile).mode & 0o077, 0);
  assert.deepEqual(fs.readdirSync(path.dirname(setup.cacheFile)).sort(), ['rules-cache.json', 'rules.json']);
});

test('failed atomic cache writes preserve the previous cache and subsequent queued writes recover', async t => {
  const setup = isolatedCache(t, {});
  assert.equal(await setup.service.updateServerCacheItem('fixture', 'preserved', 'original'), true);
  const before = fs.readFileSync(setup.cacheFile, 'utf8');
  const rename = fs.promises.rename;
  let failNextRename = true;
  t.mock.method(fs.promises, 'rename', async (...args) => {
    if (failNextRename) {
      failNextRename = false;
      assert.equal(fs.readFileSync(setup.cacheFile, 'utf8'), before);
      throw Object.assign(new Error('mock atomic replacement failure'), { code: 'EIO' });
    }
    return rename.apply(fs.promises, args);
  });
  const results = await Promise.all([
    setup.service.updateServerCacheItem('fixture', 'failed', 'must not be persisted'),
    setup.service.updateServerCacheItem('fixture', 'recovered', 'persisted after failure')
  ]);
  assert.deepEqual(results, [false, true]);
  assert.deepEqual((await setup.service.getServerRulesCache('fixture')).data, {
    preserved: 'original', recovered: 'persisted after failure'
  });
  assert.deepEqual(fs.readdirSync(path.dirname(setup.cacheFile)).sort(), ['rules-cache.json', 'rules.json']);
});
