import type { CommitResult, Diagnostic, HookSlot, MountHandle, RenderValue, StateAction, StateUpdate, TraceSink } from '../core/types';
import { createMount, disposeMount } from '../core/mount';
import { diff } from '../core/reconcile';
import { applySnapshot, emptyCounters } from '../core/patch';
import { errorDiagnostic } from '../core/vdom';
import { emitTrace } from '../observe/trace';
import { isComputing, pureComputation, renderWithHooks } from './hooks';
import type { HookFrame } from './hooks';
import { resolveExpression } from './resolve';

export interface RootOptions { readonly trace?: TraceSink; readonly onError?: (diagnostic: Diagnostic) => void }

export class FunctionComponent<P> {
  readonly host: MountHandle;
  readonly errors: Diagnostic[] = [];
  lastResult: CommitResult | undefined;
  private committedHooks: HookSlot[] = [];
  private queue: StateUpdate[] = [];
  private sequence = 0;
  private mounted = false;
  private started = false;
  private disposed = false;
  private busy = false;
  private halted = false;
  private explicitRequested = false;

  constructor(
    private readonly render: (props: Readonly<P>) => RenderValue,
    private readonly props: Readonly<P>,
    container: HTMLElement,
    private readonly options: RootOptions = {},
  ) {
    if (container.childNodes.length) throw new Error('Phase 2는 빈 전용 container에서 시작합니다.');
    this.host = createMount(container, options.trace);
  }
  get hooks(): readonly HookSlot[] { return this.committedHooks; }

  private trace(phase: 'enqueue' | 'render' | 'effect-cleanup' | 'effect-setup' | 'error', detail: Record<string, unknown>, hookIndex?: number): void {
    emitTrace(this.options.trace, { causeIds: [], mountId: this.host.id, commitId: this.host.revision, phase, detail, hookIndex });
  }
  private report(error: unknown): void {
    const diagnostic = errorDiagnostic(error);
    this.errors.push(diagnostic);
    this.trace('error', { message: diagnostic.message });
    try { this.options.onError?.(diagnostic); } catch { /* 오류 보고자가 engine을 중단하지 않는다. */ }
  }
  private enqueue = (slot: number, action: StateAction<unknown>): void => {
    if (isComputing()) throw new Error('render/updater/Memo/자식 평가 중에는 setter를 호출할 수 없습니다.');
    if (this.disposed) { this.report(new Error('unmount된 루트의 setter를 무시했습니다.')); return; }
    const sequence = ++this.sequence;
    this.queue.push({ sequence, slot, action, causeId: `update-${sequence}` });
    this.trace('enqueue', { sequence, slot });
    if (!this.busy && !this.halted && this.mounted) this.drain();
  };

  mount(): CommitResult {
    if (this.started || this.disposed) throw new Error('같은 인스턴스는 한 번만 mount할 수 있습니다.');
    if (isComputing()) throw new Error('render 중 mount는 허용하지 않습니다.');
    this.started = true; this.busy = true;
    try { this.lastResult = this.perform(true, true); }
    finally { this.busy = false; }
    if (!this.halted && this.queue.length) this.drain();
    return this.lastResult!;
  }
  update(reason: 'state' | 'explicit' = 'explicit'): void {
    if (isComputing()) throw new Error('render 중 update는 허용하지 않습니다.');
    if (!this.started || this.disposed) throw new Error('mount된 루트만 update할 수 있습니다.');
    if (reason === 'explicit') { this.halted = false; this.explicitRequested = true; }
    if (!this.busy && !this.halted) this.drain();
  }
  flushForTest(): void { if (!this.busy && !this.halted && !this.disposed) this.drain(); }

  // M1: 외부 setter마다 동기 flush. Effect 중 요청은 현 commit이 끝난 뒤 처리한다.
  private drain(): void {
    this.busy = true;
    try {
      let iterations = 0;
      while (!this.halted && !this.disposed && (this.queue.length || this.explicitRequested)) {
        if (++iterations > 50) { this.halted = true; this.report(new Error('연속 50회 초과 갱신을 중단했습니다.')); break; }
        const explicit = this.explicitRequested; this.explicitRequested = false;
        this.lastResult = this.perform(!this.mounted, explicit);
      }
    } finally { this.busy = false; }
  }
  private perform(mounting: boolean, explicit: boolean): CommitResult {
    const pending = [...this.queue], endSequence = pending.at(-1)?.sequence ?? 0;
    const previous = this.committedHooks;
    const candidate = previous.map(entry => ({ ...entry }));
    const changedEffects: number[] = [];
    try {
      pureComputation(() => {
        for (const request of pending) {
          const old = candidate[request.slot];
          if (!old || old.kind !== 'state') throw new Error('업데이트의 state 슬롯이 없습니다.');
          candidate[request.slot] = { ...old, value: typeof request.action === 'function' ? request.action(old.value) : request.action };
        }
      });
      const changed = candidate.some((entry, i) => entry.kind === 'state' && !Object.is(entry.value, (previous[i] as typeof entry).value));
      if (!mounting && !explicit && !changed) {
        this.queue = this.queue.filter(request => request.sequence > endSequence);
        return { status: 'noop', revision: this.host.revision, counters: emptyCounters() };
      }
      const frame: HookFrame = { previous, candidate, mounting, enqueue: this.enqueue, changedEffects, index: 0 };
      this.trace('render', { mounting, pending: pending.length });
      const expression = renderWithHooks(frame, () => this.render(this.props));
      const snapshot = resolveExpression(expression);
      const result = applySnapshot(this.host, diff(this.host.view, snapshot));
      if (result.status === 'rejected') throw new Error(result.diagnostics.map(d => d.message).join('\n'));
      if (result.status === 'faulted') { this.halted = true; this.report(result.error); return result; }
      this.committedHooks = candidate;
      this.mounted = true;
      this.queue = this.queue.filter(request => request.sequence > endSequence);
      // 모든 이전 cleanup을 먼저 처리하고, 새 setup을 Hook 순서로 처리한다.
      // cleanup에서 unmount해도 같은 cleanup이 두 번 실행되지 않게 먼저 분리한다.
      for (const index of changedEffects) {
        const next = candidate[index];
        if (next.kind === 'effect') next.cleanup = undefined;
      }
      for (const index of changedEffects) {
        const old = previous[index];
        if (old?.kind === 'effect' && old.cleanup) {
          this.trace('effect-cleanup', {}, index);
          try { old.cleanup(); } catch (error) { this.report(error); }
        }
      }
      for (const index of changedEffects) {
        if (this.disposed) break;
        const effect = candidate[index];
        if (effect.kind !== 'effect') continue;
        this.trace('effect-setup', {}, index);
        try {
          const cleanup = effect.setup();
          if (cleanup !== undefined && typeof cleanup !== 'function') throw new Error('Effect는 cleanup 함수 또는 undefined만 반환해야 합니다.');
          if (typeof cleanup === 'function') {
            if (this.disposed) cleanup(); // setup 자체가 unmount한 경우도 반환 자원을 즉시 정리한다.
            else effect.cleanup = cleanup;
          }
        } catch (error) { this.report(error); }
      }
      return result;
    } catch (error) {
      this.halted = true; this.report(error);
      return { status: 'rejected', diagnostics: [errorDiagnostic(error)] };
    }
  }
  unmount(): void {
    if (this.disposed) return;
    if (isComputing()) throw new Error('render 중 unmount는 허용하지 않습니다.');
    this.disposed = true;
    for (const [index, slot] of this.committedHooks.entries()) if (slot.kind === 'effect' && slot.cleanup) {
      this.trace('effect-cleanup', {}, index);
      try { slot.cleanup(); } catch (error) { this.report(error); }
      slot.cleanup = undefined;
    }
    this.queue = []; this.committedHooks = []; this.explicitRequested = false;
    disposeMount(this.host);
  }
}
