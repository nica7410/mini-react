import type { MountHandle, ReconcileStrategy, TraceSink } from '../core/types';
import { createMount, disposeMount } from '../core/mount';
import { applySnapshot } from '../core/patch';
import { diff } from '../core/reconcile';
import { resolveExpression } from '../runtime/resolve';
import { makeFixture, parseFixture, rowsExpression } from '../bench/fixtures';
import type { Fixture, Payload, Scenario } from '../bench/fixtures';
import { downloadJSON } from '../observe/inspector';

export function createLab(trace: TraceSink) {
  const get = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
  let mount: MountHandle | null = null, imported: Fixture | null = null;
  const output = get('lab-output'), status = get('lab-status'), source = get<HTMLTextAreaElement>('lab-json');
  const strategy = () => get<HTMLSelectElement>('lab-strategy').value as ReconcileStrategy;
  const fixture = () => imported ?? makeFixture(Number(get<HTMLInputElement>('lab-size').value), get<HTMLSelectElement>('lab-scenario').value as Scenario,
    Number(get<HTMLInputElement>('lab-seed').value), get<HTMLSelectElement>('lab-payload').value as Payload);
  function reset(input: Fixture) {
    if (mount) disposeMount(mount); mount = createMount(output, trace);
    const result = applySnapshot(mount, diff(mount.view, resolveExpression(rowsExpression(input.oldRows, input.payload)), { strategy: strategy() }));
    if (result.status === 'rejected') throw new Error(result.diagnostics.map(d => d.message).join('\n'));
    if (result.status === 'faulted') throw result.error;
  }
  function safely(action: () => void) { try { action(); } catch (error) { status.textContent = `실행 오류: ${String(error)} · 입력 JSON을 보존했습니다.`; } }
  function run() {
    const input = fixture(); reset(input); source.value = JSON.stringify(input, null, 2);
    const result = applySnapshot(mount!, diff(mount!.view, resolveExpression(rowsExpression(input.newRows, input.payload)), { strategy: strategy() }));
    if (result.status === 'rejected') throw new Error(result.diagnostics.map(d => d.message).join('\n'));
    if (result.status === 'faulted') throw result.error;
    status.textContent = `${strategy()} · seed ${input.seed} · 실제 이동 ${result.counters.movedRoots} · 삽입 ${result.counters.insertedRoots} · 초기 상태에서 다시 실행했습니다.`;
  }
  get('lab-run').addEventListener('click', () => safely(run));
  get('lab-reset').addEventListener('click', () => safely(() => { imported = null; const input = fixture(); reset(input); source.value = JSON.stringify(input, null, 2); status.textContent = '초기 목록으로 복원했습니다.'; }));
  get('lab-import').addEventListener('click', () => safely(() => { imported = parseFixture(source.value); run(); }));
  get('lab-export').addEventListener('click', () => safely(() => downloadJSON('mini-react-fixture.json', JSON.stringify(fixture(), null, 2))));
  for (const id of ['lab-size', 'lab-seed', 'lab-scenario', 'lab-payload']) get(id).addEventListener('change', () => { imported = null; });
  safely(() => { const input = fixture(); reset(input); source.value = JSON.stringify(input, null, 2); });
  return { get mount() { return mount; } };
}
