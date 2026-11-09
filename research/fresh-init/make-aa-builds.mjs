// A/A control for fresh/equal/100: byte-identical copies of one fixed build under two tags.
// Usage: node research/fresh-init/make-aa-builds.mjs <sourceTag> <tagX> <tagY>
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { cpSync, existsSync, readFileSync, writeFileSync } from 'node:fs';

const [sourceTag, ...tags] = process.argv.slice(2);
assert(sourceTag && tags.length === 2, 'usage: <sourceTag> <tagX> <tagY>');
const source = `.validation/task-builds/${sourceTag}`;
const sha = data => createHash('sha256').update(data).digest('hex');
const original = JSON.parse(readFileSync(`${source}/manifest.json`));
const report = { source: original.tag, sourceArtifacts: original.artifacts, copies: [] };
for (const tag of tags) {
  const target = `.validation/task-builds/${tag}`;
  assert(!existsSync(target), `Preserve existing build ${tag}`);
  cpSync(source, target, { recursive: true });
  writeFileSync(`${target}/manifest.json`, JSON.stringify({ ...original, tag, aaCopyOf: original.tag,
    aaPolicy: `Byte-identical copy of ${original.tag} for an A/A control; only the tag differs.` }, null, 2));
  const actual = Object.fromEntries(Object.keys(original.artifacts).map(file => [file, sha(readFileSync(`${target}/dist/${file}`))]));
  assert.deepEqual(actual, original.artifacts);
  report.copies.push({ tag, artifacts: actual });
}
console.log(JSON.stringify(report, null, 2));
