import type { MountHandle, TraceSink } from './types';
import { clearEvents } from './host/events';
import { emptyRoot } from './vdom';

let mountSequence = 0;
export function createMount(container: HTMLElement, trace?: TraceSink): MountHandle {
  const id = `mount-${++mountSequence}`, rootRef = `${id}/root`;
  return {
    id, container, revision: 0, nextCaptureRef: 0, disposed: false, faulted: false, trace,
    view: { mountId: id, revision: 0, rootRef, snapshot: emptyRoot(), children: [] },
    nodes: new Map([[rootRef, container]]), refs: new WeakMap([[container, rootRef]]),
  };
}

export function disposeMount(mount: MountHandle): void {
  if (mount.disposed) return;
  for (const node of mount.nodes.values()) { clearEvents(node); mount.refs.delete(node); }
  mount.nodes.clear();
  mount.container.replaceChildren();
  mount.view = { ...mount.view, snapshot: emptyRoot(), children: [] };
  mount.disposed = true;
}
