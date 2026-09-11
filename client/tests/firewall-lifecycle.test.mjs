import assert from 'node:assert/strict';
import test from 'node:test';
import firewallLifecycle from '../src/features/firewall/lifecycle.js';
import { firewallComputed } from '../src/features/firewall/model.js';
import firewallWatchers from '../src/features/firewall/watchers.js';

test('Rules server state follows the authoritative Vuex record after connection updates', () => {
  const records = new Map([
    ['server-1', { _id: 'server-1', name: 'demo', status: 'offline' }]
  ]);
  const commits = [];
  const vm = {
    serverId: 'server-1',
    $store: {
      getters: {
        'servers/getServerById': id => records.get(id)
      },
      commit(type, server) {
        commits.push({ type, server });
        records.set(server._id, server);
      }
    }
  };

  assert.equal(firewallComputed.server.get.call(vm).status, 'offline');
  records.get('server-1').status = 'online';
  assert.equal(firewallComputed.server.get.call(vm).status, 'online');

  firewallComputed.server.set.call(vm, { _id: 'server-1', name: 'updated', status: 'online' });
  assert.deepEqual(commits, [{
    type: 'servers/upsertServer',
    server: { _id: 'server-1', name: 'updated', status: 'online' }
  }]);
});

test('Rules teardown stops status polling and deployment timers', () => {
  const removedListeners = [];
  const originalWindow = globalThis.window;
  globalThis.window = {
    removeEventListener(type, handler) {
      removedListeners.push({ type, handler });
    }
  };

  let socketDisconnected = false;
  let pollingStopped = false;
  let timersCleared = false;
  const resizeHandler = () => {};
  const vm = {
    viewDisposed: false,
    socket: { disconnect: () => { socketDisconnected = true; } },
    stopServerStatusCheck: () => { pollingStopped = true; },
    clearTimers: () => { timersCleared = true; },
    checkMobileDevice: resizeHandler
  };

  try {
    firewallLifecycle.beforeUnmount.call(vm);
  } finally {
    globalThis.window = originalWindow;
  }

  assert.equal(vm.viewDisposed, true);
  assert.equal(vm.socket, null);
  assert.equal(socketDisconnected, true);
  assert.equal(pollingStopped, true);
  assert.equal(timersCleared, true);
  assert.deepEqual(removedListeners, [{ type: 'resize', handler: resizeHandler }]);
});

test('Rules resets per-server state and initializes the new route parameter', async () => {
  let stopped = 0;
  let cleared = 0;
  let disconnected = 0;
  let initialized = 0;
  let started = 0;
  let mobileChecks = 0;
  const vm = {
    serverId: 'server-2',
    serverChangeToken: 0,
    viewDisposed: false,
    $data: {
      serverChangeToken: 0,
      viewDisposed: false,
      blockList: 'old server data',
      ipOperationDebounce: { timer: null }
    },
    ipOperationDebounce: { timer: null },
    socket: { disconnect: () => { disconnected += 1; } },
    stopServerStatusCheck: () => { stopped += 1; },
    clearTimers: () => { cleared += 1; },
    $nextTick: async () => {},
    checkMobileDevice: () => { mobileChecks += 1; },
    initializeApplication: async () => { initialized += 1; },
    startServerStatusCheck: () => { started += 1; },
    handleInvalidServerId: () => assert.fail('new server id should be valid')
  };

  // Vue proxies data properties onto the component. Mirror that behavior for
  // the values the watcher reads after resetting vm.$data.
  Object.defineProperties(vm, {
    blockList: {
      get: () => vm.$data.blockList,
      set: value => { vm.$data.blockList = value; }
    }
  });

  await firewallWatchers.serverId.call(vm, 'server-2', 'server-1');

  assert.equal(stopped, 1);
  assert.equal(cleared, 1);
  assert.equal(disconnected, 1);
  assert.equal(vm.$data.blockList, '');
  assert.equal(initialized, 1);
  assert.equal(started, 1);
  assert.equal(mobileChecks, 1);
});
