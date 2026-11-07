import { describe, expect, it } from 'vitest';
import { adoptCapture, captureDOM, readDOM } from '../../src/core/capture';
import { createMount } from '../../src/core/mount';
import { unwrap } from '../../src/core/vdom';
import { h } from '../../src/runtime/expression';
import { resolveExpression } from '../../src/runtime/resolve';
import { apply, container, render, snapshot } from '../fixtures/helpers';
import { parseEditorHTML, replaceEditorHTML } from '../../src/editor/inputPolicy';

describe('P1-01 / 공통 VDOM', () => {
  it.each(['', ' ', '<!--note-->text', '<div class="box"><p> A <b>B</b> </p><span></span></div><hr>'])('T-V01: capture/render 왕복 %j', html => {
    const input = snapshot(html), { root } = render(input);
    expect(unwrap(readDOM(root))).toEqual(input);
  });
  it('T-V01: 빈 텍스트 노드도 별도 슬롯으로 보존한다', () => {
    const root = container();
    root.append(document.createTextNode(''), document.createComment(''), document.createTextNode(' '));
    const tree = unwrap(readDOM(root)), output = render(tree).root;
    expect(output.childNodes).toHaveLength(3);
    expect(unwrap(readDOM(output))).toEqual(tree);
  });
  it('T-V02 (기본): attribute와 live value/checked/선택을 구분한다', () => {
    const root = container('<input value="initial"><input type="checkbox"><textarea>before</textarea><select><option>A</option><option>B</option></select>');
    root.querySelector('input')!.value = 'typed';
    root.querySelectorAll('input')[1].checked = true;
    root.querySelector('textarea')!.value = 'after';
    root.querySelector('select')!.selectedIndex = 1;
    const tree = unwrap(readDOM(root)), output = render(tree).root;
    expect(output.querySelector('input')!.getAttribute('value')).toBe('initial');
    expect(output.querySelector('input')!.value).toBe('typed');
    expect(output.querySelectorAll('input')[1].checked).toBe(true);
    expect(output.querySelector('textarea')!.value).toBe('after');
    expect(output.querySelector('select')!.selectedIndex).toBe(1);
    expect(unwrap(readDOM(output))).toEqual(tree);
  });
  it('T-V03: 0/빈 문자열/공백/빈 값/중첩 배열의 슬롯을 보존한다', () => {
    const tree = resolveExpression(h('div', null, 0, '', [null, false, [' ', undefined]]));
    const div = render(tree).root.firstChild!;
    expect(Array.from(div.childNodes, n => [n.nodeType, n.nodeValue])).toEqual([[3, '0'], [3, ''], [8, ''], [8, ''], [3, ' '], [8, '']]);
  });
  it('T-V04: 동일 VDOM의 mount binding은 서로 독립이다', () => {
    const tree = snapshot('<p>A</p>'), a = render(tree), b = render(tree);
    expect(a.root.firstChild).not.toBe(b.root.firstChild);
    expect(a.mount.view.children[0].ref).not.toBe(b.mount.view.children[0].ref);
    apply(a.mount, snapshot('<p>B</p>'));
    expect(b.root.textContent).toBe('A');
  });
  it('T-V06: capture는 확정하지 않고 adopt만 revision을 갱신한다', () => {
    const root = container('<p>A</p>'), mount = createMount(root), captured = unwrap(captureDOM(mount));
    expect(mount.revision).toBe(0); expect(mount.view.snapshot.children).toHaveLength(0);
    expect(adoptCapture(mount, captured).ok).toBe(true);
    expect(mount.revision).toBe(1);
    expect(adoptCapture(mount, captured).ok).toBe(false);
  });
  it('T-V06: 같은 revision의 캡처 이후 외부 편집/동일 HTML 노드 교체도 거절한다', () => {
    const root = container('<p>A</p>'), mount = createMount(root);
    const first = unwrap(captureDOM(mount));
    root.firstChild!.textContent = 'B';
    expect(adoptCapture(mount, first).ok).toBe(false);
    const second = unwrap(captureDOM(mount));
    root.innerHTML = '<p>B</p>';
    expect(adoptCapture(mount, second).ok).toBe(false);
  });
  it.each(['<script>alert(1)</script>', '<img onerror="alert(1)">', '<a href="java&#10;script:alert(1)">x</a>', '<svg></svg>', '<x-custom></x-custom>', '<iframe></iframe>', '<div style="background:url(https://example.com)"></div>'])('T-V05 (M1 경계): 연결 전에 거절 %j', html => {
    const root = container('<p>safe</p>');
    expect(parseEditorHTML(document, html).ok).toBe(false);
    expect(replaceEditorHTML(root, html).ok).toBe(false);
    expect(root.innerHTML).toBe('<p>safe</p>');
  });
});
