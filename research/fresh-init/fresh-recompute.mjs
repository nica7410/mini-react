import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { distribution } from '../../src/bench/statistics.ts';
const dir = process.argv[2];
const f = v => v.toFixed(3);
for (const s of [1, 2, 3]) {
  const meta = JSON.parse(readFileSync(`${dir}/session-${s}.json`));
  const rows = gunzipSync(readFileSync(`${dir}/session-${s}.jsonl.gz`)).toString().trim().split('\n').map(JSON.parse).filter(r => r.sampleKind === 'sample');
  console.log(`== S${s} order ${meta.processes.map(p => p.build).join(' > ')}`);
  for (const build of [...new Set(rows.map(r => r.build))]) {
    const rs = rows.filter(r => r.build === build).sort((a, b) => a.index - b.index);
    const m = { init: rs.map(r => r.initialization.cpuMs), update: rs.map(r => r.result.totalCpuMs), life: rs.map(r => r.lifecycleCpuMs) };
    for (const k of [0, 1, 2]) for (const ph of ['renderMs', 'diffMs', 'commitMs', 'flushMs']) m[`f${k}.${ph}`] = rs.map(r => r.initialization.flushes[k][ph]);
    m['upd.render'] = rs.map(r => r.result.actions[0].timings.renderMs); m['upd.diff'] = rs.map(r => r.result.actions[0].timings.diffMs); m['upd.commit'] = rs.map(r => r.result.actions[0].timings.commitMs);
    m['init-minus-flushes'] = rs.map(r => r.initialization.cpuMs - r.initialization.flushes.reduce((a, x) => a + x.flushMs, 0));
    const line = Object.entries(m).map(([k, v]) => { const d = distribution(v); return `${k} ${f(d.median)}/${f(d.p95)}`; });
    console.log(`  ${build} n=${rs.length}\n    ${line.join(' | ')}`);
    // index thirds
    const thirds = [0, 60, 120].map(a => distribution(m.life.slice(a, a + 60)).median.toFixed(2) + '/' + distribution(m.life.slice(a, a + 60)).p95.toFixed(2));
    console.log(`    life median/p95 by index thirds: ${thirds.join('  ')}`);
    const top = rs.map((r, i) => ({ i: r.index, life: r.lifecycleCpuMs, init: r.initialization.cpuMs, upd: r.result.totalCpuMs, fl: r.initialization.flushes.map(x => x.flushMs.toFixed(1)).join('+') }))
      .sort((a, b) => b.life - a.life).slice(0, 9);
    console.log(`    top9 life: ${top.map(t => `#${t.i} ${t.life.toFixed(1)}=init ${t.init.toFixed(1)}[${t.fl}]+upd ${t.upd.toFixed(1)}`).join('; ')}`);
  }
}
