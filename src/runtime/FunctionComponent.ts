import type { CommitResult, Diagnostic, HookSlot, MountHandle, ReconcileStrategy, RenderValue, StateAction, StateUpdate, TraceEvent, TraceSink } from '../core/types';
import { createMount, disposeMount } from '../core/mount';
import { diff } from '../core/reconcile';
import { applySnapshot, emptyCounters } from '../core/patch';
import { errorDiagnostic } from '../core/vdom';
import { emitTrace } from '../observe/trace';
import { isComputing, pureComputation, renderWithHooks } from './hooks';
import type { HookFrame } from './hooks';
import { evaluateExpression } from './resolve';
import type { EvaluationState } from './resolve';
import { foldStateUpdates } from './updateQueue';
import { guardState } from './stateGuard';

export interface RootOptions {
  readonly trace?: TraceSink;
  readonly onError?: (diagnostic: Diagnostic) => void;
  readonly reconcile?: ReconcileStrategy;
  readonly batching?: 'sync' | 'microtask';
  readonly reuseVNode?: boolean;
  readonly onMeasure?: (measurement: RuntimeMeasurement) => void;
}
export interface RuntimeMeasurement {
  readonly renderMs: number; readonly diffMs: number; readonly commitMs: number;
  readonly flushMs: number; readonly effectMs: number;
}

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
  private evaluation: EvaluationState | null = null;
  private scheduled = false;
  private scheduleGeneration = 0;
  private consecutiveFlushes = 0;
  private blockedOnComposition = false;

  constructor(
    private readonly render: (props: Readonly<P>) => RenderValue,
    private readonly props: Readonly<P>,
    container: HTMLElement,
    private readonly options: RootOptions = {},
  ) {
    if (container.childNodes.length) throw new Error('Phase 2는 빈 전용 container에서 시작합니다.');
    this.host = createMount(container, options.trace);
    this.host.onHostInput = () => {
      if (this.hasWork()) this.requestFlush();
    };
    this.host.onCompositionEnd = () => { this.blockedOnComposition = false; this.requestFlush(); };
  }
  get hooks(): readonly HookSlot[] { return this.committedHooks; }

  private trace(phase: TraceEvent['phase'], detail: Record<string, unknown>, hookIndex?: number): void {
    emitTrace(this.options.trace, { causeIds: this.host.traceCauses, mountId: this.host.id, commitId: this.host.revision, phase, detail, hookIndex });
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
    const causeId = this.host.eventCause ?? `${this.host.id}:update-${sequence}`;
    this.queue.push({ sequence, slot, action, causeId });
    this.blockedOnComposition = false;
    emitTrace(this.options.trace, { causeIds: [causeId], mountId: this.host.id, phase: 'enqueue', detail: { sequence, slot } });
    if (this.mounted) this.requestFlush();
  };

  mount(): CommitResult {
    if (this.started || this.disposed) throw new Error('같은 인스턴스는 한 번만 mount할 수 있습니다.');
    if (isComputing()) throw new Error('render 중 mount는 허용하지 않습니다.');
    this.started = true; this.busy = true;
    try { this.lastResult = this.perform(true, true); }
    finally { this.busy = false; }
    if (this.hasWork()) this.requestFlush();
    return this.lastResult!;
  }
  update(reason: 'state' | 'explicit' = 'explicit'): void {
    if (isComputing()) throw new Error('render 중 update는 허용하지 않습니다.');
    if (!this.started || this.disposed) throw new Error('mount된 루트만 update할 수 있습니다.');
    if (reason === 'explicit') { this.halted = false; this.blockedOnComposition = false; this.consecutiveFlushes = 0; this.explicitRequested = true; }
    this.requestFlush();
  }
  flushForTest(): void {
    this.scheduleGeneration++; this.scheduled = false;
    if (!this.busy && !this.halted && !this.disposed && !this.blockedOnComposition) this.drain(true);
  }
  private hasWork(): boolean { return !!(this.queue.length || this.explicitRequested || this.host.dirtyForms.size); }
  private requestFlush(): void {
    if (this.busy || this.halted || this.disposed || this.blockedOnComposition || !this.hasWork()) return;
    if (this.options.batching === 'sync') { this.drain(true); return; }
    if (this.scheduled || this.host.nativeInputPending) return;
    this.scheduled = true;
    const generation = ++this.scheduleGeneration;
    queueMicrotask(() => {
      if (generation !== this.scheduleGeneration || this.disposed) return;
      this.scheduled = false;
      if (!this.halted && !this.host.nativeInputPending) this.drain(false);
    });
  }
  private drain(all: boolean): void {
    this.busy = true;
    try {
      while (!this.halted && !this.disposed && !this.blockedOnComposition && this.hasWork()) {
        if (++this.consecutiveFlushes > 50) { this.halted = true; this.report(new Error('연속 50회 초과 갱신을 중단했습니다.')); break; }
        const explicit = this.explicitRequested; this.explicitRequested = false;
        this.lastResult = this.perform(!this.mounted, explicit);
        if (this.lastResult.status === 'deferred') {
          this.blockedOnComposition = true; this.explicitRequested ||= explicit; this.consecutiveFlushes = 0;
        }
        if (!all) break;
      }
    } finally {
      this.busy = false;
      if (!this.hasWork()) this.consecutiveFlushes = 0;
    }
    if (this.hasWork()) this.requestFlush();
  }
  private perform(mounting: boolean, explicit: boolean): CommitResult {
    const clock = () => this.options.onMeasure ? performance.now() : 0;
    const flushStart = clock();
    let renderMs = 0, diffMs = 0, commitMs = 0, effectMs = 0, commitEnd = flushStart;
    const measure = (result: CommitResult): CommitResult => {
      if (this.options.onMeasure && (result.status === 'committed' || result.status === 'noop')) {
        const measurement = { renderMs, diffMs, commitMs, flushMs: commitEnd - flushStart, effectMs };
        try { this.options.onMeasure(measurement); } catch { /* 계측은 실행 의미를 바꾸지 않는다. */ }
      }
      return result;
    };
    const patch = (snapshot: typeof this.host.view.snapshot, dirty: ReadonlyMap<string, number>) => {
      const diffStart = clock();
      const plan = diff(this.host.view, snapshot, { strategy: this.options.reconcile, dirtyFormRefs: new Set(dirty.keys()), reuseVNode: this.options.reuseVNode });
      const commitStart = clock(); diffMs = commitStart - diffStart;
      const result = applySnapshot(this.host, plan); commitEnd = clock(); commitMs = commitEnd - commitStart;
      return result;
    };
    const pending = [...this.queue];
    this.host.traceCauses = [...new Set(pending.map(request => request.causeId))];
    const previous = this.committedHooks;
    const changedEffects: number[] = [];
    const dirty = new Map(this.host.dirtyForms);
    const acknowledgeDirty = () => {
      for (const [ref, sequence] of dirty) if (this.host.dirtyForms.get(ref) === sequence) this.host.dirtyForms.delete(ref);
    };
    try {
      const { candidate, changed, processedThrough: endSequence } = pureComputation(() => foldStateUpdates(previous, pending, guardState));
      if (!mounting && !explicit && !changed) {
        const result = dirty.size ? patch(this.host.view.snapshot, dirty)
          : { status: 'noop', revision: this.host.revision, counters: emptyCounters() } as const;
        if (!dirty.size) commitEnd = clock();
        if (result.status === 'rejected') throw new Error(result.diagnostics.map(d => d.message).join('\n'));
        if (result.status === 'faulted') { this.halted = true; this.report(result.error); return result; }
        if (result.status === 'deferred') return result;
        this.queue = this.queue.filter(request => request.sequence > endSequence);
        acknowledgeDirty();
        return measure(result);
      }
      const frame: HookFrame = { previous, candidate, mounting, enqueue: this.enqueue, changedEffects, index: 0,
        onMemo: (index, reused) => this.trace('memo', { reused }, index) };
      this.trace('render', { mounting, pending: pending.length });
      const renderStart = clock();
      const expression = renderWithHooks(frame, () => this.render(this.props));
      const evaluation = evaluateExpression(expression, this.evaluation, this.options.reuseVNode !== false, detail => this.trace('component', detail));
      renderMs = clock() - renderStart;
      const result = patch(evaluation.snapshot, dirty);
      if (result.status === 'rejected') throw new Error(result.diagnostics.map(d => d.message).join('\n'));
      if (result.status === 'faulted') { this.halted = true; this.report(result.error); return result; }
      if (result.status === 'deferred') return result;
      this.committedHooks = candidate;
      this.evaluation = evaluation.nextState;
      this.mounted = true;
      this.queue = this.queue.filter(request => request.sequence > endSequence);
      acknowledgeDirty();
      const effectStart = clock();
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
      effectMs = clock() - effectStart;
      return measure(result);
    } catch (error) {
      this.halted = true; this.report(error);
      return { status: 'rejected', diagnostics: [errorDiagnostic(error)] };
    } finally {
      this.host.traceCauses = [];
    }
  }
  unmount(): void {
    if (this.disposed) return;
    if (isComputing()) throw new Error('render 중 unmount는 허용하지 않습니다.');
    this.disposed = true;
    this.scheduleGeneration++; this.scheduled = false;
    for (const [index, slot] of this.committedHooks.entries()) if (slot.kind === 'effect' && slot.cleanup) {
      this.trace('effect-cleanup', {}, index);
      try { slot.cleanup(); } catch (error) { this.report(error); }
      slot.cleanup = undefined;
    }
    this.queue = []; this.committedHooks = []; this.evaluation = null; this.explicitRequested = false;
    disposeMount(this.host);
  }
}
