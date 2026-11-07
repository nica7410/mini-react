import { expect, test } from './fixtures';

test('T-K01~K03: Chromium의 seed 200개에서 두 전략의 순서·identity·uncontrolled 입력 보존', async ({ page }) => {
  test.info().annotations.push({ type: 'seed', description: '539365639, 200 input pairs, each greedy/lis, 0..30 nodes' });
  await page.goto('/');
  const result = await page.evaluate(async () => {
    const runtimePath = '/src/runtime/index.ts', resolvePath = '/src/runtime/resolve.ts', mountPath = '/src/core/mount.ts', diffPath = '/src/core/reconcile.ts', patchPath = '/src/core/patch.ts';
    const { h } = await import(runtimePath), { resolveExpression } = await import(resolvePath);
    const { createMount, disposeMount } = await import(mountPath), { diff } = await import(diffPath), { commit } = await import(patchPath);
    let state = 539365639;
    const random = () => { state ^= state << 13; state ^= state >>> 17; state ^= state << 5; return (state >>> 0) / 0x100000000; };
    const generate = () => {
      const keys = Array.from({ length: 30 }, (_, i) => String(i));
      for (let i = keys.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [keys[i], keys[j]] = [keys[j], keys[i]]; }
      return keys.slice(0, Math.floor(random() * 31)).map(key => ({ key, tag: random() < 0.5 ? 'li' : 'div' }));
    };
    let runs = 0;
    for (let sample = 0; sample < 200; sample++) {
      const old = generate(), next = generate();
      for (const strategy of ['greedy', 'lis']) {
        const output = document.createElement('div'); document.body.append(output); const mount = createMount(output);
        const tree = (items: { key: string; tag: string }[], version: string) => resolveExpression(h('ul', null, ...items.map(item => h(item.tag, { key: item.key, attrs: { 'data-key': item.key } },
          h('input', { form: { mode: 'uncontrolled', defaultValue: `initial-${item.key}` } }), h('span', null, `${item.key}:${version}`),
        ))));
        const apply = (snapshot: unknown) => { const plan = diff(mount.view, snapshot, { strategy }); if (!plan.ok) throw new Error(JSON.stringify(plan)); const result = commit(mount, plan.value); if (!['committed', 'noop'].includes(result.status)) throw new Error(JSON.stringify(result)); };
        try {
          apply(tree(old, 'old'));
          const before = new Map(Array.from(output.querySelectorAll<HTMLElement>('[data-key]'), node => [node.dataset.key!, node]));
          for (const [key, node] of before) node.querySelector('input')!.value = `typed-${key}`;
          apply(tree(next, 'new'));
          const children = Array.from(output.querySelector('ul')!.children) as HTMLElement[];
          if (children.map(node => node.dataset.key).join(',') !== next.map(item => item.key).join(',')) throw new Error('order');
          next.forEach((item, i) => {
            const previous = before.get(item.key), survived = previous?.localName === item.tag;
            if (survived ? children[i] !== previous : children[i] === previous) throw new Error('identity');
            if (children[i].querySelector('input')!.value !== `${survived ? 'typed' : 'initial'}-${item.key}`) throw new Error('uncontrolled value');
            if (children[i].textContent !== `${item.key}:new`) throw new Error('text');
          });
          runs++;
        } catch (error) { throw new Error(JSON.stringify({ seed: 539365639, sample, strategy, old, next, error: String(error) })); }
        finally { disposeMount(mount); output.remove(); }
      }
    }
    return { samples: 200, runs };
  });
  expect(result).toEqual({ samples: 200, runs: 400 });
});
