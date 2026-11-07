import { expect, test } from '@playwright/test';

test('회귀: native input의 부모 bubble handler가 복원 전의 실제 입력값을 읽는다', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(async () => {
    const modulePath = '/src/runtime/index.ts'; const { FunctionComponent, h, useState } = await import(modulePath);
    const output = document.createElement('div'); document.body.append(output);
    const root = new FunctionComponent(() => {
      const [value, setValue] = useState('old');
      return h('div', { events: { input: (event: Event) => setValue((event.target as HTMLInputElement).value) } },
        h('input', { attrs: { 'aria-label': 'parent-handler-input' }, form: { mode: 'controlled', value } }),
        h('output', { attrs: { 'aria-label': 'accepted-input' } }, value),
      );
    }, {}, output); root.mount();
  });
  await page.getByLabel('parent-handler-input').fill('new input');
  await expect(page.getByLabel('parent-handler-input')).toHaveValue('new input');
  await expect(page.getByLabel('accepted-input')).toHaveText('new input');
});

test('T-B01/T-P06: 실제 native 입력에서 controlled 거부/그룹 복원과 uncontrolled 보존', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(async () => {
    const modulePath = '/src/runtime/index.ts';
    const { FunctionComponent, h, useState } = await import(modulePath);
    const output = document.createElement('div'); output.id = 'form-probe'; document.body.append(output);
    const root = new FunctionComponent(() => {
      const [n, set] = useState(0);
      return h('form', null,
        h('input', { attrs: { 'aria-label': 'locked' }, form: { mode: 'controlled', value: 'fixed' } }),
        h('input', { attrs: { 'aria-label': 'free' }, form: { mode: 'uncontrolled', defaultValue: 'initial' } }),
        h('input', { attrs: { type: 'checkbox', 'aria-label': 'locked-check' }, form: { mode: 'controlled', checked: true } }),
        h('input', { attrs: { type: 'radio', name: 'r', 'aria-label': 'radio-a' }, form: { mode: 'controlled', checked: true } }),
        h('input', { attrs: { type: 'radio', name: 'r', 'aria-label': 'radio-b' }, form: { mode: 'controlled', checked: false } }),
        h('select', { attrs: { 'aria-label': 'locked-select' }, form: { mode: 'controlled', selectedIndices: [1] } },
          h('option', { attrs: { value: 'a' } }, 'A'), h('option', { attrs: { value: 'b' } }, 'B')),
        h('button', { attrs: { type: 'button' }, events: { click: () => set(n + 1) } }, 'rerender'),
        h('output', { attrs: { 'aria-label': 'probe-count' } }, n),
      );
    }, {}, output);
    root.mount();
  });
  const probe = page.locator('#form-probe');
  await probe.getByLabel('locked', { exact: true }).fill('rejected');
  await expect(probe.getByLabel('locked', { exact: true })).toHaveValue('fixed');
  await probe.getByLabel('free', { exact: true }).fill('user-owned');
  await probe.getByLabel('locked-check').click(); await expect(probe.getByLabel('locked-check')).toBeChecked();
  await probe.getByLabel('radio-b').click();
  await expect(probe.getByLabel('radio-a')).toBeChecked(); await expect(probe.getByLabel('radio-b')).not.toBeChecked();
  await probe.getByLabel('locked-select').selectOption('a'); await expect(probe.getByLabel('locked-select')).toHaveValue('b');
  await probe.getByRole('button', { name: 'rerender' }).click();
  await expect(probe.getByLabel('probe-count')).toHaveText('1'); await expect(probe.getByLabel('free', { exact: true })).toHaveValue('user-owned');
});

test('T-V02/T-H02: native 폼 편집과 History가 속성/live property를 복원한다', async ({ page }) => {
  await page.goto('/');
  await page.getByText('HTML로 구조·속성 편집하기', { exact: true }).click();
  await page.getByLabel('테스트 영역 HTML').fill('<form><label>이름<input value="initial"></label><label>메모<textarea>before</textarea></label><label>첫째<input type="radio" name="pick" checked></label><label>둘째<input type="radio" name="pick"></label><label>선택<select multiple><option value="a" selected>A</option><option value="b">B</option></select></label></form>');
  await page.getByRole('button', { name: 'HTML을 테스트 영역에 반영' }).click();
  await page.getByRole('button', { name: 'Patch', exact: true }).click();
  const actual = page.locator('#actual'), edited = page.locator('#test');
  await edited.getByLabel('이름', { exact: true }).fill('typed'); await edited.getByLabel('메모').fill('after');
  await edited.getByLabel('둘째').click(); await edited.getByLabel('선택').selectOption(['a', 'b']);
  await expect(actual.getByLabel('첫째')).toBeChecked(); await expect(actual.getByLabel('이름', { exact: true })).toHaveValue('initial');
  await page.getByRole('button', { name: 'Patch', exact: true }).click();
  await expect(actual.getByLabel('이름', { exact: true })).toHaveValue('typed'); await expect(actual.getByLabel('메모')).toHaveValue('after');
  await expect(actual.getByLabel('둘째')).toBeChecked(); await expect(actual.getByLabel('선택')).toHaveValues(['a', 'b']);
  await expect(actual.getByLabel('이름', { exact: true })).toHaveAttribute('value', 'initial');
  await page.getByRole('button', { name: '뒤로가기' }).click();
  await expect(actual.getByLabel('이름', { exact: true })).toHaveValue('initial'); await expect(edited.getByLabel('메모')).toHaveValue('before');
  await expect(actual.getByLabel('첫째')).toBeChecked(); await expect(edited.getByLabel('선택')).toHaveValues(['a']);
});

test('T-V05: 실제 file 선택을 잃어버리는 snapshot으로 확정하지 않는다', async ({ page }) => {
  await page.goto('/');
  await page.getByText('HTML로 구조·속성 편집하기', { exact: true }).click();
  await page.getByLabel('테스트 영역 HTML').fill('<input type="file" aria-label="파일">');
  await page.getByRole('button', { name: 'HTML을 테스트 영역에 반영' }).click();
  await page.getByRole('button', { name: 'Patch', exact: true }).click();
  await page.locator('#test').getByLabel('파일').setInputFiles({ name: 'probe.txt', mimeType: 'text/plain', buffer: Buffer.from('fixture') });
  await page.getByRole('button', { name: 'Patch', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('파일 목록');
  await expect(page.locator('#actual').getByLabel('파일')).toHaveValue('');
  await expect(page.locator('#history-status')).toContainText('V1');
});

test('T-E03: host 예외 후 초기화 버튼은 마지막 정상 History를 복구한다', async ({ page }) => {
  await page.goto('/');
  await page.getByText('HTML로 구조·속성 편집하기', { exact: true }).click();
  const source = page.getByLabel('테스트 영역 HTML');
  await source.fill('<p>last committed</p>');
  await page.getByRole('button', { name: 'HTML을 테스트 영역에 반영' }).click(); await page.getByRole('button', { name: 'Patch', exact: true }).click();
  await source.fill('<p>candidate</p><hr>'); await page.getByRole('button', { name: 'HTML을 테스트 영역에 반영' }).click();
  await page.evaluate(() => { document.querySelector('#actual')!.insertBefore = () => { throw new Error('injected failure'); }; });
  await page.getByRole('button', { name: 'Patch', exact: true }).click(); await expect(page.getByRole('alert')).toContainText('injected failure');
  await page.evaluate(() => { Reflect.deleteProperty(document.querySelector('#actual')!, 'insertBefore'); });
  await page.getByRole('button', { name: '편집기 초기화' }).click();
  await expect(page.locator('#actual')).toHaveText('last committed'); await expect(page.locator('#test')).toHaveText('last committed');
  await expect(page.locator('#history-status')).toContainText('V1'); await expect(page.getByRole('alert')).toBeHidden();
});
