import { readFileSync, existsSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { distribution } from '../../src/bench/statistics.ts';
for (const dir of process.argv.slice(2)) {
  console.log('##', dir);
  for (const s of [1, 2, 3]) {
    if (!existsSync(`${dir}/session-${s}.json`)) continue;
    const meta = JSON.parse(readFileSync(`${dir}/session-${s}.json`));
    const procs = meta.processes.filter(p => p.regime === 'fresh' && p.workload === 'equal' && p.size === 100);
    const rows = gunzipSync(readFileSync(`${dir}/session-${s}.jsonl.gz`)).toString().trim().split('\n').map(JSON.parse)
      .filter(r => r.sampleKind === 'sample' && r.regime === 'fresh' && r.workload === 'equal' && r.size === 100);
    const out = procs.map(p => {
      const rs = rows.filter(r => r.build === p.build);
      const i = distribution(rs.map(r => r.initialization.cpuMs)), l = distribution(rs.map(r => r.lifecycleCpuMs));
      return `${p.orderPosition}:${p.build} n=${rs.length} init ${i.median.toFixed(2)}/${i.p95.toFixed(2)} life ${l.median.toFixed(2)}/${l.p95.toFixed(2)}`;
    });
    console.log(` S${s}: ${out.join(' | ')}`);
  }
}
