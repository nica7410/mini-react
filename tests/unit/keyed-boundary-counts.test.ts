// @vitest-environment node
// Work counts of one keyed plan (not a timing): Map/Set operations and compatible() calls of
// the baseline planner (B0, same as the default planner) and the research candidate C1
// (research/keyed-boundaries/keyed.candidate.ts), at 10/100/1,000 siblings. The counts of the
// candidate are asserted, so the work reduction it is kept for stays a checked fact. Raw table: .validation/keyed-boundary-counts.json
import { afterAll, expect, it, vi } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import { planKeyedChildren } from '../../src/core/keyed';
import { planKeyedChildrenCandidate } from '../../research/keyed-boundaries/keyed.candidate';
import type { VElement, ViewNode } from '../../src/core/types';
import { planKeyedChildrenB0 } from '../fixtures/keyed-baseline';
import { ownerType, seededRandom, shuffle } from '../fixtures/keyed-model';

const calls = vi.hoisted(() => ({ compatible: 0 }));
vi.mock('../../src/core/vdom', async importOriginal => {
  const actual = await importOriginal<typeof import('../../src/core/vdom')>();
  return { ...actual, compatible: (a: Parameters<typeof actual.compatible>[0], b: Parameters<typeof actual.compatible>[1]) => { calls.compatible++; return actual.compatible(a, b); } };
});

// A row shaped like an A2 TaskApp row: keyed memo component around an unkeyed <li>.
const Row = ownerType('MemoTaskRow');
const row = (id: number): VElement => ({ kind: 'element', identity: { key: `task-${id}`, renderedRootKey: null, boundaries: [{ type: Row, key: `task-${id}` }] },
  tag: 'li', attrs: {}, style: {}, events: {}, form: null, children: [] });
const inputs: Record<string, (n: number) => [number[], number[]]> = {
  same: n => [range(n), range(n)],
  append: n => [range(n), [...range(n), n]],
  'remove-last': n => [range(n), range(n - 1)],
  'insert-middle': n => [range(n), [...range(n).slice(0, n >> 1), n, ...range(n).slice(n >> 1)]],
  reverse: n => [range(n), range(n).reverse()],
  shuffle: n => [range(n), shuffle(range(n), seededRandom(539365639))],
  'last-to-first': n => [range(n), [n - 1, ...range(n - 1)]],
};
function range(n: number): number[] { return Array.from({ length: n }, (_, i) => i); }

function count(planner: typeof planKeyedChildren, old: readonly ViewNode[], next: readonly VElement[]) {
  const counts = { mapSet: 0, mapGet: 0, setAdd: 0, setHas: 0, compatible: 0 };
  const map = Map.prototype, set = Set.prototype, original = { mapSet: map.set, mapGet: map.get, setAdd: set.add, setHas: set.has };
  calls.compatible = 0;
  map.set = function (this: Map<unknown, unknown>, key, value) { counts.mapSet++; return original.mapSet.call(this, key, value); };
  map.get = function (this: Map<unknown, unknown>, key) { counts.mapGet++; return original.mapGet.call(this, key); };
  set.add = function (this: Set<unknown>, value) { counts.setAdd++; return original.setAdd.call(this, value); };
  set.has = function (this: Set<unknown>, value) { counts.setHas++; return original.setHas.call(this, value); };
  let result: ReturnType<typeof planKeyedChildren>;
  try { result = planner(old, next, 'lis'); }
  finally { map.set = original.mapSet; map.get = original.mapGet; set.add = original.setAdd; set.has = original.setHas; }
  counts.compatible = calls.compatible;
  if (!result.ok) throw new Error('unexpected planner failure');
  return { counts, plan: result.value };
}

const table: Record<string, unknown>[] = [];
afterAll(() => { mkdirSync('.validation', { recursive: true }); writeFileSync('.validation/keyed-boundary-counts.json', `${JSON.stringify(table, null, 2)}\n`); });

it.each([10, 100, 1000])('work counts of one plan at %i siblings: the candidate removes the per-list Map/Set work, the key check stays', n => {
  for (const [name, make] of Object.entries(inputs)) {
    const [oldIds, nextIds] = make(n);
    const old: ViewNode[] = oldIds.map((id, i) => ({ ref: `old/${i}`, vnode: row(id), children: [] })), next = nextIds.map(row);
    // Boundary lengths from the definition, independent of the planner.
    let prefix = 0; while (prefix < Math.min(oldIds.length, nextIds.length) && oldIds[prefix] === nextIds[prefix]) prefix++;
    let suffix = 0; while (suffix < Math.min(oldIds.length, nextIds.length) - prefix && oldIds[oldIds.length - 1 - suffix] === nextIds[nextIds.length - 1 - suffix]) suffix++;
    const middleOld = oldIds.length - prefix - suffix, middleNew = nextIds.length - prefix - suffix;
    const b0 = count(planKeyedChildrenB0, old, next), c1 = count(planKeyedChildrenCandidate, old, next);
    // The default planner is B0: same work, same plan.
    expect(count(planKeyedChildren, old, next).counts, name).toEqual(b0.counts);
    expect(c1.plan.moveNewIndices).toEqual(b0.plan.moveNewIndices); expect(c1.plan.insertNewIndices).toEqual(b0.plan.insertNewIndices);
    expect(c1.plan.removedRefs).toEqual(b0.plan.removedRefs); expect(c1.plan.usedLIS).toBe(b0.plan.usedLIS);
    table.push({ input: name, oldLength: oldIds.length, newLength: nextIds.length, prefix, suffix, middleOld, middleNew,
      moves: c1.plan.moveNewIndices.length, inserts: c1.plan.insertNewIndices.length, removes: c1.plan.removedRefs.length,
      usedLIS: c1.plan.usedLIS, lisInput: { B0: b0.plan.usedLIS ? nextIds.length : 0, C1: c1.plan.usedLIS ? middleNew : 0 }, B0: b0.counts, C1: c1.counts });
    const keyChecks = oldIds.length + nextIds.length;
    // Unchanged whole-list key check: one Set.has and one Set.add per key of both lists.
    expect(c1.counts.setHas, name).toBeGreaterThanOrEqual(keyChecks); expect(c1.counts.setAdd, name).toBeGreaterThanOrEqual(keyChecks);
    // The middle is the only part that gets a Map (and only when both middles are non-empty).
    expect(c1.counts.mapSet, name).toBe(middleNew > 0 ? middleOld : 0);
    expect(c1.counts.mapGet, name).toBe(middleOld > 0 ? middleNew : 0);
    // Without a reorder nothing beyond the key check touches a Set; with LIS only the kept middle nodes do.
    if (!c1.plan.usedLIS) { expect(c1.counts.setAdd, name).toBe(keyChecks); expect(c1.counts.setHas, name).toBe(keyChecks); }
    // compatible(): once per key hit, plus at most two boundary probes.
    expect(c1.counts.compatible, name).toBeLessThanOrEqual(b0.counts.compatible + 2);
    // B0 for reference: a Map entry and a lookup for every node of the list.
    expect(b0.counts.mapSet, name).toBe(oldIds.length); expect(b0.counts.mapGet, name).toBe(nextIds.length);
    expect(c1.counts.mapSet + c1.counts.mapGet + c1.counts.setAdd + c1.counts.setHas, name).toBeLessThanOrEqual(b0.counts.mapSet + b0.counts.mapGet + b0.counts.setAdd + b0.counts.setHas);
  }
});
