import type { CommitResult, MountHandle, TraceEvent, TraceSink } from '../core/types';
import { createMount, disposeMount } from '../core/mount';
import { diff } from '../core/reconcile';
import { applySnapshot, emptyCounters } from '../core/patch';
import { FunctionComponent, h, useEffect, useMemo, useState } from '../runtime';
import { resolveExpression } from '../runtime/resolve';
import type { RuntimeMeasurement } from '../runtime/FunctionComponent';
import { makeFixture, rowsExpression } from './fixtures';
import type { Payload } from './fixtures';
import { profile } from './noopProfile';

export const noopPaths = ['same-ref', 'equal-fresh', 'memo-unrelated', 'dirty-controlled', 'reorder', 'form-update'] as const;
export interface NoopInput { path: typeof noopPaths[number]; size: number; payload: Payload; mode: 'counts' | 'timing' | 'profile'; seed: number }
const ensure = (condition: unknown, message: string): void => { if (!condition) throw new Error(message); };
function accepted(result: CommitResult | undefined) {
  ensure(result?.status === 'committed' || result?.status === 'noop', `Commit failed: ${JSON.stringify(result)}`);
}
export async function runNoop(input: NoopInput, output: HTMLElement) {
  ensure(noopPaths.includes(input.path), 'Unknown path');
  const runtime = ['memo-unrelated', 'dirty-controlled', 'form-update'].includes(input.path);
  const fixture = makeFixture(input.size, input.path === 'reorder' ? 'last-to-front' : 'noop', input.seed, input.payload);
  const events: TraceEvent[] = [];
  const trace: TraceSink | undefined = input.mode === 'counts' ? { emit: event => events.push(event) } : undefined;
  const timings = { expressionMs: 0, renderMs: 0, diffMs: 0, commitMs: 0, flushMs: 0, effectMs: 0, scheduledCycleMs: 0 };
  let mount: MountHandle | undefined, root: FunctionComponent<{}> | undefined, update!: () => void;
  let collecting = false, effectSetups = 0, effectCleanups = 0;
  let generationProfile: typeof profile.rows = {};
  profile.reset(false);
  try {
    let target;
    if (runtime) {
      const List = () => rowsExpression(fixture.oldRows, fixture.payload);
      root = new FunctionComponent(() => {
        const [n, set] = useState(0);
        update = () => set(input.path === 'dirty-controlled' ? 0 : 1);
        const expression = useMemo(() => h(List, {}), []);
        useEffect(() => { effectSetups++; return () => { effectCleanups++; }; }, [n]);
        return h('div', null, expression,
          h('input', { attrs: { 'aria-label': 'controlled-probe' }, form: { mode: 'controlled', value: input.path === 'form-update' ? String(n) : 'fixed' } }),
          h('output', null, n));
      }, {}, output, { trace, reconcile: 'lis', onMeasure: input.mode !== 'counts' ? (sample: RuntimeMeasurement) => {
        if (collecting) Object.assign(timings, sample);
      } : undefined });
      accepted(root.mount()); mount = root.host;
    } else {
      mount = createMount(output, trace);
      const old = resolveExpression(rowsExpression(fixture.oldRows, fixture.payload));
      accepted(applySnapshot(mount, diff(mount.view, old, { strategy: 'lis' })));
      profile.reset(input.mode === 'profile');
      const start = performance.now();
      target = input.path === 'same-ref' ? old : resolveExpression(rowsExpression(fixture.newRows, fixture.payload));
      timings.expressionMs = input.path === 'same-ref' ? 0 : performance.now() - start;
      generationProfile = profile.rows; profile.reset(false);
    }
    const previous = new Map<string, Element>();
    output.querySelectorAll('li').forEach((node, i) => {
      ensure(node.getAttribute('data-id') === fixture.oldRows[i].id, 'Initial order mismatch');
      previous.set(fixture.oldRows[i].id, node);
      if (input.payload === 'stateful') {
        const [text, checkbox] = node.querySelectorAll('input'); text.value = `typed:${fixture.oldRows[i].id}`; checkbox.checked = true;
      }
    });
    ensure(previous.size === input.size, 'Initial size mismatch');
    const control = output.querySelector<HTMLInputElement>('[aria-label="controlled-probe"]');
    if (input.path === 'dirty-controlled') {
      control!.value = 'dirty native value';
      const ref = mount.refs.get(control!); ensure(ref, 'Missing controlled binding');
      // Isolate the already-observed dirty-input flush; native event ordering has separate browser tests.
      mount.dirtyForms.set(ref!, ++mount.inputSequence);
    }
    events.length = 0; effectSetups = effectCleanups = 0;
    profile.reset(input.mode === 'profile'); collecting = true;
    let coreResult: CommitResult | undefined;
    const start = performance.now();
    if (runtime) {
      update(); await Promise.resolve();
    } else {
      const plan = diff(mount.view, target!, { strategy: 'lis' }); const diffEnd = performance.now();
      coreResult = applySnapshot(mount, plan); const end = performance.now();
      timings.diffMs = diffEnd - start; timings.commitMs = end - diffEnd; timings.flushMs = end - start;
    }
    timings.scheduledCycleMs = performance.now() - start; collecting = false;
    const cycleProfile = profile.rows; profile.reset(false);
    if (!runtime) accepted(coreResult);
    if (runtime) accepted(root!.lastResult);
    const expected = fixture.newRows, nodes = output.querySelectorAll('li');
    ensure(nodes.length === expected.length, 'Final size mismatch');
    nodes.forEach((node, i) => {
      const row = expected[i];
      ensure(node === previous.get(row.id), `Identity/order mismatch ${row.id}`);
      ensure(node.getAttribute('data-version') === String(row.version) && node.querySelector('span')?.textContent === row.label, `Host data mismatch ${row.id}`);
      if (input.payload === 'stateful') {
        const [text, checkbox] = node.querySelectorAll('input');
        ensure(text.value === `typed:${row.id}` && checkbox.checked, `Uncontrolled input lost ${row.id}`);
      }
    });
    if (runtime) {
      ensure(output.querySelector('output')?.textContent === (input.path === 'dirty-controlled' ? '0' : '1'), 'State mismatch');
      ensure(control!.value === (input.path === 'form-update' ? '1' : 'fixed'), 'Controlled value mismatch');
      ensure(effectSetups === (input.path === 'dirty-controlled' ? 0 : 1) && effectCleanups === effectSetups, 'Effect semantics mismatch');
      ensure(mount.dirtyForms.size === 0, 'Dirty input was not acknowledged');
    }
    const counts: Record<string, number> = { ...emptyCounters(), visitedNodes: 0, reusedSubtrees: 0, commits: 0, rootExecutions: 0, childExecutions: 0, effectSetups, effectCleanups };
    for (const event of events) {
      if (event.phase === 'patch') { counts.commits++; for (const key of Object.keys(emptyCounters())) counts[key] += Number(event.detail[key] ?? 0); }
      if (event.phase === 'diff') { counts.visitedNodes += Number(event.detail.visitedNodes); counts.reusedSubtrees += Number(event.detail.reusedSubtrees); }
      if (event.phase === 'render') counts.rootExecutions++;
      if (event.phase === 'component' && !event.detail.reused) counts.childExecutions++;
    }
    return { input, timings: input.mode === 'counts' ? null : timings, counts: trace ? counts : null,
      profile: input.mode === 'profile' ? { generation: generationProfile, cycle: cycleProfile } : null,
      validation: { checkedRows: nodes.length, retainedIdentities: previous.size, controlled: control?.value, effectSetups, effectCleanups },
      visibility: document.visibilityState, focused: document.hasFocus() };
  } finally {
    profile.reset(false);
    if (root) root.unmount(); else if (mount) disposeMount(mount);
    ensure(output.childNodes.length === 0, 'Unmount left DOM nodes');
    ensure(!mount || (mount.nodes.size === 0 && mount.dirtyForms.size === 0 && mount.composing.size === 0), 'Unmount left resources');
  }
}
Object.assign(window, { noopBenchmark: { run: (input: NoopInput) => runNoop(input, document.getElementById('benchmark-output')!) } });
