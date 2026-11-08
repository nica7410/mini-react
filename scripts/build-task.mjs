import assert from 'node:assert/strict';
import { build } from 'vite';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { gzipSync } from 'node:zlib';

const options = new Map(process.argv.slice(2).map(arg => { const [key, value] = arg.replace(/^--/, '').split('='); return [key, value]; }));
const tag = options.get('tag'), engineRef = options.get('engine'), appRef = options.get('app');
assert(tag && /^[a-z0-9-]+$/.test(tag) && engineRef && appRef, 'Use --tag=unique --engine=commit --app=commit');
const root = path.resolve('.validation/task-builds', tag), source = path.join(root, 'source');
assert(!existsSync(root), 'Preserve existing build'); mkdirSync(source, { recursive: true });
const sha = data => createHash('sha256').update(data).digest('hex');
const git = args => execFileSync('git', args, { maxBuffer: 16 * 1024 * 1024 });
const canonical = ref => git(['rev-parse', `${ref}^{commit}`]).toString().trim();
const engineCommit = canonical(engineRef), appCommit = canonical(appRef), startCommit = canonical('4d5a66f');
const filesAt = (ref, dirs) => git(['ls-tree', '-r', '--name-only', ref, '--', ...dirs]).toString().trim().split('\n').filter(Boolean);
const engineFiles = filesAt(engineCommit, ['src/core', 'src/runtime', 'src/observe']);
const harnessFiles = ['task-bench.html', 'src/bench/task-app.ts', 'src/bench/task-model.ts'];
const groups = { engine: {}, app: {}, dependencies: {}, harness: {}, tooling: {} }, archive = {};
function copy(file, data, group) {
  groups[group][file] = sha(data); archive[file] = data.toString('base64');
  const target = path.join(source, file); mkdirSync(path.dirname(target), { recursive: true }); writeFileSync(target, data);
}
for (const file of engineFiles) copy(file, git(['show', `${engineCommit}:${file}`]), 'engine');
copy('src/app/tasks.ts', git(['show', `${appCommit}:src/app/tasks.ts`]), 'app');
copy('src/app/style.css', git(['show', `${startCommit}:src/app/style.css`]), 'app');
for (const file of ['package.json', 'pnpm-lock.yaml']) {
  const data = git(['show', `${engineCommit}:${file}`]);
  assert.equal(sha(data), sha(readFileSync(file)), `Dependency set changed: ${file}`); copy(file, data, 'dependencies');
}
for (const file of harnessFiles) copy(file, readFileSync(file), 'harness');
for (const file of ['scripts/build-task.mjs', 'scripts/benchmark-task.mjs', 'docs/task-app-comparison-plan.md']) if (existsSync(file)) groups.tooling[file] = sha(readFileSync(file));
await build({ root: source, configFile: false, base: './', logLevel: 'warn', build: {
  outDir: path.join(root, 'dist'), emptyOutDir: false, minify: 'oxc', sourcemap: false,
  rollupOptions: { input: path.join(source, 'task-bench.html') },
} });
const files = directory => readdirSync(directory, { withFileTypes: true }).flatMap(item => item.isDirectory() ? files(path.join(directory, item.name)) : [path.join(directory, item.name)]);
const manifest = { tag, engineCommit, appCommit, styleCommit: startCommit, createdAt: new Date().toISOString(),
  engineHash: sha(JSON.stringify(groups.engine)), appHash: sha(JSON.stringify(groups.app)), harnessHash: sha(JSON.stringify(groups.harness)),
  dependencyHash: sha(JSON.stringify(groups.dependencies)), groups, node: process.version,
  vite: JSON.parse(readFileSync('node_modules/vite/package.json')).version, mode: 'production', minify: 'oxc',
  sourcePolicy: 'Exact Git objects for engine/app/CSS/dependencies; current common harness copied. No checkout changes, no app source transformation.',
  artifacts: Object.fromEntries(files(path.join(root, 'dist')).map(file => [path.relative(path.join(root, 'dist'), file).replaceAll('\\', '/'), sha(readFileSync(file))])) };
writeFileSync(path.join(root, 'manifest.json'), JSON.stringify(manifest, null, 2));
writeFileSync(path.join(root, 'sources.json.gz'), gzipSync(JSON.stringify({ manifest, files: archive })));
console.log(JSON.stringify({ tag, engineCommit, appCommit, engineHash: manifest.engineHash, appHash: manifest.appHash, harnessHash: manifest.harnessHash }));
