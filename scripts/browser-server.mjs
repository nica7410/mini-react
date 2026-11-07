import { createServer } from 'vite';
import { mkdirSync, writeFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';

const start = performance.now();
const events = [];
mkdirSync('.validation', { recursive: true });
const save = () => writeFileSync('.validation/browser-server.json', JSON.stringify({
  pid: process.pid, startedAt, elapsedMs: performance.now() - start, events,
}, null, 2));
const startedAt = new Date().toISOString();
const server = await createServer({ server: { host: '127.0.0.1', port: 4173, strictPort: true }, plugins: [{
  name: 'browser-diagnostics',
  configureServer(server) {
    server.middlewares.use((req, res, next) => {
      const requestedAt = performance.now();
      res.once('finish', () => {
        events.push({ url: req.url, status: res.statusCode, atMs: requestedAt - start, durationMs: performance.now() - requestedAt });
      });
      next();
    });
  },
}] });
await server.listen();
events.push({ phase: 'listening', atMs: performance.now() - start });
save();
// Buffer network events; synchronous disk writes are outside request handlers.
setInterval(save, 1000).unref();
console.log('Browser diagnostic server listening on 127.0.0.1:4173');
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, async () => { save(); await server.close(); process.exit(0); });
