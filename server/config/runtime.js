const fs = require('node:fs');
const path = require('node:path');
const projectRoot = path.resolve(__dirname, '../..');

function getDataDir() {
  const value = process.env.DATA_DIR;
  if (!value) return path.join(projectRoot, 'server/data');
  return value.startsWith('./') ? path.resolve(projectRoot, value) : path.resolve(value);
}

function loadRuntimeConfig() {
  // Explicit environment variables win; tests never read real configuration.
  if (process.env.NODE_ENV !== 'test') {
    const envFile = path.join(projectRoot, '.env');
    const configFile = path.join(projectRoot, 'server/config.json');
    if (fs.existsSync(envFile)) {
      require('dotenv').config({ path: envFile });
    } else if (fs.existsSync(configFile)) {
      const values = JSON.parse(fs.readFileSync(configFile, 'utf8'));
      const keys = ['NODE_ENV', 'PORT', 'HOST', 'CORS_ORIGIN', 'DATA_DIR',
        'JWT_SECRET', 'JWT_EXPIRES_IN', 'ADMIN_USERNAME', 'ADMIN_PASSWORD'];
      for (const key of keys) {
        if (process.env[key] === undefined && ['string', 'number'].includes(typeof values[key])) {
          process.env[key] = String(values[key]);
        }
      }
    }
  }
  const jwtSecret = process.env.JWT_SECRET || '';
  if (Buffer.byteLength(jwtSecret) < 32 || /your.secret|default.secret|please.change|change.this/i.test(jwtSecret)) {
    throw new Error('JWT_SECRET 必须设置为至少 32 字节的独立随机密钥，不能使用默认示例值');
  }
  const dataDir = getDataDir();
  process.env.DATA_DIR = dataDir;
  fs.mkdirSync(dataDir, { recursive: true });
  return { dataDir, jwtSecret, jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d' };
}

module.exports = { getDataDir, loadRuntimeConfig };
