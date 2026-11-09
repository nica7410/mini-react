// Build a fixed TaskApp production bundle from exact Git objects plus research patches.
// Same pipeline as scripts/build-task.mjs; patches touch engine files only and are hashed.
// Usage (repo root): node research/dirty-restore/build-patched.mjs --tag=x --engine=a1b070f --app=9b52323 [--patches=a.patch,b.patch]
import assert from 'node:assert/strict';
import { build } from 'vite';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { gzipSync } from 'node:zlib';

const options = new Map(process.argv.slice(2).map(arg => { const [key, value] = arg.replace(/^--/, '').split('='); return [key, value]; }));
const tag = options.get('tag'), engineRef = options.get('engine'), appRef = options.get('app');
const patches = (options.get('patches') ?? '').split(',').filter(Boolean);
assert(tag && /^[a-z0-9-]+$/.test(tag) && engineRef && appRef, 'Use --tag=unique --engine=commit --app=commit');
const root = path.resolve('.validation/task-builds', tag), source = path.join(root, 'source');
assert(!existsSync(root), 'Preserve existing build'); mkdirSync(source, { recursive: true });
const sha = data => createHash('sha256').update(data).digest('hex');
const git = (args, cwd) => execFileSync('git', args, { maxBuffer: 16 * 1024 * 1024, cwd });
const canonical = ref => git(['rev-parse', `${ref}^{commit}`]).toString().trim();
const engineCommit = canonical(engineRef), appCommit = canonical(appRef), startCommit = canonical('4d5a66f');
const filesAt = (ref, dirs) => git(['ls-tree', '-r', '--name-only', ref, '--', ...dirs]).toString().trim().split('\n').filter(Boolean);
const engineFiles = filesAt(engineCommit, ['src/core', 'src/runtime', 'src/observe']);
const harnessFiles = ['task-bench.html', 'src/bench/task-app.ts', 'src/bench/task-model.ts'];
const groups = { engine: {}, app: {}, dependencies: {}, harness: {}, tooling: {} }, archive = {};
const baseEngine = {};
function write(file, data) { const target = path.join(source, file); mkdirSync(path.dirname(target), { recursive: true }); writeFileSync(target, data); }
for (const file of engineFiles) { const data = git(['show', `${engineCommit}:${file}`]); baseEngine[file] = sha(data); write(file, data); }
// Apply research patches to the extracted engine (never to the checkout's src).
const patchRecords = patches.map(file => {
  const data = readFileSync(file);
  const relative = path.relative(process.cwd(), source).replaceAll('\\', '/');
  git(['-c', 'core.autocrlf=false', 'apply', '--unsafe-paths', `--directory=${relative}`, '--whitespace=nowarn', path.resolve(file)]);
  return { file: file.replaceAll('\\', '/'), sha256: sha(data) };
});
for (const file of engineFiles) {
  const data = readFileSync(path.join(source, file));
  groups.engine[file] = sha(data); archive[file] = data.toString('base64');
}
const changedEngineFiles = engineFiles.filter(file => groups.engine[file] !== baseEngine[file]);
assert(patches.length === 0 || changedEngineFiles.length > 0, 'Patch changed nothing');
function copy(file, data, group) { groups[group][file] = sha(data); archive[file] = data.toString('base64'); write(file, data); }
copy('src/app/tasks.ts', git(['show', `${appCommit}:src/app/tasks.ts`]), 'app');
copy('src/app/style.css', git(['show', `${startCommit}:src/app/style.css`]), 'app');
for (const file of ['package.json', 'pnpm-lock.yaml']) {
  const data = git(['show', `${engineCommit}:${file}`]);
  assert.equal(sha(data), sha(readFileSync(file)), `Dependency set changed: ${file}`); copy(file, data, 'dependencies');
}
for (const file of harnessFiles) copy(file, readFileSync(file), 'harness');
for (const file of ['research/dirty-restore/build-patched.mjs', 'scripts/benchmark-task.mjs', 'docs/task-app-comparison-plan.md']) if (existsSync(file)) groups.tooling[file] = sha(readFileSync(file));
await build({ root: source, configFile: false, base: './', logLevel: 'warn', build: {
  outDir: path.join(root, 'dist'), emptyOutDir: false, minify: 'oxc', sourcemap: false,
  rollupOptions: { input: path.join(source, 'task-bench.html') },
} });
const files = directory => readdirSync(directory, { withFileTypes: true }).flatMap(item => item.isDirectory() ? files(path.join(directory, item.name)) : [path.join(directory, item.name)]);
const manifest = { tag, engineCommit, appCommit, styleCommit: startCommit, createdAt: new Date().toISOString(),
  engineHash: sha(JSON.stringify(groups.engine)), baseEngineHash: sha(JSON.stringify(baseEngine)), patches: patchRecords, changedEngineFiles,
  appHash: sha(JSON.stringify(groups.app)), harnessHash: sha(JSON.stringify(groups.harness)),
  dependencyHash: sha(JSON.stringify(groups.dependencies)), groups, node: process.version,
  vite: JSON.parse(readFileSync('node_modules/vite/package.json')).version, mode: 'production', minify: 'oxc',
  sourcePolicy: 'Exact Git objects for engine/app/CSS/dependencies, then the listed research patches applied to engine files only; current common harness copied. No checkout src changes.',
  artifacts: Object.fromEntries(files(path.join(root, 'dist')).map(file => [path.relative(path.join(root, 'dist'), file).replaceAll('\\', '/'), sha(readFileSync(file))])) };
writeFileSync(path.join(root, 'manifest.json'), JSON.stringify(manifest, null, 2));
writeFileSync(path.join(root, 'sources.json.gz'), gzipSync(JSON.stringify({ manifest, files: archive })));
console.log(JSON.stringify({ tag, engineCommit, appCommit, engineHash: manifest.engineHash, baseEngineHash: manifest.baseEngineHash, patches: patchRecords, changedEngineFiles, artifacts: manifest.artifacts }));
