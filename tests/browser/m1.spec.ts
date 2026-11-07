import { expect, test } from './fixtures';

test('M1 브라우저: 직접 편집 → Patch → 미확정 편집 → Undo/Redo', async ({ page, browser }) => {
  test.info().annotations.push({ type: 'browser-version', description: browser.version() });
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  const actual = page.locator('#actual'), editable = page.getByRole('textbox', { name: '테스트 영역', exact: true });
  await expect(page.getByRole('button', { name: '뒤로가기' })).toBeDisabled();
  await expect(editable).toHaveText(await actual.innerText(), { useInnerText: true });
  await editable.locator('p').click();
  await page.keyboard.press('End'); await page.keyboard.type(' edited');
  await expect(actual).not.toContainText('edited');
  await page.getByRole('button', { name: 'Patch', exact: true }).click();
  await expect(actual).toContainText('edited');
  await page.getByText('HTML로 구조·속성 편집하기', { exact: true }).click();
  await page.getByLabel('테스트 영역 HTML').fill('<p>uncommitted X</p>');
  await page.getByRole('button', { name: 'HTML을 테스트 영역에 반영' }).click();
  await page.getByRole('button', { name: '뒤로가기' }).click();
  await expect(actual).not.toContainText('edited'); await expect(editable).not.toContainText('uncommitted');
  await page.getByRole('button', { name: '앞으로가기' }).click();
  await expect(actual).toContainText('edited'); await expect(editable).toHaveText(await actual.innerText(), { useInnerText: true });
  await page.getByRole('button', { name: '편집기 초기화' }).click();
  await expect(page.getByRole('button', { name: '뒤로가기' })).toBeDisabled();
  await expect(actual).not.toContainText('edited'); expect(errors).toEqual([]);
});

test('M1 브라우저: 루트 State, 순수 자식, Memo, Effect, 초기화', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByLabel('카운트', { exact: true })).toHaveText('0');
  const originalInput = await page.getByRole('textbox', { name: '카운터 이름' }).elementHandle();
  await page.getByRole('textbox', { name: '카운터 이름' }).fill('민수');
  await page.getByRole('button', { name: '+1', exact: true }).click({ clickCount: 2 });
  await expect(page.getByTestId('summary')).toHaveText('민수의 카운트 2 · 두 배 4');
  await expect(page).toHaveTitle('Mini React | 2');
  expect(await originalInput!.evaluate(node => node === document.querySelector('#counter input'))).toBe(true);
  await page.getByRole('button', { name: '컴포넌트 초기화' }).click();
  await expect(page.getByTestId('summary')).toHaveText('Jungle의 카운트 0 · 두 배 0');
  await page.getByRole('button', { name: '+1', exact: true }).click();
  await expect(page.getByLabel('카운트', { exact: true })).toHaveText('1');
});

test('M1 브라우저: 미지원 HTML 입력은 기존 화면을 유지하고 오류를 표시한다', async ({ page }) => {
  await page.goto('/');
  const before = await page.locator('#test').innerHTML();
  await page.getByText('HTML로 구조·속성 편집하기', { exact: true }).click();
  await page.getByLabel('테스트 영역 HTML').fill('<img src=x onerror="document.title=123">');
  await page.getByRole('button', { name: 'HTML을 테스트 영역에 반영' }).click();
  await expect(page.getByRole('alert')).toContainText('지원하지 않는 속성');
  expect(await page.locator('#test').innerHTML()).toBe(before);
  await expect(page).toHaveTitle('Mini React | 0');
});

test('M1 브라우저: 좁은 화면과 키보드로 조작할 수 있다', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  const increase = page.getByRole('button', { name: '+1', exact: true });
  await increase.focus(); await page.keyboard.press('Enter');
  await expect(page.getByLabel('카운트', { exact: true })).toHaveText('1');
  await expect(increase).toBeFocused();
  await page.screenshot({ path: 'test-results/m1-mobile.png', fullPage: true });
});
