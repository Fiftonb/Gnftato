'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { randomBytes } = require('node:crypto');
const bcrypt = require('bcryptjs');

const serverDir = path.resolve(__dirname, '..');
const configuredSecret = randomBytes(48).toString('hex');
const strongPassword = 'Administrator-Regression-981!';

function fixture(t, variables = {}) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gnftato-admin-init-'));
  t.after(() => fs.rmSync(dataDir, { recursive: true, force: true }));
  const env = {
    ...process.env,
    NODE_ENV: 'test',
    DATA_DIR: dataDir,
    JWT_SECRET: configuredSecret,
    ADMIN_USERNAME: 'admin',
    ADMIN_PASSWORD: '',
    ...variables
  };
  const usersFile = path.join(dataDir, 'users.json');
  return {
    dataDir,
    env,
    usersFile,
    seed(users) { fs.writeFileSync(usersFile, JSON.stringify({ users })); },
    read() { return JSON.parse(fs.readFileSync(usersFile, 'utf8')).users; },
    run() {
      const result = spawnSync(process.execPath, ['scripts/createAdmin.js'], {
        cwd: serverDir, env, encoding: 'utf8', timeout: 10000
      });
      assert.equal(result.error, undefined);
      return result;
    }
  };
}

test('administrator initialization requires an explicit strong password and never uses a default', async t => {
  for (const suppliedPassword of ['', 'admin123', '            ', '长'.repeat(25)]) {
    const setup = fixture(t, { ADMIN_PASSWORD: suppliedPassword });
    const result = setup.run();
    assert.equal(result.status, 1);
    assert.equal(fs.existsSync(setup.usersFile), false);
  }
});

test('administrator initialization persists a bcrypt hash and private file without printing the password', async t => {
  const setup = fixture(t, { ADMIN_USERNAME: 'operator', ADMIN_PASSWORD: strongPassword });
  const result = setup.run();
  assert.equal(result.status, 0, result.stderr);
  const [user] = setup.read();
  assert.equal(user.username, 'operator');
  assert.equal(user.isAdmin, true);
  assert.equal(user.tokenVersion, 0);
  assert.equal(typeof user.id, 'string');
  assert.ok(bcrypt.compareSync(strongPassword, user.password));
  assert.ok(!`${result.stdout}${result.stderr}`.includes(strongPassword));
  assert.equal(fs.statSync(setup.usersFile).mode & 0o077, 0);
});

test('restart preserves existing administrators and their passwords, including legacy records', async t => {
  const setup = fixture(t, { ADMIN_PASSWORD: strongPassword });
  const original = { id: 'legacy-admin', username: 'admin', password: bcrypt.hashSync('old123', 4), isAdmin: true };
  setup.seed([original]);
  assert.equal(setup.run().status, 0);
  assert.deepEqual(setup.read(), [original]);
  setup.env.ADMIN_PASSWORD = '';
  setup.env.ADMIN_USERNAME = 'different-default';
  assert.equal(setup.run().status, 0);
  assert.deepEqual(setup.read(), [original]);
});

test('an existing ordinary account named admin is never promoted implicitly', async t => {
  const setup = fixture(t, { ADMIN_PASSWORD: strongPassword });
  const ordinary = { id: 'ordinary-admin-name', username: 'admin', password: bcrypt.hashSync('old123', 4) };
  setup.seed([ordinary]);
  const before = fs.readFileSync(setup.usersFile, 'utf8');
  assert.equal(setup.run().status, 1);
  assert.equal(fs.readFileSync(setup.usersFile, 'utf8'), before);
  setup.env.ADMIN_USERNAME = 'new-operator';
  assert.equal(setup.run().status, 0);
  const users = setup.read();
  assert.equal(users.length, 2);
  assert.deepEqual(users[0], ordinary);
  assert.equal(users[1].username, 'new-operator');
  assert.equal(users[1].isAdmin, true);
});

test('malformed user databases fail initialization without replacing existing data', async t => {
  for (const original of ['{broken json', '{"users":{}}', '{"users":[null]}']) {
    const setup = fixture(t, { ADMIN_PASSWORD: strongPassword });
    fs.writeFileSync(setup.usersFile, original);
    assert.equal(setup.run().status, 1);
    assert.equal(fs.readFileSync(setup.usersFile, 'utf8'), original);
  }
});

test('runtime rejects missing, short and placeholder JWT secrets before creating application data', async t => {
  for (const JWT_SECRET of ['', 'your-secret-key', 'short-secret', 'please-change-this-secret-before-running-anywhere']) {
    const setup = fixture(t, { JWT_SECRET });
    const applicationData = path.join(setup.dataDir, 'application-data');
    setup.env.DATA_DIR = applicationData;
    const result = spawnSync(process.execPath, ['-e', "require('./config/runtime').loadRuntimeConfig()"], {
      cwd: serverDir, env: setup.env, encoding: 'utf8', timeout: 5000
    });
    assert.equal(result.error, undefined);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /JWT_SECRET/);
    assert.equal(fs.existsSync(applicationData), false);
  }
});
