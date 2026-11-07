import type { MountHandle, TraceSink } from './types';
import { clearEvents } from './host/events';
import { emptyRoot } from './vdom';
import { attachInputBoundary } from './host/inputs';
import { attachBrowserState } from './host/browserState';

let mountSequence = 0;
export function createMount(container: HTMLElement, trace?: TraceSink): MountHandle {
  const id = `mount-${++mountSequence}`, rootRef = `${id}/root`;
  const mount: MountHandle = {
    id, container, revision: 0, nextCaptureRef: 0, disposed: false, faulted: false, trace,
    dirtyForms: new Map(), inputSequence: 0, inputFlushScheduled: false, nativeInputPending: false, eventSequence: 0, traceCauses: [],
    composing: new Set(), heldForms: new Set(), focusVersion: 0,
    view: { mountId: id, revision: 0, rootRef, snapshot: emptyRoot(), children: [] },
    nodes: new Map([[rootRef, container]]), refs: new WeakMap([[container, rootRef]]),
  };
  const releaseInput = attachInputBoundary(mount), releaseBrowserState = attachBrowserState(mount);
  mount.disposeHostObservers = () => { releaseInput(); releaseBrowserState(); };
  return mount;
}

export function disposeMount(mount: MountHandle): void {
  if (mount.disposed) return;
  mount.disposeHostObservers?.(); mount.disposeHostObservers = undefined;
  for (const node of mount.nodes.values()) { clearEvents(node); mount.refs.delete(node); }
  mount.nodes.clear();
  mount.dirtyForms.clear(); mount.onHostInput = undefined;
  mount.onCompositionEnd = undefined; mount.onCompositionChange = undefined;
  mount.container.replaceChildren();
  mount.view = { ...mount.view, snapshot: emptyRoot(), children: [] };
  mount.disposed = true;
}
