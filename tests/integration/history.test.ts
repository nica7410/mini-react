import { describe, expect, it, vi } from 'vitest';
import { EditorController } from '../../src/editor/controller';
import { captureDOM } from '../../src/core/capture';
import { unwrap } from '../../src/core/vdom';
import { container } from '../fixtures/helpers';

function setup() {
  const actual = container('<article><p>A</p><span>stable</span></article>'), test = container();
  const original = actual.firstChild;
  const editor = new EditorController(actual, test);
  return { actual, test, editor, original };
}
function editAndPatch(editor: EditorController, text: string) {
  editor.test.container.querySelector('p')!.textContent = text;
  expect(editor.patch().ok).toBe(true);
}

describe('P1-05 / 두 mount와 VDOM History', () => {
  it('T-H01: 최초 DOM 캡처 → 테스트 생성 → 편집 → Patch, 실제 노드 재사용', () => {
    const { actual, test, editor, original } = setup();
    const p = actual.querySelector('p');
    expect(actual.firstChild).toBe(original); expect(test.innerHTML).toBe(actual.innerHTML);
    expect(editor.history.cursor).toBe(0); expect(editor.canUndo || editor.canRedo).toBe(false);
    test.querySelector('p')!.textContent = 'B';
    expect(actual.querySelector('p')!.textContent).toBe('A');
    expect(editor.history.entries).toHaveLength(1);
    expect(editor.patch().ok).toBe(true);
    expect(actual.innerHTML).toBe(test.innerHTML); expect(actual.querySelector('p')).toBe(p);
    expect(editor.history.cursor).toBe(1); expect(editor.history.entries).toHaveLength(2);
    expect(editor.actual.view.snapshot).toEqual(editor.history.entries[1].snapshot);
  });
  it('T-H02: 세 번 Patch 후 Undo/Redo가 두 영역과 cursor를 동기화한다', () => {
    const { actual, test, editor } = setup();
    for (const text of ['B', 'C', 'D']) editAndPatch(editor, text);
    for (const text of ['C', 'B', 'A']) {
      expect(editor.travel('undo').ok).toBe(true);
      expect(actual.querySelector('p')!.textContent).toBe(text); expect(test.innerHTML).toBe(actual.innerHTML);
    }
    for (const text of ['B', 'C', 'D']) {
      expect(editor.travel('redo').ok).toBe(true);
      expect(actual.querySelector('p')!.textContent).toBe(text); expect(test.innerHTML).toBe(actual.innerHTML);
    }
    expect(editor.history.entries).toHaveLength(4);
  });
  it('T-H03: Undo 뒤 새 변경은 미래 이력을 버리고 version은 재사용하지 않는다', () => {
    const { editor } = setup();
    editAndPatch(editor, 'B'); editAndPatch(editor, 'C'); editor.travel('undo'); editAndPatch(editor, 'branch');
    expect(editor.canRedo).toBe(false);
    expect(editor.history.entries.map(e => e.version)).toEqual([0, 1, 3]);
  });
  it('T-H04: 미확정 새 노드를 재캡처한 뒤 Undo하므로 잔여 노드가 없다', () => {
    const { actual, test, editor } = setup();
    editAndPatch(editor, 'B');
    const uncommitted = document.createElement('strong'); uncommitted.textContent = 'X'; test.prepend(uncommitted);
    expect(editor.travel('undo').ok).toBe(true);
    expect(test.querySelector('strong')).toBeNull(); expect(actual.innerHTML).toBe(test.innerHTML);
    expect(unwrap(captureDOM(editor.test)).snapshot).toEqual(editor.history.entries[0].snapshot);
  });
  it('T-H05: 과거 스냅샷은 후속 DOM 편집과 별개인 동결 데이터다', () => {
    const { editor } = setup(), old = editor.history.entries[0].snapshot;
    const serialized = JSON.stringify(old);
    editAndPatch(editor, 'B');
    expect(JSON.stringify(old)).toBe(serialized); expect(Object.isFrozen(old.children)).toBe(true);
    expect(serialized).not.toMatch(/mountId|rootRef|nodeType/);
  });
  it('T-H06: no-op/끝 경계/검증 실패는 history를 추가하지 않는다', () => {
    const { actual, test, editor } = setup();
    const old = editor.history;
    expect(editor.patch().ok).toBe(true); editor.travel('undo'); editor.travel('redo');
    expect(editor.history).toBe(old);
    test.innerHTML = '<p data-key="same">a</p><p data-key="same">b</p>';
    expect(editor.patch().ok).toBe(false); expect(editor.history).toBe(old);
    expect(actual.querySelector('p')!.textContent).toBe('A');
  });
  it('T-E03: fault 후 마지막 정상 History에서 두 mount를 복구한다', () => {
    const { actual, test, editor } = setup(); editAndPatch(editor, 'committed');
    const history = editor.history, previousMount = editor.actual;
    test.append(document.createElement('hr'));
    const insert = vi.spyOn(actual, 'insertBefore').mockImplementation(() => { throw new Error('host failure'); });
    expect(editor.patch().ok).toBe(false); expect(editor.faulted).toBe(true); expect(editor.history).toBe(history);
    insert.mockRestore(); expect(editor.recover().ok).toBe(true);
    expect(editor.faulted).toBe(false); expect(previousMount.disposed).toBe(true);
    expect(actual.innerHTML).toBe(test.innerHTML); expect(actual.querySelector('hr')).toBeNull();
    expect(actual.querySelector('p')!.textContent).toBe('committed'); expect(editor.history).toBe(history);
    editAndPatch(editor, 'after recovery'); expect(actual.querySelector('p')!.textContent).toBe('after recovery');
  });
});
