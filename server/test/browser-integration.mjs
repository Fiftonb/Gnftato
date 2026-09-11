import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { createRequire } from 'node:module';
import { chromium, expect } from '../../client/node_modules/@playwright/test/index.mjs';

const require = createRequire(import.meta.url);
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gnftato-browser-api-'));
process.env.NODE_ENV = 'test';
process.env.DATA_DIR = dataDir;
process.env.JWT_SECRET = randomBytes(48).toString('hex');
const password = 'Browser-Integration-Initial!';
const updatedPassword = 'Browser-Integration-Updated!';
const bcrypt = require('bcryptjs');
fs.writeFileSync(path.join(dataDir, 'users.json'), JSON.stringify({ users: [{
  id: 'legacy-administrator', username: 'operator', isAdmin: true,
  password: await bcrypt.hash(password, 10)
}] }));

// The browser and HTTP API are real; SSH is disabled as an extra isolation guard.
const ssh = require('../services/sshService');
let sshCalls = 0;
for (const method of ['connect', 'executeCommand', 'deployIptato', 'deployIptatoWithLogs']) {
  ssh[method] = async () => { sshCalls++; throw new Error('SSH disabled in browser integration'); };
}
const { createApplication } = require('../app');
const { server, io } = createApplication();
let browser;
try {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  await page.goto(`${base}/login`);
  await page.getByPlaceholder('请输入用户名').fill('operator');
  await page.getByPlaceholder('请输入密码', { exact: true }).fill(password);
  await page.getByRole('button', { name: '登录', exact: true }).click();
  await page.waitForURL(base + '/');
  const oldToken = await page.evaluate(() => localStorage.getItem('token'));
  assert.ok(oldToken);
  const me = await fetch(`${base}/api/auth/me`, { headers: { Authorization: `Bearer ${oldToken}` } });
  assert.equal((await me.json()).data.user.isAdmin, true);

  await page.goto(`${base}/users/new`);
  await page.getByPlaceholder('请输入用户名').fill('new-regular-user');
  await page.getByPlaceholder('请输入密码', { exact: true }).fill('Regular-User-Password!');
  await page.getByPlaceholder('请再次输入密码').fill('Regular-User-Password!');
  await page.getByRole('button', { name: '创建账号', exact: true }).click();
  await page.waitForURL(`${base}/profile`);
  assert.equal(await page.evaluate(() => localStorage.getItem('token')), oldToken);
  const user = JSON.parse(fs.readFileSync(path.join(dataDir, 'users.json'))).users.find(user => user.username === 'new-regular-user');
  assert.equal(user.isAdmin, false);

  await page.getByPlaceholder('请输入当前密码').fill(password);
  await page.getByPlaceholder('请输入新密码').fill(updatedPassword);
  await page.getByPlaceholder('请再次输入新密码').fill(updatedPassword);
  await page.getByRole('button', { name: '修改密码', exact: true }).click();
  await expect.poll(() => page.evaluate(() => localStorage.getItem('token'))).not.toBe(oldToken);
  const newToken = await page.evaluate(() => localStorage.getItem('token'));
  assert.ok(newToken);
  const revoked = await fetch(`${base}/api/auth/me`, { headers: { Authorization: `Bearer ${oldToken}` } });
  assert.equal(revoked.status, 401);
  await page.reload();
  await expect(page).toHaveURL(`${base}/profile`);
  await expect(page.locator('.user-dropdown')).toContainText('operator');
  const current = await fetch(`${base}/api/auth/me`, { headers: { Authorization: `Bearer ${newToken}` } });
  assert.equal(current.status, 200);
  const anonymous = await fetch(`${base}/api/auth/register`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'intruder', password: 'Not-Allowed-Password!' })
  });
  assert.equal(anonymous.status, 401);
  assert.equal(sshCalls, 0);
  assert.deepEqual(pageErrors, []);
  console.log('Real browser/API integration passed: legacy login, account creation, session preservation, password rotation, revoked-token rejection.');
} finally {
  await browser?.close();
  await new Promise(resolve => io.close(resolve));
  if (server.listening) await new Promise(resolve => server.close(resolve));
  fs.rmSync(dataDir, { recursive: true, force: true });
}
