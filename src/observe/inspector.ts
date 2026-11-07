import type { MountHandle, TraceEvent } from '../core/types';
import { TraceRecorder } from './recorder';

const node = <K extends keyof HTMLElementTagNameMap>(tag: K, text = '') => {
  const element = document.createElement(tag); element.textContent = text; return element;
};
export function downloadJSON(name: string, content: string): void {
  const url = URL.createObjectURL(new Blob([content], { type: 'application/json' })), link = node('a');
  link.href = url; link.download = name; link.click(); setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function createInspector(container: HTMLElement, mounts: () => readonly MountHandle[]) {
  let queued = false, selected: number | null = null, overlay: HTMLElement | null = null;
  let highlightTimer: ReturnType<typeof setTimeout> | undefined;
  const toolbar = node('div'), select = node('select'), content = node('div'), status = node('p');
  toolbar.className = 'toolbar'; select.setAttribute('aria-label', 'Inspector 실행 선택'); status.setAttribute('role', 'status');
  const clear = node('button', '기록 지우기'), exportButton = node('button', 'Trace JSON 저장');
  const enabled = node('input'); enabled.type = 'checkbox'; enabled.checked = true;
  const label = node('label', '기록 '); label.append(enabled); toolbar.append(label, select, clear, exportButton);
  container.append(toolbar, status, content);
  const recorder = new TraceRecorder(100, 1000, () => {
    if (!queued) { queued = true; requestAnimationFrame(() => { queued = false; render(); }); }
  });
  enabled.addEventListener('change', () => { recorder.enabled = enabled.checked; });
  clear.addEventListener('click', () => { selected = null; recorder.clear(); });
  exportButton.addEventListener('click', () => downloadJSON('mini-react-trace.json', recorder.export()));
  select.addEventListener('change', () => { selected = Number(select.value) || null; render(); });

  function tree(values: any[]): HTMLElement {
    const list = node('ul'); list.className = 'trace-tree';
    for (const item of values) {
      const row = node('li'), details = node('details');
      const value = item.vnode, key = value.identity?.key;
      details.append(node('summary', `${value.kind === 'element' ? value.tag : `${value.kind} ${JSON.stringify(value.text)}`} ${key === null ? '' : `key=${key}`} · ${item.ref}`));
      const { children: _children, ...data } = value;
      details.append(node('pre', JSON.stringify(data, null, 2)));
      if (item.children.length) details.append(tree(item.children));
      row.append(details); list.append(row);
    }
    return list;
  }
  function highlight(mountId: string, ref: string) {
    overlay?.remove(); clearTimeout(highlightTimer);
    const target = mounts().find(mount => mount.id === mountId)?.nodes.get(ref);
    if (!target?.isConnected) { status.textContent = `제거된 대상 ${ref} — 이전 트리에서 확인하세요.`; return; }
    const element = target.nodeType === 1 ? target as Element : target.parentElement;
    if (!element) return;
    const bounds = element.getBoundingClientRect(); overlay = node('div'); overlay.className = 'patch-highlight';
    Object.assign(overlay.style, { top: `${bounds.top}px`, left: `${bounds.left}px`, width: `${bounds.width}px`, height: `${bounds.height}px` });
    document.body.append(overlay); highlightTimer = setTimeout(() => { overlay?.remove(); overlay = null; }, 1800);
    status.textContent = `대상 ${ref} 강조 · 입력 포커스는 변경하지 않습니다.`;
  }
  function render() {
    const all = recorder.runs, run = all.find(run => run.id === selected) ?? all.at(-1);
    select.replaceChildren(node('option', '최신 실행 자동 선택'));
    select.firstElementChild!.setAttribute('value', '0');
    for (const item of [...all].reverse()) {
      const option = node('option', `#${item.id} ${item.mountId} ${item.planId}`); option.value = String(item.id); select.append(option);
    }
    select.value = selected && all.some(run => run.id === selected) ? String(selected) : '0';
    content.replaceChildren(); status.textContent = `최근 실행 ${all.length}/100 · 로그는 DOM 객체를 보관하지 않습니다.`;
    if (!run) { content.append(node('p', '편집기·카운터·재배치 실험을 실행하면 실제 기록이 나타납니다.')); return; }
    const diff = run.events.find(event => event.phase === 'diff')?.detail;
    const patch = run.events.find(event => event.phase === 'patch')?.detail;
    const summary = node('p', `#${run.id} ${run.mountId} · ${patch?.status ?? '미완료'} · 생략 로그 ${run.omittedEvents}`);
    summary.dataset.testid = 'inspector-summary'; content.append(summary);
    if (patch) {
      const counts = node('dl'); counts.className = 'trace-counts';
      for (const key of ['createdNodes', 'removedNodes', 'insertedRoots', 'movedRoots', 'textWrites', 'attributeWrites', 'styleWrites', 'propertyWrites', 'listenerAdds', 'listenerRemoves', 'skippedHostCalls']) {
        const value = node('dd', String(patch[key])); value.dataset.counter = key; counts.append(node('dt', key), value);
      }
      content.append(counts);
    }
    if (diff) {
      const trees = node('div'); trees.className = 'panes';
      for (const [title, values] of [['이전 VDOM', diff.before], ['이후 VDOM', diff.after]] as const) {
        const details = node('details'); details.append(node('summary', title), tree(values as any[] ?? [])); trees.append(details);
      }
      content.append(trees);
      const patches = node('details'); patches.open = true; patches.append(node('summary', `Patch ${diff.operations}개 · 비교 진입 ${diff.visitedNodes} · subtree 재사용 ${diff.reusedSubtrees}`));
      const list = node('ol'); list.className = 'patch-list';
      for (const op of diff.patches as any[] ?? []) {
        const ref = op.node ?? op.tree?.ref, row = node('li');
        const button = node('button', `${op.kind}${op.placement ? ` (${op.placement})` : ''} · ${ref} · parent=${op.parent ?? '—'} · anchor=${op.anchor ?? '끝/해당 없음'}`);
        button.addEventListener('click', () => highlight(run.mountId, ref)); row.append(button); list.append(row);
      }
      patches.append(list); content.append(patches);
      const routes = node('details'); routes.append(node('summary', 'keyed 경로와 fallback 이유'), node('pre', JSON.stringify(diff.reconciliations, null, 2))); content.append(routes);
    }
    const identity = node('details'); identity.append(node('summary', 'DOM 객체 재사용 검사'), node('pre', JSON.stringify(patch?.identity ?? [], null, 2))); content.append(identity);
    const flow = node('details'); flow.append(node('summary', '상태 요청 → Render/Memo → Diff/Patch → Effect 순서'));
    const order = node('ol');
    run.events.forEach((event: TraceEvent) => order.append(node('li', `${event.phase} ${event.hookIndex === null || event.hookIndex === undefined ? '' : `hook[${event.hookIndex}]`} ${event.causeIds.join(', ')} ${JSON.stringify(['diff', 'patch'].includes(event.phase) ? { planId: event.detail.planId } : event.detail)}`)));
    flow.append(order); content.append(flow);
  }
  render();
  return recorder;
}
