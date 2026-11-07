import type { CommitCounters, EventBinding, MountHandle } from '../types';
import { releaseInputObserver } from './inputs';
import { emitTrace } from '../../observe/trace';

interface Listener { binding: EventBinding; wrapper: EventListener }
const listeners = new WeakMap<Element, Map<string, Listener>>();

export function setEvent(element: Element, name: string, binding: EventBinding | null, counts: CommitCounters, mount?: MountHandle, ref?: string): void {
  let entries = listeners.get(element);
  const old = entries?.get(name);
  if (old && binding && old.binding.capture === binding.capture) {
    old.binding = binding; // wrapper는 그대로 두고 최신 closure만 교체한다.
    return;
  }
  if (old) {
    element.removeEventListener(name, old.wrapper, old.binding.capture);
    entries!.delete(name);
    counts.listenerRemoves++;
  }
  if (!binding) return;
  if (!entries) { entries = new Map(); listeners.set(element, entries); }
  const listener: Listener = { binding, wrapper: event => {
    if (!mount) { listener.binding.handler(event); return; }
    const previous = mount.eventCause, cause = `${mount.id}:event-${++mount.eventSequence}`;
    mount.eventCause = cause;
    emitTrace(mount.trace, { causeIds: [cause], mountId: mount.id, phase: 'event', nodeRef: ref, detail: { name, capture: listener.binding.capture } });
    try { listener.binding.handler(event); } finally { mount.eventCause = previous; }
  } };
  entries.set(name, listener);
  element.addEventListener(name, listener.wrapper, binding.capture);
  counts.listenerAdds++;
}

export function clearEvents(node: Node, counts?: CommitCounters): void {
  releaseInputObserver(node, counts);
  if (node.nodeType !== 1) return;
  const element = node as Element;
  const entries = listeners.get(element);
  entries?.forEach((listener, name) => {
    element.removeEventListener(name, listener.wrapper, listener.binding.capture);
    if (counts) counts.listenerRemoves++;
  });
  listeners.delete(element);
}
