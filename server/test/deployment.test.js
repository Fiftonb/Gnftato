'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { EventEmitter } = require('node:events');
const { Writable } = require('node:stream');

// Block all real connections and all application-data modules before loading
// the production service. Remote commands below are only inspected as strings.
function mockModule(name, exports) {
  const filename = require.resolve(name);
  require.cache[filename] = { id: filename, filename, loaded: true, exports };
}
mockModule('ssh2', { Client: class { constructor() { throw new Error('Real SSH forbidden in deployment tests'); } } });
mockModule('../models/Server', { findById: async () => ({ status: 'online' }) });
let cacheClears = [];
mockModule('../services/cacheService', { clearServerRulesCache: async id => { cacheClears.push(id); } });
const SSHService = require('../services/sshService').constructor;
const packagedScript = path.resolve(__dirname, '../scripts/Nftato.sh');

function setup({ location = 'missing', failChecksum = false, exitCode = 0, failInstall = false, remoteHome = '/root' } = {}) {
  const service = new SSHService();
  const commands = [];
  const streams = [];
  const uploads = [];
  let closed = 0;
  const sftp = new EventEmitter();
  sftp.end = () => { closed += 1; };
  sftp.createWriteStream = (remotePath, options) => {
    const record = { remotePath, options, chunks: [] };
    uploads.push(record);
    return new Writable({ write(chunk, encoding, done) { record.chunks.push(Buffer.from(chunk)); done(); } });
  };
  service.connections.target = { sftp: done => done(null, sftp) };
  service.checkConnection = () => true;
  service.connect = async () => { throw new Error('Existing test connection must be reused'); };
  service.executeCommand = async (id, command) => {
    assert.equal(id, 'target');
    commands.push(command);
    assert.doesNotMatch(command, /wget|curl|https?:\/\//);
    if (command.startsWith('if [ -f')) return { code: 0, stdout: location };
    if (command.endsWith('"$HOME"')) return { code: 0, stdout: remoteHome + '\n' };
    if (command.includes('sha256sum')) {
      const uploadedHash = createHash('sha256').update(Buffer.concat(uploads[0].chunks)).digest('hex');
      assert.ok(command.includes(uploadedHash), 'verification must cover the bytes actually uploaded');
      return { code: failChecksum ? 1 : 0, stdout: '' };
    }
    if (command.startsWith('chmod') && failInstall) return { code: 1, stdout: '' };
    return { code: 0, stdout: '' };
  };
  service.executeCommandWithStream = async (id, command, log) => {
    streams.push(command);
    assert.doesNotMatch(command, /\|\||wget|curl/);
    log('mock initialization output', 'log');
    return { code: exitCode, stdout: 'mock output', stderr: '' };
  };
  cacheClears = [];
  return { service, commands, streams, uploads, sftp, closed: () => closed };
}

test('missing script uploads the packaged bytes, verifies before atomic installation, then initializes', async () => {
  const qa = setup();
  const logs = [];
  const result = await qa.service.deployIptato('target', event => logs.push(event));
  assert.equal(result.success, true);
  assert.equal(qa.uploads.length, 1);
  assert.deepEqual(Buffer.concat(qa.uploads[0].chunks), fs.readFileSync(packagedScript));
  assert.match(qa.uploads[0].remotePath, /^\/root\/\.Nftato\.sh\.[a-f0-9-]+\.upload$/);
  assert.equal(qa.uploads[0].options.mode, 0o600);
  assert.equal(qa.closed(), 1);
  const verifyIndex = qa.commands.findIndex(command => command.includes('sha256sum'));
  const installIndex = qa.commands.findIndex(command => command.includes('mv --'));
  assert.ok(verifyIndex >= 0 && installIndex > verifyIndex);
  assert.deepEqual(qa.streams, ["AUTOMATED=yes bash '/root/Nftato.sh' 20"]);
  assert.deepEqual(cacheClears, ['target']);
  assert.ok(logs.some(event => event.message === 'mock initialization output' && event.type === 'log'));
});

for (const location of ['root', 'home']) {
  test(`existing ${location} script is reused without uploading or rebuilding rules`, async () => {
    const qa = setup({ location, remoteHome: '/home/operator' });
    assert.equal((await qa.service.deployIptatoWithLogs('target')).success, true);
    assert.equal(qa.uploads.length, 0);
    assert.equal(qa.streams.length, 0);
    assert.deepEqual(cacheClears, []);
    assert.ok(qa.commands.some(command => command.startsWith('if [ ! -x ') && command.includes('then chmod +x -- ')));
  });
}

test('checksum failure cleans the temporary file and never installs or executes it', async () => {
  const qa = setup({ failChecksum: true });
  const result = await qa.service.deployIptatoWithLogs('target');
  assert.equal(result.success, false);
  assert.match(result.error, /SHA-256/);
  assert.equal(qa.streams.length, 0);
  assert.ok(!qa.commands.some(command => command.includes('mv --')));
  assert.ok(qa.commands.some(command => command.startsWith('rm -f -- ')));
  assert.deepEqual(cacheClears, []);
});

test('installation failure cleans staging and fails before initialization', async () => {
  const qa = setup({ failInstall: true });
  await assert.rejects(qa.service.deployIptato('target'), /安装上传脚本失败/);
  assert.equal(qa.streams.length, 0);
  assert.ok(qa.commands.some(command => command.startsWith('rm -f -- ')));
});

test('nonzero initialization exit is returned to sockets and rejected by the REST wrapper', async () => {
  let qa = setup({ exitCode: 23 });
  const result = await qa.service.deployIptatoWithLogs('target');
  assert.equal(result.success, false);
  assert.match(result.error, /退出码: 23/);
  assert.deepEqual(cacheClears, []);
  qa = setup({ exitCode: 23 });
  await assert.rejects(qa.service.deployIptato('target'), /退出码: 23/);
});

test('remote home paths are quoted, including apostrophes and spaces', async () => {
  const qa = setup({ remoteHome: "/home/operator's files" });
  assert.equal((await qa.service.deployIptatoWithLogs('target')).success, true);
  assert.equal(qa.uploads[0].remotePath.startsWith("/home/operator's files/"), true);
  assert.deepEqual(qa.streams, ["AUTOMATED=yes bash '/home/operator'\"'\"'s files/Nftato.sh' 20"]);
});

test('a local upload read failure rejects and closes the SFTP session', async () => {
  const qa = setup();
  await assert.rejects(qa.service.uploadFile('target', path.join(__dirname, 'missing-local-script'), '/tmp/fixture'), /ENOENT/);
  assert.equal(qa.closed(), 1);
});

test('a remote upload write failure rejects and closes the SFTP session', async () => {
  const qa = setup();
  qa.sftp.createWriteStream = () => new Writable({ write(chunk, encoding, done) { done(new Error('mock remote disk full')); } });
  await assert.rejects(qa.service.uploadFile('target', packagedScript, '/tmp/fixture'), /mock remote disk full/);
  assert.equal(qa.closed(), 1);
});

test('an SFTP session error rejects the upload and closes its channel', async () => {
  const qa = setup();
  qa.sftp.createWriteStream = () => new Writable({ write(chunk, encoding, done) {
    qa.sftp.emit('error', new Error('mock SFTP disconnected'));
    done();
  } });
  await assert.rejects(qa.service.uploadFile('target', packagedScript, '/tmp/fixture'), /mock SFTP disconnected/);
  assert.equal(qa.closed(), 1);
});

test('a synchronous remote stream creation failure rejects and closes its channel', async () => {
  const qa = setup();
  qa.sftp.createWriteStream = () => { throw new Error('mock stream creation failed'); };
  await assert.rejects(qa.service.uploadFile('target', path.join(__dirname, 'missing-local-script'), '/tmp/fixture'), /mock stream creation failed/);
  assert.equal(qa.closed(), 1);
});
