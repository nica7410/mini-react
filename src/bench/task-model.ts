import type { Task } from '../app/tasks';

export const taskWorkloads = ['draft', 'counter', 'search', 'filter', 'sort', 'move', 'crud', 'dirty', 'equal'] as const;
export type TaskWorkload = typeof taskWorkloads[number];
export interface TaskModel {
  items: Task[]; nextId: number; draft: string; query: string;
  filter: 'all' | 'active' | 'done'; sort: 'manual' | 'name' | 'done'; counter: number;
}
export type TaskAction =
  | { kind: 'draft'; value: string }
  | { kind: 'search'; value: string }
  | { kind: 'filter'; value: TaskModel['filter'] }
  | { kind: 'sort'; value: TaskModel['sort'] }
  | { kind: 'rename'; id: string; value: string }
  | { kind: 'toggle' | 'delete'; id: string }
  | { kind: 'counter' | 'move' | 'add' | 'dirty' | 'equal' };

export function initialTaskModel(size: number, seed: number): TaskModel {
  if (!Number.isInteger(size) || size < 2 || size > 10000) throw new Error('Invalid task fixture size');
  let state = seed >>> 0 || 1;
  const labels = Array.from({ length: size }, (_, i) => `group-${i % 2} 업무 ${String(i + 1).padStart(5, '0')}`);
  for (let i = labels.length - 1; i > 0; i--) {
    state ^= state << 13; state ^= state >>> 17; state ^= state << 5;
    const j = (state >>> 0) % (i + 1); [labels[i], labels[j]] = [labels[j], labels[i]];
  }
  return { items: labels.map((label, i) => ({ id: `task-${i + 1}`, label, done: i % 3 === 0 })), nextId: size + 1,
    draft: '', query: '', filter: 'all', sort: 'manual', counter: 0 };
}
export function visibleTasks(model: TaskModel): Task[] {
  const needle = model.query.trim().toLocaleLowerCase();
  const selected = model.items.filter(item => item.label.toLocaleLowerCase().includes(needle)
    && (model.filter === 'all' || (model.filter === 'done' ? item.done : !item.done)));
  const collator = new Intl.Collator('ko');
  if (model.sort === 'name') selected.sort((a, b) => collator.compare(a.label, b.label) || a.id.localeCompare(b.id));
  if (model.sort === 'done') selected.sort((a, b) => Number(a.done) - Number(b.done) || a.id.localeCompare(b.id));
  return selected;
}
export function taskActions(workload: TaskWorkload, index: number, model: TaskModel): TaskAction[] {
  switch (workload) {
    case 'draft': return [{ kind: 'draft', value: `draft ${index}` }];
    case 'counter': return [{ kind: 'counter' }];
    case 'search': return [{ kind: 'search', value: index % 2 === 0 ? 'group-0' : '' }];
    case 'filter': return [{ kind: 'filter', value: index % 2 === 0 ? 'done' : 'all' }];
    case 'sort': return [{ kind: 'sort', value: index % 2 === 0 ? 'name' : 'manual' }];
    case 'move': return [{ kind: 'move' }];
    case 'dirty': return [{ kind: 'dirty' }];
    case 'equal': return [{ kind: 'equal' }];
    case 'crud': {
      const id = `task-${model.nextId}`;
      return [{ kind: 'draft', value: `추가 ${index}` }, { kind: 'add' }, { kind: 'rename', id, value: `수정 ${index}` }, { kind: 'toggle', id }, { kind: 'delete', id }];
    }
  }
}
export function applyTaskAction(model: TaskModel, action: TaskAction): boolean {
  switch (action.kind) {
    case 'draft': model.draft = action.value; return false;
    case 'search': model.query = action.value; return false;
    case 'filter': model.filter = action.value; return false;
    case 'sort': model.sort = action.value; return false;
    case 'counter': model.counter += 3; return false;
    case 'move': model.items = [...model.items.slice(-1), ...model.items.slice(0, -1)]; model.sort = 'manual'; return true;
    case 'add': model.items = model.items.concat({ id: `task-${model.nextId++}`, label: model.draft.trim(), done: false }); model.draft = ''; return true;
    case 'rename': model.items = model.items.map(item => item.id === action.id ? { ...item, label: action.value } : item); return true;
    case 'toggle': model.items = model.items.map(item => item.id === action.id ? { ...item, done: !item.done } : item); return true;
    case 'delete': model.items = model.items.filter(item => item.id !== action.id); return true;
    case 'dirty': case 'equal': return false;
  }
}
