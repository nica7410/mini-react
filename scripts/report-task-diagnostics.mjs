import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const directory = process.argv[2]; assert(directory, 'Usage: node scripts/report-task-diagnostics.mjs docs/bench/tag');
const read = name => JSON.parse(readFileSync(`${directory}/${name}.json`));
const env = read('environment'), audit = read('diagnostic-audit'), results = read('diagnostic-summary');
const sha = file => createHash('sha256').update(readFileSync(file)).digest('hex');
assert.equal(env.status, 'passed'); assert.equal(audit.status, 'passed');
assert.equal(audit.summarySha256, sha(`${directory}/diagnostic-summary.json`));
const f = value => value.toFixed(3), mib = value => f(value / 1048576);
const rows = ['# 별도 TaskApp 진단', '',
  '정식 성능 표본과 분리한 unminified production 사본이다. 엔진·앱의 기능 소스 hash는 원본 timing build와 일치한다. CPU/할당 sampling·trace·observer가 실행에 영향을 주므로 아래 시간으로 정식 비교의 순위를 대체하지 않는다.', '',
  `CPU는 warm-up ${env.cpuWarmup}회 후 ${env.repetitions}회이며 CRUD 한 회는 action 5개다. 표의 primary 시간은 측정 action 창들의 합계이고 40ms 대기·oracle·비동기 후속 flush를 포함하지 않는다. 별도 전체 profile에는 이 작업들이 남아 있다.`, '',
  '## CPU·할당·GC·긴 작업', '',
  'CPU self는 서로 겹치지 않는 가중 표본이며 inclusive stack은 중첩되므로 합치지 않는다. GC는 같은 renderer 주 스레드의 기록된 GC category 구간 합집합과 primary 창의 교집합이다. 모든 GC 이벤트를 stop-the-world pause로 해석하지 않는다. 할당은 전체 진단(초기화·warm-up·oracle 포함)의 32KiB Poisson sampling 추정량이며 수거된 객체도 포함한다. 보유 메모리나 정확한 allocation byte count가 아니다. Long task도 전체 페이지 관찰값으로 계측/검증 작업을 포함한다.', '',
  '| build / 크기 / 작업 | primary 창 합계 ms | 동결·증명 self ms / 비중 | validateTree inclusive ms | primary 내 GC category ms | 전체 할당 추정 MiB | 전체 long tasks |',
  '|---|---:|---:|---:|---:|---:|---:|'];
const cpuRows = [];
for (const result of results.filter(result => result.cpu)) {
  const phases = Object.entries(result.cpu.phases).filter(([name]) => name.startsWith('sample')).map(([, phase]) => phase);
  for (const phase of phases) assert(Math.abs(phase.selfMs.reduce((sum, item) => sum + item.value, 0) - phase.sampledMs) < .00001, 'Self samples do not account for the phase');
  const windows = result.cpu.windows.filter(window => window.name.startsWith('sample')).sort((a, b) => a.start - b.start);
  windows.forEach((window, index) => { if (index) assert(window.start >= windows[index - 1].end, 'Overlapping primary windows'); });
  const total = phases.reduce((sum, phase) => sum + phase.sampledMs, 0);
  const sum = (field, prefix) => phases.reduce((sum, phase) => sum + phase[field].filter(item => item.name.startsWith(prefix)).reduce((sum, item) => sum + item.value, 0), 0);
  const freeze = sum('selfMs', 'freezeTree @') + sum('selfMs', 'proveImmutable @'), validation = sum('inclusiveMs', 'validateTree @');
  const gc = windows.reduce((sum, window) => sum + window.gcOverlapMs, 0); assert(gc <= total + .00001);
  const row = { name: result.name, totalMs: total, freezeSelfMs: freeze, freezePercent: freeze / total * 100,
    validationInclusiveMs: validation, primaryGcCategoryMs: gc, allocationEstimatedBytes: result.allocations.estimatedBytes,
    longtasks: result.longtaskCount, windows: windows.length, negativeDeltas: result.cpu.sampleOrdering.negativeDeltas };
  cpuRows.push(row);
  rows.push(`| ${result.build} / ${result.size} / ${result.workload} | ${f(total)} | ${f(freeze)} / ${f(row.freezePercent)}% | ${f(validation)} | ${f(gc)} | ${mib(row.allocationEstimatedBytes)} | ${row.longtasks} |`);
}
rows.push('', '원본에 음수 timeDelta가 있는 경우 모든 timestamp/sample 쌍을 함께 정렬한다. 표본 삭제·재시도·missing sample 보간은 하지 않는다. 각 표본은 정렬 후 직전 구간을 가중치로 받으며 표시한 창과의 교집합만 합산한다. 모든 창의 전체 시간과 self 합계를 검산했다. 1ms sampling 근사이므로 정확한 함수 실행 시간이 아니다.', '',
  '## 보유 heap과 DOM 수명', '',
  '각 checkpoint 직전 강제 GC를 수행한 별도 단일 궤적이다. reuse:CRUD 1:1을 먼저, 10:1을 나중에 같은 앱에서 실행했다. 두 엔진의 초기 데이터와 순서는 같다. JS used heap은 프로세스 RSS가 아니며 해제 후 남은 값만으로 객체 누수를 단정하지 않는다. JIT/runtime/내부 자료구조의 구분에는 별도 소유 경로 증거가 필요하다.', '',
  '| build / 크기 | 전 / mount 후 / 마지막 작업 후 / dispose 후 MiB | DOM nodes 전→dispose | listeners 전→dispose |', '|---|---:|---:|---:|');
const memoryRows = [];
for (const result of results.filter(result => result.memory)) {
  const points = result.memory.points, first = points[0], last = points.at(-1);
  const row = { name: result.name, usedBytes: [first.heap.usedSize, points[1].heap.usedSize, points.at(-2).heap.usedSize, last.heap.usedSize],
    nodes: [first.dom.nodes, last.dom.nodes], listeners: [first.dom.jsEventListeners, last.dom.jsEventListeners] };
  memoryRows.push(row);
  rows.push(`| ${result.build} / ${result.size} | ${row.usedBytes.map(mib).join(' / ')} | ${row.nodes.join('→')} | ${row.listeners.join('→')} |`);
}
rows.push('', '## 표시 경계', '',
  '버튼을 미리 찾고 대상이 viewport 안에 있는지 확인한 뒤 programmatic click 직전에 시작한다. commit 후 같은 renderer 주 스레드의 첫 Paint 종료까지를 관찰한다. rAF callback·commit·DrawFrame을 물리 화면 표시 완료로 부르지 않는다. 각 조건의 3회 기록(작은 smoke는 1회)이며 브라우저 일반 지연 분포나 p95가 아니다. 정식 primary는 대상 검색 비용도 포함하므로 절대 경계가 다르다.', '',
  '| build / 크기 / 작업 | click→commit ms (각 회) | click→첫 Paint 종료 ms (각 회) |', '|---|---:|---:|');
const visualRows = [];
for (const result of results.filter(result => result.visual)) {
  const row = { name: result.name, commitMs: result.visual.map(value => value.dispatchToCommitMs), paintMs: result.visual.map(value => value.dispatchToFirstPaintEndMs) };
  visualRows.push(row);
  rows.push(`| ${result.build} / ${result.size} / ${result.workload} | ${row.commitMs.map(f).join(' / ')} | ${row.paintMs.map(f).join(' / ')} |`);
}
rows.push('', '[기능 소스·분석 감사](diagnostic-audit.json), [모든 stack/GC/heap/표시 구간](diagnostic-summary.json), [조건별 출처](cases.json). `*.cpu.json.gz`, `*.allocations.json.gz`, `*.trace.json.gz`, `*.memory.json`, `*.marks.json`, `*.actions.json.gz`에 원자료가 있다.', '');
writeFileSync(`${directory}/diagnostics.md`, rows.join('\n'));
const result = { status: 'passed', createdAt: new Date().toISOString(), scriptSha256: sha('scripts/report-task-diagnostics.mjs'),
  sourceSummarySha256: sha(`${directory}/diagnostic-summary.json`), reportSha256: sha(`${directory}/diagnostics.md`),
  cpuRows, memoryRows, visualRows, primarySelfAndWindowAccounting: true, note: 'Report values derived from the archived audited summary; CPU and retained-heap/visual boundaries are intentionally separate.' };
writeFileSync(`${directory}/diagnostic-report-audit.json`, JSON.stringify(result, null, 2));
console.log(JSON.stringify({ status: result.status, cpuRows: cpuRows.length, memoryRows: memoryRows.length, visualRows: visualRows.length }));
