import { expect, test } from './fixtures';

async function probe(page: import('@playwright/test').Page) {
  await page.goto('/');
  await page.evaluate(async () => {
    const modulePath = '/src/runtime/index.ts'; const { FunctionComponent, h, useState, useEffect } = await import(modulePath);
    const output = document.createElement('div'); output.id = 'selection-probe'; document.body.append(output);
    const outside = document.createElement('button'); outside.id = 'outside-focus'; outside.textContent = 'outside'; document.body.append(outside);
    const effects: string[] = []; let update: any;
    const root = new FunctionComponent(() => {
      const [state, set] = useState({ value: 'abcdef', move: false, remove: false, replace: false, inputType: 'text', title: 'old' });
      update = (patch: any) => set((old: any) => ({ ...old, ...patch }));
      useEffect(() => { effects.push(state.title); }, [state]);
      const a = h('li', { key: 'a', attrs: { 'data-probe-id': 'a' } }, h(state.replace ? 'textarea' : 'input', {
        attrs: { 'aria-label': 'selection-input', ...(state.replace ? {} : { type: state.inputType }) },
        form: { mode: 'controlled', value: state.value }, events: { input: (event: Event) => update({ value: (event.target as HTMLInputElement).value }) },
      }));
      const b = h('li', { key: 'b', attrs: { 'data-probe-id': 'b' } }, 'B');
      return h('div', { attrs: { title: state.title } }, h('output', { attrs: { 'aria-label': 'selection-title' } }, state.title), h('ul', null, state.remove ? [b] : state.move ? [a, b] : [b, a]));
    }, {}, output); root.mount();
    (window as any).selectionProbe = { root, update, effects, input: output.querySelector('input') };
  });
}

test('T-B02/T-B03: browser preserves active node and range through unrelated writes/reorder and clamps changed values', async ({ page }) => {
  await probe(page); const input = page.getByLabel('selection-input'); await input.focus();
  await input.evaluate((node: HTMLInputElement) => node.setSelectionRange(1, 4, 'backward'));
  await page.evaluate(() => (window as any).selectionProbe.update({ title: 'unrelated' }));
  await expect(page.getByLabel('selection-title')).toHaveText('unrelated'); await expect(input).toBeFocused();
  expect(await input.evaluate((node: HTMLInputElement) => [node.selectionStart, node.selectionEnd, node.selectionDirection])).toEqual([1, 4, 'backward']);
  await page.evaluate(() => (window as any).selectionProbe.update({ move: true }));
  await expect(page.locator('#selection-probe li').first()).toHaveAttribute('data-probe-id', 'a'); await expect(input).toBeFocused();
  expect(await input.evaluate((node: HTMLInputElement) => node === (window as any).selectionProbe.input)).toBe(true);
  expect(await input.evaluate((node: HTMLInputElement) => [node.selectionStart, node.selectionEnd, node.selectionDirection])).toEqual([1, 4, 'backward']);
  await page.evaluate(() => (window as any).selectionProbe.update({ value: 'xy' })); await expect(input).toHaveValue('xy');
  expect(await input.evaluate((node: HTMLInputElement) => [node.selectionStart, node.selectionEnd])).toEqual([1, 2]);
});

test('T-B03: removal/replacement do not refocus a new node, and explicit external focus wins', async ({ page }) => {
  await probe(page); await page.getByLabel('selection-input').focus();
  await page.evaluate(() => (window as any).selectionProbe.update({ replace: true }));
  await expect(page.locator('#selection-probe textarea')).toHaveCount(1); await expect(page.getByLabel('selection-input')).not.toBeFocused();
  await page.getByLabel('selection-input').focus();
  await page.evaluate(() => {
    const element = document.querySelector('#selection-probe > div')!, original = element.setAttribute.bind(element);
    element.setAttribute = (name, value) => { original(name, value); document.getElementById('outside-focus')!.focus(); };
    (window as any).selectionProbe.update({ title: 'focus elsewhere' });
  });
  await expect(page.getByLabel('selection-title')).toHaveText('focus elsewhere'); await expect(page.locator('#outside-focus')).toBeFocused();
  await page.getByLabel('selection-input').focus(); await page.evaluate(() => (window as any).selectionProbe.update({ remove: true }));
  await expect(page.getByLabel('selection-input')).toHaveCount(0);
  expect(await page.evaluate(() => document.activeElement === (window as any).selectionProbe.input)).toBe(false);
});

test('T-B04: synthetic composition defers ancestor move and latest plan, preserving input and Effects until end', async ({ page }) => {
  await probe(page); const input = page.getByLabel('selection-input'); await input.focus();
  await input.dispatchEvent('compositionstart', { data: '' });
  await input.evaluate((node: HTMLInputElement) => { node.value = '한'; node.dispatchEvent(new InputEvent('input', { bubbles: true, isComposing: true, data: '한' })); });
  await page.evaluate(() => (window as any).selectionProbe.update({ move: true, title: 'held' }));
  await expect.poll(() => page.evaluate(() => (window as any).selectionProbe.root.lastResult.status)).toBe('deferred');
  await expect(page.locator('#selection-probe li').first()).toHaveAttribute('data-probe-id', 'b'); await expect(input).toHaveValue('한');
  await expect(page.getByLabel('selection-title')).toHaveText('old');
  expect(await page.evaluate(() => (window as any).selectionProbe.effects.includes('held'))).toBe(false);
  await page.evaluate(() => (window as any).selectionProbe.update({ title: 'latest' }));
  await input.dispatchEvent('compositionend', { data: '한' });
  await expect(page.locator('#selection-probe li').first()).toHaveAttribute('data-probe-id', 'a');
  await expect(page.getByLabel('selection-title')).toHaveText('latest'); await expect(input).toHaveValue('한'); await expect(input).toBeFocused();
  expect(await page.evaluate(() => (window as any).selectionProbe.effects.includes('held'))).toBe(false);
});

test('T-B04: editor buttons are disabled throughout composition and re-enabled after end', async ({ page }) => {
  await page.goto('/'); await page.locator('#test').dispatchEvent('compositionstart', { data: '' });
  await expect(page.getByRole('button', { name: 'Patch', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: '뒤로가기' })).toBeDisabled();
  await page.locator('#test').dispatchEvent('compositionend', { data: '한' });
  await expect(page.getByRole('button', { name: 'Patch', exact: true })).toBeEnabled();
});
