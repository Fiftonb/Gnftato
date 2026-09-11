import { build, preview } from 'vite';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const outDir = await mkdtemp(join(tmpdir(), 'gnftato-client-e2e-'));
await build({ build: { outDir } });
const server = await preview({ build: { outDir }, preview: { host: '127.0.0.1', port: 4176, strictPort: true } });
const close = async () => {
  await new Promise(resolve => server.httpServer.close(resolve));
  await rm(outDir, { recursive: true, force: true });
  process.exit();
};
process.on('SIGTERM', close);
process.on('SIGINT', close);
