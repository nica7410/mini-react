import type { Result, VNode, ViewNode } from './types';
import { compatible, fail, ok } from './vdom';

export interface MatchedSlot {
  readonly newIndex: number;
  readonly oldIndex: number | null;
  readonly previous: ViewNode | undefined;
  readonly vnode: VNode;
}
export interface ReorderPlan {
  readonly slots: readonly MatchedSlot[];
  readonly stableNewIndices: ReadonlySet<number>;
  readonly moveNewIndices: readonly number[];
  readonly insertNewIndices: readonly number[];
  readonly removedRefs: readonly string[];
  readonly usedLIS: boolean;
}

export function keyedEligibility(old: readonly ViewNode[], next: readonly VNode[]): 'keyed' | 'missing-key' | 'mixed-node-kinds' {
  const nodes = [...old.map(entry => entry.vnode), ...next];
  if (nodes.some(node => node.kind !== 'element')) return 'mixed-node-kinds';
  return nodes.some(node => node.identity.key === null) ? 'missing-key' : 'keyed';
}

// oldIndex=0은 유효한 기존 노드다. 신규 노드는 null로 구분한다.
function increasingPositions(slots: readonly MatchedSlot[]): Set<number> {
  const tails: number[] = [], predecessors = new Array<number>(slots.length).fill(-1);
  slots.forEach((slot, index) => {
    if (slot.oldIndex === null) return;
    let low = 0, high = tails.length;
    while (low < high) {
      const middle = (low + high) >>> 1;
      if (slots[tails[middle]].oldIndex! < slot.oldIndex) low = middle + 1; else high = middle;
    }
    if (low > 0) predecessors[index] = tails[low - 1];
    tails[low] = index;
  });
  const stable = new Set<number>();
  let current = tails.at(-1) ?? -1;
  while (current !== -1) { stable.add(current); current = predecessors[current]; }
  return stable;
}

export function planKeyedChildren(old: readonly ViewNode[], next: readonly VNode[], strategy: 'greedy' | 'lis'): Result<ReorderPlan> {
  if (keyedEligibility(old, next) !== 'keyed') return fail('NOT_KEYED', '양쪽 직접 자식이 모두 key가 있는 element여야 합니다.');
  for (const nodes of [old.map(node => node.vnode), next]) {
    const keys = new Set<string>();
    for (const node of nodes) {
      const key = node.identity.key!;
      if (!key || keys.has(key)) return fail('DUPLICATE_KEY', `빈 key 또는 중복 key: ${key}`);
      keys.add(key);
    }
  }
  const byKey = new Map(old.map((node, index) => [node.vnode.identity.key!, { node, index }]));
  const reused = new Set<string>();
  const slots = next.map((vnode, newIndex): MatchedSlot => {
    const oldSlot = byKey.get(vnode.identity.key!);
    if (!oldSlot || !compatible(oldSlot.node.vnode, vnode)) return { newIndex, oldIndex: null, previous: undefined, vnode };
    reused.add(oldSlot.node.ref);
    return { newIndex, oldIndex: oldSlot.index, previous: oldSlot.node, vnode };
  });
  let maximum = -1, monotonic = true;
  const greedyStable = new Set<number>();
  for (const slot of slots) if (slot.oldIndex !== null) {
    if (slot.oldIndex < maximum) monotonic = false;
    else { maximum = slot.oldIndex; greedyStable.add(slot.newIndex); }
  }
  const usedLIS = strategy === 'lis' && !monotonic;
  const stableNewIndices = usedLIS ? increasingPositions(slots) : greedyStable;
  return ok({
    slots, stableNewIndices, usedLIS,
    moveNewIndices: slots.filter(slot => slot.oldIndex !== null && !stableNewIndices.has(slot.newIndex)).map(slot => slot.newIndex),
    insertNewIndices: slots.filter(slot => slot.oldIndex === null).map(slot => slot.newIndex),
    removedRefs: old.filter(node => !reused.has(node.ref)).map(node => node.ref),
  });
}
