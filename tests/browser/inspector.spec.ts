import { expect, test } from './fixtures';

test('T-Q01/T-Q02: Inspector reflects executor counts and highlights actual ref; replay/reset are deterministic', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '초기 상태에서 실행', exact: true }).click();
  await expect(page.locator('#lab-status')).toContainText('실제 이동 1');
  await expect(page.locator('[data-counter="movedRoots"]')).toHaveText('1');
  await page.getByRole('button', { name: /PLACE_BEFORE \(move\)/ }).click();
  await expect(page.locator('.patch-highlight')).toHaveCount(1);
  await page.locator('#lab-strategy').selectOption('greedy');
  await page.getByRole('button', { name: '초기 상태에서 실행', exact: true }).click();
  await expect(page.locator('#lab-status')).toContainText('실제 이동 7');
  await expect(page.locator('[data-counter="movedRoots"]')).toHaveText('7');
  await page.locator('#lab-scenario').selectOption('shuffle');
  await page.getByRole('button', { name: '초기 상태에서 실행', exact: true }).click();
  const first = await page.locator('#lab-output li').evaluateAll(nodes => nodes.map(node => node.getAttribute('data-id')));
  await page.getByText('입력 JSON 저장·실패 입력 재실행', { exact: true }).click();
  await page.getByRole('button', { name: 'JSON 입력 재실행' }).click();
  expect(await page.locator('#lab-output li').evaluateAll(nodes => nodes.map(node => node.getAttribute('data-id')))).toEqual(first);
  await page.getByRole('button', { name: '실험 초기화' }).click();
  await expect(page.locator('#lab-output li').first()).toHaveAttribute('data-id', 'row-0');
  await page.screenshot({ path: '.validation/inspector.png', fullPage: true });
});
