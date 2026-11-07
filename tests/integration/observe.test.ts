import { expect, it, vi } from 'vitest';
import { TraceRecorder, traceData } from '../../src/observe/recorder';
import { createMount, disposeMount } from '../../src/core/mount';
import { diff } from '../../src/core/reconcile';
import { applySnapshot } from '../../src/core/patch';
import { resolveExpression } from '../../src/runtime/resolve';
import { FunctionComponent, h, useEffect, useState } from '../../src/runtime';
import { makeFixture, parseFixture, rowsExpression } from '../../src/bench/fixtures';
import { container } from '../fixtures/helpers';

it('T-Q01: actual host moves, planned refs/anchors and recorded reused objects agree', () => {
  const recorder = new TraceRecorder(), output = container(), mount = createMount(output, recorder);
  const fixture = makeFixture(8, 'last-to-front', 539365639, 'stateful');
  applySnapshot(mount, diff(mount.view, resolveExpression(rowsExpression(fixture.oldRows, fixture.payload)))); recorder.clear();
  const oldNodes = [...output.querySelectorAll('li')], parent = output.firstElementChild!;
  const insert = vi.spyOn(parent, 'insertBefore');
  const result = applySnapshot(mount, diff(mount.view, resolveExpression(rowsExpression(fixture.newRows, fixture.payload))));
  expect(result).toMatchObject({ status: 'committed', counters: { movedRoots: 1, createdNodes: 0 } });
  expect(insert).toHaveBeenCalledTimes(1); expect(insert.mock.calls[0]).toEqual([oldNodes[7], oldNodes[0]]);
  const run = recorder.runs[0], plan = run.events.find(e => e.phase === 'diff')!.detail;
  const op = (plan.patches as any[]).find(op => op.kind === 'PLACE_BEFORE');
  expect(mount.nodes.get(op.node)).toBe(oldNodes[7]); expect(mount.nodes.get(op.anchor)).toBe(oldNodes[0]);
  const recorded = run.events.find(e => e.phase === 'patch')!.detail;
  expect(recorded.movedRoots).toBe(insert.mock.calls.length); expect((recorded.identity as any[]).every(item => item.reused)).toBe(true);
  expect(JSON.parse(recorder.export()).runs).toHaveLength(1); disposeMount(mount);
});

it('T-Q02: ring keeps only 100 runs and caps pending events without retaining DOM/handlers', () => {
  const recorder = new TraceRecorder(100, 3), output = container(), mount = createMount(output, recorder);
  for (let i = 0; i < 105; i++) {
    for (let j = 0; j < 6; j++) recorder.emit({ mountId: mount.id, phase: 'render', causeIds: [], detail: { dom: output, event: new Event('input'), handler: () => undefined } });
    applySnapshot(mount, diff(mount.view, resolveExpression(h('p', null, i))));
  }
  expect(recorder.runs).toHaveLength(100); expect(recorder.runs[0].id).toBe(6);
  expect(recorder.runs.every(run => run.omittedEvents === 3 && run.events.length === 5)).toBe(true);
  const text = recorder.export(); expect(text).toContain('[DOM DIV]'); expect(text).toContain('[Event input]');
  const cyclic: any = {}; cyclic.self = cyclic; expect(traceData(cyclic)).toEqual({ self: '[circular]' });
  disposeMount(mount); recorder.clear(); expect(recorder.runs).toHaveLength(0);
});

it('T-Q01/T-Q02: event cause, enqueue, Memo/commit and Effects are actual traces; trace off gives same output', async () => {
  const outputs: string[] = [];
  for (const recording of [true, false]) {
    const recorder = new TraceRecorder(); recorder.enabled = recording;
    const output = container(), root = new FunctionComponent(() => {
      const [n, set] = useState(0); useEffect(() => () => undefined, [n]);
      return h('button', { events: { click: () => set(v => v + 1) } }, n);
    }, {}, output, { trace: recorder }); root.mount(); recorder.clear();
    output.querySelector('button')!.click(); await Promise.resolve(); outputs.push(output.innerHTML);
    if (recording) {
      const events = recorder.runs[0].events;
      expect(events.map(e => e.phase)).toEqual(['event', 'enqueue', 'render', 'diff', 'patch', 'effect-cleanup', 'effect-setup']);
      expect(events.slice(1).every(e => e.causeIds[0] === events[0].causeIds[0])).toBe(true);
    } else expect(recorder.runs).toHaveLength(0);
    root.unmount();
  }
  expect(outputs[0]).toBe(outputs[1]);
});

it('T-Q02: seed and exported fixture reproduce exact input; invalid/duplicate keys are rejected', () => {
  const fixture = makeFixture(100, 'mixed', 539365639, 'stateful');
  expect(makeFixture(100, 'mixed', 539365639, 'stateful')).toEqual(fixture);
  expect(parseFixture(JSON.stringify(fixture))).toEqual(fixture);
  expect(() => parseFixture(JSON.stringify({ ...fixture, newRows: [fixture.newRows[0], fixture.newRows[0]] }))).toThrow(/key/);
});
