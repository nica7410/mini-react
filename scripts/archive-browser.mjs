import { cpSync, copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
const tag = process.argv[2];
if (!tag || !/^[a-z0-9-]+$/.test(tag)) throw new Error('Usage: node scripts/archive-browser.mjs unique-tag');
const dir = `docs/validation/browser-stability/${tag}`;
if (existsSync(dir)) throw new Error(`Preserve existing evidence: ${dir}`);
mkdirSync(dir, { recursive: true });
for (const name of ['browser-results.json', 'browser-timings.json', 'browser-server.json']) if (existsSync(`.validation/${name}`)) copyFileSync(`.validation/${name}`, `${dir}/${name}`);
if (existsSync('test-results')) cpSync('test-results', `${dir}/test-results`, { recursive: true });
const results = JSON.parse(readFileSync(`${dir}/browser-results.json`));
writeFileSync(`${dir}/context.json`, JSON.stringify({ archivedAt: new Date().toISOString(), commit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  status: execFileSync('git', ['status', '--short'], { encoding: 'utf8' }), stats: results.stats, config: results.config }, null, 2));
console.log(JSON.stringify({ dir, stats: results.stats }));
