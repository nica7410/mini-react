import type { TraceEvent, TraceSink } from '../core/types';

/** True when the sink will record events. Callers check this before building event data. */
export function traceActive(sink: TraceSink | undefined): sink is TraceSink {
  return !!sink && sink.enabled !== false;
}
/** True when the sink records and also wants VDOM/patch/identity snapshots. */
export function traceDetailed(sink: TraceSink | undefined): boolean {
  return traceActive(sink) && sink.detailed === true;
}
export function emitTrace(sink: TraceSink | undefined, event: TraceEvent): void {
  if (!traceActive(sink)) return;
  // 관측자의 오류가 엔진 실행을 변경해서는 안 된다.
  try { sink.emit(event); } catch { /* trace sink is optional */ }
}
