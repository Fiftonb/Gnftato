'use strict';

const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { test } = require('node:test');
const { CommandExecutor } = require('../services/commandExecutor');
const { ConnectionManager } = require('../services/connectionManager');
const { PerServerMutationQueue } = require('../services/mutationQueue');
const { buildCommand, resolveCommand } = require('../services/nftatoCommandRegistry');
const SSHService = require('../services/sshService').constructor;
const NftablesService = require('../services/nftablesService').constructor;

function streamResult(code = 0, stdout = '', stderr = '') {
  const stream = new EventEmitter();
  stream.stderr = new EventEmitter();
  process.nextTick(() => {
    if (stdout) stream.emit('data', Buffer.from(stdout));
    if (stderr) stream.stderr.emit('data', Buffer.from(stderr));
    stream.emit('close', code);
  });
  return stream;
}

function managerFor(connection) {
  return {
    checkConnection: () => true,
    connect: async () => {},
    getConnection: () => connection
  };
}

test('mutation commands never retry callback errors or nonzero exits', async () => {
  let callbackErrors = 0;
  const errorExecutor = new CommandExecutor(managerFor({
    exec(command, callback) {
      callbackErrors += 1;
      callback(new Error('channel unavailable'));
    }
  }), { retryDelayMs: 0 });
  await assert.rejects(errorExecutor.execute('server', 'change firewall'), /channel unavailable/);
  assert.equal(callbackErrors, 1);

  let exits = 0;
  const exitExecutor = new CommandExecutor(managerFor({
    exec(command, callback) {
      exits += 1;
      callback(null, streamResult(9, '', 'failed'));
    }
  }), { retryDelayMs: 0 });
  assert.equal((await exitExecutor.execute('server', 'change firewall')).code, 9);
  assert.equal(exits, 1);
});

test('only explicitly read-only commands retry transient failures', async () => {
  let attempts = 0;
  const executor = new CommandExecutor(managerFor({
    exec(command, callback) {
      attempts += 1;
      if (attempts < 3) callback(new Error('transient channel failure'));
      else callback(null, streamResult(0, 'ready'));
    }
  }), { readRetries: 2, retryDelayMs: 0 });
  const result = await executor.execute('server', 'inspect firewall', { readOnly: true });
  assert.equal(result.stdout, 'ready');
  assert.equal(attempts, 3);
});

test('read-only command exit codes are results and are not retried', async () => {
  let attempts = 0;
  const executor = new CommandExecutor(managerFor({
    exec(command, callback) {
      attempts += 1;
      callback(null, streamResult(2, '', 'invalid query'));
    }
  }), { readRetries: 2, retryDelayMs: 0 });
  const result = await executor.execute('server', 'inspect firewall', { readOnly: true });
  assert.equal(result.code, 2);
  assert.equal(attempts, 1);
});

test('a dispatched mutation timeout is terminated and reported as an unknown outcome', async () => {
  let attempts = 0;
  let closes = 0;
  const executor = new CommandExecutor(managerFor({
    exec(command, callback) {
      attempts += 1;
      const stream = new EventEmitter();
      stream.stderr = new EventEmitter();
      stream.close = () => { closes += 1; };
      stream.destroy = () => {};
      callback(null, stream);
    }
  }), { timeoutMs: 10, readRetries: 5, retryDelayMs: 0 });
  await assert.rejects(
    executor.execute('server', 'change firewall'),
    error => error.code === 'COMMAND_OUTCOME_UNKNOWN' && error.outcomeUnknown === true
  );
  assert.equal(attempts, 1);
  assert.equal(closes, 1);
});

test('a streaming mutation timeout closes its channel and reports an unknown outcome', async () => {
  let closes = 0;
  const executor = new CommandExecutor(managerFor({
    exec(command, callback) {
      const stream = new EventEmitter();
      stream.stderr = new EventEmitter();
      stream.close = () => { closes += 1; };
      stream.destroy = () => {};
      callback(null, stream);
    }
  }));
  await assert.rejects(
    executor.executeStream('server', 'deploy firewall', () => {}, { timeoutMs: 10 }),
    error => error.code === 'COMMAND_OUTCOME_UNKNOWN' && error.outcomeUnknown === true
  );
  assert.equal(closes, 1);
});

test('the command registry validates types, rejects injection, and safely quotes accepted values', () => {
  assert.throws(() => buildCommand('/root/Nftato.sh', 4, '80; touch /tmp/injected'), /端口格式无效/);
  assert.throws(() => buildCommand('/root/Nftato.sh', 17, '192.0.2.1 && id'), /IP地址格式无效/);
  assert.throws(() => buildCommand('/root/Nftato.sh', 23, [443, 4, 1, 1, 1, 1]), /协议类型/);
  assert.equal(resolveCommand(15, '8000:8010').args[0], '8000-8010');
  assert.equal(resolveCommand('ddos:status').legacyCode, 25);
  const command = buildCommand("/home/operator's files/Nftato.sh", 'outbound:block-keyword', 'youtube.com?q=a+b');
  assert.equal(command.legacyCode, 5);
  assert.equal(command.command, "bash '/home/operator'\"'\"'s files/Nftato.sh' 5 'youtube.com?q=a+b'");
  assert.match(
    buildCommand('/root/Nftato.sh', 'outbound:block-keyword', 'path with space/?a=1&b=2').command,
    /'path with space\/\?a=1&b=2'$/
  );
  assert.throws(() => buildCommand('/root/Nftato.sh', 5, 'first\nsecond'), /关键词包含无效字符/);
  assert.deepEqual(resolveCommand(24, [1, '192.0.2.1', 0]).args, ['1', '192.0.2.1', '0']);
});

function sshFacadeWith(commandResult) {
  const commands = [];
  const connectionManager = {
    connections: { server: {} },
    checkConnection: () => true,
    getStatus: () => ({ status: 'online', connected: true, valid: true })
  };
  const executor = {
    async execute(id, command, options) {
      commands.push({ id, command, options });
      if (command.startsWith('if [ -f /root/Nftato.sh')) return { code: 0, stdout: 'root', stderr: '' };
      if (command.startsWith('grep -Fq')) return commandResult.probe;
      return commandResult.run(command);
    },
    executeStream: async () => ({ code: 0, stdout: '', stderr: '' })
  };
  return {
    service: new SSHService({ connectionManager, executor, transfer: {}, mutationQueue: new PerServerMutationQueue() }),
    commands
  };
}

test('new scripts use named commands and parse their JSON result envelope', async () => {
  const qa = sshFacadeWith({
    probe: { code: 0, stdout: '', stderr: '' },
    run: command => ({ code: 0, stdout: JSON.stringify({ success: true, command: 'outbound:block-ports', exitCode: 0, output: 'changed' }), stderr: '' })
  });
  const result = await qa.service.executeNftato('server', 4, '80,443');
  assert.equal(result.success, true);
  assert.equal(result.output, 'changed');
  assert.ok(qa.commands.some(call => call.command === "bash '/root/Nftato.sh' --json 'outbound:block-ports' '80,443'"));
});

test('legacy scripts retain numeric action compatibility after a read-only capability check', async () => {
  const qa = sshFacadeWith({
    probe: { code: 1, stdout: '', stderr: '' },
    run: command => ({ code: 0, stdout: 'legacy output', stderr: '' })
  });
  const result = await qa.service.executeNftato('server', 'inbound:allow-ports', '443');
  assert.equal(result.success, true);
  assert.equal(result.output, 'legacy output');
  assert.ok(qa.commands.some(call => call.command === "bash '/root/Nftato.sh' 15 '443'"));
});

test('a malformed JSON response from a dispatched mutation never falls back and reports unknown outcome', async () => {
  const qa = sshFacadeWith({
    probe: { code: 0, stdout: '', stderr: '' },
    run: command => ({ code: 0, stdout: 'not-json', stderr: '' })
  });
  const result = await qa.service.executeNftato('server', 4, '80');
  assert.equal(result.success, false);
  assert.equal(result.outcomeUnknown, true);
  assert.match(result.error, /结果未知/);
  assert.equal(qa.commands.filter(call => call.command.startsWith("bash '/root/Nftato.sh'")).length, 1);
});

test('the compact nftables facade preserves port and IPv4/IPv6 parsing', () => {
  const service = new NftablesService({ ssh: {}, serverRepository: {} });
  assert.deepEqual(
    service._parsePortOutput('TCP端口:\n22 443\n=====\nUDP端口:\n53 443\n====='),
    { tcp: [22, 443], udp: [53, 443] }
  );
  assert.deepEqual(
    service._parseIPOutput('允许: 192.0.2.1, 2001:db8::1/64; 忽略 999.2.3.4'),
    ['192.0.2.1', '2001:db8::1/64']
  );
});

test('the backend refuses to remove the configured SSH port before remote execution', async () => {
  let executions = 0;
  const service = new NftablesService({
    ssh: {
      checkConnection: () => true,
      executeNftato: async () => { executions += 1; return { success: true, output: '' }; }
    },
    serverRepository: { findById: async () => ({ port: 2222 }) }
  });
  const result = await service.disallowInboundPorts('server', '2000-2300');
  assert.equal(result.success, false);
  assert.match(result.error, /SSH端口\(2222\)/);
  assert.equal(executions, 0);
});

test('firewall mutations are serial per server while different servers proceed independently', async () => {
  const queue = new PerServerMutationQueue();
  const events = [];
  let releaseFirst;
  const gate = new Promise(resolve => { releaseFirst = resolve; });
  const first = queue.run('a', async () => { events.push('a1-start'); await gate; events.push('a1-end'); });
  const second = queue.run('a', async () => { events.push('a2-start'); events.push('a2-end'); });
  const other = queue.run('b', async () => { events.push('b-start'); events.push('b-end'); });
  await other;
  assert.deepEqual(events, ['a1-start', 'b-start', 'b-end']);
  releaseFirst();
  await Promise.all([first, second]);
  assert.deepEqual(events, ['a1-start', 'b-start', 'b-end', 'a1-end', 'a2-start', 'a2-end']);
  assert.equal(queue.pending('a'), false);
});

test('a failed firewall mutation releases the queue for the next operation', async () => {
  const queue = new PerServerMutationQueue();
  const first = queue.run('server', async () => { throw new Error('first failed'); });
  const second = queue.run('server', async () => 'second completed');
  await assert.rejects(first, /first failed/);
  assert.equal(await second, 'second completed');
  assert.equal(queue.pending('server'), false);
});

test('connection status is in-memory authority and ignores persisted online state after restart', async () => {
  let persistedWrites = 0;
  class FakeClient extends EventEmitter {
    constructor() {
      super();
      this._sock = { readable: true, writable: true, destroyed: false };
    }
    connect() { process.nextTick(() => this.emit('ready')); }
    end() { process.nextTick(() => this.emit('end')); }
  }
  const manager = new ConnectionManager({
    ClientClass: FakeClient,
    serverRepository: {
      findById: async () => ({ _id: 'server', status: 'online', host: '192.0.2.1', username: 'root' }),
      findByIdAndUpdate: async () => { persistedWrites += 1; }
    }
  });
  assert.equal(manager.getStatus('server').status, 'offline');
  await manager.connect('server');
  assert.equal(manager.getStatus('server').status, 'online');
  assert.equal(manager.checkConnection('server'), true);
  await manager.disconnect('server');
  assert.equal(manager.getStatus('server').status, 'offline');
  assert.equal(persistedWrites, 0);
});

test('late events from a replaced connection cannot overwrite the current online state', async () => {
  const clients = [];
  class FakeClient extends EventEmitter {
    constructor() { super(); this._sock = { readable: true, writable: true }; clients.push(this); }
    connect() { process.nextTick(() => this.emit('ready')); }
    end() {}
  }
  const manager = new ConnectionManager({
    ClientClass: FakeClient,
    serverRepository: { findById: async () => ({ host: '192.0.2.1', username: 'root' }) }
  });
  await manager.connect('server');
  await manager.disconnect('server');
  await manager.connect('server');
  clients[0].emit('close', true);
  clients[0].emit('end');
  assert.equal(manager.getStatus('server').status, 'online');
  assert.equal(manager.getConnection('server'), clients[1]);
});

test('a connection closed before ready rejects instead of leaving connect pending', async () => {
  class EarlyCloseClient extends EventEmitter {
    connect() { process.nextTick(() => this.emit('close', false)); }
    end() {}
  }
  const manager = new ConnectionManager({
    ClientClass: EarlyCloseClient,
    serverRepository: { findById: async () => ({ host: '192.0.2.1', username: 'root' }) }
  });
  await assert.rejects(manager.connect('server'), /就绪前关闭/);
  assert.equal(manager.getStatus('server').status, 'error');
});

test('a connection test closed before ready rejects instead of hanging', async () => {
  class EarlyCloseClient extends EventEmitter {
    connect() { process.nextTick(() => this.emit('close', false)); }
    end() {}
  }
  const manager = new ConnectionManager({ ClientClass: EarlyCloseClient });
  await assert.rejects(
    manager.testConnection({ host: '192.0.2.1', username: 'root' }),
    /连接测试在就绪前关闭/
  );
});
