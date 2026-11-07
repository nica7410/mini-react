import { afterEach, expect, it, vi } from 'vitest';
import { FunctionComponent, h, useEffect, useState } from '../../src/runtime';
import type { FormPolicy, RenderValue, StateSetter } from '../../src/core/types';
import { resolveExpression } from '../../src/runtime/resolve';
import { readDOM } from '../../src/core/capture';
import { EditorController } from '../../src/editor/controller';
import { parseEditorHTML } from '../../src/editor/inputPolicy';
import { apply, container, render, snapshot } from '../fixtures/helpers';

afterEach(() => document.body.replaceChildren());
const options = (values: readonly string[]) => values.map(value => h('option', { key: value, attrs: { value } }, value));

it('T-V02: radio의 live checked와 원래 attribute를 구분하고 두 영역 form을 격리한다', () => {
  const actual = container('<form><input type="radio" name="r" checked><input type="radio" name="r"></form>'), test = container();
  document.body.append(actual, test);
  const editor = new EditorController(actual, test);
  const actualRadios = actual.querySelectorAll('input'), testRadios = test.querySelectorAll('input');
  testRadios[1].click();
  expect(actualRadios[0].checked).toBe(true); expect(testRadios[0].checked).toBe(false);
  expect(testRadios[0].hasAttribute('checked')).toBe(true);
  expect(editor.patch().ok).toBe(true);
  expect(actualRadios[0].checked).toBe(false); expect(actualRadios[1].checked).toBe(true);
  expect(actualRadios[0].hasAttribute('checked')).toBe(true);
  expect(editor.travel('undo').ok).toBe(true);
  expect(actualRadios[0].checked).toBe(true); expect(testRadios[0].checked).toBe(true);
  editor.dispose();
});

it('T-V05: form 없는 Phase 1 radio와 외부 form 참조는 연결 전에 거절한다', () => {
  expect(parseEditorHTML(document, '<input type="radio" name="r">').ok).toBe(false);
  expect(parseEditorHTML(document, '<form><input type="radio" form="outside"></form>').ok).toBe(false);
  expect(parseEditorHTML(document, '<form><input type="radio" name="r"></form>').ok).toBe(true);
});

it('T-V02: 빈 file input은 왕복하고 선택된 파일은 복원 가능한 것처럼 캡처하지 않는다', () => {
  const root = container('<input type="file">');
  const captured = readDOM(root); expect(captured.ok).toBe(true);
  if (captured.ok) expect(render(captured.value).root.querySelector('input')!.type).toBe('file');
  Object.defineProperty(root.querySelector('input')!, 'files', { value: [new File(['x'], 'selected.txt')] });
  expect(readDOM(root)).toMatchObject({ ok: false, diagnostics: [{ code: 'CAPTURE_ERROR' }] });
});

it.each(['input', 'textarea'])('T-P06: handler 없는 controlled %s는 render/Effect 없이 복원된다', async tag => {
  const effect = vi.fn(), renderFn = vi.fn(() => {
    useEffect(effect); return h(tag, { form: { mode: 'controlled', value: 'fixed' } });
  });
  const output = container(), root = new FunctionComponent(renderFn, {}, output);
  root.mount(); const input = output.firstElementChild as HTMLInputElement;
  input.value = 'native'; input.dispatchEvent(new Event('input', { bubbles: true }));
  await Promise.resolve(); await Promise.resolve();
  expect(input.value).toBe('fixed'); expect(renderFn).toHaveBeenCalledTimes(1); expect(effect).toHaveBeenCalledTimes(1);
  expect(root.lastResult).toMatchObject({ status: 'committed', counters: { propertyWrites: 1 } });
  root.unmount();
});

it('T-P06/T-F07: setter의 Object.is no-op도 복원하고 explicit DOM no-op만 Effect를 다시 실행한다', async () => {
  const effect = vi.fn(), renderFn = vi.fn(() => {
    const [value, set] = useState('fixed'); useEffect(effect);
    return h('input', { form: { mode: 'controlled', value }, events: { input: () => set(value) } });
  });
  const output = container(), root = new FunctionComponent(renderFn, {}, output); root.mount();
  const input = output.firstElementChild as HTMLInputElement;
  input.value = 'rejected'; input.dispatchEvent(new Event('input', { bubbles: true })); await Promise.resolve(); await Promise.resolve();
  expect(input.value).toBe('fixed'); expect(effect).toHaveBeenCalledTimes(1); expect(renderFn).toHaveBeenCalledTimes(1);
  root.update(); await Promise.resolve(); expect(effect).toHaveBeenCalledTimes(2); expect(renderFn).toHaveBeenCalledTimes(2);
  root.unmount();
});

it('T-P06: native checkbox/select 변경도 handler 없이 복원된다', async () => {
  const output = container(), root = new FunctionComponent(() => h('div', null,
    h('input', { attrs: { type: 'checkbox' }, form: { mode: 'controlled', checked: true } }),
    h('select', { form: { mode: 'controlled', selectedIndices: [1] } }, options(['a', 'b'])),
  ), {}, output);
  document.body.append(output); root.mount(); const checkbox = output.querySelector('input')!, select = output.querySelector('select')!;
  checkbox.click(); select.selectedIndex = 0; select.dispatchEvent(new Event('change', { bubbles: true }));
  await Promise.resolve(); await Promise.resolve(); expect(checkbox.checked).toBe(true); expect(select.selectedIndex).toBe(1);
  root.unmount();
});

it('T-P06: radio 클릭은 함께 바뀐 그룹의 controlled 노드까지 복원한다', async () => {
  const output = container(), root = new FunctionComponent(() => h('form', null,
    h('input', { attrs: { type: 'radio', name: 'group' }, form: { mode: 'controlled', checked: true } }),
    h('input', { attrs: { type: 'radio', name: 'group' }, form: { mode: 'controlled', checked: false } }),
  ), {}, output);
  document.body.append(output); root.mount(); const radios = output.querySelectorAll('input');
  radios[1].click(); expect(radios[1].checked).toBe(true);
  await Promise.resolve(); await Promise.resolve(); expect(radios[0].checked).toBe(true); expect(radios[1].checked).toBe(false);
  root.unmount();
});

it('T-P04: option 삽입/삭제 이후 selectedIndices를 적용하고 빈 선택을 보존한다', () => {
  const tree = (values: readonly string[], selectedIndices: readonly number[]) => resolveExpression(h('select', { form: { mode: 'controlled', selectedIndices } }, options(values)));
  const { root, mount } = render(tree(['a', 'b'], [1])), select = root.querySelector('select')!;
  apply(mount, tree(['x', 'a', 'b'], [1])); expect(select.value).toBe('a'); expect(select.selectedIndex).toBe(1);
  apply(mount, tree(['a'], [])); expect(select.selectedIndex).toBe(-1); expect(select.value).toBe('');
  apply(mount, tree([], [])); expect(select.options).toHaveLength(0); expect(select.selectedIndex).toBe(-1);
});

it('T-P04: optgroup와 multiple 선택을 option 순서 기준으로 복원한다', () => {
  const { root, mount } = render(snapshot('<select multiple><optgroup label="x"><option>A</option><option selected>B</option></optgroup><option selected>C</option></select>'));
  const target = snapshot('<select multiple><option selected>X</option><optgroup label="y"><option>Y</option><option selected>Z</option></optgroup></select>');
  apply(mount, target);
  expect(Array.from(root.querySelector('select')!.options, o => o.selected)).toEqual([true, false, true]);
  expect(readDOM(root)).toEqual({ ok: true, value: target });
});

it('uncontrolled live 입력은 unrelated render와 default 변경으로 덮어쓰지 않는다', () => {
  let initial = 'first', unrelated = 0;
  const output = container(), root = new FunctionComponent(() => h('div', { attrs: { title: unrelated } },
    h('input', { form: { mode: 'uncontrolled', defaultValue: initial } }),
    h('input', { attrs: { type: 'checkbox' }, form: { mode: 'uncontrolled', defaultChecked: true } }),
  ), {}, output);
  root.mount(); const [input, checkbox] = output.querySelectorAll('input');
  input.value = 'typed'; checkbox.checked = false; unrelated++; initial = 'changed default'; root.update(); root.flushForTest();
  expect(input.value).toBe('typed'); expect(checkbox.checked).toBe(false);
  expect(input.defaultValue).toBe('first'); expect(checkbox.defaultChecked).toBe(true);
  root.unmount();
});

it.each([true, false])('폼 소유 전환은 DOM 쓰기 전에 거절한다 (controlled=%s)', controlled => {
  let policy: FormPolicy = controlled ? { mode: 'controlled', value: 'first' } : { mode: 'uncontrolled', defaultValue: 'first' };
  const output = container(), root = new FunctionComponent(() => h('input', { form: policy }), {}, output);
  root.mount(); policy = controlled ? { mode: 'uncontrolled' } : { mode: 'controlled', value: 'new' }; root.update(); root.flushForTest();
  expect(root.lastResult!.status).toBe('rejected'); expect((output.firstElementChild as HTMLInputElement).value).toBe('first');
  root.unmount();
});

it.each([
  () => h('input', { attrs: { value: 'duplicate' }, form: { mode: 'controlled', value: 'state' } }),
  () => h('input', { attrs: { value: 'implicit' } }),
  () => h('textarea', { form: { mode: 'controlled', value: 'state' } }, 'child text'),
  () => h('input', { form: { mode: 'uncontrolled', value: 'bad' } }),
  () => h('select', { form: { mode: 'controlled', selectedIndices: [0] } }, h('option', { attrs: { selected: true } }, 'A')),
])('폼 값의 이중 소유를 정규화 단계에서 거절한다 #%#', expression => {
  expect(() => resolveExpression(expression())).toThrow();
});

it.each([[-1], [2], [0, 0], [0, 1], [0.5], [NaN]].map(indices => ({ indices })))('잘못된 selectedIndices $indices를 commit 전에 거절한다', ({ indices }) => {
  expect(() => resolveExpression(h('select', { form: { mode: 'controlled', selectedIndices: indices } }, options(['a', 'b'])))).toThrow(/selectedIndices|single select/);
});

it('같은 value는 재대입하지 않고 observer·대기 복원을 unmount에서 정리한다', async () => {
  let set!: StateSetter<number>;
  const output = container(), root = new FunctionComponent((): RenderValue => {
    const [n, setter] = useState(0); set = setter;
    return h('div', null, h('input', { form: { mode: 'controlled', value: 'fixed' } }), n);
  }, {}, output);
  root.mount(); const input = output.querySelector('input')!, setter = vi.spyOn(input, 'value', 'set');
  set(1); root.flushForTest(); expect(setter).not.toHaveBeenCalled(); setter.mockRestore();
  input.value = 'native'; input.dispatchEvent(new Event('input')); root.unmount(); await Promise.resolve();
  expect(root.host.dirtyForms.size).toBe(0); expect(root.host.nodes.size).toBe(0);
  input.dispatchEvent(new Event('input')); await Promise.resolve(); expect(root.host.dirtyForms.size).toBe(0);
});
