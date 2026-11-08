// Human-readable gate evidence; selection and explanations remain a separate decision.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const [tag, engine] = process.argv.slice(2);
assert(tag && /^[a-z0-9-]+$/.test(tag) && /^E\d+[A-Z]*$/.test(engine), 'Usage: node scripts/report-task-policy.mjs run-tag E3');
const directory = `docs/bench/${tag}`;
const read = name => JSON.parse(readFileSync(`${directory}/${name}.json`));
const sha = file => createHash('sha256').update(readFileSync(file)).digest('hex');
const environment = read('environment'), audit = read('statistics-audit'), decisions = read('decisions');
assert.equal(environment.status, 'passed'); assert.equal(audit.status, 'passed');
const policyAudit = read('policy-audit'); assert.equal(policyAudit.status, 'passed');
assert.equal(policyAudit.decisionsSha256, sha(`${directory}/decisions.json`));
assert.equal(policyAudit.statisticsAuditSha256, sha(`${directory}/statistics-audit.json`));
assert.equal(environment.smoke, false); assert.equal(environment.sessions, 3);
const comparisons = [`A1: E1 -> ${engine}`, `${engine}: A0 -> A1`];
const rows = decisions.filter(row => comparisons.includes(row.comparison));
assert(rows.length > 0);
const n = value => Number(value).toFixed(3);
const percent = value => value === null ? 'n/a' : `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;
const delta = (session, field) => `${percent(session.delta[field].percent)} (${n(session.delta[field].ms)}ms)`;
const label = row => `${row.regime}/${row.workload}/${row.size}/${row.scope}`;
const report = [
  `# ${tag}: ${engine} 정책 판정용 근거`, '',
  '같은 세션의 비교만 사용한다. +는 악화, −는 개선이다. 아래 초과는 사전 허용 오차를 넘었다는 뜻이며 통계적 유의성 검정이나 자동 채택 결과가 아니다. 결과를 합치거나 느린 표본을 제거하지 않았다.', '',
  '원래 ms·IQR·p95/n과 모든 비교는 [전체 비교](comparisons.md), 독립 원자료 재계산은 [통계 감사](statistics-audit.json)에 있다. 시간은 정의된 처리 창의 경과 시간 합계이며 OS CPU 시간·물리 입력 지연·화면 표시 완료 시간이 아니다.', '',
  environment.supplement ? '이 실행은 별도 n=180 보충이다. 원래 표본과 합치지 않는다.' : '정식 초기 비교다. 최종 정책에 영향을 주는 초과·상반된 tail 판정은 사전 계획의 새 3세션 n=180 보충 또는 보수적인 적용 범위 판단이 필요하다.', '',
  '| 비교 | 검사 조건 | median 초과 조건 | p95 초과 조건 | 어느 하나 초과 |',
  '|---|---:|---:|---:|---:|',
];
const totals = [];
for (const comparison of comparisons) {
  const selected = rows.filter(row => row.comparison === comparison);
  if (!selected.length) continue;
  const entry = { comparison, conditions: selected.length, medianExceeded: selected.filter(row => row.medianGateExceedances).length,
    p95Exceeded: selected.filter(row => row.p95GateExceedances).length, anyExceeded: selected.filter(row => row.medianGateExceedances || row.p95GateExceedances).length };
  totals.push(entry);
  report.push(`| ${comparison} | ${entry.conditions} | ${entry.medianExceeded} | ${entry.p95Exceeded} | ${entry.anyExceeded} |`);
}
report.push('', 'median/p95 열은 겹칠 수 있다. 조건에는 작업 묶음·fresh 초기화/생명주기·CRUD 하위 action이 따로 들어 있다. 이 수를 사용자 작업 개수나 독립 브라우저 테스트 개수로 합산하지 않는다.', '',
  '## 반복 재사용 목표', '',
  '| 비교 | 조건 | 10% 이상 median 감소 세션 | median 변화 S1 / S2 / S3 | p95 변화 S1 / S2 / S3 |',
  '|---|---|---:|---|---|');
const reuse = rows.filter(row => row.reuseTarget && row.scope === 'workload');
for (const row of reuse) report.push(`| ${row.comparison} | ${label(row)} | ${row.gainsOf10Percent}/${row.sessions.length} | ${row.sessions.map(s => delta(s, 'median')).join(' / ')} | ${row.sessions.map(s => delta(s, 'p95')).join(' / ')} |`);
report.push('', '## 사전 허용 범위를 한 번이라도 넘은 모든 조건', '',
  '초과하지 않은 세션도 같은 행에 남긴다. 10,000개는 stress 조건이다. 허용치는 앱 median max(5%,0.5ms)/p95 max(10%,1ms), 엔진 median max(5%,1ms)/p95 max(10%,2ms)다.', '',
  '| 비교 | 조건 | n (각 세션) | median 변화 S1 / S2 / S3 | p95 변화 S1 / S2 / S3 | 초과 세션 median / p95 |',
  '|---|---|---:|---|---|---|');
const exceeded = rows.filter(row => row.medianGateExceedances || row.p95GateExceedances);
for (const row of exceeded) {
  assert.deepEqual(row.sessions.map(s => s.session), [1, 2, 3]);
  report.push(`| ${row.comparison} | ${label(row)} | ${row.sessions.map(s => s.n).join('/')} | ${row.sessions.map(s => delta(s, 'median')).join(' / ')} | ${row.sessions.map(s => delta(s, 'p95')).join(' / ')} | ${row.sessions.filter(s => s.medianExceeded).map(s => s.session).join(',') || '없음'} / ${row.sessions.filter(s => s.p95Exceeded).map(s => s.session).join(',') || '없음'} |`);
}
if (!exceeded.length) report.push('', '이 실행에서 초과한 조건은 없다. 다른 기기·입력·장기 사용까지 보장하는 결과는 아니다.');
report.push('', '최종 정책과 진단 해석은 사람이 별도로 기록한다. 이 표만으로 전체 성능 개선이나 최종 인수를 선언하지 않는다.', '');
writeFileSync(`${directory}/policy-review-${engine.toLowerCase()}.md`, report.join('\n'));
const result = { status: 'passed', createdAt: new Date().toISOString(), engine, totals, reuseConditions: reuse.map(row => row.key),
  exceededConditions: exceeded.map(row => row.key), inputDecisionsSha256: sha(`${directory}/decisions.json`),
  statisticsAuditSha256: sha(`${directory}/statistics-audit.json`), scriptSha256: sha('scripts/report-task-policy.mjs'),
  policyAuditSha256: sha(`${directory}/policy-audit.json`),
  reportSha256: sha(`${directory}/policy-review-${engine.toLowerCase()}.md`), note: 'All gate-exceeding conditions from the independently audited input were rendered. This is evidence formatting, not an adoption decision.' };
writeFileSync(`${directory}/policy-review-${engine.toLowerCase()}.json`, JSON.stringify(result, null, 2));
console.log(JSON.stringify({ status: result.status, totals, reuseConditions: reuse.length, exceededConditions: exceeded.length }));
