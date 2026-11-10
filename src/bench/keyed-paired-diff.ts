import { diff as diffB0 } from '../core/reconcile';
import { diff as diffC1 } from 'paired:keyed-c1';
import { TaskApp, type Task } from '../app/tasks';
import { equalData, unwrap } from '../core/vdom';
import type { MountView, VElement, VNode, ViewNode } from '../core/types';
import { renderWithHooks, type HookFrame } from '../runtime/hooks';
import { evaluateExpression } from '../runtime/resolve';
import { initialTaskModel } from './task-model';

const options = { strategy: 'lis', planId: 'paired-diff' } as const;
const rowCount = 100;
const batchSize = 20;
const seed = 539365639;
type Condition = 'A' | 'B' | 'C' | 'AA';
type Fixture = ReturnType<typeof prepare>[keyof ReturnType<typeof prepare>];
type Audit = Record<'B0' | 'C1', number[]>;
const check = (condition: unknown, message: string) => { if (!condition) throw new Error(message); };

function prepare() {
  // Render the real TaskApp with its normal Hooks and memo evaluation, without mounting
  // or running Effects. Slot 0 is the items State used by the existing TaskApp benchmark.
  const { items } = initialTaskModel(rowCount, seed);
  const frame: HookFrame = { mounting: true, previous: [], candidate: [], index: 0, changedEffects: [],
    enqueue: () => { throw new Error('Unexpected fixture state update'); } };
  renderWithHooks(frame, TaskApp);
  const render = (rows: readonly Task[], previous: HookFrame, prior: ReturnType<typeof evaluateExpression>['nextState'] | null) => {
    const candidate = [...previous.candidate];
    const slot = candidate[0];
    if (slot?.kind !== 'state' || !Array.isArray(slot.value)) throw new Error('TaskApp items State slot changed');
    candidate[0] = { ...slot, value: rows };
    const next: HookFrame = { ...frame, mounting: false, previous: previous.candidate, candidate, index: 0, changedEffects: [] };
    return { frame: next, evaluation: evaluateExpression(renderWithHooks(next, TaskApp), prior, true) };
  };
  const initial = render(items, frame, null);
  const snapshot = initial.evaluation.snapshot;
  // Diff only needs a MountView. Create the normal preorder ref/child mapping without
  // calling either measured implementation or warming one planner during setup.
  const mountId = 'mount-paired';
  let ref = 0;
  const view = (vnode: VNode): ViewNode => ({ ref: `${mountId}/base/${++ref}`, vnode,
    children: vnode.kind === 'element' ? vnode.children.map(view) : [] });
  const base: MountView = { mountId, rootRef: `${mountId}/root`, revision: 1, snapshot, children: snapshot.children.map(view) };
  const target = (rows: readonly Task[]) => ({ base, target: render(rows, initial.frame, initial.evaluation.nextState).evaluation.snapshot });
  const swapped = [...items];
  [swapped[49], swapped[50]] = [swapped[50], swapped[49]];
  const A = target(items.map((item, i) => i === 49 ? { ...item, label: `${item.label} 변경` } : item));
  return { A, B: target(swapped), C: target([...items].reverse()), AA: A };
}

function listIndex(node: VNode) {
  if (node.kind !== 'element') throw new Error('Missing TaskApp root');
  const index = node.children.findIndex(child => child.kind === 'element' && child.tag === 'ul' && child.attrs.class === 'task-list');
  check(index >= 0, 'Missing TaskApp list');
  return index;
}

// Check each original object and its own property descriptors after each Diff. A
// replacement with equal data would still fail the reference check. Do not freeze
// the ViewNodes or otherwise change the fixture shapes to detect writes.
function unchanged(...roots: object[]) {
  const seen = new Map<object, ReturnType<typeof Object.getOwnPropertyDescriptors>>();
  function record(object: object) {
    if (seen.has(object)) return;
    const descriptors = Object.getOwnPropertyDescriptors(object);
    seen.set(object, descriptors);
    for (const descriptor of Object.values(descriptors)) {
      if (descriptor.value && typeof descriptor.value === 'object') record(descriptor.value);
    }
  }
  roots.forEach(record);
  return () => {
    for (const [object, before] of seen) {
      check(equalData(Reflect.ownKeys(object), Reflect.ownKeys(before)), 'Input keys changed');
      for (const key of Reflect.ownKeys(before)) {
        const expected = Reflect.get(before, key);
        const actual = Object.getOwnPropertyDescriptor(object, key);
        check(actual && Reflect.ownKeys(expected).every(field => Object.is(Reflect.get(expected, field), Reflect.get(actual, field))),
          `Input descriptor changed: ${String(key)}`);
      }
    }
  };
}

function checkView(a: ViewNode, b: ViewNode, target: VNode, old: ReadonlyMap<string, ViewNode>) {
  check(a.vnode === target && b.vnode === target, `Target VNode reference changed at ${a.ref}`);
  if (old.get(a.ref)?.vnode === target) check(a === old.get(a.ref) && b === a, `ViewNode reuse changed at ${a.ref}`);
  if (target.kind === 'element') target.children.forEach((child, i) => checkView(a.children[i], b.children[i], child, old));
}

function verify(audited: boolean) {
  const fixtures = prepare();
  const global = globalThis as typeof globalThis & { pairedPlannerAudit?: Audit };
  check(!global.pairedPlannerAudit && diffB0 !== diffC1, 'Unexpected function identity or audit state');
  return (['A', 'B', 'C'] as const).map(condition => {
    const { base, target } = fixtures[condition];
    const verifyInputs = unchanged(base, target, options);
    const list = base.children[0].children[listIndex(base.snapshot.children[0])];
    const nextIndex = listIndex(target.children[0]);
    const nextRows = ((target.children[0] as VElement).children[nextIndex] as VElement).children;
    const expectedOrder = Array.from({ length: rowCount }, (_, i) => i);
    if (condition === 'B') [expectedOrder[49], expectedOrder[50]] = [expectedOrder[50], expectedOrder[49]];
    if (condition === 'C') expectedOrder.reverse();
    check(list.children.length === rowCount && nextRows.length === rowCount, 'Fixture row count');
    nextRows.forEach((row, i) => {
      const oldRow = list.children[expectedOrder[i]].vnode;
      check(row.identity.key === oldRow.identity.key && row.identity.boundaries.length === 1 &&
        row.identity.boundaries[0].type === oldRow.identity.boundaries[0].type &&
        (row === oldRow) === !(condition === 'A' && i === 49), `${condition}: row identity ${i}`);
    });
    const auditedDiff = (name: keyof Audit, diff: typeof diffB0) => {
      const calls: Audit = { B0: [], C1: [] };
      if (audited) global.pairedPlannerAudit = calls;
      try {
        const plan = unwrap(diff(base, target, options));
        verifyInputs();
        const other = name === 'B0' ? 'C1' : 'B0';
        check(!audited || (calls[name].filter(length => length === rowCount).length === 1 && !calls[other].length),
          `${condition}: wrong planner for ${name}`);
        return { plan, calls: calls[name] };
      } finally { delete global.pairedPlannerAudit; }
    };
    const baseline = auditedDiff('B0', diffB0);
    const candidate = auditedDiff('C1', diffC1);
    const a = baseline.plan, b = candidate.plan;
    // Same full-plan differential as the integration test, with reference checks
    // added for the target, VNodes and reused view entries. equalData uses Object.is
    // for functions, so handler and boundary function identities are preserved.
    check(equalData(a, b) && a.target === target && b.target === target && a.nextView.snapshot === target && b.nextView.snapshot === target,
      `${condition}: PatchPlan mismatch`);
    const old = new Map<string, ViewNode>();
    function remember(node: ViewNode) { old.set(node.ref, node); node.children.forEach(remember); }
    base.children.forEach(remember);
    target.children.forEach((child, i) => checkView(a.nextView.children[i], b.nextView.children[i], child, old));

    // Replay the row placements against the old array as in the integration oracle.
    const model = list.children.map(row => row.ref);
    const moves = a.operations.filter(op => op.kind === 'PLACE_BEFORE' && op.parent === list.ref);
    const decision = a.reconciliations.find(entry => entry.parent === list.ref);
    const expectedMoves = { A: 0, B: 1, C: 99 }[condition];
    check(moves.length === expectedMoves && decision?.moves === expectedMoves && decision.usedLIS === (condition !== 'A') &&
      decision.inserts === 0 && decision.removes === 0 && decision.reused === rowCount, `${condition}: list reconciliation`);
    for (const op of moves) {
      if (op.kind !== 'PLACE_BEFORE' || op.placement !== 'move' || !model.includes(op.node)) throw new Error('Invalid move');
      model.splice(model.indexOf(op.node), 1);
      const at = op.anchor === null ? model.length : model.indexOf(op.anchor);
      check(at >= 0, 'Anchor is not placed');
      model.splice(at, 0, op.node);
    }
    const expectedRefs = expectedOrder.map(index => list.children[index].ref);
    check(equalData(model, expectedRefs) && equalData(a.nextView.children[0].children[nextIndex].children.map(row => row.ref), expectedRefs),
      `${condition}: matching or placement order`);
    check(a.operations.some(op => op.kind === 'SYNC_FORM') === (condition === 'A'), `${condition}: form update`);
    return { condition, operations: a.operations.map(op => op.kind), decision, visitedNodes: a.visitedNodes,
      reusedSubtrees: a.reusedSubtrees, plannerCalls: { B0: baseline.calls, C1: candidate.calls } };
  });
}

let sink = 0;
function batch(diff: typeof diffB0, { base, target }: Fixture) {
  const start = performance.now();
  for (let i = 0; i < batchSize; i++) {
    const result = diff(base, target, options);
    if (!result.ok) unwrap(result);
    else sink += result.value.operations.length;
  }
  return performance.now() - start;
}

let fixtures: ReturnType<typeof prepare>;
function pair(condition: Condition, sample: number, deadlineMs: number) {
  if (performance.timeOrigin + performance.now() >= deadlineMs) return null;
  const fixture = fixtures[condition];
  const right = condition === 'AA' ? diffB0 : diffC1;
  const first = sample % 2 === 0 ? 'B0' : condition === 'AA' ? 'B0-repeat' : 'C1';
  const leftFirst = first === 'B0';
  const firstMs = batch(leftFirst ? diffB0 : right, fixture);
  const secondMs = batch(leftFirst ? right : diffB0, fixture);
  return { pair: sample, first, batchSize, b0Ms: leftFirst ? firstMs : secondMs, otherMs: leftFirst ? secondMs : firstMs, sink };
}

Object.assign(window, { pairedDiff: { verify, prepare: () => { fixtures = prepare(); }, pair } });
