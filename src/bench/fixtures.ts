import { h } from '../runtime/expression';
import type { RenderValue } from '../core/types';

export const scenarios = ['noop', 'one-change', 'prepend', 'delete-middle', 'last-to-front', 'first-to-back', 'reverse', 'adjacent', 'swap-ends', 'shuffle', 'mixed'] as const;
export type Scenario = typeof scenarios[number];
export type Payload = 'light' | 'stateful';
export interface Row { readonly id: string; readonly label: string; readonly version: number }
export interface Fixture {
  readonly schemaVersion: 1;
  readonly seed: number;
  readonly scenario: Scenario;
  readonly size: number;
  readonly payload: Payload;
  readonly oldRows: readonly Row[];
  readonly newRows: readonly Row[];
}
export function random(seed: number): () => number {
  let state = seed >>> 0 || 1;
  return () => { state ^= state << 13; state ^= state >>> 17; state ^= state << 5; return (state >>> 0) / 0x100000000; };
}
export function shuffle<T>(values: readonly T[], next: () => number): T[] {
  const result = [...values];
  for (let i = result.length - 1; i > 0; i--) { const j = Math.floor(next() * (i + 1)); [result[i], result[j]] = [result[j], result[i]]; }
  return result;
}
export function makeFixture(size: number, scenario: Scenario, seed: number, payload: Payload): Fixture {
  if (!Number.isInteger(size) || size < 2 || size > 10000 || !scenarios.includes(scenario) || !Number.isInteger(seed)) throw new Error('입력 크기/시나리오/seed를 확인하세요.');
  const oldRows = Array.from({ length: size }, (_, i) => ({ id: `row-${i}`, label: `항목 ${i}`, version: 0 }));
  let newRows = [...oldRows];
  const middle = Math.floor(size / 2), next = random(seed);
  switch (scenario) {
    case 'noop': break;
    case 'one-change': newRows[middle] = { ...newRows[middle], label: '수정된 항목', version: 1 }; break;
    case 'prepend': newRows.unshift({ id: 'new-first', label: '새 항목', version: 0 }); break;
    case 'delete-middle': newRows.splice(middle, 1); break;
    case 'last-to-front': newRows.unshift(newRows.pop()!); break;
    case 'first-to-back': newRows.push(newRows.shift()!); break;
    case 'reverse': newRows.reverse(); break;
    case 'adjacent': [newRows[middle - 1], newRows[middle]] = [newRows[middle], newRows[middle - 1]]; break;
    case 'swap-ends': [newRows[0], newRows[size - 1]] = [newRows[size - 1], newRows[0]]; break;
    case 'shuffle': newRows = shuffle(newRows, next); break;
    case 'mixed': {
      const count = Math.max(1, Math.floor(size / 10));
      const removed = new Set(shuffle(oldRows, next).slice(0, count).map(row => row.id));
      newRows = shuffle([...oldRows.filter(row => !removed.has(row.id)), ...Array.from({ length: count }, (_, i) => ({ id: `new-${i}`, label: `신규 ${i}`, version: 1 }))], next);
      break;
    }
  }
  return { schemaVersion: 1, seed, scenario, size, payload, oldRows, newRows };
}
export function rowsExpression(rows: readonly Row[], payload: Payload): RenderValue {
  return h('ul', { attrs: { class: 'fixture-list' } }, rows.map(row => h('li', { key: row.id, attrs: { 'data-id': row.id, 'data-version': row.version } },
    h('span', null, row.label),
    ...(payload === 'stateful' ? [h('div', null,
      h('input', { attrs: { 'aria-label': `${row.id} 메모` }, form: { mode: 'uncontrolled', defaultValue: row.id } }),
      h('input', { attrs: { type: 'checkbox', 'aria-label': `${row.id} 완료` }, form: { mode: 'uncontrolled', defaultChecked: false } }),
      h('strong', null, '중첩 내용'))] : []),
  )));
}
export function parseFixture(text: string): Fixture {
  const fixture = JSON.parse(text) as Fixture;
  if (fixture.schemaVersion !== 1 || !scenarios.includes(fixture.scenario) || !['light', 'stateful'].includes(fixture.payload) || !Number.isInteger(fixture.seed)) throw new Error('지원하지 않는 fixture 형식입니다.');
  for (const rows of [fixture.oldRows, fixture.newRows]) {
    if (!Array.isArray(rows) || rows.length > 10001) throw new Error('fixture 항목 수를 확인하세요.');
    const ids = new Set<string>();
    for (const row of rows) {
      if (typeof row.id !== 'string' || !row.id || ids.has(row.id) || typeof row.label !== 'string' || !Number.isInteger(row.version)) throw new Error('fixture key/내용이 잘못되었습니다.');
      ids.add(row.id);
    }
  }
  return fixture;
}
