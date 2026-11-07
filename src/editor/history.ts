import type { VRoot } from '../core/types';
import { equalData } from '../core/vdom';

export interface HistoryEntry { readonly version: number; readonly snapshot: VRoot; readonly label: string }
export interface HistoryState {
  readonly entries: readonly HistoryEntry[];
  readonly cursor: number;
  readonly nextVersion: number;
}
export function createHistory(initial: VRoot): HistoryState {
  return { entries: [{ version: 0, snapshot: initial, label: '최초 캡처' }], cursor: 0, nextVersion: 1 };
}
export function pushHistory(history: HistoryState, next: VRoot, label: string): HistoryState {
  if (equalData(history.entries[history.cursor].snapshot, next)) return history;
  const entries = [...history.entries.slice(0, history.cursor + 1), { version: history.nextVersion, snapshot: next, label }];
  return { entries, cursor: entries.length - 1, nextVersion: history.nextVersion + 1 };
}
export function getHistoryTarget(history: HistoryState, direction: 'undo' | 'redo'): HistoryEntry | null {
  return history.entries[history.cursor + (direction === 'undo' ? -1 : 1)] ?? null;
}
export function moveHistoryCursor(history: HistoryState, targetVersion: number): HistoryState {
  const cursor = history.entries.findIndex(entry => entry.version === targetVersion);
  if (cursor < 0) throw new Error(`존재하지 않는 History version: ${targetVersion}`);
  return { ...history, cursor };
}
