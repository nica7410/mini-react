import { describe, expect, it, vi } from 'vitest';
import { readDOM } from '../../src/core/capture';
import { diff } from '../../src/core/reconcile';
import { commit } from '../../src/core/patch';
import { disposeMount } from '../../src/core/mount';
import { unwrap } from '../../src/core/vdom';
import { h } from '../../src/runtime/expression';
import { resolveExpression } from '../../src/runtime/resolve';
import { apply, render, snapshot } from '../fixtures/helpers';

describe('P1-02 / 위치 기반 Diff + host Patch', () => {
  it('T-D01: 추가/삭제/교체/텍스트/속성 변경과 살아남은 DOM 정체성', () => {
    const { root, mount } = render(snapshot('<div><p class="old">A</p><b>B</b><i>C</i></div>'));
    const div = root.firstChild, p = root.querySelector('p');
    const target = snapshot('<div><p title="new">AA</p><em>E</em></div><hr>');
    const plan = unwrap(diff(mount.view, target));
    expect(plan.operations.map(op => op.kind)).toEqual(expect.arrayContaining(['CREATE_SUBTREE', 'REMOVE_SUBTREE', 'REMOVE_ATTR', 'SET_ATTR', 'SET_TEXT', 'PLACE_BEFORE']));
    expect(commit(mount, plan).status).toBe('committed');
    expect(unwrap(readDOM(root))).toEqual(target);
    expect(root.firstChild).toBe(div); expect(root.querySelector('p')).toBe(p);
    expect(mount.nodes.size).toBe(7); // container, div, p, text, em, text, hr
  });
  it('T-D02: 의미상 같은 새 트리는 host 쓰기 없이 기존 DOM을 유지한다', () => {
    const { root, mount } = render(snapshot('<p title="same">A</p>'));
    const node = root.firstChild, revision = mount.revision;
    const result = apply(mount, snapshot('<p title="same">A</p>'));
    expect(result.status).toBe('noop'); expect(result.counters.createdNodes).toBe(0);
    expect(result.counters.textWrites + result.counters.attributeWrites).toBe(0);
    expect(root.firstChild).toBe(node); expect(mount.revision).toBe(revision);
  });
  it('T-D04: 여러 root/전체 삭제에도 container는 유지한다', () => {
    const { root, mount } = render(snapshot('<p>A</p><p>B</p>'));
    apply(mount, snapshot(''));
    expect(root.childNodes).toHaveLength(0); expect(mount.nodes.size).toBe(1);
    apply(mount, snapshot('text<!--comment--><hr>'));
    expect(root.childNodes).toHaveLength(3); expect(mount.container).toBe(root);
  });
  it('T-P01: style 삭제와 boolean 속성 존재 의미', () => {
    const { root, mount } = render(snapshot('<button disabled="false" style="color:red;background-color:blue!important">A</button>'));
    expect(root.querySelector('button')!.disabled).toBe(true);
    apply(mount, snapshot('<button style="color:green">A</button>'));
    const button = root.querySelector('button')!;
    expect(button.disabled).toBe(false); expect(button.style.backgroundColor).toBe(''); expect(button.style.color).toBe('green');
  });
  it('T-P02: 이벤트 최신 closure/제거/capture 변경/해제', () => {
    const a = vi.fn(), b = vi.fn();
    const tree = (handler?: () => void, capture = false) => resolveExpression(h('button', { events: handler ? { click: { handler, capture } } : {} }, 'click'));
    const { root, mount } = render(tree(a)), button = root.querySelector('button')!;
    button.click(); apply(mount, tree(b)); button.click(); apply(mount, tree(b, true)); button.click();
    expect(a).toHaveBeenCalledTimes(1); expect(b).toHaveBeenCalledTimes(2);
    apply(mount, tree()); button.click(); expect(b).toHaveBeenCalledTimes(2);
    apply(mount, tree(b)); disposeMount(mount); button.click(); expect(b).toHaveBeenCalledTimes(2);
  });
  it('T-E01: stale/wrong mount 계획을 DOM 쓰기 전에 거절한다', () => {
    const a = render(snapshot('<p>A</p>')), b = render(snapshot('<p>A</p>'));
    const plan = unwrap(diff(a.mount.view, snapshot('<p>B</p>')));
    expect(commit(b.mount, plan).status).toBe('rejected'); expect(b.root.textContent).toBe('A');
    apply(a.mount, snapshot('<p>C</p>'));
    expect(commit(a.mount, plan).status).toBe('rejected'); expect(a.root.textContent).toBe('C');
  });
  it('key가 같은 위치에서 바뀌거나 type이 바뀌면 해당 노드를 교체한다', () => {
    const { root, mount } = render(snapshot('<p data-key="a">A</p>'));
    const old = root.firstChild;
    apply(mount, snapshot('<p data-key="b">B</p>')); expect(root.firstChild).not.toBe(old);
    const next = root.firstChild;
    apply(mount, snapshot('<div data-key="b">B</div>')); expect(root.firstChild).not.toBe(next);
  });
  it('중복 key는 DOM 변경 전에 거절한다', () => {
    const { root, mount } = render(snapshot('<p>old</p>'));
    expect(() => apply(mount, resolveExpression(h('div', null, h('i', { key: 1 }), h('i', { key: '1' }))))).toThrow(/중복/);
    expect(root.textContent).toBe('old');
  });
});
