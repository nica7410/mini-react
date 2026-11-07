import type { Result } from '../core/types';
import { EditorController } from '../editor/controller';
import { replaceEditorHTML } from '../editor/inputPolicy';
import { FunctionComponent } from '../runtime';
import { Counter } from './counter';
import { createInspector } from '../observe/inspector';
import { createLab } from './lab';

const element = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;
const actual = element('actual'), test = element('test');
const source = element<HTMLTextAreaElement>('html-source');
const originalHTML = actual.innerHTML;
const error = element('error'), status = element('history-status');
const recorder = createInspector(element('inspector'), () => [editor.actual, editor.test, counter.host, ...(lab.mount ? [lab.mount] : [])]);
let editor = new EditorController(actual, test, recorder);

function show(result: Result<void>, message: string): void {
  error.hidden = result.ok;
  error.textContent = result.ok ? '' : result.diagnostics.map(d => `${d.path ?? ''} ${d.message}`).join('\n');
  if (result.ok) refresh(message);
}
function refresh(message = ''): void {
  element<HTMLButtonElement>('undo').disabled = !editor.canUndo;
  element<HTMLButtonElement>('redo').disabled = !editor.canRedo;
  updateStatus(message);
  source.value = test.innerHTML;
}
function updateStatus(message: string): void {
  const entry = editor.history.entries[editor.history.cursor];
  status.textContent = `V${entry.version} · 이력 ${editor.history.cursor + 1}/${editor.history.entries.length}${message ? ` · ${message}` : ''}`;
}
element('patch').addEventListener('click', () => show(editor.patch(), 'Patch 완료'));
element('undo').addEventListener('click', () => show(editor.travel('undo'), '이전 버전 복원'));
element('redo').addEventListener('click', () => show(editor.travel('redo'), '다음 버전 복원'));
element('reset-editor').addEventListener('click', () => {
  if (editor.faulted) { show(editor.recover(), '마지막 정상 버전에서 복구'); return; }
  editor.dispose();
  replaceEditorHTML(actual, originalHTML);
  editor = new EditorController(actual, test, recorder);
  show({ ok: true, value: undefined }, '초기화 완료');
});
element('apply-html').addEventListener('click', () => show(replaceEditorHTML(test, source.value), '테스트 편집 미확정'));
element('read-html').addEventListener('click', () => { source.value = test.innerHTML; });
test.addEventListener('input', () => { updateStatus('테스트 편집 미확정 · Patch로 실제 영역에 적용하세요.'); });
// plaintext-only는 브라우저의 HTML 붙여넣기를 텍스트로 제한한다. 파일/외부 drag 삽입은 사용하지 않는다.
test.addEventListener('drop', event => event.preventDefault());

function createCounter() {
  const root = new FunctionComponent(Counter, {}, element('counter'), {
    trace: recorder,
    onError: diagnostic => { error.hidden = false; error.textContent = diagnostic.message; },
  });
  root.mount();
  return root;
}
let counter = createCounter();
const lab = createLab(recorder);
element('reset-counter').addEventListener('click', () => { counter.unmount(); counter = createCounter(); });
refresh();
