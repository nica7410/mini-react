import type { CommitResult, MountHandle, Result, TraceSink } from '../core/types';
import { createMount, disposeMount } from '../core/mount';
import { adoptCapture, captureDOM } from '../core/capture';
import { diff } from '../core/reconcile';
import { applySnapshot, validatePlan } from '../core/patch';
import { fail, ok, unwrap } from '../core/vdom';
import { createHistory, getHistoryTarget, moveHistoryCursor, pushHistory } from './history';
import type { HistoryState } from './history';

function commitError(result: CommitResult): Result<void> {
  if (result.status === 'rejected') return { ok: false, diagnostics: result.diagnostics };
  if (result.status === 'faulted') return fail('COMMIT_FAULT', String(result.error));
  return ok(undefined);
}

export class EditorController {
  actual: MountHandle;
  test: MountHandle;
  history: HistoryState;
  faulted = false;

  constructor(actual: HTMLElement, test: HTMLElement, trace?: TraceSink) {
    if (test.childNodes.length) throw new Error('초기 테스트 영역은 비어 있어야 합니다.');
    this.actual = createMount(actual, trace); this.test = createMount(test, trace);
    const captured = unwrap(captureDOM(this.actual));
    unwrap(adoptCapture(this.actual, captured));
    unwrap(commitError(applySnapshot(this.test, diff(this.test.view, captured.snapshot))));
    this.history = createHistory(captured.snapshot);
  }
  get canUndo(): boolean { return !this.faulted && this.history.cursor > 0; }
  get canRedo(): boolean { return !this.faulted && this.history.cursor < this.history.entries.length - 1; }

  patch(): Result<void> {
    if (this.faulted) return fail('EDITOR_FAULT', '초기화 후 다시 시도하세요.');
    const captured = captureDOM(this.test);
    if (!captured.ok) return captured;
    const result = commitError(applySnapshot(this.actual, diff(this.actual.view, captured.value.snapshot)));
    if (!result.ok) { this.faulted = this.actual.faulted; return result; }
    const adopted = adoptCapture(this.test, captured.value);
    if (!adopted.ok) { this.faulted = true; return adopted; }
    this.history = pushHistory(this.history, captured.value.snapshot, 'Patch');
    return ok(undefined);
  }
  travel(direction: 'undo' | 'redo'): Result<void> {
    if (this.faulted) return fail('EDITOR_FAULT', '초기화 후 다시 시도하세요.');
    const target = getHistoryTarget(this.history, direction);
    if (!target) return ok(undefined);
    const captured = captureDOM(this.test);
    if (!captured.ok) return captured;
    const adopted = adoptCapture(this.test, captured.value);
    if (!adopted.ok) return adopted;
    const actualPlan = diff(this.actual.view, target.snapshot), testPlan = diff(this.test.view, target.snapshot);
    if (!actualPlan.ok) return actualPlan;
    if (!testPlan.ok) return testPlan;
    const actualValid = validatePlan(this.actual, actualPlan.value), testValid = validatePlan(this.test, testPlan.value);
    if (!actualValid.ok) return actualValid;
    if (!testValid.ok) return testValid;
    const result = commitError(applySnapshot(this.actual, actualPlan));
    if (!result.ok) { this.faulted = true; return result; }
    const testResult = commitError(applySnapshot(this.test, testPlan));
    if (!testResult.ok) { this.faulted = true; return testResult; }
    this.history = moveHistoryCursor(this.history, target.version);
    return ok(undefined);
  }
  recover(): Result<void> {
    const snapshot = this.history.entries[this.history.cursor].snapshot;
    const actual = this.actual.container, test = this.test.container, trace = this.actual.trace;
    disposeMount(this.actual); disposeMount(this.test);
    this.actual = createMount(actual, trace); this.test = createMount(test, trace);
    const actualResult = commitError(applySnapshot(this.actual, diff(this.actual.view, snapshot)));
    if (!actualResult.ok) { this.faulted = true; return actualResult; }
    const testResult = commitError(applySnapshot(this.test, diff(this.test.view, snapshot)));
    this.faulted = !testResult.ok;
    return testResult;
  }
  dispose(): void { disposeMount(this.actual); disposeMount(this.test); }
}
