import { expect, test } from '@playwright/test';

test('T-S03/T-S05: real clicks batch three requests, while later clicks remain separate', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(async () => {
    const modulePath = '/src/runtime/index.ts'; const { FunctionComponent, h, useState } = await import(modulePath);
    const output = document.createElement('div'); output.id = 'batch-probe'; document.body.append(output);
    const events: any[] = []; (window as any).batchEvents = events;
    const root = new FunctionComponent(() => {
      const [n, set] = useState(0);
      return h('button', { events: { click: () => { set((v: number) => v + 1); set((v: number) => v + 1); set((v: number) => v + 1); } } }, String(n));
    }, {}, output, { trace: { emit: (event: any) => events.push(event) } }); root.mount(); events.length = 0;
  });
  const button = page.locator('#batch-probe button'); await button.click(); await expect(button).toHaveText('3');
  await button.click(); await expect(button).toHaveText('6');
  expect(await page.evaluate(() => (window as any).batchEvents.filter((e: any) => e.phase === 'patch').length)).toBe(2);
});

test('regression: capture setter cannot flush before the native parent bubble input handler', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(async () => {
    const modulePath = '/src/runtime/index.ts'; const { FunctionComponent, h, useState } = await import(modulePath);
    const output = document.createElement('div'); document.body.append(output);
    const root = new FunctionComponent(() => {
      const [value, setValue] = useState('old'), [n, setN] = useState(0);
      return h('div', { events: { input: (event: Event) => setValue((event.target as HTMLInputElement).value) } },
        h('div', { events: { input: { capture: true, handler: () => setN((n: number) => n + 1) } } },
          h('input', { attrs: { 'aria-label': 'capture-probe' }, form: { mode: 'controlled', value } })),
        h('output', { attrs: { 'aria-label': 'capture-result' } }, `${value}:${n}`));
    }, {}, output); root.mount();
  });
  await page.getByLabel('capture-probe').fill('native new');
  await expect(page.getByLabel('capture-probe')).toHaveValue('native new');
  await expect(page.getByLabel('capture-result')).toHaveText('native new:1');
});
