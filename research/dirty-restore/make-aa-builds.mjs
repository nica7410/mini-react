// A/A control: the exact task-e9-a0-v1 production files under two build names.
// Only manifest.tag differs; every served artifact (JS/CSS/HTML) is byte-identical and re-hashed here.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { cpSync, existsSync, readFileSync, writeFileSync } from 'node:fs';

const source = '.validation/task-builds/task-e9-a0-v1';
const sha = data => createHash('sha256').update(data).digest('hex');
const original = JSON.parse(readFileSync(`${source}/manifest.json`));
const report = { source: original.tag, sourceArtifacts: original.artifacts, copies: [] };
for (const tag of ['dr-aa-e9-a0-x', 'dr-aa-e9-a0-y']) {
  const target = `.validation/task-builds/${tag}`;
  assert(!existsSync(target), `Preserve existing build ${tag}`);
  cpSync(source, target, { recursive: true });
  const manifest = { ...original, tag, aaCopyOf: original.tag, aaPolicy: 'Byte-identical copy of task-e9-a0-v1 for an A/A control; only the tag differs.' };
  writeFileSync(`${target}/manifest.json`, JSON.stringify(manifest, null, 2));
  const actual = Object.fromEntries(Object.keys(original.artifacts).map(file => [file, sha(readFileSync(`${target}/dist/${file}`))]));
  assert.deepEqual(actual, original.artifacts);
  report.copies.push({ tag, artifacts: actual });
}
console.log(JSON.stringify(report, null, 2));
