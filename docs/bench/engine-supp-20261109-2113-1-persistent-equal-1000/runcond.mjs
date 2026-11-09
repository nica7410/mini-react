import { spawn, execFileSync } from 'node:child_process';
import { appendFileSync, writeFileSync } from 'node:fs';
const [tag, builds, size, workload, regime, measureDeadline, hardKill, log] = process.argv.slice(2);
const md = Number(measureDeadline), hk = Number(hardKill);
const maxMin = (md - Date.now()) / 60000;
const args = ['scripts/benchmark-task.mjs', `--tag=${tag}`, `--builds=${builds}`, `--sizes=${size}`, `--workloads=${workload}`, `--regimes=${regime}`,
  '--sessions=3', '--supplement', '--alternate-pair-order', `--max-minutes=${maxMin}`, `--deadline-epoch-ms=${md}`];
writeFileSync(log, `CMD node ${args.join(' ')}\nSTART ${new Date().toISOString()} maxMin=${maxMin.toFixed(3)}\n`);
const child = spawn(process.execPath, args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
child.stdout.on('data', d => appendFileSync(log, d)); child.stderr.on('data', d => appendFileSync(log, d));
let killed = false;
const timer = setTimeout(() => { killed = true; appendFileSync(log, `HARDKILL ${new Date().toISOString()}\n`); try { execFileSync('taskkill', ['/PID', String(child.pid), '/T', '/F']); } catch (e) { appendFileSync(log, String(e)); } }, Math.max(0, hk - Date.now()));
child.once('close', (code, sig) => { clearTimeout(timer); appendFileSync(log, `EXIT code=${code} signal=${sig} killed=${killed} ${new Date().toISOString()}\n`); });
