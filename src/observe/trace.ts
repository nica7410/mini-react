import type { TraceEvent, TraceSink } from '../core/types';

export function emitTrace(sink: TraceSink | undefined, event: TraceEvent): void {
  // 관측자의 오류가 엔진 실행을 변경해서는 안 된다.
  try { sink?.emit(event); } catch { /* trace sink is optional */ }
}
