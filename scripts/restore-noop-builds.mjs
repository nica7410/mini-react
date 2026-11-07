import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import path from 'node:path';

const file = process.argv[2];
if (!file) throw new Error('Usage: node scripts/restore-noop-builds.mjs docs/bench/noop-full/builds.json.gz [--verify-only]');
const archive = JSON.parse(gunzipSync(readFileSync(file)));
assert.equal(archive.schemaVersion, 1);
const pending = [];
for (const build of archive.builds) {
  assert(/^[a-z0-9-]+$/.test(build.manifest.tag));
  const root = path.resolve('.validation/noop-builds', build.manifest.tag);
  const prefix = `.validation/noop-builds/${build.manifest.tag}/`;
  for (const [original, expected] of Object.entries(build.manifest.artifacts)) {
    assert(original.startsWith(prefix));
    const target = path.resolve(root, original.slice(prefix.length));
    assert(target.startsWith(root + path.sep));
    const data = Buffer.from(build.files[original], 'base64');
    assert.equal(createHash('sha256').update(data).digest('hex'), expected);
    if (existsSync(target)) assert(readFileSync(target).equals(data), `Preserve different existing file: ${target}`);
    else pending.push({ target, data });
  }
  const target = path.join(root, 'manifest.json'), data = Buffer.from(JSON.stringify(build.manifest, null, 2));
  if (existsSync(target)) assert.deepEqual(JSON.parse(readFileSync(target)), build.manifest);
  else pending.push({ target, data });
}
if (!process.argv.includes('--verify-only')) for (const { target, data } of pending) { mkdirSync(path.dirname(target), { recursive: true }); writeFileSync(target, data); }
console.log(`Verified ${archive.builds.length} frozen builds; ${pending.length} files ${process.argv.includes('--verify-only') ? 'would be restored' : 'restored'}.`);
