import assert from 'node:assert/strict';
import test from 'node:test';
import cacheMethods from '../src/features/firewall/cacheMethods.js';
import connectionMethods from '../src/features/firewall/connectionMethods.js';
import ddosMethods from '../src/features/firewall/ddosMethods.js';
import deploymentMethods from '../src/features/firewall/deploymentMethods.js';
import { createFirewallState, firewallComputed } from '../src/features/firewall/model.js';
import queryMethods from '../src/features/firewall/queryMethods.js';
import ruleMethods from '../src/features/firewall/ruleMethods.js';

const methodGroups = {
  cacheMethods,
  connectionMethods,
  ddosMethods,
  deploymentMethods,
  queryMethods,
  ruleMethods
};

test('firewall method modules have disjoint responsibilities', () => {
  const owners = new Map();

  for (const [group, methods] of Object.entries(methodGroups)) {
    for (const name of Object.keys(methods)) {
      assert.equal(owners.has(name), false, `${name} is defined by both ${owners.get(name)} and ${group}`);
      owners.set(name, group);
    }
  }

  assert.equal(owners.size, 67);
  for (const requiredMethod of [
    'initializeApplication',
    'refreshInboundPorts',
    'allowPort',
    'setupDdosProtectionAction',
    'initWebSocket'
  ]) {
    assert.equal(owners.has(requiredMethod), true, `${requiredMethod} must remain available to Rules.vue`);
  }
});

test('each firewall view receives isolated mutable state', () => {
  const first = createFirewallState();
  const second = createFirewallState();

  first.dataCache.inboundPorts = { tcp: [22], udp: [22] };
  first.deployLogs.push({ type: 'success', message: 'done' });

  assert.equal(second.dataCache.inboundPorts, null);
  assert.deepEqual(second.deployLogs, []);
});

test('formattedPorts preserves the existing merged TCP/UDP view', () => {
  const formatted = firewallComputed.formattedPorts.call({
    dataCache: {
      inboundPorts: { tcp: [22, 80], udp: [53, 80] }
    }
  });

  assert.deepEqual(formatted, [
    { port: 22, protocol: 'TCP/UDP' },
    { port: 80, protocol: 'TCP/UDP' },
    { port: 53, protocol: 'TCP/UDP' }
  ]);
});
