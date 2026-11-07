import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import path from 'node:path';
import { distribution } from '../src/bench/statistics.ts';

const directory = path.resolve(process.argv[2] ?? 'docs/bench/m8-full');
const read = name => JSON.parse(readFileSync(path.join(directory, name), 'utf8'));
const env = read('environment.json');
assert.equal(env.status, 'passed', 'Analyze only a completed benchmark');
const summary = read('summary.json'), counts = read('counts.json');
const values = new Map(), runTotals = { counts: 0, warmup: 0, sample: 0 };
const conditions = new Map(), initial = new Map(), countByCondition = new Map();
const seenIndices = new Set(), validations = new Map();
let hidden = 0, unfocused = 0;
const rawHashes = {};
const scenarios = env.scenarios ?? ['noop','one-change','prepend','delete-middle','last-to-front','first-to-back','reverse','adjacent','swap-ends','shuffle','mixed'];
const payloads = env.payloads ?? ['light','stateful'];
const variants = Object.fromEntries(Object.entries({keyed:['greedy','lis'],batching:['sync','microtask'],reuse:['off','on']}).filter(([axis])=>!env.axes || env.axes.includes(axis)));
for (let session = 1; session <= env.sessions; session++) {
  const name = `session-${session}.jsonl.gz`, buffer = readFileSync(path.join(directory, name));
  rawHashes[name] = createHash('sha256').update(buffer).digest('hex');
  for (const line of gunzipSync(buffer).toString('utf8').trim().split('\n')) {
    const row = JSON.parse(line), input = row.input;
    assert.equal(row.session, session);
    assert.equal(input.seed, env.seed);
    assert.ok(variants[input.axis]?.includes(input.variant));
    assert.ok(env.sizes.includes(input.size));
    assert.ok(payloads.includes(input.payload));
    assert.ok((input.axis === 'keyed' ? scenarios : ['noop']).includes(input.scenario));
    assert.ok(Object.hasOwn(runTotals, row.sampleKind));
    runTotals[row.sampleKind]++;
    if (row.visibility !== 'visible') hidden++;
    if (!row.focused) unfocused++;
    const key = [session,input.axis,input.size,input.payload,input.scenario,input.variant].join(',');
    const sampleKey = `${key},${row.sampleKind},${row.index}`;
    assert.ok(!seenIndices.has(sampleKey),`duplicate sample ${sampleKey}`); seenIndices.add(sampleKey);
    if (!conditions.has(key)) conditions.set(key, {counts:0,warmup:0,sample:0});
    conditions.get(key)[row.sampleKind]++;
    const validationKey=[session,input.axis,input.size,input.payload,input.scenario].join(',');
    if(!validations.has(validationKey))validations.set(validationKey,row.validation);
    assert.deepEqual(row.validation,validations.get(validationKey),'variant or sample result differs');
    const initialKey = `${input.size},${input.payload}`;
    if (!initial.has(initialKey)) initial.set(initialKey,row.validation.initialOrder);
    assert.equal(row.validation.initialOrder,initial.get(initialKey),'initial state differs');
    if (row.sampleKind === 'counts') {
      assert.equal(input.mode,'counts'); assert.equal(row.timings,null); assert.ok(row.counts);
      countByCondition.set(key,row.counts);
    } else {
      assert.equal(input.mode,'timing'); assert.equal(row.counts,null); assert.ok(row.timings);
      if (row.sampleKind === 'sample') for (const [metric,value] of Object.entries(row.timings)) {
        assert.ok(Number.isFinite(value) && value >= 0);
        const metricKey=`${key},${metric}`;
        if (!values.has(metricKey)) values.set(metricKey,[]);
        values.get(metricKey).push(value);
      }
    }
  }
}
for (let session=1;session<=env.sessions;session++) for(const size of env.sizes) for(const payload of payloads) for(const [axis,options] of Object.entries(variants)) for(const scenario of axis==='keyed'?scenarios:['noop']) for(const variant of options) {
  const key=[session,axis,size,payload,scenario,variant].join(',');
  const policy=size===10000?env.repetitions.stress:env.repetitions.normal;
  assert.deepEqual(conditions.get(key),{counts:1,warmup:policy.warmup,sample:policy.samples},`incomplete condition ${key}`);
  assert.ok(seenIndices.has(`${key},counts,${-policy.warmup-1}`));
  for(let i=-policy.warmup;i<policy.samples;i++)assert.ok(seenIndices.has(`${key},${i<0?'warmup':'sample'},${i}`));
}
assert.equal(conditions.size,env.sessions*env.sizes.length*payloads.length*Object.keys(variants).reduce((n,axis)=>n+2*(axis==='keyed'?scenarios.length:1),0));
assert.equal(counts.length,runTotals.counts);
for(const row of counts) {
  const i=row.input,key=[row.session,i.axis,i.size,i.payload,i.scenario,i.variant].join(',');
  assert.deepEqual(row.counts,countByCondition.get(key));
}
assert.equal(summary.length,values.size);
for(const row of summary) {
  const recomputed=distribution(values.get(row.key));
  for(const [metric,value] of Object.entries(recomputed)) assert.ok(Math.abs(row[metric]-value)<1e-9,`summary mismatch ${row.key}/${metric}`);
}
const lookup=new Map(summary.map(row=>[row.key,row]));
const comparisons=[];
for(const size of env.sizes) for(const payload of payloads) for(const [axis,[baseline,candidate]] of Object.entries(variants)) for(const scenario of axis==='keyed'?scenarios:['noop']) {
  const sessions=[];
  for(let session=1;session<=env.sessions;session++) {
    const prefix=[session,axis,size,payload,scenario].join(',');
    const a=lookup.get(`${prefix},${baseline},scheduledCycleMs`),b=lookup.get(`${prefix},${candidate},scheduledCycleMs`);
    sessions.push({session,baseline:a,candidate:b,medianDifferenceMs:b.median-a.median,ratio:a.median?b.median/a.median:null,
      baselineCounts:countByCondition.get(`${prefix},${baseline}`),candidateCounts:countByCondition.get(`${prefix},${candidate}`)});
  }
  const direction=sessions.every(s=>s.medianDifferenceMs<0)?'lower-all-sessions':sessions.every(s=>s.medianDifferenceMs>0)?'higher-all-sessions':'mixed-or-tied';
  comparisons.push({axis,size,payload,scenario,baseline,candidate,direction,sessions});
}
const changedSources=Object.entries(env.sourceSha256).filter(([file,hash])=>!existsSync(path.join('src',file)) || createHash('sha256').update(readFileSync(path.join('src',file))).digest('hex')!==hash).map(([file])=>file);
const audit={schemaVersion:1,codeCommit:env.codeCommit,sourceHashesMatchCurrent:changedSources.length===0,changedSources,rawHashes,
  runTotals,conditions:conditions.size,summaryMetrics:summary.length,hidden,unfocused,rawAndSummaryAgree:true,
  comparisonMetric:'scheduledCycleMs: keyed diff+commit; runtime enqueue through next microtask; excludes later paint',comparisons};
writeFileSync(path.join(directory,'analysis.json'),JSON.stringify(audit,null,2));
const fmt=v=>v.toFixed(3), medians=(row,variant)=>row.sessions.map(s=>fmt(s[variant].median)).join(' / ');
const lines=['# 전체 조건의 세션별 결과','',`기능 commit: \`${env.codeCommit}\`. 세션 ${env.sessions}개. 값의 단위는 ms. A/B는 아래 비교 축의 baseline/candidate다.`,
  '', `주 지표는 \`scheduledCycleMs\`: keyed는 diff+commit, runtime은 enqueue부터 다음 microtask까지다. paint·사용자 지각 지연이 아니다. 각 셀의 순서는 세션 ${Array.from({length:env.sessions},(_,i)=>i+1).join(' / ')}이며 세션을 합쳐 하나의 표본으로 취급하지 않는다.`,
  '', 'median만으로 유의성을 주장하지 않는다. 각 조건의 IQR·p95·capture/render/diff/commit/flush/effect는 [summary.csv](summary.csv)와 [analysis.json](analysis.json)에 있다. raw 표본과 대조한 재계산이 모두 일치한다.',
  '', '| 축 (A→B) | 크기 | payload | 입력 | A median | B median | B−A median |', '|---|---:|---|---|---|---|---|'];
for(const row of comparisons)lines.push(`| ${row.axis} (${row.baseline}→${row.candidate}) | ${row.size} | ${row.payload} | ${row.scenario} | ${medians(row,'baseline')} | ${medians(row,'candidate')} | ${row.sessions.map(s=>fmt(s.medianDifferenceMs)).join(' / ')} |`);
lines.push('', '## Raw 감사', '', `- counts ${runTotals.counts}, warm-up ${runTotals.warmup}, measured samples ${runTotals.sample}; 조건 ${conditions.size}.`,
  `- hidden ${hidden}, unfocused ${unfocused}. 해당 표본을 사후 제외하지 않았다.`,
  '- 모든 condition의 표본 수/seed/mode/reset checksum, counts 원본, 통계 재계산을 검사했다.',
  '- 실제 순서·객체 identity·텍스트·삭제·live 입력 oracle는 측정 직후 harness에서 실행했다. checksum은 이 oracle의 대체물이 아니다.',
  '- no-op·역순·작은 목록·stress를 포함해 전체 조건을 보존했다. 결과를 보고 조건을 삭제하지 않았다.',
  '', `재생성: \`node scripts/analyze-benchmark.mjs ${path.relative(process.cwd(),directory).replaceAll('\\','/')}\` (Node 24). 전체 gzip raw를 읽으므로 측정 완료 후 실행한다.`);
writeFileSync(path.join(directory,'all-results.md'),lines.join('\n')+'\n');
console.log(JSON.stringify({directory,...runTotals,conditions:conditions.size,summaryMetrics:summary.length,hidden,unfocused,rawAndSummaryAgree:true},null,2));
