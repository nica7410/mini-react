import { describe, expect, it } from 'vitest';
import { createTaskBenchmark } from '../../src/bench/task-app';
import { initialTaskModel, taskWorkloads } from '../../src/bench/task-model';

describe('actual TaskApp measurement adapter and oracle', () => {
  it.each(taskWorkloads)('%s keeps real State, forms, order, identity and async sync consistent', async workload => {
    const output = document.createElement('section'); document.body.append(output);
    const app = await createTaskBenchmark({ size: 10, seed: 539365639, mode: 'counts' }, output);
    try {
      expect(app.initialization.validation.stateRows).toBe(10);
      const before = output.querySelector('li');
      const first = await app.step(workload, 0), second = await app.step(workload, 1);
      expect(first.actions.every(row => row.timings === null)).toBe(true);
      expect(second.actions.at(-1)!.validation.stateRows).toBe(10);
      if (['draft', 'counter', 'dirty', 'equal'].includes(workload)) expect(output.querySelector('li')).toBe(before);
      if (workload === 'dirty') {
        expect(first.actions[0].counts!.total.rootExecutions).toBe(0);
        expect(first.actions[0].counts!.total.propertyWrites).toBe(1);
      }
      if (workload === 'counter') {
        expect(second.actions[0].validation.counter).toBe(6);
        expect(first.actions[0].counts!.primary.rootExecutions).toBe(1);
        // The adapter mounts the default A0 app; A1 row skipping is tested in task-reuse.
        expect(first.actions[0].counts!.primary.taskRowExecutions).toBe(10);
      }
    } finally { app.dispose(); output.remove(); }
    expect(output.childNodes.length).toBe(0);
  });
  it('records render and real Effect followups without summing nested intervals', async () => {
    const output = document.createElement('section'); document.body.append(output);
    const app = await createTaskBenchmark({ size: 10, seed: 539365639, mode: 'timing' }, output);
    try {
      const result = await app.step('crud', 0);
      expect(result.actions.map(row => row.action.kind)).toEqual(['draft', 'add', 'rename', 'toggle', 'delete']);
      for (const row of result.actions) {
        expect(row.counts).toBeNull();
        expect(row.timings!.totalCpuMs).toBeCloseTo(row.timings!.primaryMs + row.timings!.followupCpuMs, 6);
      }
      expect(result.actions[1].followups).toHaveLength(1);
      expect(result.actions[1].validation.syncedTotal).toBe(11);
      expect(result.actions.at(-1)!.validation.syncedTotal).toBe(10);
    } finally { app.dispose(); output.remove(); }
  });
  it('uses repeatable, nontrivial initial tasks without aliasing fixture objects', () => {
    const a = initialTaskModel(100, 1), b = initialTaskModel(100, 1), c = initialTaskModel(100, 2);
    expect(a).toEqual(b); expect(a.items).not.toBe(b.items);
    expect(a.items.map(row => row.label)).not.toEqual(c.items.map(row => row.label));
    expect(new Set(a.items.map(row => row.id)).size).toBe(100);
    expect(a.items.filter(row => row.done)).toHaveLength(34);
  });
});
