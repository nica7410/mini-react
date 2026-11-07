import { afterEach, expect, test } from 'vitest';
import { noopPaths, runNoop } from '../../src/bench/noop';

afterEach(() => { document.body.replaceChildren(); });
for (const payload of ['light', 'stateful'] as const) for (const path of noopPaths) {
  test(`no-op comparison oracle/counts: ${payload}/${path}`, async () => {
    const output = document.createElement('div'); document.body.append(output);
    const sample = await runNoop({ path, payload, size: 10, mode: 'counts', seed: 539365639 }, output);
    expect(sample.validation.checkedRows).toBe(10);
    expect(sample.counts?.movedRoots).toBe(path === 'reorder' ? 1 : 0);
    expect(sample.counts?.propertyWrites).toBe(['dirty-controlled', 'form-update'].includes(path) ? 1 : 0);
    expect(sample.counts?.createdNodes).toBe(0);
    expect(sample.counts?.removedNodes).toBe(0);
    expect(sample.counts?.childExecutions).toBe(0);
    expect(sample.counts?.rootExecutions).toBe(['memo-unrelated', 'form-update'].includes(path) ? 1 : 0);
    expect(sample.timings).toBeNull(); expect(sample.profile).toBeNull();
    expect(output.childNodes.length).toBe(0);
  });
}
