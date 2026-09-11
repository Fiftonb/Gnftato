import { test, expect } from '@playwright/test';

// Intercept every API and socket. Tests never contact managed hosts.
async function mockPanel(page, { isAdmin = true, scriptExists = true, socketDenied = false } = {}) {
  const state = {
    user: { _id: 'test-user', username: 'test-user', isAdmin, createdAt: '2026-01-01' },
    servers: [{ _id: 'test-server', name: '测试服务器', host: '192.0.2.10', port: 22, username: 'root', authType: 'password', status: 'online' }],
    calls: [], errors: [], socketAuth: [], socketEvents: [], expired: false
  };
  page.on('pageerror', error => state.errors.push(error.message));
  await page.route('**/api/**', async route => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const method = request.method();
    const body = request.postDataJSON();
    state.calls.push({ path, method, body, auth: request.headers().authorization });
    let status = 200;
    const json = { success: true, data: {} };
    if (path === '/api/auth/login') json.data = { token: 'test-token', user: state.user };
    else if (path === '/api/auth/me' && state.expired) { status = 401; json.success = false; }
    else if (path === '/api/auth/me') json.data = { user: state.user };
    else if (path === '/api/auth/update-password') json.data = { token: 'rotated-token', user: state.user };
    else if (path === '/api/auth/register') json.data = { user: { username: body.username, isAdmin: false } };
    else if (path === '/api/servers' && method === 'GET') json.data = state.servers;
    else if (path === '/api/servers' && method === 'POST') {
      const server = { ...body, _id: 'new-server', status: 'offline' };
      state.servers.push(server);
      json.data = server;
    } else if (path === '/api/servers/test-server' && method === 'PUT') {
      Object.assign(state.servers[0], body);
      json.data = state.servers[0];
    } else if (path === '/api/servers/test-server') json.data = state.servers[0];
    else if (path.endsWith('/checkScript')) json.exists = scriptExists;
    else if (path.endsWith('/logs')) json.data = 'SSH连接建立成功';
    else if (path.endsWith('/ddos/status')) json.data = '防御已启用';
    else if (path.endsWith('/status')) json.data = { status: 'online', backendConnected: true, connectionValid: true };
    else if (path.endsWith('/cache/last-update')) json.success = false;
    else if (path.endsWith('/ssh-port')) json.data = 'SSH端口: 22';
    else if (path.endsWith('/inbound/ports')) json.data = { tcp: [22, 443], udp: [53] };
    else if (path.endsWith('/inbound/ips')) json.data = ['192.0.2.5'];
    else if (path.endsWith('/blocklist')) json.data = '封禁端口: 25';
    else if (path.endsWith('/execute')) json.data = { stdout: '', stderr: '' };
    await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(json) });
  });
  await page.routeWebSocket('**/socket.io/**', socket => {
    socket.send('0' + JSON.stringify({ sid: 'test-engine', upgrades: [], pingInterval: 60000, pingTimeout: 60000 }));
    socket.onMessage(message => {
      if (message.startsWith('40')) {
        state.socketAuth.push(JSON.parse(message.slice(2)));
        socket.send(socketDenied
          ? '44' + JSON.stringify({ message: '登录已过期', data: { code: 'UNAUTHORIZED' } })
          : '40' + JSON.stringify({ sid: 'test-socket' }));
      } else if (message.startsWith('42')) {
        const event = JSON.parse(message.slice(2));
        state.socketEvents.push(event);
        if (event[0] === 'start_deploy') socket.send('42' + JSON.stringify(['deploy_log', { message: '测试部署日志', type: 'log' }]));
      }
    });
  });
  return state;
}

async function login(page) {
  await page.goto('/login');
  await page.getByPlaceholder('请输入用户名').fill('test-user');
  await page.getByPlaceholder('请输入密码', { exact: true }).fill('old-password');
  await page.getByRole('button', { name: '登录', exact: true }).click();
  await expect(page).not.toHaveURL(/\/login$/);
}

test('administrator forms, rules, mobile layout and session rotation', async ({ page }) => {
  const state = await mockPanel(page);
  await login(page);
  await page.getByRole('button', { name: '开始管理服务器' }).click();
  await page.getByRole('button', { name: '编辑', exact: true }).first().click();
  const dialog = page.getByRole('dialog');
  await dialog.getByPlaceholder('请输入服务器名称').fill('更新后的服务器');
  await dialog.getByRole('button', { name: '确定', exact: true }).click();
  await expect(dialog).toBeHidden();
  const update = state.calls.find(call => call.method === 'PUT' && call.path === '/api/servers/test-server');
  expect(update.body.name).toBe('更新后的服务器');
  expect(update.body.password).toBe('');
  expect(update.body).not.toHaveProperty('_id');
  await page.getByRole('button', { name: '添加服务器', exact: true }).click();
  await expect(dialog.getByPlaceholder('请输入服务器名称')).toHaveValue('');
  await dialog.getByPlaceholder('请输入服务器名称').fill('新服务器');
  await dialog.getByPlaceholder('请输入主机IP或域名').fill('192.0.2.20');
  await dialog.getByPlaceholder('请输入用户名').fill('root');
  await dialog.getByText('密钥', { exact: true }).click();
  await dialog.getByPlaceholder('请输入私钥内容').fill('test-private-key');
  await dialog.getByRole('button', { name: '确定', exact: true }).click();
  await expect(dialog).toBeHidden();
  expect(state.calls.find(call => call.path === '/api/servers' && call.method === 'POST').body.authType).toBe('privateKey');
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('.mobile-server-card').first()).toBeVisible();
  await page.setViewportSize({ width: 1440, height: 1000 });

  await page.goto('/rules/test-server');
  await page.getByRole('tab', { name: '入网控制' }).waitFor();
  await expect(page.getByRole('cell', { name: '443', exact: true }).first()).toBeVisible();
  await expect(page.getByRole('row').filter({ has: page.getByRole('cell', { name: '22', exact: true }) }).getByRole('button', { name: '取消放行' }).first()).toBeDisabled();
  await page.getByPlaceholder('如: 80,443').fill('8443');
  await page.getByRole('button', { name: '添加', exact: true }).first().click();
  await expect.poll(() => state.calls.some(call => call.path.endsWith('/inbound/allow/ports') && call.body.ports === '8443')).toBe(true);
  await page.getByRole('tab', { name: '出网控制' }).click();
  await expect(page.getByRole('button', { name: '封禁SPAM', exact: true })).toBeVisible();
  await page.getByRole('tab', { name: 'DDoS防御' }).click();
  await page.getByRole('button', { name: '管理IP黑白名单', exact: true }).click();
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: '关闭', exact: true }).click();
  await expect(dialog).toBeHidden();

  await page.goto('/profile');
  await page.getByPlaceholder('请输入当前密码').fill('old-password');
  await page.getByPlaceholder('请输入新密码').fill('new-test-password');
  await page.getByPlaceholder('请再次输入新密码').fill('new-test-password');
  await page.getByRole('button', { name: '修改密码', exact: true }).click();
  await expect.poll(() => page.evaluate(() => localStorage.getItem('token'))).toBe('rotated-token');
  await page.goto('/users/new');
  await page.getByPlaceholder('请输入用户名').fill('regular-user');
  await page.getByPlaceholder('请输入密码', { exact: true }).fill('regular-test-password');
  await page.getByPlaceholder('请再次输入密码').fill('regular-test-password');
  await page.getByRole('button', { name: '创建账号', exact: true }).click();
  await expect(page).toHaveURL(/\/profile$/);
  expect(await page.evaluate(() => localStorage.getItem('token'))).toBe('rotated-token');
  expect(state.calls.find(call => call.path === '/api/auth/register').auth).toBe('Bearer rotated-token');
  expect(state.errors).toEqual([]);
});

test('regular users and expired sessions cannot enter administrative pages', async ({ page }) => {
  const state = await mockPanel(page, { isAdmin: false });
  await login(page);
  await expect(page).toHaveURL(/\/profile$/);
  for (const path of ['/servers', '/rules/test-server', '/users/new']) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/profile$/);
  }
  expect(state.calls.some(call => call.path.startsWith('/api/servers'))).toBe(false);
  state.expired = true;
  await page.reload();
  await expect(page).toHaveURL(/\/login$/);
  expect(await page.evaluate(() => localStorage.getItem('token'))).toBeNull();
  expect(state.errors).toEqual([]);
});

for (const socketDenied of [false, true]) {
  test(`deployment socket ${socketDenied ? 'rejects expired authentication' : 'sends session token and receives logs'}`, async ({ page }) => {
    const state = await mockPanel(page, { scriptExists: false, socketDenied });
    await login(page);
    await page.goto('/rules/test-server');
    await page.getByRole('button', { name: '开始部署', exact: true }).click();
    await expect.poll(() => state.socketAuth).toEqual([{ token: 'test-token' }]);
    if (socketDenied) {
      await expect(page).toHaveURL(/\/login$/);
      await page.waitForTimeout(3500); // Cover the old delayed deployment fallback after auth rejection.
      expect(state.socketEvents).toEqual([]);
      expect(state.calls.some(call => call.path.endsWith('/deploy'))).toBe(false);
    } else {
      await expect(page.getByText('测试部署日志', { exact: true })).toBeVisible();
      expect(state.socketEvents).toContainEqual(['start_deploy', { serverId: 'test-server' }]);
    }
    expect(state.errors).toEqual([]);
  });
}
