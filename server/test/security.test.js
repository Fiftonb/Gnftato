'use strict';

const assert = require('node:assert/strict');
const { before, after, test } = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { randomBytes } = require('node:crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const TestSocket = require('./helpers/socket-client');

// These tests use isolated JSON files and in-memory SSH/firewall/cache services.
// Requiring a real SSH implementation is deliberately unnecessary: no host can
// be contacted and no deployment or firewall shell command can be executed.
const originalEnvironment = { ...process.env };
const secret = randomBytes(48).toString('hex');
const password = 'Regression-Password-813!';
const legacyLongPassword = 'Legacy-long-password-'.repeat(5);
const calls = [];
const connections = {};
const cache = {};
let tempDir;
let application;
let baseUrl;
let adminToken;
let memberToken;
let legacyToken;
let Server;
let deploymentGate;
let deploymentStarted;

function mockModule(relativePath, exports) {
  const filename = require.resolve(relativePath);
  require.cache[filename] = { id: filename, filename, loaded: true, exports };
}

async function request(route, { method = 'GET', token, body } = {}) {
  const response = await fetch(`${baseUrl}${route}`, {
    method,
    headers: {
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(5000)
  });
  return { status: response.status, body: await response.json() };
}

async function login(username, suppliedPassword = password) {
  const result = await request('/api/auth/login', {
    method: 'POST', body: { username, password: suppliedPassword }
  });
  assert.equal(result.status, 200, JSON.stringify(result.body));
  assert.equal(result.body.success, true);
  assert.equal(result.body.data.user.username, username);
  assert.equal(typeof result.body.data.token, 'string');
  assert.equal(result.body.data.user.password, undefined);
  return result.body.data.token;
}

function persistedUsers() {
  return JSON.parse(fs.readFileSync(path.join(tempDir, 'users.json'), 'utf8')).users;
}

before(async () => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gnftato-security-'));
  process.env.DATA_DIR = tempDir;
  process.env.JWT_SECRET = secret;
  process.env.NODE_ENV = 'test';
  process.env.CORS_ORIGIN = 'http://localhost:8080';
  process.env.PORT = '0';
  const hash = bcrypt.hashSync(password, 4);
  fs.writeFileSync(path.join(tempDir, 'users.json'), JSON.stringify({ users: [
    { id: 'original-admin', username: 'admin', password: hash, isAdmin: true, tokenVersion: 0 },
    { id: 'ordinary-member', username: 'member', password: hash, role: 'user', tokenVersion: 0 },
    { id: 'legacy-member', username: 'legacy', password: hash },
    { id: 'rotating-admin', username: 'rotate', password: hash, isAdmin: true, tokenVersion: 0 },
    { id: 'old-short-admin', username: 'short-password', password: bcrypt.hashSync('old123', 4), isAdmin: true },
    { id: 'old-long-admin', username: 'long-password', password: bcrypt.hashSync(legacyLongPassword, 4), isAdmin: true }
  ] }));
  fs.writeFileSync(path.join(tempDir, 'servers.json'), JSON.stringify({ servers: [] }));
  fs.writeFileSync(path.join(tempDir, 'rules.json'), JSON.stringify({ rules: {} }));

  mockModule('../services/sshService', {
    connections,
    checkConnection: id => Boolean(connections[id]),
    async connect(id) {
      calls.push(['connect', id]);
      connections[id] = {};
      await Server.findByIdAndUpdate(id, { status: 'online', lastConnection: new Date().toISOString() });
      return { success: true, message: 'mock connected' };
    },
    async disconnect(id) {
      calls.push(['disconnect', id]);
      delete connections[id];
      await Server.findByIdAndUpdate(id, { status: 'offline' });
      return { success: true, message: 'mock disconnected' };
    },
    async executeCommand(id, command) {
      calls.push(['executeCommand', id, command]);
      if (command === 'mock-ssh-failure') throw new Error('mock SSH connection failure');
      return { stdout: 'mock command output', stderr: '', code: 0 };
    },
    async deployIptato(id) {
      calls.push(['deployIptato', id]);
      if (deploymentStarted) deploymentStarted();
      if (deploymentGate) await deploymentGate;
      return { success: true };
    },
    async deployIptatoWithLogs(id, log) {
      calls.push(['deployIptatoWithLogs', id]);
      log('mock deployment progress');
      if (deploymentGate) await deploymentGate;
      return { success: true };
    }
  });
  mockModule('../services/cacheService', {
    async getServerRulesCache(id) { return cache[id] || null; },
    async getServerCacheLastUpdate(id) { return cache[id]?.lastUpdate || null; },
    async updateServerCacheItem(id, key, value) {
      cache[id] ||= { data: {}, lastUpdate: new Date().toISOString() };
      cache[id].data[key] = value;
      return true;
    },
    async clearServerRulesCache(id) { delete cache[id]; return true; }
  });
  mockModule('../services/nftablesService', {
    async getBlockList(id) {
      calls.push(['getBlockList', id]);
      return { success: true, data: 'mock block list' };
    },
    async blockCustomPorts(id, ports) {
      calls.push(['blockCustomPorts', id, ports]);
      return { success: true, data: 'mock ports blocked' };
    }
  });
  const exported = require('../app');
  application = typeof exported.createApplication === 'function' ? exported.createApplication() : exported;
  assert.ok(application.server && application.io, 'app.js must export a testable HTTP/Socket.IO server');
  assert.equal(application.server.listening, false, 'requiring app.js must not bind a production port');
  Server = require('../models/Server');
  await new Promise((resolve, reject) => {
    application.server.once('error', reject);
    application.server.listen(0, '127.0.0.1', resolve);
  });
  baseUrl = `http://127.0.0.1:${application.server.address().port}`;
  adminToken = await login('admin');
  memberToken = await login('member');
  legacyToken = await login('legacy');
});

after(async () => {
  if (application?.io) await new Promise(resolve => application.io.close(resolve));
  if (application?.server?.listening) await new Promise(resolve => application.server.close(resolve));
  if (tempDir) fs.rmSync(tempDir, { recursive: true, force: true });
  for (const key of Object.keys(process.env)) {
    if (!(key in originalEnvironment)) delete process.env[key];
  }
  Object.assign(process.env, originalEnvironment);
});

test('existing administrator and ordinary accounts retain login and /me response compatibility', async () => {
  for (const [token, username] of [[adminToken, 'admin'], [memberToken, 'member'], [legacyToken, 'legacy']]) {
    const result = await request('/api/auth/me', { token });
    assert.equal(result.status, 200);
    assert.equal(result.body.success, true);
    assert.equal(result.body.data.user.username, username);
    assert.equal(result.body.data.user.password, undefined);
  }
  const shortPasswordToken = await login('short-password', 'old123');
  assert.equal((await request('/api/servers', { token: shortPasswordToken })).status, 200);
  const longPasswordToken = await login('long-password', legacyLongPassword);
  assert.equal((await request('/api/servers', { token: longPasswordToken })).status, 200);
});

test('anonymous registration and ordinary-account user creation cannot persist users', async () => {
  const beforeUsers = persistedUsers();
  for (const [token, expectedStatus] of [[undefined, 401], [memberToken, 403], [legacyToken, 403]]) {
    const result = await request('/api/auth/register', {
      method: 'POST', token, body: { username: 'attacker', password, isAdmin: true, role: 'admin' }
    });
    assert.equal(result.status, expectedStatus);
    assert.equal(result.body.success, false);
  }
  assert.deepEqual(persistedUsers(), beforeUsers);
});

test('administrator-only user creation preserves its session and supports explicit administrator assignment', async () => {
  for (const [username, isAdmin] of [['created-member', false], ['created-admin', true]]) {
    const result = await request('/api/auth/register', {
      method: 'POST', token: adminToken, body: { username, password, isAdmin }
    });
    assert.equal(result.status, 201, JSON.stringify(result.body));
    assert.equal(result.body.success, true);
    assert.equal(result.body.data.user.username, username);
    assert.equal(result.body.data.user.isAdmin, isAdmin);
    assert.equal(result.body.data.user.password, undefined);
    assert.equal(result.body.data.token, undefined, 'creating another account must not replace the administrator session');
    const token = await login(username);
    assert.equal((await request('/api/servers', { token })).status, isAdmin ? 200 : 403);
  }
  assert.equal((await request('/api/auth/me', { token: adminToken })).body.data.user.username, 'admin');
});

test('concurrent administrator user creation persists both accounts and rejects duplicate usernames', async () => {
  const created = await Promise.all(['concurrent-one', 'concurrent-two'].map(username => request('/api/auth/register', {
    method: 'POST', token: adminToken, body: { username, password }
  })));
  assert.deepEqual(created.map(result => result.status), [201, 201]);
  await login('concurrent-one');
  await login('concurrent-two');
  const duplicates = await Promise.all([1, 2].map(() => request('/api/auth/register', {
    method: 'POST', token: adminToken, body: { username: 'concurrent-duplicate', password }
  })));
  assert.equal(duplicates.filter(result => result.status === 201).length, 1);
  assert.equal(duplicates.filter(result => result.status === 400).length, 1);
  assert.equal(persistedUsers().filter(user => user.username === 'concurrent-duplicate').length, 1);
});

test('all server and firewall capabilities reject anonymous and unprivileged accounts before side effects', async () => {
  const operations = [
    ['GET', '/api/servers'], ['POST', '/api/servers'],
    ['GET', '/api/servers/fixture'], ['PUT', '/api/servers/fixture'], ['DELETE', '/api/servers/fixture'],
    ['POST', '/api/servers/fixture/connect'], ['POST', '/api/servers/fixture/disconnect'],
    ['POST', '/api/servers/test-connection'], ['POST', '/api/servers/fixture/execute'],
    ['POST', '/api/servers/fixture/deploy'], ['GET', '/api/servers/fixture/status'],
    ['GET', '/api/servers/fixture/logs'], ['GET', '/api/servers/fixture/checkScript'],
    ['GET', '/api/rules/fixture/cache'], ['GET', '/api/rules/fixture/cache/last-update'],
    ['PUT', '/api/rules/fixture/cache/blockList'], ['DELETE', '/api/rules/fixture/cache'],
    ['GET', '/api/rules/fixture/blocklist'], ['POST', '/api/rules/fixture/block/ports'],
    ['POST', '/api/rules/fixture/unblock/all'], ['GET', '/api/rules/fixture/inbound/ports'],
    ['POST', '/api/rules/fixture/inbound/allow/ips'], ['POST', '/api/rules/fixture/ddos/protection'],
    ['POST', '/api/rules/fixture/ddos/custom-port'], ['POST', '/api/rules/fixture/ddos/ip-lists'],
    ['GET', '/api/rules/fixture/ddos/status'], ['GET', '/api/rules/fixture/ssh-port'],
    ['POST', '/api/rules/fixture/clear-all']
  ];
  const beforeCalls = calls.length;
  for (const [token, expectedStatus] of [[undefined, 401], [memberToken, 403], [legacyToken, 403]]) {
    for (const [method, route] of operations) {
      const result = await request(route, { method, token, ...(method === 'GET' ? {} : { body: {} }) });
      assert.equal(result.status, expectedStatus, `${method} ${route}`);
      assert.equal(result.body.success, false);
    }
  }
  assert.equal(calls.length, beforeCalls, 'access denial must happen before SSH/firewall calls');
  assert.deepEqual(await Server.find(), []);
});

test('forged, expired, wrong-algorithm and mismatched-user JWTs cannot authenticate', async () => {
  const payload = jwt.decode(adminToken);
  const { exp, iat, ...claims } = payload;
  const rejectedTokens = [
    'not-a-jwt',
    jwt.sign(claims, 'your-secret-key', { expiresIn: '1h' }),
    jwt.sign(claims, secret, { expiresIn: -1 }),
    jwt.sign(claims, secret, { algorithm: 'HS512', expiresIn: '1h' }),
    jwt.sign({ ...claims, id: 'different-user' }, secret, { expiresIn: '1h' })
  ];
  for (const token of rejectedTokens) {
    const result = await request('/api/auth/me', { token });
    assert.equal(result.status, 401);
    assert.equal(result.body.success, false);
  }
});

test('administrator access follows the stored privilege flag, including for an account named admin', async () => {
  const users = persistedUsers();
  try {
    fs.writeFileSync(path.join(tempDir, 'users.json'), JSON.stringify({ users: users.map(user => {
      if (user.username !== 'admin') return user;
      const { isAdmin, ...unprivileged } = user;
      return unprivileged;
    }) }));
    assert.equal((await request('/api/auth/me', { token: adminToken })).status, 200);
    assert.equal((await request('/api/servers', { token: adminToken })).status, 403);
  } finally {
    fs.writeFileSync(path.join(tempDir, 'users.json'), JSON.stringify({ users }));
  }
});

test('invalid login data and passwords are rejected without issuing tokens', async () => {
  for (const body of [{}, { username: {}, password }, { username: 'admin', password: [] }, { username: 'admin', password: 'wrong' }]) {
    const result = await request('/api/auth/login', { method: 'POST', body });
    assert.ok([400, 401].includes(result.status), JSON.stringify(result));
    assert.equal(result.body.success, false);
    assert.equal(result.body.data?.token, undefined);
  }
});

test('administrator server CRUD preserves credentials during blank-password edits and never returns secrets', async () => {
  const created = await request('/api/servers', {
    method: 'POST', token: adminToken,
    body: { name: 'Isolated fixture', host: '192.0.2.1', port: 22, username: 'root', authType: 'password', password: 'ssh-fixture-secret', privateKey: 'private-fixture' }
  });
  assert.equal(created.status, 201);
  const id = created.body.data._id;
  assert.ok(id);
  assert.equal(created.body.data.password, undefined);
  assert.equal(created.body.data.privateKey, undefined);
  for (const route of ['/api/servers', `/api/servers/${id}`]) {
    const result = await request(route, { token: adminToken });
    assert.equal(result.status, 200);
    assert.ok(!JSON.stringify(result.body).includes('ssh-fixture-secret'));
    assert.ok(!JSON.stringify(result.body).includes('private-fixture'));
  }
  const updated = await request(`/api/servers/${id}`, {
    method: 'PUT', token: adminToken,
    body: { name: 'Renamed fixture', password: '', privateKey: '', _id: 'replacement-id', status: 'online' }
  });
  assert.equal(updated.status, 200);
  assert.equal(updated.body.data.name, 'Renamed fixture');
  assert.equal(updated.body.data._id, id);
  assert.equal(updated.body.data.status, 'offline');
  assert.equal((await Server.findById(id)).password, 'ssh-fixture-secret');
  assert.equal((await Server.findById(id)).privateKey, 'private-fixture');
  const removed = await request(`/api/servers/${id}`, { method: 'DELETE', token: adminToken });
  assert.equal(removed.status, 200);
  assert.equal((await request(`/api/servers/${id}`, { token: adminToken })).status, 404);
});

test('administrator connection, execution, deployment and firewall routes retain API behavior with mock SSH', async () => {
  const server = await Server.create({ name: 'Mock SSH', host: '192.0.2.2', username: 'root' });
  const id = server._id;
  assert.equal((await request(`/api/servers/${id}/connect`, { method: 'POST', token: adminToken, body: {} })).status, 200);
  const status = await request(`/api/servers/${id}/status`, { token: adminToken });
  assert.equal(status.body.data.status, 'online');
  const execution = await request(`/api/servers/${id}/execute`, {
    method: 'POST', token: adminToken, body: { command: 'fixture-only-command' }
  });
  assert.equal(execution.status, 200);
  assert.deepEqual(execution.body.data, { stdout: 'mock command output', stderr: '', code: 0 });
  assert.equal((await request(`/api/servers/${id}/deploy`, { method: 'POST', token: adminToken, body: {} })).status, 200);
  const blockList = await request(`/api/rules/${id}/blocklist`, { token: adminToken });
  assert.equal(blockList.status, 200);
  assert.equal(blockList.body.data, 'mock block list');
  const blocked = await request(`/api/rules/${id}/block/ports`, { method: 'POST', token: adminToken, body: { ports: '80,443' } });
  assert.equal(blocked.status, 200);
  assert.equal(blocked.body.success, true);
  assert.ok(calls.some(call => call[0] === 'blockCustomPorts' && call[1] === id && call[2] === '80,443'));
  assert.equal((await request(`/api/servers/${id}/disconnect`, { method: 'POST', token: adminToken, body: {} })).status, 200);
  assert.equal(connections[id], undefined);
});

test('firewall routes reject a missing request body field as a client error', async () => {
  const server = await Server.create({ name: 'Validation fixture', host: '192.0.2.20', username: 'root' });
  const result = await request(`/api/rules/${server._id}/block/ports`, {
    method: 'POST', token: adminToken
  });
  assert.equal(result.status, 400);
  assert.equal(result.body.success, false);
});

test('the cache compatibility route rejects arbitrary client-defined fields', async () => {
  const server = await Server.create({ name: 'Cache validation fixture', host: '192.0.2.21', username: 'root' });
  const result = await request(`/api/rules/${server._id}/cache/untrusted-field`, {
    method: 'PUT', token: adminToken, body: { value: { attackerControlled: true } }
  });
  assert.equal(result.status, 400);
  assert.equal(result.body.success, false);
  assert.equal(cache[server._id], undefined);
});

test('SSH failures produce a JSON error response while the server remains available', async () => {
  const server = await Server.create({ name: 'Failing mock SSH', host: '192.0.2.4', username: 'root' });
  connections[server._id] = {};
  const result = await request(`/api/servers/${server._id}/execute`, {
    method: 'POST', token: adminToken, body: { command: 'mock-ssh-failure' }
  });
  assert.equal(result.status, 500);
  assert.equal(result.body.success, false);
  assert.equal((await request('/api/auth/me', { token: adminToken })).status, 200);
  delete connections[server._id];
});

test('Socket.IO rejects anonymous, invalid and ordinary-user handshakes', async () => {
  const beforeCalls = calls.length;
  for (const auth of [{}, { token: 'invalid' }, { token: memberToken }, { token: legacyToken }]) {
    const socket = new TestSocket(baseUrl, auth);
    try {
      const handshake = await socket.waitFor('connect', 'connect_error', 'transport_error');
      assert.equal(handshake.event, 'connect_error');
    } finally {
      await socket.close();
    }
  }
  assert.equal(calls.length, beforeCalls);
});

test('authenticated Socket.IO heartbeat, validation and deployment progress remain functional', async () => {
  const server = await Server.create({ name: 'Mock socket deployment', host: '192.0.2.3', username: 'root' });
  const socket = new TestSocket(baseUrl, { token: adminToken });
  try {
    assert.equal((await socket.waitFor('connect', 'connect_error')).event, 'connect');
    socket.emit('heartbeat', { timestamp: Date.now() });
    assert.equal(typeof (await socket.waitFor('heartbeat_response')).payload.timestamp, 'number');
    const beforeCalls = calls.length;
    for (const payload of [null, {}, { serverId: [] }]) {
      socket.emit('start_deploy', payload);
      assert.equal((await socket.waitFor('deploy_complete')).payload.success, false);
    }
    assert.equal(calls.length, beforeCalls);
    socket.emit('start_deploy', { serverId: server._id });
    assert.equal((await socket.waitFor('deploy_complete')).payload.success, true);
    assert.ok(calls.some(call => call[0] === 'deployIptatoWithLogs' && call[1] === server._id));
    assert.ok(socket.messages.some(message => message.event === 'deploy_log' && message.payload.message === 'mock deployment progress'));
  } finally {
    await socket.close();
  }
});

test('concurrent Socket.IO deployments for the same server are rejected and the lock is released afterward', async () => {
  const server = await Server.create({ name: 'Serialized mock deployment', host: '192.0.2.5', username: 'root' });
  const socket = new TestSocket(baseUrl, { token: adminToken });
  let release;
  try {
    assert.equal((await socket.waitFor('connect', 'connect_error')).event, 'connect');
    deploymentGate = new Promise(resolve => { release = resolve; });
    const beforeCalls = calls.filter(call => call[0] === 'deployIptatoWithLogs').length;
    socket.emit('start_deploy', { serverId: server._id });
    socket.emit('start_deploy', { serverId: server._id });
    assert.equal((await socket.waitFor('deploy_complete')).payload.success, false);
    assert.equal(calls.filter(call => call[0] === 'deployIptatoWithLogs').length, beforeCalls + 1);
    release();
    deploymentGate = undefined;
    assert.equal((await socket.waitFor('deploy_complete')).payload.success, true);
    socket.emit('start_deploy', { serverId: server._id });
    assert.equal((await socket.waitFor('deploy_complete')).payload.success, true);
  } finally {
    if (release) release();
    deploymentGate = undefined;
    await socket.close();
  }
});

test('HTTP and Socket.IO share deployment locks, including release after a failed deployment', async () => {
  const server = await Server.create({ name: 'Shared deployment lock', host: '192.0.2.6', username: 'root' });
  const socket = new TestSocket(baseUrl, { token: adminToken });
  connections[server._id] = {};
  let release;
  let rejectDeployment;
  let activeRequest;
  try {
    assert.equal((await socket.waitFor('connect', 'connect_error')).event, 'connect');
    deploymentGate = new Promise(resolve => { release = resolve; });
    socket.emit('start_deploy', { serverId: server._id });
    await socket.waitFor('deploy_log');
    const deniedHttp = await request(`/api/servers/${server._id}/deploy`, { method: 'POST', token: adminToken, body: {} });
    assert.equal(deniedHttp.status, 409);
    release();
    deploymentGate = undefined;
    assert.equal((await socket.waitFor('deploy_complete')).payload.success, true);

    const started = new Promise(resolve => { deploymentStarted = resolve; });
    deploymentGate = new Promise((resolve, reject) => { release = resolve; rejectDeployment = reject; });
    activeRequest = request(`/api/servers/${server._id}/deploy`, { method: 'POST', token: adminToken, body: {} });
    await started;
    socket.emit('start_deploy', { serverId: server._id });
    assert.equal((await socket.waitFor('deploy_complete')).payload.success, false);
    const deniedSecondHttp = await request(`/api/servers/${server._id}/deploy`, { method: 'POST', token: adminToken, body: {} });
    assert.equal(deniedSecondHttp.status, 409);
    rejectDeployment(new Error('mock deployment failure'));
    deploymentGate = undefined;
    assert.equal((await activeRequest).status, 500);
    const retried = await request(`/api/servers/${server._id}/deploy`, { method: 'POST', token: adminToken, body: {} });
    assert.equal(retried.status, 200);
    socket.emit('start_deploy', { serverId: server._id });
    assert.equal((await socket.waitFor('deploy_complete')).payload.success, true);
  } finally {
    if (release) release();
    deploymentGate = undefined;
    deploymentStarted = undefined;
    if (activeRequest) await activeRequest.catch(() => {});
    delete connections[server._id];
    await socket.close();
  }
});

test('password changes revoke existing HTTP tokens and already-connected deployment sockets', async () => {
  const oldToken = await login('rotate');
  const socket = new TestSocket(baseUrl, { token: oldToken });
  try {
    assert.equal((await socket.waitFor('connect', 'connect_error')).event, 'connect');
    const newPassword = 'Rotated-Regression-Password-924!';
    const result = await request('/api/auth/update-password', {
      method: 'PUT', token: oldToken, body: { currentPassword: password, newPassword }
    });
    assert.equal(result.status, 200);
    assert.equal(result.body.success, true);
    assert.equal((await request('/api/auth/me', { token: oldToken })).status, 401);
    const freshToken = result.body.data?.token;
    assert.equal(typeof freshToken, 'string', 'password updates return a replacement token to preserve the current session');
    assert.equal((await request('/api/auth/me', { token: freshToken })).status, 200);
    const beforeCalls = calls.length;
    if (socket.socket.readyState === WebSocket.OPEN && !socket.messages.some(message => message.event === 'disconnect')) {
      socket.emit('start_deploy', { serverId: 'any-server' });
    }
    const rejected = await socket.waitFor('deploy_complete', 'disconnect');
    if (rejected.event === 'deploy_complete') assert.equal(rejected.payload.success, false);
    assert.equal(calls.length, beforeCalls, 'revoked sockets must not invoke deployment');
    const wrongPassword = await request('/api/auth/login', { method: 'POST', body: { username: 'rotate', password } });
    assert.equal(wrongPassword.status, 401);
    await login('rotate', newPassword);
  } finally {
    await socket.close();
  }
});

test('legacy duplicate user IDs cannot redirect an ordinary-account password change to an administrator', async () => {
  const originalUsers = persistedUsers();
  const originalAdminPassword = 'Duplicate-Admin-Original-914!';
  const originalMemberPassword = 'Duplicate-Member-Original-815!';
  const newMemberPassword = 'Duplicate-Member-Changed-716!';
  const duplicateAdmin = {
    id: 'legacy-shared-timestamp-id', username: 'duplicate-admin',
    password: bcrypt.hashSync(originalAdminPassword, 4), isAdmin: true, tokenVersion: 0
  };
  const duplicateMember = {
    id: duplicateAdmin.id, username: 'duplicate-member',
    password: bcrypt.hashSync(originalMemberPassword, 4), tokenVersion: 0
  };
  try {
    // The older administrator appears first, reproducing the historic id-only lookup.
    fs.writeFileSync(path.join(tempDir, 'users.json'), JSON.stringify({ users: [...originalUsers, duplicateAdmin, duplicateMember] }));
    const administratorToken = await login(duplicateAdmin.username, originalAdminPassword);
    const ordinaryToken = await login(duplicateMember.username, originalMemberPassword);
    const changed = await request('/api/auth/update-password', {
      method: 'PUT', token: ordinaryToken,
      body: { currentPassword: originalMemberPassword, newPassword: newMemberPassword }
    });
    assert.equal(changed.status, 200);
    assert.equal(changed.body.data.user.username, duplicateMember.username);
    assert.equal(changed.body.data.user.isAdmin, false);
    assert.deepEqual(persistedUsers().find(user => user.username === duplicateAdmin.username), duplicateAdmin);
    const updatedMember = persistedUsers().find(user => user.username === duplicateMember.username);
    assert.ok(bcrypt.compareSync(newMemberPassword, updatedMember.password));
    assert.equal(updatedMember.tokenVersion, 1);
    assert.notEqual(updatedMember.isAdmin, true);
    assert.equal((await request('/api/auth/me', { token: ordinaryToken })).status, 401);
    assert.equal((await request('/api/servers', { token: changed.body.data.token })).status, 403);
    assert.equal((await request('/api/servers', { token: administratorToken })).status, 200);
    await login(duplicateAdmin.username, originalAdminPassword);
    await login(duplicateMember.username, newMemberPassword);
  } finally {
    fs.writeFileSync(path.join(tempDir, 'users.json'), JSON.stringify({ users: originalUsers }));
  }
});
