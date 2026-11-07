import type { TraceEvent, TraceSink } from '../core/types';

export interface TraceRun {
  readonly id: number;
  readonly mountId: string;
  readonly planId: string;
  readonly events: TraceEvent[];
  omittedEvents: number;
  complete: boolean;
}

// 로그에는 DOM/Event/함수의 강한 참조를 남기지 않는다.
export function traceData(value: unknown, ancestors = new Set<object>()): any {
  if (typeof value === 'function') return `[function ${value.name || 'anonymous'}]`;
  if (value === undefined) return null;
  if (value === null || typeof value !== 'object') return value;
  if (typeof Node !== 'undefined' && value instanceof Node) return `[DOM ${value.nodeName}]`;
  if (typeof Event !== 'undefined' && value instanceof Event) return `[Event ${value.type}]`;
  if (value instanceof Error) return { name: value.name, message: value.message };
  if (ancestors.has(value)) return '[circular]';
  ancestors.add(value);
  const result = Array.isArray(value) ? value.map(child => traceData(child, ancestors))
    : Object.fromEntries(Object.entries(value).map(([key, child]) => [key, traceData(child, ancestors)]));
  ancestors.delete(value);
  return result;
}

export class TraceRecorder implements TraceSink {
  readonly detailed = true;
  enabled = true;
  readonly runs: TraceRun[] = [];
  private pending = new Map<string, { events: TraceEvent[]; omitted: number }>();
  private current = new Map<string, TraceRun>();
  private sequence = 0;
  constructor(readonly limit = 100, readonly eventLimit = 1000, private readonly changed?: () => void) {
    if (!Number.isInteger(limit) || limit < 1 || !Number.isInteger(eventLimit) || eventLimit < 1) throw new Error('Trace 보관 한도는 양의 정수여야 합니다.');
  }
  emit(event: TraceEvent): void {
    if (!this.enabled) return;
    const safe = traceData(event) as TraceEvent;
    if (event.phase === 'diff') {
      const prefix = this.pending.get(event.mountId);
      const run: TraceRun = { id: ++this.sequence, mountId: event.mountId, planId: String(event.detail.planId),
        events: prefix?.events ?? [], omittedEvents: prefix?.omitted ?? 0, complete: false };
      // 구조/카운터 이벤트는 항상 남긴다. prefix는 eventLimit으로 제한한다.
      run.events.push(safe); this.pending.delete(event.mountId);
      this.current.set(event.mountId, run); this.runs.push(run);
      while (this.runs.length > this.limit) {
        const removed = this.runs.shift()!;
        if (this.current.get(removed.mountId) === removed) this.current.delete(removed.mountId);
      }
    } else if (event.phase === 'patch' || event.phase === 'deferred' || event.phase === 'effect-setup' || event.phase === 'effect-cleanup' || event.phase === 'error') {
      const run = this.current.get(event.mountId);
      if (run) {
        if (event.phase === 'patch' || run.events.length < this.eventLimit + 2) run.events.push(safe); else run.omittedEvents++;
        if (event.phase === 'patch') run.complete = true;
      } else this.addPending(safe);
    } else this.addPending(safe);
    this.changed?.();
  }
  private addPending(event: TraceEvent) {
    let value = this.pending.get(event.mountId);
    if (!value) {
      value = { events: [], omitted: 0 }; this.pending.set(event.mountId, value);
      if (this.pending.size > this.limit) this.pending.delete(this.pending.keys().next().value!);
    }
    if (value.events.length < this.eventLimit) value.events.push(event); else value.omitted++;
  }
  clear(): void { this.runs.length = 0; this.pending.clear(); this.current.clear(); this.changed?.(); }
  export(): string { return JSON.stringify({ schemaVersion: 1, limit: this.limit, eventLimit: this.eventLimit, runs: this.runs, pending: [...this.pending.values()] }, null, 2); }
}
