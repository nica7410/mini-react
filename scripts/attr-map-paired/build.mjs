// Builds the two arms of the attribute-map comparison from the same page code
// (src/bench/attr-map-arm.ts): b0 = the default source, r1 = the same source with
// src/runtime/resolve.ts and src/core/capture.ts replaced by the candidate copies.
// Plan: docs/validation/followup-attr-maps/plan.md
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { build, normalizePath } from 'vite';

const root = process.cwd();
const harness = 'scripts/attr-map-paired';
const out = path.resolve('.validation/attr-map-paired');
const entry = `${harness}/arm.html`;
const redirects = { 'src/runtime/resolve.ts': 'research/attr-maps/resolve.candidate.ts', 'src/core/capture.ts': 'research/attr-maps/capture.candidate.ts' };
const candidateFiles = [...Object.values(redirects), 'research/attr-maps/attrMap.ts'];
const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trimEnd();
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const hashFile = file => sha(readFileSync(file));
const relative = id => normalizePath(path.relative(root, id.split('?')[0]));
const filesUnder = dir => readdirSync(dir, { recursive: true, withFileTypes: true }).filter(item => item.isFile())
  .map(item => normalizePath(path.relative(root, path.join(item.parentPath, item.name)))).sort();

function plugin(arm, record) {
  return {
    name: 'attr-map-arm',
    enforce: 'pre',
    configResolved(config) {
      record.settings = { mode: config.mode, production: config.isProduction, target: config.build.target, minify: config.build.minify };
      assert.equal(config.mode, 'production');
      assert.equal(config.isProduction, true);
      assert.ok(config.build.minify);
    },
    async resolveId(source, importer, options) {
      if (arm !== 'r1' || !importer) return null;
      const resolved = await this.resolve(source, importer, { ...options, skipSelf: true });
      const target = resolved && redirects[relative(resolved.id)];
      return target ? normalizePath(path.resolve(target)) : null;
    },
    generateBundle() {
      const modules = [...this.getModuleIds()].map(relative).filter(id => id.startsWith('src/') || id.startsWith('research/')).sort();
      if (arm === 'b0') {
        assert.ok(modules.includes('src/runtime/resolve.ts'));
        assert.ok(modules.every(id => !id.startsWith('research/')), 'The default arm must not contain research code');
      } else {
        assert.ok(modules.includes('research/attr-maps/resolve.candidate.ts') && modules.includes('research/attr-maps/attrMap.ts'));
        assert.ok(Object.keys(redirects).every(id => !modules.includes(id)), 'The candidate arm must not contain the replaced modules');
      }
      record.modules = modules;
    },
  };
}

mkdirSync(out, { recursive: true });
const builds = {};
for (const arm of ['b0', 'r1']) {
  const outDir = path.join(out, arm);
  const record = builds[arm] = {};
  await build({ mode: 'production', base: './', logLevel: 'warn', plugins: [plugin(arm, record)],
    build: { outDir, emptyOutDir: true, rollupOptions: { input: path.resolve(entry) } } });
  record.artifacts = Object.fromEntries(filesUnder(outDir).map(file => [normalizePath(path.relative(outDir, file)), hashFile(file)]));
  assert.ok(Object.hasOwn(record.artifacts, entry));
}
assert.deepEqual(builds.b0.settings, builds.r1.settings);
// Apart from the replaced modules and the helper, both arms consist of the same source modules.
const expectedR1 = [...builds.b0.modules.filter(id => !Object.hasOwn(redirects, id)),
  ...Object.entries(redirects).filter(([from]) => builds.b0.modules.includes(from)).map(([, to]) => to), 'research/attr-maps/attrMap.ts'].sort();
assert.deepEqual(builds.r1.modules, expectedR1, 'The arms must share every other module');
const files = [...git('ls-files', '--', 'src').split('\n'), ...filesUnder(harness), ...candidateFiles, 'vite.config.ts', 'package.json', 'pnpm-lock.yaml'];
const manifest = { hashAlgorithm: 'SHA-256 (working-tree bytes)', sourceCommit: git('rev-parse', 'HEAD'), sourceTree: git('rev-parse', 'HEAD:src'),
  workingTreeClean: git('status', '--porcelain', '--', 'src', 'scripts', 'research') === '',
  node: process.version, vite: JSON.parse(readFileSync('node_modules/vite/package.json', 'utf8')).version,
  entry, host: `${harness}/host.html`, redirects, files: Object.fromEntries([...new Set(files)].sort().map(file => [file, hashFile(file)])), builds };
writeFileSync(path.join(out, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(`Arms b0 and r1 built; modules replaced in r1: ${Object.keys(redirects).filter(id => builds.b0.modules.includes(id)).join(', ')}`);
