import { expect, it } from 'vitest';
import { runBenchmark } from '../../src/bench/harness';
import { distribution } from '../../src/bench/statistics';
import { container } from '../fixtures/helpers';

it('T-Q03: every variant starts from the same old state and trace is absent in timing mode', async () => {
  const output = container();
  const base = { axis: 'keyed', size: 8, payload: 'stateful', scenario: 'last-to-front', seed: 539365639 } as const;
  const greedy = await runBenchmark({ ...base, variant: 'greedy', mode: 'counts' }, output);
  const lis = await runBenchmark({ ...base, variant: 'lis', mode: 'counts' }, output);
  expect(greedy.counts?.movedRoots).toBe(7); expect(lis.counts?.movedRoots).toBe(1);
  expect(greedy.validation).toEqual(lis.validation); expect(lis.validation.reusedRoots).toBe(8); expect(output.childNodes).toHaveLength(0);
  const timed = await runBenchmark({ ...base, variant: 'lis', mode: 'timing' }, output);
  expect(timed.counts).toBeNull(); expect(lis.timings).toBeNull(); expect(timed.validation).toEqual(lis.validation);
  expect(Object.values(timed.timings!).every(value => value >= 0)).toBe(true);
});

it('T-Q03: batching/reuse vary exactly one axis and count actual root/child/effect executions', async () => {
  const base = { size: 10, payload: 'light', scenario: 'noop', seed: 539365639, mode: 'counts' } as const;
  const sync = await runBenchmark({ ...base, axis: 'batching', variant: 'sync' }, container());
  const micro = await runBenchmark({ ...base, axis: 'batching', variant: 'microtask' }, container());
  expect(sync.counts).toMatchObject({ commits: 3, rootExecutions: 3, effectSetups: 3, childExecutions: 0 });
  expect(micro.counts).toMatchObject({ commits: 1, rootExecutions: 1, effectSetups: 1, childExecutions: 0 });
  const off = await runBenchmark({ ...base, axis: 'reuse', variant: 'off' }, container());
  const on = await runBenchmark({ ...base, axis: 'reuse', variant: 'on' }, container());
  expect(off.validation).toEqual(on.validation); expect(off.counts?.childExecutions).toBe(1); expect(on.counts?.childExecutions).toBe(0);
  expect(off.counts?.effectSetups).toBe(on.counts?.effectSetups); expect(off.counts!.visitedNodes).toBeGreaterThan(on.counts!.visitedNodes);
});

it('statistics retain all samples and compute linearly interpolated median/IQR/p95', () => {
  expect(distribution([4, 0, 3, 1, 2])).toEqual({ n: 5, median: 2, q1: 1, q3: 3, iqr: 2, p95: 3.8, min: 0, max: 4 });
  expect(distribution([7])).toMatchObject({ n: 1, median: 7, iqr: 0, p95: 7 });
  expect(() => distribution([])).toThrow();
});
