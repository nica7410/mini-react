import { h, useEffect, useMemo, useState } from '../runtime';

function Summary(props: Readonly<{ name: string; count: number; doubled: number }>) {
  return h('p', { attrs: { 'data-testid': 'summary' } }, `${props.name}의 카운트 ${props.count} · 두 배 ${props.doubled}`);
}

export function Counter() {
  const [count, setCount] = useState(0);
  const [name, setName] = useState('Jungle');
  const doubled = useMemo(() => count * 2, [count]);
  useEffect(() => {
    const previous = document.title;
    document.title = `Mini React | ${count}`;
    return () => { document.title = previous; };
  }, [count]);

  return h('div', { attrs: { class: 'counter-content' } },
    h('label', null, '이름', h('input', {
      attrs: { type: 'text', 'aria-label': '카운터 이름' },
      form: { mode: 'controlled', value: name },
      events: { input: event => setName((event.target as HTMLInputElement).value) },
    })),
    h('output', { attrs: { 'aria-label': '카운트', 'aria-live': 'polite' } }, count),
    h('div', { attrs: { class: 'toolbar' } },
      h('button', { events: { click: () => setCount(previous => previous - 1) } }, '−1'),
      h('button', { attrs: { class: 'primary' }, events: { click: () => setCount(previous => previous + 1) } }, '+1'),
      h('button', { events: { click: () => setCount(0) } }, '0으로'),
    ),
    h(Summary, { name, count, doubled }),
  );
}
