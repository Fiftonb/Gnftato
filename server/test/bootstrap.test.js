const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

const source = path.resolve(__dirname, '../start.sh');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

for (const failure of [false, true]) {
  test(`POSIX startup ${failure ? 'stops on initialization failure' : 'starts from another directory and forwards termination'}`, { timeout: 10000 }, async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gnftato shell qa '));
    const server = path.join(root, 'server');
    fs.mkdirSync(path.join(server, 'scripts'), { recursive: true });
    fs.copyFileSync(source, path.join(server, 'start.sh'));
    fs.writeFileSync(path.join(server, 'scripts/createAdmin.js'),
      `require('fs').writeFileSync('../init.json', JSON.stringify({ cwd: process.cwd() })); process.exit(${failure ? 7 : 0});`);
    fs.writeFileSync(path.join(server, 'app.js'),
      `require('fs').writeFileSync('../app.json', JSON.stringify({ pid: process.pid, cwd: process.cwd() })); setInterval(() => {}, 1000);`);
    const child = spawn('/bin/sh', [path.join(server, 'start.sh')], {
      cwd: os.tmpdir(),
      env: { PATH: `${path.dirname(process.execPath)}${path.delimiter}${process.env.PATH || ''}` },
      stdio: 'pipe'
    });
    const completion = new Promise((resolve, reject) => { child.once('error', reject); child.once('exit', (code, signal) => resolve({ code, signal })); });
    try {
      if (failure) {
        assert.equal((await completion).code, 7);
        assert.equal(fs.existsSync(path.join(root, 'app.json')), false);
      } else {
        for (let attempt = 0; attempt < 100 && !fs.existsSync(path.join(root, 'app.json')); attempt += 1) await delay(20);
        const app = JSON.parse(fs.readFileSync(path.join(root, 'app.json'), 'utf8'));
        assert.equal(app.pid, child.pid, 'exec should preserve the shell PID for Node');
        assert.equal(app.cwd, fs.realpathSync(server));
        child.kill('SIGTERM');
        assert.equal((await completion).signal, 'SIGTERM');
      }
      assert.equal(JSON.parse(fs.readFileSync(path.join(root, 'init.json'), 'utf8')).cwd, fs.realpathSync(server));
    } finally {
      child.kill('SIGKILL');
      await completion;
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
}
