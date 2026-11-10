import type { PureComponent, VElement, ViewNode } from '../../src/core/types';
import type { ReorderPlan } from '../../src/core/keyed';

// `owner`/`rendered` model a component boundary around the host element: the owner names a
// component type and `rendered` is the key of the element the component returned.
export interface Item { key: string; tag: string; owner?: string; rendered?: string }
export const items = (keys: string): Item[] => Array.from(keys, key => ({ key, tag: 'li' }));
const owners = new Map<string, PureComponent>();
export function ownerType(name: string): PureComponent {
  let type = owners.get(name);
  if (!type) { type = () => null; Object.defineProperty(type, 'name', { value: name }); owners.set(name, type); }
  return type;
}
export const vnode = (item: Item): VElement => ({
  kind: 'element',
  identity: { key: item.key, renderedRootKey: item.rendered ?? null, boundaries: item.owner ? [{ type: ownerType(item.owner), key: item.key }] : [] },
  tag: item.tag,
  attrs: { 'data-key': item.key }, style: {}, events: {}, form: null, children: [],
});
export const views = (values: readonly Item[]): ViewNode[] => values.map((item, i) => ({ ref: `old/${i}`, vnode: vnode(item), children: [] }));

// The reuse contract written out independently of the engine's compatible()/equalData():
// same key, same host tag, same rendered root key and the same component boundaries.
export function sameModelIdentity(a: VElement, b: VElement): boolean {
  if (a.identity.key !== b.identity.key || a.tag !== b.tag || a.identity.renderedRootKey !== b.identity.renderedRootKey) return false;
  if (a.identity.boundaries.length !== b.identity.boundaries.length) return false;
  return a.identity.boundaries.every((boundary, i) => boundary.type === b.identity.boundaries[i].type && boundary.key === b.identity.boundaries[i].key);
}

// production DOM executor와 독립된 배열 모델. stable set을 재계산하거나 LIS를 사용하지 않는다.
export function executeModel(old: readonly ViewNode[], plan: ReorderPlan): ViewNode[] {
  const removed = new Set(plan.removedRefs);
  const output = old.filter(node => !removed.has(node.ref));
  const next = plan.slots.map(slot => slot.previous ?? { ref: `new/${slot.newIndex}`, vnode: slot.vnode, children: [] });
  const placements = new Set([...plan.insertNewIndices, ...plan.moveNewIndices]);
  for (let i = next.length - 1; i >= 0; i--) if (placements.has(i)) {
    const node = next[i], existing = output.findIndex(value => value.ref === node.ref);
    if (existing >= 0) output.splice(existing, 1);
    const anchor = next[i + 1];
    const index = anchor ? output.findIndex(value => value.ref === anchor.ref) : output.length;
    if (index < 0) throw new Error('Model anchor is not placed');
    output.splice(index, 0, node);
  }
  return output;
}

export function assertModel(old: readonly ViewNode[], target: readonly Item[], plan: ReorderPlan): void {
  const output = executeModel(old, plan);
  if (output.length !== target.length) throw new Error('Model length differs');
  target.forEach((item, i) => {
    const node = output[i], expected = vnode(item);
    if (node.vnode.kind !== 'element' || node.vnode.identity.key !== item.key || node.vnode.tag !== item.tag) throw new Error(`Order/type differs at ${i}`);
    // 정답 매칭은 planner의 slots를 사용하지 않고 key/tag/boundary 계약에서 별도로 계산한다.
    const previous = old.find(entry => entry.vnode.kind === 'element' && sameModelIdentity(entry.vnode, expected));
    if (previous ? node !== previous : old.some(entry => entry.ref === node.ref)) throw new Error(`Identity differs at ${i}`);
  });
}

export function* permutations<T>(values: readonly T[]): Generator<T[]> {
  if (!values.length) { yield []; return; }
  for (let i = 0; i < values.length; i++) for (const rest of permutations([...values.slice(0, i), ...values.slice(i + 1)])) yield [values[i], ...rest];
}

export function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => { state ^= state << 13; state ^= state >>> 17; state ^= state << 5; return (state >>> 0) / 0x100000000; };
}
export function shuffle<T>(values: readonly T[], random: () => number): T[] {
  const result = [...values];
  for (let i = result.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [result[i], result[j]] = [result[j], result[i]]; }
  return result;
}
