// @vitest-environment node
// Keyed boundary-run study (2026-11-10). Two planners must preserve the observable result of the
// baseline planner B0 (tests/fixtures/keyed-baseline.ts): the default planner in src/core/keyed.ts
// and the research candidate C1 (research/keyed-boundaries/keyed.candidate.ts, kept for research:
// docs/followup-keyed-boundaries.md).
//   A. differential: every field of the plan against B0, for Greedy and LIS;
//   B. independent model: array executor + matching/move oracles that never read the plan's
//      slots or stable set as the answer and do not use the engine's compatible();
//   C. bounded generation with a fixed seed and a shrinker for the first failing input.
import { afterAll, expect, it } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import { planKeyedChildren } from '../../src/core/keyed';
import type { VNode, ViewNode } from '../../src/core/types';
import { planKeyedChildrenB0 } from '../fixtures/keyed-baseline';
import { planKeyedChildrenCandidate } from '../../research/keyed-boundaries/keyed.candidate';
import { assertModel, items, permutations, sameModelIdentity, seededRandom, shuffle, views, vnode } from '../fixtures/keyed-model';
import type { Item } from '../fixtures/keyed-model';

type Planner = typeof planKeyedChildren;
const planners: [string, Planner][] = [['default', planKeyedChildren], ['candidate', planKeyedChildrenCandidate]];
const SEED = 20261110, GENERATED = 1700, SHRINK_EVALUATIONS = 300, SHRINK_MS = 30000;
const counts = { seed: SEED, required: 0, wrappedPairs: 0, wrappedPermutations: 0, generated: 0, generatedInvalid: 0, shrinkDemoEvaluations: 0 };
afterAll(() => { mkdirSync('.validation', { recursive: true }); writeFileSync('.validation/keyed-boundaries-counts.json', JSON.stringify(counts, null, 2)); });

// Longest strictly increasing subsequence length by the quadratic textbook recurrence.
function lisLength(values: readonly number[]): number {
  const best: number[] = [];
  values.forEach((value, i) => { best[i] = 1; for (let j = 0; j < i; j++) if (values[j] < value && best[j] + 1 > best[i]) best[i] = best[j] + 1; });
  return best.length ? Math.max(...best) : 0;
}

/** First observable difference of `planner` from B0 or from the independent model, or null. */
function difference(planner: Planner, oldItems: readonly Item[], nextItems: readonly Item[], old: readonly ViewNode[] = views(oldItems), next: readonly VNode[] = nextItems.map(vnode)): string | null {
  for (const strategy of ['greedy', 'lis'] as const) {
    const expected = planKeyedChildrenB0(old, next, strategy), actual = planner(old, next, strategy);
    if (!expected.ok || !actual.ok) {
      if (expected.ok !== actual.ok) return `${strategy}: baseline ok=${expected.ok}, candidate ok=${actual.ok}`;
      if (JSON.stringify(expected) !== JSON.stringify(actual)) return `${strategy}: diagnostics ${JSON.stringify(expected)} vs ${JSON.stringify(actual)}`;
      continue;
    }
    const a = expected.value, b = actual.value;
    // A. differential against B0.
    if (a.slots.length !== b.slots.length) return `${strategy}: slot count ${a.slots.length} vs ${b.slots.length}`;
    for (let i = 0; i < a.slots.length; i++) {
      const x = a.slots[i], y = b.slots[i];
      if (!y || x.newIndex !== y.newIndex || x.oldIndex !== y.oldIndex || x.previous !== y.previous || x.vnode !== y.vnode) return `${strategy}: slot ${i} ${x.newIndex}/${x.oldIndex} vs ${y?.newIndex}/${y?.oldIndex}`;
    }
    const sorted = (set: ReadonlySet<number>) => [...set].sort((m, n) => m - n).join(',');
    if (sorted(a.stableNewIndices) !== sorted(b.stableNewIndices)) return `${strategy}: stable {${sorted(a.stableNewIndices)}} vs {${sorted(b.stableNewIndices)}}`;
    if (a.moveNewIndices.join(',') !== b.moveNewIndices.join(',')) return `${strategy}: moves [${a.moveNewIndices}] vs [${b.moveNewIndices}]`;
    if (a.insertNewIndices.join(',') !== b.insertNewIndices.join(',')) return `${strategy}: inserts [${a.insertNewIndices}] vs [${b.insertNewIndices}]`;
    if (a.removedRefs.join(',') !== b.removedRefs.join(',')) return `${strategy}: removed [${a.removedRefs}] vs [${b.removedRefs}]`;
    if (a.usedLIS !== b.usedLIS) return `${strategy}: usedLIS ${a.usedLIS} vs ${b.usedLIS}`;
    if (b.stableNewIndices !== b.stableNewIndices) return `${strategy}: stable set is not one object`;
    // B. independent model: final order and identity through the array executor ...
    try { assertModel(old, nextItems, b); } catch (error) { return `${strategy}: model ${error instanceof Error ? error.message : String(error)}`; }
    // ... and matching, inserts, removals and moves from the written contract.
    const matchedOld = next.map(node => { const index = old.findIndex(entry => entry.vnode.kind === 'element' && node.kind === 'element' && sameModelIdentity(entry.vnode, node)); return index < 0 ? null : index; });
    if (matchedOld.join(',') !== b.slots.map(slot => slot.oldIndex).join(',')) return `${strategy}: matching [${b.slots.map(slot => slot.oldIndex)}], contract [${matchedOld}]`;
    const inserts = matchedOld.flatMap((index, j) => index === null ? [j] : []);
    if (inserts.join(',') !== b.insertNewIndices.join(',')) return `${strategy}: inserts [${b.insertNewIndices}], contract [${inserts}]`;
    const removed = old.filter((_, i) => !matchedOld.includes(i)).map(entry => entry.ref);
    if (removed.join(',') !== b.removedRefs.join(',')) return `${strategy}: removed [${b.removedRefs}], contract [${removed}]`;
    const reused = matchedOld.filter((index): index is number => index !== null);
    if (strategy === 'greedy') {
      // Greedy contract: a reused node moves iff a node placed before it in the new list came from a later old position.
      const moves = matchedOld.flatMap((index, j) => index !== null && matchedOld.some((other, i) => i < j && other !== null && other > index) ? [j] : []);
      if (moves.join(',') !== b.moveNewIndices.join(',')) return `greedy: moves [${b.moveNewIndices}], contract [${moves}]`;
      if (b.usedLIS) return 'greedy: usedLIS must be false';
    } else {
      // LIS contract: the kept nodes are in increasing old order and as many as possible.
      const moved = new Set(b.moveNewIndices);
      const kept = matchedOld.filter((index, j): index is number => index !== null && !moved.has(j));
      if (kept.some((index, i) => i > 0 && kept[i - 1] >= index)) return `lis: kept nodes are not in increasing old order [${kept}]`;
      if (kept.length !== lisLength(reused)) return `lis: kept ${kept.length}, longest possible ${lisLength(reused)}`;
      const inOrder = reused.every((index, i) => i === 0 || reused[i - 1] < index);
      if (b.usedLIS !== !inOrder) return `lis: usedLIS ${b.usedLIS} for in-order=${inOrder}`;
    }
    if (b.moveNewIndices.some(j => matchedOld[j] === null)) return `${strategy}: a new node is listed as a move`;
  }
  return null;
}

interface Shrunk { old: Item[]; next: Item[]; evaluations: number; stopped: 'minimal' | 'evaluation-limit' | 'time-limit'; difference: string }
/** Greedy one-step reduction: drop one item or simplify one item while the input still fails. */
function shrink(planner: Planner, oldItems: readonly Item[], nextItems: readonly Item[]): Shrunk {
  let old = [...oldItems], next = [...nextItems], evaluations = 0, last = difference(planner, old, next)!;
  const started = Date.now();
  const simpler = (item: Item): Item[] => [
    ...(item.owner !== undefined || item.rendered !== undefined ? [{ key: item.key, tag: item.tag }] : []),
    ...(item.tag !== 'li' ? [{ ...item, tag: 'li' }] : []),
  ];
  for (;;) {
    let progressed = false;
    const candidates: [Item[], Item[]][] = [];
    old.forEach((_, i) => candidates.push([old.filter((__, j) => j !== i), next]));
    next.forEach((_, i) => candidates.push([old, next.filter((__, j) => j !== i)]));
    old.forEach((item, i) => simpler(item).forEach(value => candidates.push([old.map((entry, j) => j === i ? value : entry), next])));
    next.forEach((item, i) => simpler(item).forEach(value => candidates.push([old, next.map((entry, j) => j === i ? value : entry)])));
    for (const [a, b] of candidates) {
      if (evaluations >= SHRINK_EVALUATIONS) return { old, next, evaluations, stopped: 'evaluation-limit', difference: last };
      if (Date.now() - started >= SHRINK_MS) return { old, next, evaluations, stopped: 'time-limit', difference: last };
      evaluations++;
      const found = difference(planner, a, b);
      if (found) { old = a; next = b; last = found; progressed = true; break; }
    }
    if (!progressed) return { old, next, evaluations, stopped: 'minimal', difference: last };
  }
}
function verify(oldItems: readonly Item[], nextItems: readonly Item[], context: string) {
  for (const [name, planner] of planners) verifyPlanner(name, planner, oldItems, nextItems, context);
}
function verifyPlanner(name: string, planner: Planner, oldItems: readonly Item[], nextItems: readonly Item[], context: string) {
  const found = difference(planner, oldItems, nextItems);
  if (!found) return;
  const fixture = { schemaVersion: 1, planner: name, context, seed: SEED, command: 'pnpm exec vitest run tests/unit/keyed-boundaries.test.ts',
    original: { oldItems, nextItems, difference: found }, shrunk: shrink(planner, oldItems, nextItems) };
  mkdirSync('.validation', { recursive: true }); writeFileSync('.validation/keyed-boundaries-failure.json', JSON.stringify(fixture, null, 2));
  throw new Error(JSON.stringify(fixture));
}

const tagged = (keys: string, changes: Record<string, Partial<Item>> = {}): Item[] => items(keys).map(item => ({ ...item, ...changes[item.key] }));
const required: [string, Item[], Item[]][] = [
  ['both empty', [], []],
  ['all identical', items('ABCDEF'), items('ABCDEF')],
  ['all inserted', [], items('ABCD')],
  ['all removed', items('ABCD'), []],
  ['single identical', items('A'), items('A')],
  ['insert at front', items('BCD'), items('ABCD')],
  ['insert at back', items('ABC'), items('ABCD')],
  ['insert in the middle', items('ABEF'), items('ABCDEF')],
  ['remove at front', items('ABCD'), items('BCD')],
  ['remove at back', items('ABCD'), items('ABC')],
  ['remove in the middle', items('ABCDEF'), items('ABEF')],
  ['replace in the middle', items('PABQ'), items('PXYQ')],
  ['insert + remove + move', items('PABCDQ'), items('PDXBQ')],
  ['reverse', items('ABCDEFGH'), items('HGFEDCBA')],
  ['reverse inside boundaries', items('PABCDQ'), items('PDCBAQ')],
  ['last to first', items('ABCDEFGH'), items('HABCDEFG')],
  ['first to last', items('ABCDEFGH'), items('BCDEFGHA')],
  ['last to first inside boundaries', items('PABCDQ'), items('PDABCQ')],
  ['swap neighbours inside boundaries (several longest runs)', items('PABCDQ'), items('PBADCQ')],
  ['three longest runs', items('ABCDEF'), items('BADCFE')],
  ['Greedy must not see the suffix first', items('ABCQ'), items('CABQ')],
  ['suffix longer than the middle', items('ABCDEFG'), items('BACDEFG')],
  ['shorter new list keeps both ends', items('DBAC'), items('DC')],
  ['new list extends the old one', items('ABC'), items('ABCDE')],
  ['same key, other tag at the front', items('ABCD'), tagged('ABCD', { A: { tag: 'div' } })],
  ['same key, other tag at the back', items('ABCD'), tagged('ABCD', { D: { tag: 'div' } })],
  ['same key, other tag in the middle of a reorder', items('PABCQ'), tagged('PCBAQ', { B: { tag: 'div' } })],
  ['same key, other component owner at the front', tagged('ABCD', { A: { owner: 'X' } }), tagged('ABCD', { A: { owner: 'Y' } })],
  ['same key, owner added at the back', items('ABCD'), tagged('ABCD', { D: { owner: 'X' } })],
  ['same key, other rendered root key in the middle', tagged('ABCD', { B: { owner: 'X', rendered: 'r1' } }), tagged('ABCD', { B: { owner: 'X', rendered: 'r2' } })],
  ['same owner and rendered root key is reused across a move', tagged('PABQ', { A: { owner: 'X', rendered: 'r' } }), tagged('PBAQ', { A: { owner: 'X', rendered: 'r' } })],
  ['boundary node replaced while the rest moves', tagged('PABCQ', { P: { owner: 'X' } }), tagged('PCABQ', { P: { owner: 'Y' } })],
  ['duplicate key in old across prefix and middle', items('PAPB'), items('PAB')],
  ['duplicate key in old across middle and suffix', items('PAQBQ'), items('PABQ')],
  ['duplicate key in old across prefix and suffix', items('PABP'), items('PABQ')],
  ['duplicate key in new across prefix and middle', items('PAB'), items('PAPB')],
  ['duplicate key in new across middle and suffix', items('PABQ'), items('PQAQ')],
  ['duplicate key in new across prefix and suffix', items('PABQ'), items('PABP')],
  ['duplicate keys in both lists', items('PAP'), items('PAP')],
  ['duplicate inside an otherwise identical list', items('ABCB'), items('ABCB')],
];

it('required boundary inputs: default planner and candidate equal B0 and the independent model', () => {
  for (const [name, oldItems, nextItems] of required) { verify(oldItems, nextItems, `required/${name}`); counts.required++; }
  expect(counts.required).toBe(required.length);
});

it.each(planners)('known decisions (%s): Greedy keeps new-list order, LIS keeps its tie choice, indices are whole-list indices', (_name, planner) => {
  const plan = (oldKeys: string, nextKeys: string, strategy: 'greedy' | 'lis') => {
    const result = planner(views(items(oldKeys)), items(nextKeys).map(vnode), strategy);
    if (!result.ok) throw new Error('unexpected failure');
    return result.value;
  };
  // If the suffix Q raised the Greedy maximum first, C would be reported as moved too.
  expect(plan('ABCQ', 'CABQ', 'greedy').moveNewIndices).toEqual([1, 2]);
  // Two moves either way, but different nodes: LIS keeps A and C, Greedy keeps B and D.
  expect(plan('PABCDQ', 'PBADCQ', 'lis')).toMatchObject({ moveNewIndices: [1, 3], usedLIS: true });
  expect([...plan('PABCDQ', 'PBADCQ', 'lis').stableNewIndices].sort()).toEqual([0, 2, 4, 5]);
  expect(plan('PABCDQ', 'PBADCQ', 'greedy')).toMatchObject({ moveNewIndices: [2, 4], usedLIS: false });
  // Whole-list old/new indices next to boundary runs; nothing is renumbered from the middle.
  const mixed = plan('PABQ', 'PXBAYQ', 'lis');
  expect(mixed.slots.map(slot => slot.oldIndex)).toEqual([0, null, 2, 1, null, 3]);
  expect(mixed.slots.map(slot => slot.newIndex)).toEqual([0, 1, 2, 3, 4, 5]);
  expect(mixed).toMatchObject({ insertNewIndices: [1, 4], moveNewIndices: [2], removedRefs: [] });
  expect(plan('PABCQ', 'PCQ', 'lis').removedRefs).toEqual(['old/1', 'old/2']);
  // In-order lists never run LIS, with or without boundary runs (as before).
  expect(plan('ABC', 'XABYC', 'lis')).toMatchObject({ usedLIS: false, moveNewIndices: [] });
  expect(plan('ABCDEF', 'ABCDEF', 'lis')).toMatchObject({ usedLIS: false, moveNewIndices: [], insertNewIndices: [], removedRefs: [] });
});

it.each(planners)('key validation and eligibility keep their whole-list scope and priority (%s)', (_name, planner) => {
  const text: VNode = { kind: 'text', identity: { key: null, renderedRootKey: null, boundaries: [] }, text: 't' };
  const keyless = { ...vnode({ key: 'x', tag: 'li' }), identity: { key: null, renderedRootKey: null, boundaries: [] } };
  const empty = { ...vnode({ key: 'x', tag: 'li' }), identity: { key: '', renderedRootKey: null, boundaries: [] } };
  const asView = (nodes: readonly VNode[]): ViewNode[] => nodes.map((node, i) => ({ ref: `old/${i}`, vnode: node, children: [] }));
  const base = items('PABQ').map(vnode);
  const cases: [string, VNode[], VNode[], string][] = [
    ['keyless node after an equal prefix', base, [base[0], base[1], keyless, base[3]], 'NOT_KEYED'],
    ['text node in old suffix', [...base, text], [...base], 'NOT_KEYED'],
    ['text node wins over a duplicate key', [base[0], base[0], text], [base[0]], 'NOT_KEYED'],
    ['keyless node wins over a duplicate key', [base[0], base[1]], [base[0], base[0], keyless], 'NOT_KEYED'],
    ['empty key at the old front', [empty, base[1]], [base[1]], 'DUPLICATE_KEY'],
    ['empty key at the new back', [base[0], base[1]], [base[0], base[1], empty], 'DUPLICATE_KEY'],
    ['old duplicate is reported before a new duplicate', [base[0], base[1], base[0]], [base[2], base[2]], 'DUPLICATE_KEY'],
  ];
  for (const [name, oldNodes, nextNodes, code] of cases) for (const strategy of ['greedy', 'lis'] as const) {
    const expected = planKeyedChildrenB0(asView(oldNodes), nextNodes, strategy), actual = planner(asView(oldNodes), nextNodes, strategy);
    expect(actual, name).toEqual(expected);
    expect(actual.ok ? 'ok' : actual.diagnostics[0].code, name).toBe(code);
  }
  expect(difference(planner, [], [], asView([base[0], base[1], base[0]]), [base[2], base[2]])).toBeNull();
});

it('every partial pair of four keys inside unchanged, absent and incompatible boundary nodes', () => {
  const subsets: Item[][] = [];
  function collect(prefix: Item[], remaining: Item[]) {
    subsets.push(prefix);
    remaining.forEach((item, i) => collect([...prefix, item], remaining.filter((_, index) => index !== i)));
  }
  collect([], items('ABCD'));
  const wraps: [Item[], Item[]][] = [[[], []], [items('P'), items('P')], [items('P'), tagged('P', { P: { tag: 'div' } })]];
  const tails: [Item[], Item[]][] = [[[], []], [items('Q'), items('Q')], [items('Q'), tagged('Q', { Q: { owner: 'X' } })]];
  for (const [oldHead, nextHead] of wraps) for (const [oldTail, nextTail] of tails) for (const old of subsets) for (const next of subsets) {
    verify([...oldHead, ...old, ...oldTail], [...nextHead, ...next, ...nextTail], `wrapped-pair/${counts.wrappedPairs}`); counts.wrappedPairs++;
  }
  expect(counts.wrappedPairs).toBe(9 * 65 * 65);
}, 60000);

it('every permutation of up to six keys between two-node boundary runs', () => {
  for (let n = 0; n <= 6; n++) {
    const middle = items('ABCDEF'.slice(0, n));
    for (const permutation of permutations(middle)) {
      verify([...items('PR'), ...middle, ...items('SQ')], [...items('PR'), ...permutation, ...items('SQ')], `wrapped-permutation/${n}/${counts.wrappedPermutations}`);
      counts.wrappedPermutations++;
    }
  }
  expect(counts.wrappedPermutations).toBe(1 + 1 + 2 + 6 + 24 + 120 + 720);
}, 60000);

// One generated pair: a shared prefix and suffix around a middle that is kept, reversed, shuffled,
// rotated, thinned out or refilled; any node may change tag/owner/rendered key; ~5% get a duplicate key.
function generate(random: () => number): { old: Item[]; next: Item[]; invalid: boolean } {
  const pool = Array.from('abcdefghijklmnop'), pick = <T>(values: readonly T[]) => values[Math.floor(random() * values.length)];
  const base = shuffle(pool, random).slice(0, Math.floor(random() * 13));
  const spare = pool.filter(key => !base.includes(key));
  const make = (key: string): Item => ({ key, tag: random() < 0.8 ? 'li' : 'div', ...(random() < 0.3 ? { owner: pick(['X', 'Y']), ...(random() < 0.5 ? { rendered: pick(['r1', 'r2']) } : {}) } : {}) });
  const old = base.map(make);
  const prefix = Math.floor(random() * (old.length + 1)), suffix = Math.floor(random() * (old.length - prefix + 1));
  let middle = old.slice(prefix, old.length - suffix);
  const kind = Math.floor(random() * 7);
  if (kind === 1) middle = [...middle].reverse();
  if (kind === 2) middle = shuffle(middle, random);
  if (kind === 3 && middle.length) middle = [middle[middle.length - 1], ...middle.slice(0, -1)];
  if (kind === 4) middle = middle.filter(() => random() < 0.6);
  if (kind === 5 || kind === 6) {
    middle = kind === 6 ? shuffle(middle, random).filter(() => random() < 0.7) : [...middle];
    for (const key of spare.slice(0, Math.floor(random() * 4))) middle.splice(Math.floor(random() * (middle.length + 1)), 0, make(key));
  }
  let next = [...old.slice(0, prefix), ...middle, ...old.slice(old.length - suffix)].map(item => {
    if (random() >= 0.08) return item;
    const change = Math.floor(random() * 3);
    return change === 0 ? { ...item, tag: item.tag === 'li' ? 'div' : 'li' } : change === 1 ? { ...item, owner: item.owner === 'X' ? 'Y' : 'X' } : { key: item.key, tag: item.tag, owner: item.owner ?? 'X', rendered: item.rendered === 'r1' ? 'r2' : 'r1' };
  });
  let invalid = false, oldItems = old;
  if (random() < 0.05) {
    const target = random() < 0.5 ? old : next;
    if (target.length) {
      const copy = [...target]; copy.splice(Math.floor(random() * (copy.length + 1)), 0, { ...pick(target) });
      if (target === old) oldItems = copy; else next = copy;
      invalid = true;
    }
  }
  return { old: oldItems, next, invalid };
}

it(`seed ${SEED}: ${GENERATED} generated pairs with boundary runs, identity changes and duplicate keys`, () => {
  const random = seededRandom(SEED);
  for (let sample = 0; sample < GENERATED; sample++) {
    const { old, next, invalid } = generate(random);
    verify(old, next, `generated/${sample}`); counts.generated++; if (invalid) counts.generatedInvalid++;
  }
  expect(counts.generated).toBe(GENERATED); expect(counts.generatedInvalid).toBeGreaterThan(20);
}, 60000);

it('the harness reports and shrinks a wrong planner within its budget', () => {
  // A deliberately wrong planner: the suffix is counted as already placed before the middle (Greedy).
  const wrong: Planner = (old, next, strategy) => {
    const result = planKeyedChildrenCandidate(old, next, strategy);
    if (!result.ok || strategy !== 'greedy') return result;
    const plan = result.value, last = plan.slots.at(-1)?.oldIndex;
    if (last !== old.length - 1 || plan.slots.length < 2) return result;
    const moves = plan.slots.filter((slot, i) => i < plan.slots.length - 1 && slot.oldIndex !== null && slot.oldIndex < last && slot.oldIndex !== i).map(slot => slot.newIndex);
    return { ok: true, value: { ...plan, moveNewIndices: moves, stableNewIndices: new Set(plan.slots.filter(slot => slot.oldIndex !== null && !moves.includes(slot.newIndex)).map(slot => slot.newIndex)) } };
  };
  const random = seededRandom(SEED);
  let failing: { old: Item[]; next: Item[] } | undefined;
  for (let sample = 0; sample < GENERATED && !failing; sample++) { const pair = generate(random); if (difference(wrong, pair.old, pair.next)) failing = pair; }
  expect(failing).toBeDefined();
  const shrunk = shrink(wrong, failing!.old, failing!.next);
  counts.shrinkDemoEvaluations = shrunk.evaluations;
  expect(shrunk.evaluations).toBeLessThanOrEqual(SHRINK_EVALUATIONS);
  expect(difference(wrong, shrunk.old, shrunk.next)).not.toBeNull(); expect(difference(planKeyedChildrenCandidate, shrunk.old, shrunk.next)).toBeNull();
  expect(shrunk.old.length + shrunk.next.length).toBeLessThanOrEqual(failing!.old.length + failing!.next.length);
  if (shrunk.stopped === 'minimal') expect(shrunk.old.length).toBeLessThanOrEqual(3);
});
