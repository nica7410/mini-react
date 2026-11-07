import { build } from 'vite';
import { readdirSync, readFileSync, existsSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';

const tag = process.argv[2];
if (!tag || !/^[a-z0-9-]+$/.test(tag)) throw new Error('Usage: node scripts/build-noop.mjs unique-tag [--profile]');
const profiled = process.argv.includes('--profile');
const outDir = `.validation/noop-builds/${tag}`;
if (existsSync(outDir)) throw new Error(`Preserve existing build: ${outDir}`);
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const files = directory => readdirSync(directory, { withFileTypes: true }).flatMap(item => item.isDirectory() ? files(`${directory}/${item.name}`) : [`${directory}/${item.name}`]);
const hashes = names => Object.fromEntries(names.sort().map(name => [name, sha(readFileSync(name))]));
const engineSources = hashes(['src/core', 'src/runtime', 'src/observe'].flatMap(files).filter(name => name.endsWith('.ts')));
const harnessSources = hashes(['src/bench/noop.ts', 'src/bench/noopProfile.ts', 'src/bench/fixtures.ts', 'noop.html', 'scripts/build-noop.mjs', 'scripts/benchmark-noop.mjs']);
const functions = {
  'src/core/validate.ts': { validateTree: 'treeValidation' },
  'src/core/vdom.ts': { equalData: 'equality' },
  'src/core/reconcile.ts': { diff: 'diff' },
  'src/core/planValidation.ts': { validatePlan: 'preflight' },
  'src/core/patch.ts': { commit: 'commit' },
  'src/runtime/resolve.ts': { evaluateExpression: 'vdomEvaluation' },
  'src/core/host/forms.ts': { syncForm: 'hostFormsFocus' },
  'src/core/host/browserState.ts': { saveSelection: 'hostFormsFocus', restoreSelection: 'hostFormsFocus', compositionConflict: 'hostFormsFocus' },
};
await build({ configFile: false, base: './', plugins: profiled ? [{ name: 'diagnostic-spans-only', enforce: 'pre', transform(source, id) {
  const file = path.relative(process.cwd(), id.split('?')[0]).replaceAll('\\', '/');
  const names = functions[file]; if (!names) return;
  for (const [name, label] of Object.entries(names)) {
    const marker = `export function ${name}(`;
    if (!source.includes(marker)) throw new Error(`Missing profile function ${file}:${name}`);
    source = source.replace(marker, `function unprofiled_${name}(`);
    if (name === 'equalData') source = source.replace('equalData(aa[k], bb[k])', 'unprofiled_equalData(aa[k], bb[k])');
    source += `\nexport function ${name}(...args: any[]): any { return __profile.span('${label}', () => unprofiled_${name}(...args)); }\n`;
  }
  if (file === 'src/core/planValidation.ts') {
    const start = 'for (const [ref, entry] of graph) {';
    const end = "if (graph.size !== mount.nodes.size) throw new Error('mount registry에 view 밖의 ref가 있습니다.');";
    if (!source.includes(start) || !source.includes(end)) throw new Error('DOM profile boundaries changed; audit the instrumentation');
    source = source.replace(start, `__profile.span('domBinding', () => { ${start}`).replace(end, `${end} });`);
  }
  return `import { profile as __profile } from '/src/bench/noopProfile.ts';\n${source}`;
} }] : [], build: { outDir, emptyOutDir: false, sourcemap: false, minify: profiled ? false : 'oxc', rollupOptions: { input: 'noop.html' } } });
const manifest = { tag, profiled, createdAt: new Date().toISOString(), commit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  branch: execFileSync('git', ['branch', '--show-current'], { encoding: 'utf8' }).trim(), workingTree: execFileSync('git', ['status', '--short'], { encoding: 'utf8' }),
  engineSources, engineHash: sha(JSON.stringify(engineSources)), harnessSources, harnessHash: sha(JSON.stringify(harnessSources)),
  artifacts: hashes(files(outDir)), buildMode: 'Vite production', node: process.version };
writeFileSync(`${outDir}/manifest.json`, JSON.stringify(manifest, null, 2));
console.log(`NOOP_BUILD ${outDir}`);
