import { describe, expect, it, vi } from 'vitest';
import { FunctionComponent, h, useEffect, useMemo, useState } from '../../src/runtime';
import type { StateSetter, TraceEvent } from '../../src/core/types';
import { container } from '../fixtures/helpers';

describe('P2-01 / 루트와 공통 엔진', () => {
  it('T-C01: mount/update는 공통 diff/patch를 통과하고 기존 host를 재사용한다', () => {
    const output = container(), events: TraceEvent[] = [];
    let label = 'A';
    const root = new FunctionComponent(() => h('p', null, label), {}, output, { trace: { emit: event => events.push(event) } });
    expect(root.mount().status).toBe('committed');
    const p = output.firstChild;
    label = 'B'; root.update();
    expect(output.textContent).toBe('B'); expect(output.firstChild).toBe(p);
    expect(events.map(e => e.phase)).toEqual(['render', 'diff', 'patch', 'render', 'diff', 'patch']);
    expect(events.filter(e => e.phase === 'patch')[1].detail).toMatchObject({ createdNodes: 0, textWrites: 1 });
    expect(() => root.mount()).toThrow(/한 번/);
    root.unmount(); expect(output.childNodes).toHaveLength(0);
  });
  it('T-C02: 동일 순수 자식 함수의 서로 다른 위치는 props로 독립 평가한다', () => {
    const Child = (props: { label: string }) => h('p', null, props.label);
    let second = 'B';
    const output = container(), root = new FunctionComponent(() => h('div', null, h(Child, { label: 'A' }), h(Child, { label: second })), {}, output);
    root.mount(); const nodes = output.querySelectorAll('p'); second = 'C'; root.update();
    expect(output.textContent).toBe('AC'); expect(nodes[0]).toBe(output.querySelectorAll('p')[0]);
    expect(nodes[0]).not.toBe(nodes[1]); expect(root.hooks).toHaveLength(0);
  });
  it('T-C03: 루트 밖/자식 Hook 사용을 거절하고 실패한 렌더를 commit하지 않는다', () => {
    expect(() => useState(0)).toThrow(/루트/);
    const BadChild = () => { useState(0); return h('p', null, 'bad'); };
    const output = container(), root = new FunctionComponent(() => h(BadChild, {}), {}, output);
    expect(root.mount().status).toBe('rejected'); expect(output.childNodes).toHaveLength(0);
  });
  it.each(['count', 'kind'])('T-C03: Hook %s 변경은 기존 commit을 보존한다', mode => {
    let invalid = false;
    const output = container(), root = new FunctionComponent(() => {
      useState(1);
      if (!invalid) useMemo(() => 2, []);
      else if (mode === 'kind') useState(2);
      return h('p', null, invalid ? 'bad' : 'good');
    }, {}, output);
    root.mount(); invalid = true; root.update();
    expect(root.lastResult!.status).toBe('rejected'); expect(output.textContent).toBe('good');
    expect(root.hooks).toHaveLength(2);
  });
  it('컴포넌트 경계 type/반환 host key 변경은 같은 tag여도 교체한다', () => {
    let key = 'a';
    const A = () => h('p', { key }, 'A'), B = () => h('p', { key }, 'B');
    let child = A;
    const output = container(), root = new FunctionComponent(() => h(child, { key: 'outer' }), {}, output);
    root.mount(); const first = output.firstChild; key = 'b'; root.update();
    expect(output.firstChild).not.toBe(first); const second = output.firstChild;
    child = B; root.update(); expect(output.firstChild).not.toBe(second);
  });
});

describe('State 슬롯 / M1 동기 갱신', () => {
  it('T-S01: 여러 슬롯의 값/setter identity는 재렌더 뒤에도 정확하다', () => {
    const output = container();
    let setCount!: StateSetter<number>, setLabel!: StateSetter<string>;
    const root = new FunctionComponent(() => {
      const [count, countSetter] = useState(0), [label, labelSetter] = useState('A');
      setCount = countSetter; setLabel = labelSetter;
      return h('p', null, `${label}:${count}`);
    }, {}, output);
    root.mount(); const countSetter = setCount, labelSetter = setLabel;
    countSetter(value => value + 1); labelSetter('B'); countSetter(value => value + 2);
    expect(output.textContent).toBe('B:3'); expect(setCount).toBe(countSetter); expect(setLabel).toBe(labelSetter);
    expect(root.hooks.filter(s => s.kind === 'state').map(s => s.value)).toEqual([3, 'B']);
  });
  it('T-S02: lazy initializer 1회와 함수 값 저장', () => {
    const initialize = vi.fn(() => () => 'first');
    let set!: StateSetter<() => string>;
    const output = container(), root = new FunctionComponent(() => {
      const [fn, setter] = useState<() => string>(initialize); set = setter; return h('p', null, fn());
    }, {}, output);
    root.mount(); root.update(); set(() => () => 'second');
    expect(initialize).toHaveBeenCalledTimes(1); expect(output.textContent).toBe('second');
  });
  it('M1 동기 기준: 함수형 +1 세 번은 +3이며 commit은 세 번이다', () => {
    let set!: StateSetter<number>;
    const output = container(), root = new FunctionComponent(() => { const [n, s] = useState(0); set = s; return h('p', null, n); }, {}, output);
    root.mount(); const revision = root.host.revision;
    set(n => n + 1); set(n => n + 1); set(n => n + 1);
    expect(output.textContent).toBe('3'); expect(root.host.revision - revision).toBe(3);
    // T-S03의 batching commit 1회는 M5에서 구현한다.
  });
  it('T-S07 (기본): Object.is no-op과 unmount 뒤 setter', () => {
    let set!: StateSetter<number>; const render = vi.fn(() => { const [n, s] = useState(NaN); set = s; return h('p', null, String(n)); });
    const output = container(), root = new FunctionComponent(render, {}, output);
    root.mount(); set(NaN); expect(render).toHaveBeenCalledTimes(1);
    set(0); set(-0); expect(render).toHaveBeenCalledTimes(3);
    root.unmount(); set(42); root.unmount(); expect(output.childNodes).toHaveLength(0); expect(root.errors).toHaveLength(1);
  });
  it('T-E02 (기본): updater/render 실패는 상태·화면·Effect를 확정하지 않는다', () => {
    let set!: StateSetter<number>, failRender = false; const effect = vi.fn();
    const output = container(), root = new FunctionComponent(() => {
      const [n, s] = useState(0); set = s; useEffect(effect, [n]);
      if (failRender) throw new Error('render failed'); return h('p', null, n);
    }, {}, output);
    root.mount(); failRender = true; set(1);
    expect(root.lastResult!.status).toBe('rejected'); expect(output.textContent).toBe('0');
    expect(root.hooks[0]).toMatchObject({ value: 0 }); expect(effect).toHaveBeenCalledTimes(1);
    failRender = false; root.update(); expect(output.textContent).toBe('1'); expect(effect).toHaveBeenCalledTimes(2);
    set(() => { throw new Error('updater failed'); });
    expect(output.textContent).toBe('1'); expect(root.hooks[0]).toMatchObject({ value: 1 }); expect(effect).toHaveBeenCalledTimes(2);
  });
  it('Memo 계산에서 Hook/setter 사용을 거절한다', () => {
    const output = container(), root = new FunctionComponent(() => {
      const [, set] = useState(0); useMemo(() => { set(1); return 1; }, []); return h('p', null, 'bad');
    }, {}, output);
    expect(root.mount().status).toBe('rejected'); expect(output.childNodes).toHaveLength(0);
    const nested = new FunctionComponent(() => { useMemo(() => useState(1), []); return null; }, {}, container());
    expect(nested.mount().status).toBe('rejected');
  });
  it('T-S07: 개발 모드 plain state 직접 mutation을 진단하고 과거 값을 보존한다', () => {
    let set!: StateSetter<{ count: number }>;
    const initial = { count: 0 }, output = container();
    const root = new FunctionComponent(() => { const [value, setter] = useState(initial); set = setter; return h('p', null, value.count); }, {}, output);
    root.mount(); expect(Object.isFrozen(initial)).toBe(true);
    set(value => { value.count++; return value; });
    expect(root.lastResult!.status).toBe('rejected'); expect(initial.count).toBe(0); expect(output.textContent).toBe('0');
    root.unmount();
  });
});

describe('Effect와 Memo 최소 계약', () => {
  it('T-F01: deps 생략/[]/같음/변경과 DOM commit 이후 setup', () => {
    const every = vi.fn(), once = vi.fn(), changed = vi.fn(); let dep = 1;
    const output = container(), root = new FunctionComponent(() => {
      useEffect(every); useEffect(once, []); useEffect(() => changed(output.textContent), [dep]);
      return h('p', null, dep);
    }, {}, output);
    root.mount(); root.update(); dep = 2; root.update();
    expect(every).toHaveBeenCalledTimes(3); expect(once).toHaveBeenCalledTimes(1);
    expect(changed.mock.calls).toEqual([['1'], ['2']]);
  });
  it('T-F02: 변경된 Effect의 모든 cleanup 뒤 setup, 마지막 unmount cleanup', () => {
    const log: string[] = []; let dep = 0;
    const root = new FunctionComponent(() => {
      const captured = dep;
      useEffect(() => { log.push(`a${captured}`); return () => { log.push(`-a${captured}`); }; }, [dep]);
      useEffect(() => { log.push(`b${captured}`); return () => { log.push(`-b${captured}`); }; }, [dep]);
      return null;
    }, {}, container());
    root.mount(); dep = 1; root.update(); root.unmount(); root.unmount();
    expect(log).toEqual(['a0', 'b0', '-a0', '-b0', 'a1', 'b1', '-a1', '-b1']);
  });
  it('T-F04: Effect setter는 중첩 commit 없이 다음 동기 flush에서 처리한다', () => {
    const log: string[] = [];
    const output = container(), root = new FunctionComponent(() => {
      const [n, set] = useState(0);
      useEffect(() => { log.push(`start:${n}:${output.textContent}`); if (!n) set(1); log.push(`end:${n}:${output.textContent}`); }, [n]);
      return h('p', null, n);
    }, {}, output);
    root.mount(); expect(output.textContent).toBe('1');
    expect(log).toEqual(['start:0:0', 'end:0:0', 'start:1:1', 'end:1:1']);
  });
  it('cleanup 예외가 나머지 cleanup과 다음 setup을 막지 않는다', () => {
    let dep = 0; const cleanup = vi.fn(), setup = vi.fn();
    const root = new FunctionComponent(() => {
      useEffect(() => () => { throw new Error('cleanup'); }, [dep]);
      useEffect(() => { setup(); return cleanup; }, [dep]); return null;
    }, {}, container());
    root.mount(); dep = 1; root.update();
    expect(root.errors).toHaveLength(1); expect(cleanup).toHaveBeenCalledTimes(1); expect(setup).toHaveBeenCalledTimes(2);
  });
  it('Effect setup 중 unmount해도 반환된 cleanup을 한 번 수행한다', () => {
    const cleanup = vi.fn(), later = vi.fn(), output = container();
    const root = new FunctionComponent(() => {
      useEffect(() => { root.unmount(); return cleanup; }, []);
      useEffect(later, []); return h('p', null, 'removed');
    }, {}, output);
    root.mount(); root.unmount();
    expect(cleanup).toHaveBeenCalledTimes(1); expect(later).not.toHaveBeenCalled(); expect(output.childNodes).toHaveLength(0);
  });
  it('Effect cleanup 중 unmount해도 다른 cleanup을 중복 호출하지 않는다', () => {
    let dep = 0; const first = vi.fn(), second = vi.fn(), setup = vi.fn();
    const root = new FunctionComponent(() => {
      useEffect(() => { setup(); return () => { first(); root.unmount(); }; }, [dep]);
      useEffect(() => second, [dep]); return null;
    }, {}, container());
    root.mount(); dep = 1; root.update(); root.unmount();
    expect(first).toHaveBeenCalledTimes(1); expect(second).toHaveBeenCalledTimes(1); expect(setup).toHaveBeenCalledTimes(1);
  });
  it('T-M01: deps 같음/변경/생략에 따른 값과 계산 횟수', () => {
    const fixed = vi.fn(() => 'fixed'), calc = vi.fn((n: number) => n * 2), always = vi.fn(() => 'always'); let dep = 1;
    const output = container(), root = new FunctionComponent(() => {
      const a = useMemo(fixed, []), b = useMemo(() => calc(dep), [dep]), c = useMemo(always);
      return h('p', null, `${a}:${b}:${c}`);
    }, {}, output);
    root.mount(); root.update(); dep = 2; root.update();
    expect(fixed).toHaveBeenCalledTimes(1); expect(calc).toHaveBeenCalledTimes(2); expect(always).toHaveBeenCalledTimes(3);
    expect(output.textContent).toBe('fixed:4:always');
  });
  it('deps 배열을 복사하고 실패한 Memo 후보값을 버린다', () => {
    const deps = [1]; let fail = false; const factory = vi.fn(() => deps[0] * 2);
    const output = container(), root = new FunctionComponent(() => {
      const value = useMemo(factory, deps); if (fail) throw new Error('fail'); return h('p', null, value);
    }, {}, output);
    root.mount(); deps[0] = 2; fail = true; root.update();
    expect(output.textContent).toBe('2'); expect(root.hooks[0]).toMatchObject({ value: 2, deps: [1] });
    fail = false; root.update(); expect(output.textContent).toBe('4'); expect(factory).toHaveBeenCalledTimes(3);
  });
  it('T-F05: setup 예외와 Promise 반환은 진단하고 다른 Effect와 이미 끝난 commit을 유지한다', async () => {
    const good = vi.fn(), output = container();
    const root = new FunctionComponent(() => {
      useEffect(() => { throw new Error('setup failed'); }, []);
      useEffect((() => Promise.resolve()) as unknown as () => void, []);
      useEffect(good, []); return h('p', null, 'committed');
    }, {}, output);
    expect(root.mount().status).toBe('committed'); await Promise.resolve();
    expect(root.errors).toHaveLength(2); expect(good).toHaveBeenCalledTimes(1); expect(output.textContent).toBe('committed');
    root.unmount();
  });
  it('T-F06: 반복 mount/unmount에서 앱 Effect listener와 오래된 setter가 남지 않는다', () => {
    const render = vi.fn(() => {
      const [n, set] = useState(0);
      useEffect(() => { const listener = () => set(value => value + 1); window.addEventListener('probe', listener); return () => window.removeEventListener('probe', listener); }, []);
      return h('p', null, n);
    });
    for (let i = 0; i < 3; i++) {
      const output = container(), root = new FunctionComponent(render, {}, output); root.mount();
      window.dispatchEvent(new Event('probe')); expect(output.textContent).toBe('1'); root.unmount();
      window.dispatchEvent(new Event('probe')); expect(root.errors).toHaveLength(0);
    }
    expect(render).toHaveBeenCalledTimes(6);
  });
  it('deps 길이 변경은 commit 전에 오류가 된다', () => {
    let deps = [1]; const output = container();
    const root = new FunctionComponent(() => { useEffect(() => undefined, deps); return h('p', null, deps.length); }, {}, output);
    root.mount(); deps = [1, 2]; root.update(); expect(root.lastResult!.status).toBe('rejected'); expect(output.textContent).toBe('1'); root.unmount();
  });
});
