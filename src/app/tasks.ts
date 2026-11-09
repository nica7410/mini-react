import { h, memo, useEffect, useMemo, useState } from '../runtime';
import type { PureComponent, RenderValue, StateSetter } from '../core/types';

export interface Task { readonly id: string; readonly label: string; readonly done: boolean }
type Filter = 'all' | 'active' | 'done';
type Sort = 'manual' | 'name' | 'done';
const initialTasks = (): Task[] => ['DOM 캡처', 'Diff 이해', 'Patch 적용', 'History 복원', 'Hook 추적', 'FIFO 확인', 'LIS 비교', '한글 입력'].map((label, i) => ({ id: `task-${i + 1}`, label, done: false }));
const moveLast = (items: readonly Task[]): Task[] => items.length > 1 ? [items.at(-1)!, ...items.slice(0, -1)] : [...items];

type RowProps = { item: Task; rename: (id: string, label: string) => void; toggle: (id: string) => void; remove: (id: string) => void };
function TaskRow(props: RowProps) {
  const { item } = props;
  return h('li', { attrs: { 'data-task-id': item.id, class: item.done ? 'task-row done' : 'task-row' } },
    h('label', { attrs: { class: 'task-check' } }, h('input', {
      attrs: { type: 'checkbox', 'aria-label': `${item.id} 완료` }, form: { mode: 'controlled', checked: item.done },
      events: { change: () => props.toggle(item.id) },
    }), '완료'),
    h('label', { attrs: { class: 'task-name' } }, h('span', { attrs: { class: 'visually-hidden' } }, `${item.id} 이름`), h('input', {
      attrs: { type: 'text', 'aria-label': `${item.id} 이름`, placeholder: '이름 없음' }, form: { mode: 'controlled', value: item.label },
      events: { input: event => props.rename(item.id, (event.target as HTMLInputElement).value) },
    })),
    h('button', { attrs: { type: 'button', 'aria-label': `${item.id} 삭제` }, events: { click: () => props.remove(item.id) } }, '삭제'),
  );
}
function TaskSummary(props: { total: number; done: number }) {
  return h('p', { attrs: { 'data-testid': 'task-summary', 'aria-live': 'polite' } }, `전체 ${props.total} · 완료 ${props.done} · 남음 ${props.total - props.done}`);
}

type Items = readonly Task[];
interface RowActions { rename: (id: string, label: string) => void; toggle: (id: string) => void; remove: (id: string) => void }
// State setters keep their identity. Functional actions read the latest FIFO
// candidate, so these callbacks do not capture a particular items array.
const rowActionsFor = (setItems: StateSetter<Items>): RowActions => ({
  rename: (id, label) => setItems(previous => previous.map(item => item.id === id ? { ...item, label } : item)),
  toggle: id => setItems(previous => previous.map(item => item.id === id ? { ...item, done: !item.done } : item)),
  remove: id => setItems(previous => previous.filter(item => item.id !== id)),
});
const MemoTaskRow = memo(TaskRow);
const taskList = (visible: Items, actions: RowActions, Row: PureComponent<RowProps> = TaskRow) => h('ul', { attrs: { class: 'task-list', 'aria-label': '학습 항목 목록' } },
  visible.map(item => h(Row, { key: item.id, item, ...actions })));
type ListStrategy = (visible: Items, setItems: StateSetter<Items>) => RenderValue;
// A0 (default app): row callbacks and row expressions are rebuilt on every root render.
const rebuildRows: ListStrategy = (visible, setItems) => taskList(visible, rowActionsFor(setItems));
// A1 (comparison build only): the list expression and callbacks are memoized in
// root Hook slots, so draft/counter updates skip TaskRow evaluation. Each strategy
// always calls the same Hooks in the same order.
const memoRows: ListStrategy = (visible, setItems) => {
  const actions = useMemo(() => rowActionsFor(setItems), [setItems]);
  return useMemo(() => taskList(visible, actions), [visible, actions]);
};

// A2 (row reuse experiment): stable callbacks plus memo(TaskRow). The list expression
// is rebuilt, but a row whose item object and callbacks are unchanged reuses its
// previous evaluation, so editing one row re-evaluates only that row.
const memoEachRow: ListStrategy = (visible, setItems) => {
  const actions = useMemo(() => rowActionsFor(setItems), [setItems]);
  return taskList(visible, actions, MemoTaskRow);
};

/**
 * Final policy: the default TaskApp is A0. A1 is kept as `TaskAppWithRowReuse` for
 * fixed comparison builds and tests. Its repeated-reuse gain was measured, but
 * the pre-registered regression gates were exceeded (see docs/task-app-final-policy.md).
 */
// Candidate (2026-11-09 ④): the default TaskApp is A2; A0 stays exported for comparison.
export function TaskApp() { return renderTaskApp(memoEachRow); }
export function TaskAppA0() { return renderTaskApp(rebuildRows); }
export function TaskAppWithRowReuse() { return renderTaskApp(memoRows); }
export const TaskAppWithRowMemo = TaskApp;

function renderTaskApp(listStrategy: ListStrategy) {
  const [items, setItems] = useState<Items>(initialTasks);
  const [nextId, setNextId] = useState(9);
  const [draft, setDraft] = useState(''), [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all'), [sort, setSort] = useState<Sort>('manual');
  const [error, setError] = useState(''), [batchCount, setBatchCount] = useState(0);
  const [delayedMove, setDelayedMove] = useState(0), [syncedTotal, setSyncedTotal] = useState<number | null>(null);
  const visible = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    const result = items.filter(item => item.label.toLocaleLowerCase().includes(needle) && (filter === 'all' || (filter === 'done') === item.done));
    if (sort === 'name') result.sort((a, b) => a.label.localeCompare(b.label, 'ko') || a.id.localeCompare(b.id));
    if (sort === 'done') result.sort((a, b) => Number(a.done) - Number(b.done) || a.id.localeCompare(b.id));
    return result;
  }, [items, query, filter, sort]);
  const summary = useMemo(() => h(TaskSummary, { total: items.length, done: items.filter(item => item.done).length }), [items]);
  useEffect(() => {
    const listener = (event: KeyboardEvent) => {
      if (event.altKey && event.key.toLowerCase() === 'n') { event.preventDefault(); document.getElementById('new-task')?.focus(); }
    };
    const move = () => { setSort('manual'); setItems(moveLast); };
    window.addEventListener('keydown', listener); window.addEventListener('mini-react:list-move-last', move);
    return () => { window.removeEventListener('keydown', listener); window.removeEventListener('mini-react:list-move-last', move); };
  }, []);
  useEffect(() => {
    // 취소 가능한 작은 비동기 동기화 예제. 새 render/unmount가 오래된 결과를 취소한다.
    const timer = setTimeout(() => setSyncedTotal(items.length), 40);
    return () => clearTimeout(timer);
  }, [items]);
  useEffect(() => {
    if (!delayedMove) return;
    const timer = setTimeout(() => { setSort('manual'); setItems(moveLast); }, 1500);
    return () => clearTimeout(timer);
  }, [delayedMove]);
  const list = listStrategy(visible, setItems);
  const add = (event: Event) => {
    event.preventDefault(); const label = draft.trim();
    if (!label) { setError('추가할 항목 이름을 입력하세요.'); return; }
    setItems(previous => [...previous, { id: `task-${nextId}`, label, done: false }]); setNextId(id => id + 1); setDraft(''); setError('');
  };
  return h('div', { attrs: { class: 'task-app-content' } },
    h('form', { events: { submit: add } },
      h('label', null, '새 항목', h('input', { attrs: { id: 'new-task', 'aria-label': '새 항목', placeholder: '학습할 내용을 입력하세요' },
        form: { mode: 'controlled', value: draft }, events: { input: event => setDraft((event.target as HTMLInputElement).value) } })),
      h('button', { attrs: { type: 'submit', class: 'primary' } }, '항목 추가')),
    error ? h('p', { attrs: { role: 'alert', class: 'task-error' } }, error) : null,
    h('div', { attrs: { class: 'toolbar task-filters' } },
      h('label', null, '검색', h('input', { attrs: { type: 'search', 'aria-label': '항목 검색' }, form: { mode: 'controlled', value: query }, events: { input: event => setQuery((event.target as HTMLInputElement).value) } })),
      h('label', null, '필터', h('select', { attrs: { 'aria-label': '완료 필터' }, form: { mode: 'controlled', selectedIndices: [['all', 'active', 'done'].indexOf(filter)] }, events: { change: event => setFilter((event.target as HTMLSelectElement).value as Filter) } },
        h('option', { key: 'all', attrs: { value: 'all' } }, '전체'), h('option', { key: 'active', attrs: { value: 'active' } }, '진행 중'), h('option', { key: 'done', attrs: { value: 'done' } }, '완료'))),
      h('label', null, '정렬', h('select', { attrs: { 'aria-label': '목록 정렬' }, form: { mode: 'controlled', selectedIndices: [['manual', 'name', 'done'].indexOf(sort)] }, events: { change: event => setSort((event.target as HTMLSelectElement).value as Sort) } },
        h('option', { key: 'manual', attrs: { value: 'manual' } }, '직접 순서'), h('option', { key: 'name', attrs: { value: 'name' } }, '이름순'), h('option', { key: 'done', attrs: { value: 'done' } }, '미완료 우선'))),
    ),
    summary,
    h('p', { attrs: { class: 'hint', 'data-testid': 'task-sync' } }, `취소 가능한 동기화: ${syncedTotal === null ? '대기' : `${syncedTotal}개`}`),
    list,
    !visible.length ? h('p', { attrs: { role: 'status', 'data-testid': 'task-empty' } }, items.length ? '검색·필터에 맞는 항목이 없습니다.' : '목록이 비었습니다. 새 항목을 추가하세요.') : null,
    h('div', { attrs: { class: 'toolbar' } },
      h('button', { attrs: { type: 'button' }, events: { click: () => { setBatchCount(n => n + 1); setBatchCount(n => n + 1); setBatchCount(n => n + 1); } } }, '+1 세 번'),
      h('output', { attrs: { 'aria-label': 'Batching 카운트' } }, batchCount),
      h('button', { attrs: { type: 'button', disabled: items.length < 2 }, events: { click: () => { setSort('manual'); setItems(moveLast); } } }, '마지막 항목을 처음으로'),
      h('button', { attrs: { type: 'button', disabled: items.length < 2 }, events: { click: () => setDelayedMove(n => n + 1) } }, '1.5초 뒤 마지막 항목 이동'),
    ),
    h('p', { attrs: { class: 'hint' } }, 'Alt+N: 새 항목 입력. 지연 이동을 누른 뒤 마지막 항목에서 한글을 조합해 보세요. 조합 중 충돌하는 이동은 끝난 뒤 적용합니다.'),
  );
}
