import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { build, normalizePath } from 'vite';

const root = process.cwd();
const harness = 'scripts/keyed-paired-diff';
const out = path.resolve('.validation/keyed-paired-diff');
const entry = `${harness}/index.html`;
const reconcile = 'src/core/reconcile.ts';
const baseline = 'src/core/keyed.ts';
const candidate = 'research/keyed-boundaries/keyed.candidate.ts';
const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trimEnd();
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const hashFile = file => sha(readFileSync(file));
const filesUnder = dir => readdirSync(dir, { recursive: true, withFileTypes: true }).filter(item => item.isFile())
  .map(item => normalizePath(path.relative(root, path.join(item.parentPath, item.name)))).sort();
const read = file => readFileSync(file, 'utf8');

const source = read(reconcile);
const original = "import { keyedEligibility, planKeyedChildren } from './keyed';";
const replacement = `import { keyedEligibility } from './keyed';\nimport { planKeyedChildrenCandidate as planKeyedChildren } from '/${candidate}';`;
assert.equal(source.split(original).length, 2, 'Expected exactly one original Keyed import');
const variant = source.replace(original, replacement);
assert.equal(variant.split(replacement).length, 2);
assert.equal(variant.replace(replacement, original), source, 'Only the planner binding may change');
const variantId = `${normalizePath(path.resolve(reconcile))}?paired-c1`;
const absolute = file => normalizePath(path.resolve(file));
const names = { [absolute(baseline)]: ['B0', 'planKeyedChildren'], [absolute(candidate)]: ['C1', 'planKeyedChildrenCandidate'] };

function plugin(audit, record) {
  const seen = new Set();
  return {
    name: 'paired-keyed-diff',
    enforce: 'pre',
    configResolved(config) {
      record.settings = { mode: config.mode, production: config.isProduction, target: config.build.target, minify: config.build.minify };
      assert.equal(config.mode, 'production');
      assert.equal(config.isProduction, true);
      assert.ok(config.build.minify);
    },
    resolveId(id) { if (id === 'paired:keyed-c1') return variantId; },
    load(id) { if (id === variantId) return variant; },
    transform(code, id) {
      if (!audit || !Object.hasOwn(names, id)) return;
      const [label, name] = names[id];
      const signature = `export function ${name}(old: readonly ViewNode[], next: readonly VNode[], strategy: 'greedy' | 'lis'): Result<ReorderPlan> {`;
      assert.equal(code.split(signature).length, 2, `Audit hook must match exactly once in ${id}`);
      seen.add(label);
      return code.replace(signature, `${signature}\n  (globalThis as unknown as { pairedPlannerAudit?: Record<string, number[]> }).pairedPlannerAudit?.${label}.push(next.length);`);
    },
    generateBundle() {
      const normalize = id => normalizePath(path.relative(root, id));
      const imports = id => this.getModuleInfo(id).importedIds.map(normalize).sort();
      const b0 = imports(absolute(reconcile));
      const c1 = imports(variantId);
      assert.ok(b0.includes(baseline) && !b0.includes(candidate));
      assert.deepEqual(c1, [...b0, candidate].sort(), 'Reconcile variants must share every other dependency');
      assert.deepEqual([...seen].sort(), audit ? ['B0', 'C1'] : []);
      record.imports = { B0: b0, C1: c1 };
      record.auditHooks = [...seen].sort();
    },
  };
}

mkdirSync(out, { recursive: true });
const builds = {};
for (const kind of ['timing', 'audit']) {
  const outDir = path.join(out, kind);
  const record = builds[kind] = {};
  await build({ mode: 'production', base: './', logLevel: 'warn', plugins: [plugin(kind === 'audit', record)],
    build: { outDir, emptyOutDir: true, rollupOptions: { input: path.resolve(entry) } } });
  record.artifacts = Object.fromEntries(filesUnder(outDir).map(file => [normalizePath(path.relative(outDir, file)), hashFile(file)]));
  assert.ok(Object.hasOwn(record.artifacts, entry));
}
assert.deepEqual(builds.timing.settings, builds.audit.settings);
const files = [...git('ls-files', '--', 'src').split('\n'), ...filesUnder(harness),
  'src/bench/keyed-paired-diff.ts', 'src/bench/keyed-paired-diff-modules.d.ts', candidate,
  'vite.config.ts', 'package.json', 'pnpm-lock.yaml'];
const manifest = { hashAlgorithm: 'SHA-256 (working-tree bytes)', sourceCommit: git('rev-parse', 'HEAD'),
  sourceTree: git('rev-parse', 'HEAD:src'), node: process.version, vite: JSON.parse(read('node_modules/vite/package.json')).version,
  entry, files: Object.fromEntries([...new Set(files)].sort().map(file => [file, hashFile(file)])),
  reconcileChange: { file: reconcile, original, replacement, B0: sha(source), C1: sha(variant) }, builds };
writeFileSync(path.join(out, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log('Production bundles and SHA-256 manifest written to .validation/keyed-paired-diff');
