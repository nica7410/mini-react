// Full E9 (a1b070f) tree + candidate.patch for typecheck / unit+integration / browser tests.
// The checkout's src is never touched. Usage: node research/dirty-restore/make-candidate-tree.mjs [--out=.validation/dirty-restore/cand-tree]
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const options = new Map(process.argv.slice(2).map(arg => { const [k, v] = arg.replace(/^--/, '').split('='); return [k, v]; }));
const out = options.get('out') ?? '.validation/dirty-restore/cand-tree', patch = 'research/dirty-restore/candidate.patch';
assert(!existsSync(out), 'Preserve existing tree'); mkdirSync(out, { recursive: true });
const sha = data => createHash('sha256').update(data).digest('hex');
const commit = execFileSync('git', ['rev-parse', 'a1b070f^{commit}']).toString().trim();
// Raw Git blobs (LF), the same bytes the fixed builds were made from.
const tar = execFileSync('git', ['-c', 'core.autocrlf=false', 'archive', '--format=tar', commit, '--', 'src', 'tests', 'scripts', 'package.json', 'pnpm-lock.yaml', 'tsconfig.json', 'vite.config.ts', 'vitest.config.ts', 'playwright.config.ts', 'index.html', 'benchmark.html', 'noop.html', 'task-bench.html'], { maxBuffer: 256 * 1024 * 1024 });
execFileSync('tar', ['-x', '-C', out], { input: tar });
const before = sha(readFileSync(`${out}/src/core/planValidation.ts`));
execFileSync('git', ['-c', 'core.autocrlf=false', 'apply', '--unsafe-paths', `--directory=${out.replaceAll('\\', '/')}`, path.resolve(patch)]);
const after = sha(readFileSync(`${out}/src/core/planValidation.ts`));
copyFileSync('research/dirty-restore/tests/sync-form-validation.test.ts', `${out}/tests/integration/research-sync-form-validation.test.ts`);
const record = { baseCommit: commit, patch, patchSha256: sha(readFileSync(patch)), planValidationBefore: before, planValidationAfter: after,
  researchTestSha256: sha(readFileSync('research/dirty-restore/tests/sync-form-validation.test.ts')), createdAt: new Date().toISOString() };
writeFileSync(`${out}/candidate-tree.json`, JSON.stringify(record, null, 2));
console.log(JSON.stringify(record, null, 2));
