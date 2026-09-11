import assert from 'node:assert/strict';
import test from 'node:test';
import {
  errorMessage,
  normalizeServerStatus,
  statusPatchFromResponse
} from '../src/features/servers/serverStatus.js';
import { createServerStatusMonitor } from '../src/features/servers/serverStatusMonitor.js';

test('status normalization uses structured connection validity as the authority', () => {
  assert.equal(normalizeServerStatus({
    data: { status: 'offline', backendConnected: true, backendConnectionValid: true }
  }), 'online');

  assert.equal(normalizeServerStatus({
    data: { status: 'online', backendConnected: true, backendConnectionValid: false }
  }), 'offline');

  assert.equal(normalizeServerStatus({
    connectionStatus: { databaseStatus: 'error', actualConnected: true, connectionValid: true },
    data: 'arbitrary human-readable log text'
  }), 'online');

  assert.equal(normalizeServerStatus({
    data: { status: 'online', connected: false, valid: false }
  }), 'offline');
});

test('status normalization supports connect responses and legacy backendConnected responses', () => {
  assert.equal(normalizeServerStatus({ serverStatus: 'online' }), 'online');
  assert.equal(normalizeServerStatus({ data: { backendConnected: true } }), 'online');
  assert.equal(normalizeServerStatus({ data: { backendConnected: false } }, 'online'), 'offline');
  assert.equal(normalizeServerStatus({ data: 'SSH连接建立成功' }), 'offline');

  const connectPatch = statusPatchFromResponse({ serverStatus: 'online' }, 'offline', 'now');
  assert.equal(connectPatch.backendConnected, true);
  assert.equal(connectPatch.backendConnectionValid, true);
});

test('status patches preserve structured backend facts and a deterministic check time', () => {
  assert.deepEqual(statusPatchFromResponse({
    data: {
      status: 'online',
      backendConnected: true,
      backendConnectionValid: true
    }
  }, 'offline', '2026-09-11T00:00:00.000Z'), {
    status: 'online',
    backendConnected: true,
    backendConnectionValid: true,
    lastChecked: '2026-09-11T00:00:00.000Z'
  });
});

test('API errors preserve backend details and warn when a mutation outcome is unknown', () => {
  assert.equal(errorMessage({
    response: { data: { error: 'SSH连接中断', outcomeUnknown: true } }
  }), 'SSH连接中断（操作结果未知，请先刷新状态，避免重复执行）');
  assert.equal(errorMessage({ message: 'network failed' }), 'network failed');
});

test('status monitor has one timer and coalesces overlapping refreshes', async () => {
  let scheduled;
  let cleared;
  let calls = 0;
  let finishRefresh;
  const refreshGate = new Promise(resolve => { finishRefresh = resolve; });

  const monitor = createServerStatusMonitor({
    refresh: async () => {
      calls += 1;
      await refreshGate;
    },
    setIntervalFn: callback => {
      scheduled = callback;
      return 42;
    },
    clearIntervalFn: id => { cleared = id; }
  });

  monitor.start();
  monitor.start();
  assert.equal(monitor.isRunning(), true);

  const first = scheduled();
  const second = scheduled();
  await Promise.resolve();
  assert.equal(calls, 1);

  finishRefresh();
  await Promise.all([first, second]);
  monitor.stop();

  assert.equal(cleared, 42);
  assert.equal(monitor.isRunning(), false);
});
