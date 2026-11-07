import { expect, it, vi } from 'vitest';
import { diff } from '../../src/core/reconcile';
import { commit } from '../../src/core/patch';
import { unwrap } from '../../src/core/vdom';
import { resolveExpression } from '../../src/runtime/resolve';
import { FunctionComponent, h } from '../../src/runtime';
import { apply, container, render, snapshot } from '../fixtures/helpers';

it('검증된 기본 경로는 keyed 재정렬에 LIS를 적용하고 no-reorder에서는 계산을 생략한다', () => {
  const tree = (keys: string) => snapshot(Array.from(keys, key => `<p data-key="${key}">${key}</p>`).join(''));
  const { mount } = render(tree('ABCDEFGH'));
  const reordered = unwrap(diff(mount.view, tree('HABCDEFG')));
  expect(reordered.reconciliations.find(d => d.parent === mount.view.rootRef)).toMatchObject({ strategy: 'lis', usedLIS: true, moves: 1 });
  expect(commit(mount, reordered)).toMatchObject({ counters: { movedRoots: 1 } });
  const same = unwrap(diff(mount.view, tree('HABCDEFG')));
  expect(same.reconciliations.find(d => d.parent === mount.view.rootRef)).toMatchObject({ strategy: 'lis', usedLIS: false, moves: 0 });
  expect(commit(mount, same).status).toBe('noop');
});

it.each(['greedy', 'lis'] as const)('T-K01/T-P03: %s는 같은 key/type DOM·입력과 최신 handler를 유지한다', strategy => {
  const oldHandler = vi.fn(), newHandler = vi.fn();
  const tree = (keys: string, handler: () => void) => resolveExpression(h('ul', null, ...Array.from(keys, key => h('li', { key, attrs: { 'data-key': key } },
    h('input', { form: { mode: 'uncontrolled', defaultValue: key } }), h('button', { events: { click: handler } }, key),
  ))));
  const { root, mount } = render(tree('ABCDEFGH', oldHandler));
  const previous = new Map(Array.from(root.querySelectorAll('li'), node => [node.dataset.key, node]));
  root.querySelector('input')!.value = 'typed A';
  const plan = unwrap(diff(mount.view, tree('HABCDEFG', newHandler), { strategy })), result = commit(mount, plan);
  expect(Array.from(root.querySelectorAll('li'), node => node.dataset.key).join('')).toBe('HABCDEFG');
  for (const node of root.querySelectorAll('li')) expect(node).toBe(previous.get(node.dataset.key));
  expect(previous.get('A')!.querySelector('input')!.value).toBe('typed A');
  previous.get('A')!.querySelector('button')!.click(); expect(newHandler).toHaveBeenCalledTimes(1); expect(oldHandler).not.toHaveBeenCalled();
  expect(result).toMatchObject({ counters: { createdNodes: 0, removedNodes: 0, movedRoots: strategy === 'greedy' ? 7 : 1 } });
  expect(plan.reconciliations.find(decision => decision.reason === 'keyed' && decision.moves > 0)).toMatchObject({ strategy, usedLIS: strategy === 'lis' });
});

it.each(['greedy', 'lis'] as const)('T-D03/T-K02/K03: %s의 삭제+이동+신규+type 변경+수정', strategy => {
  const { root, mount } = render(snapshot('<p data-key="a">A</p><p data-key="b">B</p><p data-key="c">C</p><p data-key="d">D</p>'));
  const [a, b, c, d] = Array.from(root.childNodes);
  const plan = unwrap(diff(mount.view, snapshot('<p data-key="c">changed</p><input data-key="b"><p data-key="d">D</p><p data-key="x">X</p>'), { strategy }));
  expect(commit(mount, plan).status).toBe('committed');
  expect(root.childNodes[0]).toBe(c); expect(c.textContent).toBe('changed'); expect(root.childNodes[2]).toBe(d);
  expect(root.childNodes[1]).not.toBe(b); expect(a.parentNode).toBeNull(); expect(b.parentNode).toBeNull();
  expect(root.querySelectorAll('[data-key]')).toHaveLength(4);
});

it('T-K05: 공백/텍스트/placeholder 혼재는 삭제하지 않고 위치 기반 fallback 이유를 기록한다', () => {
  const { root, mount } = render(snapshot('<p data-key="a">A</p> <p data-key="b">B</p>'));
  const old = root.firstChild;
  const plan = unwrap(diff(mount.view, snapshot('<p data-key="b">B</p> <p data-key="a">A</p>'), { strategy: 'lis' }));
  expect(plan.reconciliations.find(d => d.parent === mount.view.rootRef)).toMatchObject({ strategy: 'positional', reason: 'mixed-node-kinds' });
  commit(mount, plan); expect(root.childNodes).toHaveLength(3); expect(root.childNodes[1].nodeValue).toBe(' '); expect(root.firstChild).not.toBe(old);
  const placeholder = resolveExpression(h('div', null, h('p', { key: 'a' }), false, h('p', { key: 'b' })));
  const rendered = render(placeholder);
  const next = unwrap(diff(rendered.mount.view, resolveExpression(h('div', null, h('p', { key: 'b' }), null, h('p', { key: 'a' }))), { strategy: 'lis' }));
  expect(next.reconciliations.some(d => d.reason === 'mixed-node-kinds')).toBe(true);
  expect(commit(rendered.mount, next).status).toBe('committed'); expect(rendered.root.firstChild!.childNodes[1].nodeType).toBe(8);
});

it('T-K06: 같은 key를 다른 부모로 옮기면 기존 노드를 넘겨 재사용하지 않는다', () => {
  const { root, mount } = render(snapshot('<section data-key="left"><p data-key="item">X</p></section><section data-key="right"></section>'));
  const old = root.querySelector('p');
  apply(mount, snapshot('<section data-key="left"></section><section data-key="right"><p data-key="item">X</p></section>'));
  expect(root.querySelector('p')).not.toBe(old); expect(old!.parentNode).toBeNull();
});

it('T-K07: 같은 외부 key와 host tag여도 내부 컴포넌트 key를 바꾸면 교체한다', () => {
  let innerKey = 'first';
  const Inner = () => h('p', { key: 'host' }, 'X');
  const Outer = () => h(Inner, { key: innerKey });
  const output = container(), root = new FunctionComponent(() => h(Outer, { key: 'outer' }), {}, output, { reconcile: 'lis' });
  root.mount(); const previous = output.firstChild; innerKey = 'next'; root.update();
  expect(output.firstChild).not.toBe(previous); expect(previous!.parentNode).toBeNull(); root.unmount();
});
