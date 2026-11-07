import type { CommitCounters, MountHandle, VElement } from '../types';

interface Observer { readonly dispose: (counts?: CommitCounters) => void }
const observers = new WeakMap<Node, Observer>();

function finishNativeInput(mount: MountHandle): void {
  if (mount.inputFallbackTimer !== undefined) {
    clearTimeout(mount.inputFallbackTimer); mount.inputFallbackTimer = undefined;
  }
  if (!mount.inputFlushScheduled && mount.dirtyForms.size) {
    mount.inputFlushScheduled = true;
    queueMicrotask(() => {
      mount.inputFlushScheduled = false;
      if (!mount.disposed && !mount.faulted) mount.onHostInput?.();
    });
  }
}

// 브라우저는 native listener 사이에도 microtask checkpoint를 수행할 수 있다.
// target의 capture listener에서 복원을 예약하면 사용자 bubble handler보다 먼저
// value가 되돌아간다. 관리 영역의 bubble 끝에서 예약하고 전파 차단은 다음 task로 보완한다.
export function attachInputBoundary(mount: MountHandle): () => void {
  const finish = () => finishNativeInput(mount);
  mount.container.addEventListener('input', finish);
  mount.container.addEventListener('change', finish);
  return () => {
    mount.container.removeEventListener('input', finish);
    mount.container.removeEventListener('change', finish);
    if (mount.inputFallbackTimer !== undefined) clearTimeout(mount.inputFallbackTimer);
    mount.inputFallbackTimer = undefined;
  };
}

export function observeControlledInput(mount: MountHandle, node: HTMLElement, ref: string, vnode: VElement, counts: CommitCounters): void {
  if (vnode.form?.mode !== 'controlled' || observers.has(node)) return;
  const onInput = () => {
    if (mount.disposed || mount.faulted) return;
    const sequence = ++mount.inputSequence;
    mount.dirtyForms.set(ref, sequence);
    if (node.localName === 'input' && (node as HTMLInputElement).type === 'radio' && (node as HTMLInputElement).name) {
      const input = node as HTMLInputElement;
      // radio의 native 동작은 같은 그룹의 다른 노드도 바꾼다.
      for (const [otherRef, otherNode] of mount.nodes) if (otherNode.nodeType === 1 && (otherNode as Element).localName === 'input') {
        const other = otherNode as HTMLInputElement;
        if (other.type === 'radio' && other.name === input.name && other.form === input.form) mount.dirtyForms.set(otherRef, sequence);
      }
    }
    if (mount.inputFallbackTimer === undefined) mount.inputFallbackTimer = setTimeout(() => {
      mount.inputFallbackTimer = undefined;
      if (!mount.disposed && !mount.faulted) finishNativeInput(mount);
    }, 0);
  };
  node.addEventListener('input', onInput, true);
  node.addEventListener('change', onInput, true);
  counts.listenerAdds += 2;
  observers.set(node, { dispose: removedCounts => {
    node.removeEventListener('input', onInput, true);
    node.removeEventListener('change', onInput, true);
    mount.dirtyForms.delete(ref);
    if (removedCounts) removedCounts.listenerRemoves += 2;
  } });
}

export function releaseInputObserver(node: Node, counts?: CommitCounters): void {
  observers.get(node)?.dispose(counts);
  observers.delete(node);
}
