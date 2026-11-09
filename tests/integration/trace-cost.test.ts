import { afterEach, expect, it, vi } from 'vitest';
import { TraceRecorder } from '../../src/observe/recorder';
import { createInspector } from '../../src/observe/inspector';
import { createMount, disposeMount } from '../../src/core/mount';
import { diff } from '../../src/core/reconcile';
import { applySnapshot } from '../../src/core/patch';
import { resolveExpression } from '../../src/runtime/resolve';
import { FunctionComponent, h, useMemo, useState } from '../../src/runtime';
import type { StateSetter } from '../../src/core/types';
import { container } from '../fixtures/helpers';

const rows = (count: number, label = 'row') => h('ul', null, ...Array.from({ length: count }, (_, i) => h('li', { key: i }, h('span', null, `${label} ${i}`))));
const frame = () => new Promise<void>(resolve => requestAnimationFrame(() => resolve()));

afterEach(() => { document.body.replaceChildren(); vi.restoreAllMocks(); });

it('T-Q03: with recording off, no trace event or detailed snapshot is requested and output is unchanged', async () => {
  const outputs: string[] = [];
  for (const recording of [true, false]) {
    const recorder = new TraceRecorder(); recorder.enabled = recording;
    const emit = vi.spyOn(recorder, 'emit');
    // Patch builds its identity Map and VDOM snapshots only for detailed sinks.
    expect(recorder.detailed).toBe(recording);
    let set!: StateSetter<number>;
    function Row(props: { n: number }) { return h('span', null, props.n); }
    const output = container(), root = new FunctionComponent(() => {
      const [n, setter] = useState(0); set = setter;
      const list = useMemo(() => h('ul', null, h(Row, { n: 1, key: 'a' })), []);
      return h('div', null, h('button', { events: { click: () => set(v => v + 1) } }, n), list);
    }, {}, output, { trace: recorder });
    root.mount(); emit.mockClear();
    output.querySelector('button')!.click(); await Promise.resolve();
    outputs.push(output.innerHTML);
    if (recording) {
      expect(emit.mock.calls.map(([event]) => event.phase)).toEqual(['event', 'enqueue', 'render', 'memo', 'component', 'diff', 'patch']);
      expect(recorder.runs.at(-1)!.events.find(event => event.phase === 'patch')!.detail.identity).toBeDefined();
    } else {
      expect(emit).not.toHaveBeenCalled();
    }
    root.unmount();
  }
  expect(outputs[0]).toBe(outputs[1]);
});

it('T-Q03: a sink without `enabled` still records; `enabled: false` sinks receive nothing from patch', () => {
  const plain = { events: [] as string[], emit(event: { phase: string }) { this.events.push(event.phase); } };
  const off = { enabled: false, detailed: true, emit: vi.fn() };
  for (const sink of [plain, off]) {
    const mount = createMount(container(), sink);
    applySnapshot(mount, diff(mount.view, resolveExpression(rows(3))));
    disposeMount(mount);
  }
  expect(plain.events).toEqual(['diff', 'patch']);
  expect(off.emit).not.toHaveBeenCalled();
});

it('T-Q03: the Inspector builds collapsed VDOM trees only when opened and keeps content for an unchanged run', async () => {
  const panel = container(), app = container();
  const recorder = createInspector(panel, () => [mount]);
  const mount = createMount(app, recorder);
  applySnapshot(mount, diff(mount.view, resolveExpression(rows(300))));
  await frame();
  const collapsed = panel.querySelectorAll('*').length;
  expect(panel.querySelector('.trace-tree')).toBeNull();
  expect(collapsed).toBeLessThan(400);
  // The open Patch list is built eagerly (create + insert for the first mount).
  expect(panel.querySelectorAll('.patch-list li')).toHaveLength(2);
  const summary = panel.querySelector('[data-testid="inspector-summary"]');
  // Another frame with no new events keeps the same DOM.
  recorder.emit({ mountId: 'other', phase: 'render', causeIds: [], detail: {} }); await frame();
  expect(panel.querySelector('[data-testid="inspector-summary"]')).toBe(summary);
  const after = [...panel.querySelectorAll('details')].find(details => details.querySelector('summary')!.textContent === '이후 VDOM')!;
  after.open = true; after.dispatchEvent(new Event('toggle'));
  const tree = after.querySelector('.trace-tree')!;
  expect(tree.children).toHaveLength(1);
  const ul = tree.querySelector('details')!; ul.open = true; ul.dispatchEvent(new Event('toggle'));
  expect(ul.querySelectorAll(':scope > .trace-tree > li')).toHaveLength(300);
  expect(ul.querySelector('pre')!.textContent).toContain('"tag": "ul"');
  // A new run replaces the content.
  applySnapshot(mount, diff(mount.view, resolveExpression(rows(300, 'next'))));
  await frame();
  expect(panel.querySelector('[data-testid="inspector-summary"]')).not.toBe(summary);
  disposeMount(mount);
});
