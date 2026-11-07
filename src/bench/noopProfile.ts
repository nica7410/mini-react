// Injected ONLY into the separate diagnostic build. Final timings use uninstrumented engines.
interface Frame { name: string; start: number; child: number }
export const profile = {
  enabled: false,
  rows: {} as Record<string, { calls: number; inclusiveMs: number; selfMs: number }>,
  stack: [] as Frame[],
  reset(enabled: boolean) { this.enabled = enabled; this.rows = {}; this.stack = []; },
  span<T>(name: string, action: () => T): T {
    if (!this.enabled || this.stack.some(frame => frame.name === name)) return action();
    const frame = { name, start: performance.now(), child: 0 }; this.stack.push(frame);
    try { return action(); }
    finally {
      const elapsed = performance.now() - frame.start; this.stack.pop();
      const row = this.rows[name] ??= { calls: 0, inclusiveMs: 0, selfMs: 0 };
      row.calls++; row.inclusiveMs += elapsed; row.selfMs += elapsed - frame.child;
      const parent = this.stack.at(-1); if (parent) parent.child += elapsed;
    }
  },
};
