import { expect, test } from './fixtures';

test('T-A01/T-A02: keyboard CRUD, search/filter/sort, counts, error and empty states use the root engine', async ({ page }) => {
  await page.goto('/'); const app = page.locator('#task-app');
  await expect(app.getByTestId('task-summary')).toHaveText('전체 8 · 완료 0 · 남음 8');
  await app.getByRole('button', { name: '항목 추가', exact: true }).click(); await expect(app.getByRole('alert')).toContainText('이름');
  await page.keyboard.press('Alt+n'); await expect(app.getByLabel('새 항목', { exact: true })).toBeFocused();
  await app.getByLabel('새 항목', { exact: true }).fill('브라우저 검증'); await page.keyboard.press('Enter');
  await expect(app.getByLabel('task-9 이름')).toHaveValue('브라우저 검증'); await expect(app.getByRole('alert')).toHaveCount(0);
  await app.getByLabel('task-9 이름').fill('수정한 학습'); await app.getByLabel('task-9 완료').check();
  await expect(app.getByTestId('task-summary')).toHaveText('전체 9 · 완료 1 · 남음 8');
  await app.getByLabel('완료 필터').selectOption('done'); await expect(app.locator('li')).toHaveCount(1);
  await app.getByLabel('항목 검색').fill('없는 입력'); await expect(app.getByTestId('task-empty')).toContainText('맞는 항목');
  await app.getByLabel('항목 검색').fill(''); await app.getByLabel('완료 필터').selectOption('all');
  await app.getByLabel('목록 정렬').selectOption('name');
  const names = await app.locator('li input[type=text]').evaluateAll(nodes => nodes.map(node => (node as HTMLInputElement).value));
  expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b, 'ko')));
  await app.getByLabel('task-9 삭제').click(); await expect(app.getByLabel('task-9 이름')).toHaveCount(0);
  await expect(app.getByTestId('task-sync')).toHaveText('취소 가능한 동기화: 8개');
  await app.getByRole('button', { name: '+1 세 번', exact: true }).click(); await expect(app.getByLabel('Batching 카운트')).toHaveText('3');
  await app.getByRole('button', { name: '마지막 항목을 처음으로', exact: true }).click();
  await expect(app.locator('li').first()).toHaveAttribute('data-task-id', 'task-8');
  for (let i = 1; i <= 8; i++) await app.getByLabel(`task-${i} 삭제`).click();
  await expect(app.getByTestId('task-empty')).toContainText('목록이 비었습니다');
  await expect(app.getByRole('button', { name: '마지막 항목을 처음으로', exact: true })).toBeDisabled();
});

test('T-A03/T-B03: repeated reset cancels timers/listeners and focused keyed input survives one move', async ({ page }) => {
  await page.goto('/'); const app = page.locator('#task-app');
  for (let i = 0; i < 4; i++) {
    await app.getByRole('button', { name: '1.5초 뒤 마지막 항목 이동' }).click();
    await page.getByRole('button', { name: '목록 앱 초기화' }).click();
  }
  await page.waitForTimeout(1700); await expect(app.locator('li').first()).toHaveAttribute('data-task-id', 'task-1');
  const input = app.getByLabel('task-8 이름'); await input.focus();
  await input.evaluate((node: HTMLInputElement) => node.setSelectionRange(0, 2));
  await page.evaluate(() => window.dispatchEvent(new Event('mini-react:list-move-last')));
  await expect(app.locator('li').first()).toHaveAttribute('data-task-id', 'task-8'); await expect(input).toBeFocused();
  expect(await input.evaluate((node: HTMLInputElement) => [node.selectionStart, node.selectionEnd])).toEqual([0, 2]);
  await expect(page.locator('#error')).toBeHidden();
  await page.setViewportSize({ width: 390, height: 844 }); await page.screenshot({ path: '.validation/tasks-mobile.png', fullPage: true });
  await app.screenshot({ path: '.validation/task-app-mobile.png' });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
