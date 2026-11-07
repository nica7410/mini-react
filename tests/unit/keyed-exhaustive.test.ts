// @vitest-environment node
import { afterAll, expect, it } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import { planKeyedChildren } from '../../src/core/keyed';
import { unwrap } from '../../src/core/vdom';
import { assertModel, items, permutations, seededRandom, shuffle, views, vnode } from '../fixtures/keyed-model';
import type { Item } from '../fixtures/keyed-model';

const counts = { permutations: 0, bfsStates: 0, partialPairs: 0, randomPairs: 0, seed: 539365639 };
afterAll(() => { mkdirSync('.validation', { recursive: true }); writeFileSync('.validation/m4-model-counts.json', JSON.stringify(counts, null, 2)); });

function verify(oldItems: readonly Item[], nextItems: readonly Item[], context: string) {
  const old = views(oldItems), next = nextItems.map(vnode);
  try {
    for (const strategy of ['greedy', 'lis'] as const) assertModel(old, nextItems, unwrap(planKeyedChildren(old, next, strategy)));
  } catch (error) {
    const fixture = { schemaVersion: 1, context, seed: counts.seed, oldItems, nextItems, error: String(error) };
    mkdirSync('.validation', { recursive: true }); writeFileSync('.validation/keyed-failure.json', JSON.stringify(fixture, null, 2));
    throw new Error(JSON.stringify(fixture));
  }
}

it('T-L01: n=1~8의 모든 순열에서 실제 Greedy/LIS planner + 독립 배열 executor의 순서·identity 일치', () => {
  for (let n = 1; n <= 8; n++) {
    const original = items('ABCDEFGH'.slice(0, n));
    for (const permutation of permutations(original)) { verify(original, permutation, `permutation/${n}/${counts.permutations}`); counts.permutations++; }
  }
  expect(counts.permutations).toBe(46233);
}, 60000);

it('T-L02: n≤7 BFS의 독립 최단 이동 oracle와 실제 LIS 이동 수 일치', () => {
  for (let n = 1; n <= 7; n++) {
    const start = Array.from({ length: n }, (_, i) => i);
    const distance = new Map<string, number>([[start.join(','), 0]]), queue = [start];
    // 한 번의 간선은 임의 노드 하나를 제거해 임의 위치에 삽입하는 연산이다.
    // LIS, n-LIS, Greedy의 결과를 정답 계산에 사용하지 않는다.
    for (let cursor = 0; cursor < queue.length; cursor++) {
      const state = queue[cursor], nextDistance = distance.get(state.join(','))! + 1;
      for (let from = 0; from < n; from++) for (let to = 0; to < n; to++) if (from !== to) {
        const next = [...state]; next.splice(to, 0, next.splice(from, 1)[0]); const key = next.join(',');
        if (!distance.has(key)) { distance.set(key, nextDistance); queue.push(next); }
      }
    }
    const old = views(start.map(i => ({ key: String(i), tag: 'li' })));
    for (const state of queue) {
      const target = state.map(i => vnode({ key: String(i), tag: 'li' }));
      const plan = unwrap(planKeyedChildren(old, target, 'lis'));
      if (plan.moveNewIndices.length !== distance.get(state.join(','))) throw new Error(`BFS mismatch n=${n}, target=${state}`);
      counts.bfsStates++;
    }
  }
  expect(counts.bfsStates).toBe(5913);
}, 60000);

it('T-L03: 4개 key의 모든 부분 순열 4,225쌍에서 삽입/삭제/이동과 oldIndex 0 보존', () => {
  const subsets: Item[][] = [];
  function collect(prefix: Item[], remaining: Item[]) {
    subsets.push(prefix);
    remaining.forEach((item, i) => collect([...prefix, item], remaining.filter((_, index) => index !== i)));
  }
  collect([], items('ABCD'));
  expect(subsets).toHaveLength(65);
  for (const old of subsets) for (const next of subsets) { verify(old, next, `partial/${counts.partialPairs}`); counts.partialPairs++; }
  expect(counts.partialPairs).toBe(4225);
}, 60000);

it('T-L04: type 변경 포함 seed 10,000쌍의 순서·identity 일치', () => {
  const random = seededRandom(counts.seed), keys = Array.from({ length: 20 }, (_, i) => String(i));
  const generate = () => shuffle(keys, random).slice(0, Math.floor(random() * 21)).map(key => ({ key, tag: random() < 0.5 ? 'li' : 'div' }));
  for (let sample = 0; sample < 10000; sample++) { verify(generate(), generate(), `random/${sample}`); counts.randomPairs++; }
  expect(counts.randomPairs).toBe(10000);
}, 60000);

it('T-K04/K05: planner의 key 검증, monotonic/no-reorder의 LIS 생략', () => {
  expect(planKeyedChildren(views(items('AA')), items('AB').map(vnode), 'lis').ok).toBe(false);
  expect(planKeyedChildren(views(items('AB')), items('AA').map(vnode), 'lis').ok).toBe(false);
  const plan = unwrap(planKeyedChildren(views(items('ABC')), items('XABYC').map(vnode), 'lis'));
  expect(plan.usedLIS).toBe(false); expect(plan.moveNewIndices).toHaveLength(0);
  expect(plan.slots[1].oldIndex).toBe(0); expect(plan.insertNewIndices).toEqual([0, 3]);
});

it.each([
  ['HABCDEFG', 7, 1], ['BCDEFGHA', 1, 1], ['HGFEDCBA', 7, 7], ['HBCDEFGA', 7, 2], ['ACBDEFGH', 1, 1],
])('알려진 입력 %s의 이동 판정 Greedy=%i / LIS=%i', (target, greedyMoves, lisMoves) => {
  const old = views(items('ABCDEFGH')), next = items(target as string).map(vnode);
  expect(unwrap(planKeyedChildren(old, next, 'greedy')).moveNewIndices).toHaveLength(greedyMoves as number);
  expect(unwrap(planKeyedChildren(old, next, 'lis')).moveNewIndices).toHaveLength(lisMoves as number);
});
