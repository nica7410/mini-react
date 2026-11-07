import { createServer } from 'vite';
import { mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';

const start = performance.now();
const events = [];
mkdirSync('.validation', { recursive: true });
const save = () => writeFileSync('.validation/browser-server.json', JSON.stringify({
  pid: process.pid, startedAt, elapsedMs: performance.now() - start, events,
}, null, 2));
const startedAt = new Date().toISOString();
let ready = false;
const server = await createServer({ server: { host: '127.0.0.1', port: 4173, strictPort: true }, plugins: [{
  name: 'browser-diagnostics',
  configureServer(server) {
    server.middlewares.use((req, res, next) => {
      if (req.url === '/__browser_ready') {
        res.writeHead(ready ? 200 : 503, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ready, pid: process.pid })); return;
      }
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
// HTTP readiness alone does not mean Vite has transformed the application's modules.
// Resolve those requests before Playwright starts any test's 30-second budget.
const warmStart = performance.now();
const files = ['app', 'core', 'editor', 'runtime', 'observe'].flatMap(folder =>
  readdirSync(`src/${folder}`, { recursive: true }).filter(name => name.endsWith('.ts')).map(name => `/src/${folder}/${name.replaceAll('\\', '/')}`));
const urls = ['/', '/@vite/client', '/src/app/style.css', '/src/bench/fixtures.ts', ...files];
await Promise.all(urls.map(async url => {
  const response = await fetch(`http://127.0.0.1:4173${url}`);
  if (!response.ok) throw new Error(`Browser warmup failed: ${url} ${response.status}`);
  await response.arrayBuffer();
}));
ready = true;
events.push({ phase: 'ready', atMs: performance.now() - start, warmupMs: performance.now() - warmStart, modules: urls.length });
save();
