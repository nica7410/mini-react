import type { HookSlot, StateUpdate } from '../core/types';

export function foldStateUpdates(previous: readonly HookSlot[], updates: readonly StateUpdate[], protect: (value: unknown) => unknown = value => value) {
  const candidate = previous.map(slot => ({ ...slot }));
  let processedThrough = 0;
  for (const request of updates) {
    if (request.sequence <= processedThrough) throw new Error('State 요청 sequence는 FIFO 증가 순서여야 합니다.');
    processedThrough = request.sequence;
    const slot = candidate[request.slot];
    if (!slot || slot.kind !== 'state') throw new Error('업데이트의 state 슬롯이 없습니다.');
    candidate[request.slot] = { ...slot, value: protect(typeof request.action === 'function' ? request.action(slot.value) : request.action) };
  }
  const changed = candidate.some((slot, i) => slot.kind === 'state' && !Object.is(slot.value, (previous[i] as typeof slot).value));
  return { candidate, changed, processedThrough };
}
