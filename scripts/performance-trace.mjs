import { chromium, expect } from '@playwright/test';
import { preview } from 'vite';
import { mkdirSync, writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const output = path.resolve('docs/performance'); mkdirSync(output, { recursive: true });
const server = await preview({ preview: { host: '127.0.0.1', port: 4175, strictPort: true } });
const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } }), page = await context.newPage();
  await page.goto('http://127.0.0.1:4175/');
  await expect(page.locator('#task-app [data-testid=task-sync]')).toHaveText('취소 가능한 동기화: 8개');
  const client = await context.newCDPSession(page);
  await client.send('Tracing.start', { categories: 'devtools.timeline,blink.user_timing,loading,disabled-by-default-devtools.timeline', transferMode: 'ReturnAsStream' });
  await page.evaluate(() => performance.mark('mini-react-workflow:start'));
  const app = page.locator('#task-app');
  await app.getByLabel('새 항목', { exact: true }).fill('Performance trace'); await app.getByRole('button', { name: '항목 추가', exact: true }).click();
  await expect(app.getByLabel('task-9 이름')).toHaveValue('Performance trace');
  await app.getByLabel('task-9 이름').fill('실제 사용자 흐름'); await app.getByLabel('task-9 완료').check();
  await app.getByRole('button', { name: '마지막 항목을 처음으로', exact: true }).click();
  await expect(app.locator('li').first()).toHaveAttribute('data-task-id', 'task-9');
  await app.getByRole('button', { name: '+1 세 번', exact: true }).click(); await expect(app.getByLabel('Batching 카운트')).toHaveText('3');
  await page.getByText('HTML로 구조·속성 편집하기', { exact: true }).click();
  await page.getByLabel('테스트 영역 HTML').fill('<p>Performance trace history</p>');
  await page.getByRole('button', { name: 'HTML을 테스트 영역에 반영' }).click(); await page.getByRole('button', { name: 'Patch', exact: true }).click();
  await page.getByRole('button', { name: '뒤로가기' }).click(); await expect(page.locator('#actual')).toContainText('오늘의 학습');
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await page.evaluate(() => performance.mark('mini-react-workflow:end'));
  const complete = new Promise(resolve => client.once('Tracing.tracingComplete', resolve));
  await client.send('Tracing.end'); const { stream } = await complete;
  const chunks = [];
  for (;;) {
    const chunk = await client.send('IO.read', { handle: stream });
    chunks.push(Buffer.from(chunk.data, chunk.base64Encoded ? 'base64' : 'utf8')); if (chunk.eof) break;
  }
  await client.send('IO.close', { handle: stream });
  const raw = Buffer.concat(chunks), parsed = JSON.parse(raw.toString('utf8'));
  writeFileSync(path.join(output, 'chromium-workflow.trace.json.gz'), gzipSync(raw));
  const metrics = {};
  for (const name of ['Layout', 'UpdateLayoutTree', 'Paint', 'PrePaint', 'EventDispatch', 'FunctionCall']) {
    const events = parsed.traceEvents.filter(event => event.name === name && event.ph === 'X');
    metrics[name] = { count: events.length, totalDurationMs: events.reduce((sum, event) => sum + (event.dur ?? 0), 0) / 1000 };
  }
  const metadata = { recordedAt: new Date().toISOString(), browser: await browser.version(), headless: true, buildMode: 'production',
    codeCommit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), workingTreeStatus: execFileSync('git', ['status', '--short'], { encoding: 'utf8' }).trim(),
    viewport: { width: 1280, height: 900 }, inspectorEnabled: true,
    workflow: ['type/add task', 'rename/toggle', 'move last task to first', 'batch +1 three times', 'editor HTML/Patch/Undo'],
    metrics, traceEventCount: parsed.traceEvents.length,
    interpretation: 'Single browser workflow with Inspector enabled. Trace contains real style/layout/paint events. Categories can overlap; durations are not additive, not an input latency metric or a Greedy/LIS speed comparison.' };
  writeFileSync(path.join(output, 'chromium-workflow.json'), JSON.stringify(metadata, null, 2));
  console.log(JSON.stringify(metadata, null, 2));
} finally { await browser.close(); await new Promise(resolve => server.httpServer.close(resolve)); }
