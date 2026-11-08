import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import path from 'node:path';

const directory = process.argv[2]; assert(directory, 'Usage: node scripts/restore-task-builds.mjs docs/bench/tag');
const environment = JSON.parse(readFileSync(`${directory}/environment.json`));
const archive = JSON.parse(gunzipSync(readFileSync(`${directory}/builds.json.gz`)));
assert.deepEqual(archive.builds.map(build => build.manifest), environment.builds);
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
function inside(folder, relative) {
  const target = path.resolve(folder, relative), check = path.relative(folder, target);
  assert(check && !check.startsWith('..') && !path.isAbsolute(check), 'Archive path escaped destination'); return target;
}
for (const build of archive.builds) {
  assert(/^[a-z0-9-]+$/.test(build.manifest.tag));
  const root = path.resolve('.validation/task-builds', build.manifest.tag), existing = existsSync(root);
  const sourceBytes = readFileSync(`${directory}/${build.manifest.tag}.sources.json.gz`);
  const sources = JSON.parse(gunzipSync(sourceBytes)); assert.deepEqual(sources.manifest, build.manifest);
  if (existing) {
    assert.deepEqual(JSON.parse(readFileSync(`${root}/manifest.json`)), build.manifest, 'Existing build differs; preserve it');
    assert.equal(sha(readFileSync(`${root}/sources.json.gz`)), sha(sourceBytes));
  }
  for (const [relative, encoded] of Object.entries(build.files)) {
    const bytes = Buffer.from(encoded, 'base64'); assert.equal(sha(bytes), build.manifest.artifacts[relative]);
    const target = inside(path.join(root, 'dist'), relative);
    if (existing) assert.equal(sha(readFileSync(target)), sha(bytes));
    else { mkdirSync(path.dirname(target), { recursive: true }); writeFileSync(target, bytes); }
  }
  for (const [relative, encoded] of Object.entries(sources.files)) {
    const bytes = Buffer.from(encoded, 'base64');
    const expected = Object.values(build.manifest.groups).map(group => group[relative]).find(Boolean); assert.equal(sha(bytes), expected);
    const target = inside(path.join(root, 'source'), relative);
    if (existing) assert.equal(sha(readFileSync(target)), sha(bytes), `Existing source differs: ${relative}`);
    else { mkdirSync(path.dirname(target), { recursive: true }); writeFileSync(target, bytes); }
  }
  if (!existing) {
    writeFileSync(`${root}/manifest.json`, JSON.stringify(build.manifest, null, 2)); writeFileSync(`${root}/sources.json.gz`, sourceBytes);
  }
  console.log(`${build.manifest.tag}: ${existing ? 'existing hashes verified' : 'restored exact archived source and bundle'}`);
}
