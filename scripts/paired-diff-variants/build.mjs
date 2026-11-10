// Builds the same-page paired full-diff() comparison of scripts/keyed-paired-diff for one of
// two variants. The page code (src/bench/keyed-paired-diff.ts) and its entry are reused
// unchanged; only the module behind its "other" diff differs:
//   --variant=validate  other = reconcile.ts with validateTree taken from the V1 candidate
//   --variant=planner   other = reconcile.ts with the keyed planner taken from the C1 candidate
// Plan: docs/validation/followup-validate-names/plan.md
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { build, normalizePath } from 'vite';

const variants = {
  validate: {
    label: 'V1', baseline: 'src/core/validate.ts', candidate: 'research/validate-names/validate.candidate.ts',
    original: "import { validateTree } from './validate';",
    replacement: candidate => `import { validateTree } from '/${candidate}';`,
    hook: { signature: 'export function validateTree(tree: VRoot): Result<VRoot> {',
      inject: label => `\n  { const audit = (globalThis as unknown as { pairedValidateAudit?: Record<string, number> }).pairedValidateAudit; if (audit) audit.${label}++; }` },
  },
  planner: {
    label: 'C1', baseline: 'src/core/keyed.ts', candidate: 'research/keyed-boundaries/keyed.candidate.ts',
    original: "import { keyedEligibility, planKeyedChildren } from './keyed';",
    replacement: candidate => `import { keyedEligibility } from './keyed';\nimport { planKeyedChildrenCandidate as planKeyedChildren } from '/${candidate}';`,
    hook: { signature: null, // per file, below: the same hook as scripts/keyed-paired-diff/build.mjs
      inject: label => `\n  (globalThis as unknown as { pairedPlannerAudit?: Record<string, number[]> }).pairedPlannerAudit?.${label}.push(next.length);` },
  },
};
const name = process.argv.find(value => value.startsWith('--variant='))?.split('=')[1];
const variant = variants[name];
assert(variant, 'Use --variant=validate or --variant=planner');

const root = process.cwd();
const harness = 'scripts/keyed-paired-diff';
const out = path.resolve(`.validation/paired-diff-variants/${name}`);
const entry = `${harness}/index.html`;
const reconcile = 'src/core/reconcile.ts';
const { baseline, candidate } = variant;
const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trimEnd();
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const hashFile = file => sha(readFileSync(file));
const filesUnder = dir => readdirSync(dir, { recursive: true, withFileTypes: true }).filter(item => item.isFile())
  .map(item => normalizePath(path.relative(root, path.join(item.parentPath, item.name)))).sort();
const read = file => readFileSync(file, 'utf8');

const source = read(reconcile);
const original = variant.original, replacement = variant.replacement(candidate);
assert.equal(source.split(original).length, 2, 'Expected exactly one original import');
const changed = source.replace(original, replacement);
assert.equal(changed.split(replacement).length, 2);
assert.equal(changed.replace(replacement, original), source, 'Only one import binding may change');
const variantId = `${normalizePath(path.resolve(reconcile))}?paired-${name}`;
const absolute = file => normalizePath(path.resolve(file));
const signatures = name === 'planner'
  ? { [absolute(baseline)]: ['B0', "export function planKeyedChildren(old: readonly ViewNode[], next: readonly VNode[], strategy: 'greedy' | 'lis'): Result<ReorderPlan> {"],
      [absolute(candidate)]: ['C1', "export function planKeyedChildrenCandidate(old: readonly ViewNode[], next: readonly VNode[], strategy: 'greedy' | 'lis'): Result<ReorderPlan> {"] }
  : { [absolute(baseline)]: ['B0', variant.hook.signature], [absolute(candidate)]: [variant.label, variant.hook.signature] };

function plugin(audit, record) {
  const seen = new Set();
  return {
    name: 'paired-diff-variant',
    enforce: 'pre',
    configResolved(config) {
      record.settings = { mode: config.mode, production: config.isProduction, target: config.build.target, minify: config.build.minify };
      assert.equal(config.mode, 'production');
      assert.equal(config.isProduction, true);
      assert.ok(config.build.minify);
    },
    // The page imports its other diff as 'paired:keyed-c1' whatever the variant is.
    resolveId(id) { if (id === 'paired:keyed-c1') return variantId; },
    load(id) { if (id === variantId) return changed; },
    transform(code, id) {
      if (!audit || !Object.hasOwn(signatures, id)) return;
      const [label, signature] = signatures[id];
      assert.equal(code.split(signature).length, 2, `Audit hook must match exactly once in ${id}`);
      seen.add(label);
      return code.replace(signature, `${signature}${variant.hook.inject(label)}`);
    },
    generateBundle() {
      const normalize = id => normalizePath(path.relative(root, id));
      const imports = id => this.getModuleInfo(id).importedIds.map(normalize).sort();
      const b0 = imports(absolute(reconcile));
      const other = imports(variantId);
      assert.ok(b0.includes(baseline) && !b0.includes(candidate));
      // validate: the candidate replaces the baseline module. planner: keyed.ts stays for
      // keyedEligibility and the candidate planner is added (as in scripts/keyed-paired-diff).
      const expected = name === 'validate' ? [...b0.filter(file => file !== baseline), candidate] : [...b0, candidate];
      assert.deepEqual(other, expected.sort(), 'Reconcile variants must share every other dependency');
      assert.deepEqual([...seen].sort(), audit ? ['B0', variant.label].sort() : []);
      record.imports = { B0: b0, [variant.label]: other };
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
const files = [...git('ls-files', '--', 'src').split('\n'), ...filesUnder(harness), ...filesUnder('scripts/paired-diff-variants'),
  candidate, 'vite.config.ts', 'package.json', 'pnpm-lock.yaml'];
const manifest = { hashAlgorithm: 'SHA-256 (working-tree bytes)', variant: name, otherLabel: variant.label, sourceCommit: git('rev-parse', 'HEAD'),
  sourceTree: git('rev-parse', 'HEAD:src'), workingTreeClean: git('status', '--porcelain', '--', 'src', 'scripts', 'research') === '',
  node: process.version, vite: JSON.parse(read('node_modules/vite/package.json')).version,
  entry, files: Object.fromEntries([...new Set(files)].sort().map(file => [file, hashFile(file)])),
  reconcileChange: { file: reconcile, original, replacement, B0: sha(source), [variant.label]: sha(changed) }, builds };
writeFileSync(path.join(out, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(`Production bundles and SHA-256 manifest written to .validation/paired-diff-variants/${name}`);
