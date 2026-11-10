// One arm of the attribute-map comparison (docs/validation/followup-attr-maps/plan.md).
// The same file is built twice: with the default engine and with the candidate resolver.
// Each build runs in its own iframe of one page, so every arm executes only its own code and
// its own VDOM objects, as an application would. Fixtures follow src/bench/keyed-paired-diff.ts.
import { diff } from '../core/reconcile';
import { TaskApp, type Task } from '../app/tasks';
import { unwrap } from '../core/vdom';
import type { MountView, VNode, VRoot, ViewNode } from '../core/types';
import { renderWithHooks, type HookFrame } from '../runtime/hooks';
import { evaluateExpression, type EvaluationState } from '../runtime/resolve';
import { initialTaskModel } from './task-model';

const options = { strategy: 'lis', planId: 'paired-diff' } as const;
const rowCount = 100;
const seed = 539365639;
// A, B, C: diff() only. U: re-render with one changed row, then diff(). F: a fresh render of all rows.
const batchSizes = { A: 20, B: 20, C: 20, U: 20, F: 5 } as const;
type Operation = keyof typeof batchSizes;

function prepare() {
  const { items } = initialTaskModel(rowCount, seed);
  const mountFrame: HookFrame = { mounting: true, previous: [], candidate: [], index: 0, changedEffects: [],
    enqueue: () => { throw new Error('Unexpected fixture state update'); } };
  renderWithHooks(mountFrame, TaskApp);
  // Slot 0 is the items State (as in the existing TaskApp benchmark fixtures).
  const render = (rows: readonly Task[], previous: HookFrame, prior: EvaluationState | null) => {
    const candidate = [...previous.candidate];
    const slot = candidate[0];
    if (slot?.kind !== 'state' || !Array.isArray(slot.value)) throw new Error('TaskApp items State slot changed');
    candidate[0] = { ...slot, value: rows };
    const next: HookFrame = { ...mountFrame, mounting: false, previous: previous.candidate, candidate, index: 0, changedEffects: [] };
    return { frame: next, evaluation: evaluateExpression(renderWithHooks(next, TaskApp), prior, true) };
  };
  const initial = render(items, mountFrame, null);
  const snapshot = initial.evaluation.snapshot;
  const mountId = 'mount-paired';
  let ref = 0;
  const view = (vnode: VNode): ViewNode => ({ ref: `${mountId}/base/${++ref}`, vnode,
    children: vnode.kind === 'element' ? vnode.children.map(view) : [] });
  const base: MountView = { mountId, rootRef: `${mountId}/root`, revision: 1, snapshot, children: snapshot.children.map(view) };
  const update = (rows: readonly Task[]) => render(rows, initial.frame, initial.evaluation.nextState).evaluation.snapshot;
  const renamed = items.map((item, i) => i === 49 ? { ...item, label: `${item.label} 변경` } : item);
  const swapped = [...items];
  [swapped[49], swapped[50]] = [swapped[50], swapped[49]];
  return { base, targets: { A: update(renamed), B: update(swapped), C: update([...items].reverse()) },
    updateA: () => update(renamed), fresh: () => render(items, mountFrame, null).evaluation.snapshot };
}

let fixtures: ReturnType<typeof prepare> | undefined;
let sink = 0;
function batch(operation: Operation): number {
  if (!fixtures) throw new Error('prepare() first');
  const { base, targets, updateA, fresh } = fixtures, size = batchSizes[operation];
  const start = performance.now();
  if (operation === 'F') {
    for (let i = 0; i < size; i++) sink += fresh().children.length;
  } else if (operation === 'U') {
    for (let i = 0; i < size; i++) {
      const result = diff(base, updateA(), options);
      if (!result.ok) unwrap(result); else sink += result.value.operations.length;
    }
  } else {
    const target = targets[operation];
    for (let i = 0; i < size; i++) {
      const result = diff(base, target, options);
      if (!result.ok) unwrap(result); else sink += result.value.operations.length;
    }
  }
  return performance.now() - start;
}

// A structural record that can be compared between arms (other realms): JSON text drops
// functions, so handler and component identities are not part of it.
function digest(value: unknown) {
  const text = JSON.stringify(value);
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) { hash ^= text.charCodeAt(i); hash = Math.imul(hash, 0x01000193) >>> 0; }
  return { length: text.length, fnv1a: hash.toString(16).padStart(8, '0') };
}
function attributeMaps(root: VRoot) {
  let elements = 0, nullPrototype = 0, frozen = 0, attributes = 0;
  (function walk(nodes: readonly VNode[]) {
    for (const node of nodes) if (node.kind === 'element') {
      elements++; attributes += Object.keys(node.attrs).length;
      if (Object.getPrototypeOf(node.attrs) === null) nullPrototype++;
      if (Object.isFrozen(node.attrs)) frozen++;
      walk(node.children);
    }
  })(root.children);
  return { elements, nullPrototype, frozen, attributes };
}
function verify() {
  const { base, targets, updateA, fresh } = prepare();
  const plans = (['A', 'B', 'C'] as const).map(condition => {
    const plan = unwrap(diff(base, targets[condition], options));
    if (plan.target !== targets[condition]) throw new Error('Target reference changed');
    return { condition, operations: plan.operations.map(op => op.kind), operationsDigest: digest(plan.operations), reconciliations: plan.reconciliations,
      visitedNodes: plan.visitedNodes, reusedSubtrees: plan.reusedSubtrees, nextViewDigest: digest(plan.nextView.children), targetDigest: digest(targets[condition]) };
  });
  const updated = updateA(), update = unwrap(diff(base, updated, options));
  const freshSnapshot = fresh();
  return { baseDigest: digest(base.snapshot), baseMaps: attributeMaps(base.snapshot), plans,
    update: { targetDigest: digest(updated), operations: update.operations.map(op => op.kind), reusedSubtrees: update.reusedSubtrees },
    fresh: { digest: digest(freshSnapshot), maps: attributeMaps(freshSnapshot), sameObjectAsBase: freshSnapshot === base.snapshot } };
}

Object.assign(window, { arm: { batchSizes, verify, prepare: () => { fixtures = prepare(); }, batch } });
