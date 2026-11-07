import type { Deps, EffectSetup, HookSlot, StateAction, StateSetter } from '../core/types';
import { guardState } from './stateGuard';

export interface HookFrame {
  readonly previous: readonly HookSlot[];
  readonly candidate: HookSlot[];
  readonly mounting: boolean;
  readonly enqueue: (slot: number, action: StateAction<unknown>) => void;
  readonly changedEffects: number[];
  index: number;
}
let current: HookFrame | null = null;
let computationDepth = 0;

export const isComputing = (): boolean => computationDepth > 0;
export function pureComputation<T>(callback: () => T): T {
  const outer = current;
  current = null; computationDepth++;
  try { return callback(); } finally { computationDepth--; current = outer; }
}
export function renderWithHooks<T>(frame: HookFrame, callback: () => T): T {
  if (current || computationDepth) throw new Error('렌더 도중 다른 루트를 렌더할 수 없습니다.');
  current = frame; computationDepth++;
  try {
    const result = callback();
    if (!frame.mounting && frame.index !== frame.previous.length) throw new Error('Hook 개수가 이전 render와 다릅니다.');
    return result;
  } finally { current = null; computationDepth--; }
}
function slot(kind: HookSlot['kind']): { frame: HookFrame; index: number; previous: HookSlot | undefined } {
  if (!current) throw new Error('Hook은 루트 render에서만 호출할 수 있습니다.');
  const frame = current, index = frame.index++, previous = frame.previous[index];
  if (!frame.mounting && (!previous || previous.kind !== kind)) throw new Error(`Hook ${index}의 개수 또는 종류가 변경되었습니다.`);
  return { frame, index, previous };
}
function depsChanged(previous: Deps, next: Deps): boolean {
  if (previous === undefined || next === undefined) return true;
  if (previous.length !== next.length) throw new Error('deps 길이는 render 사이에 변경할 수 없습니다.');
  return next.some((value, i) => !Object.is(value, previous[i]));
}
const copyDeps = (deps: Deps): Deps => deps === undefined ? undefined : Object.freeze([...deps]);

export function useState<T>(initial: T | (() => T)): [T, StateSetter<T>] {
  const { frame, index } = slot('state');
  let entry = frame.candidate[index];
  if (!entry) {
    const value = guardState(typeof initial === 'function' ? pureComputation(initial as () => T) : initial);
    const enqueue = frame.enqueue;
    entry = { kind: 'state', value, setter: (action: StateAction<T>) => enqueue(index, action as StateAction<unknown>) };
    frame.candidate[index] = entry;
  }
  if (entry.kind !== 'state') throw new Error('State 슬롯 불일치');
  return [entry.value as T, entry.setter as StateSetter<T>];
}
export function useMemo<T>(factory: () => T, deps?: readonly unknown[]): T {
  const { frame, index, previous } = slot('memo');
  if (previous?.kind === 'memo' && !depsChanged(previous.deps, deps)) {
    frame.candidate[index] = previous;
    return previous.value as T;
  }
  const value = pureComputation(factory);
  frame.candidate[index] = { kind: 'memo', deps: copyDeps(deps), value };
  return value;
}
export function useEffect(setup: EffectSetup, deps?: readonly unknown[]): void {
  const { frame, index, previous } = slot('effect');
  const old = previous?.kind === 'effect' ? previous : undefined;
  if (!old || depsChanged(old.deps, deps)) frame.changedEffects.push(index);
  frame.candidate[index] = { kind: 'effect', deps: copyDeps(deps), setup, cleanup: old?.cleanup };
}
