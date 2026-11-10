import type { CaptureResult, MountHandle, MountView, Result, StyleValue, VNode, VRoot, ViewNode } from './types';
import { readForm } from './host/forms';
import { clearEvents } from './host/events';
import { equalData, fail, freezeTree, identity, ok } from './vdom';
import { createAttrMap, finishAttrMap } from './attrMap';
import { validateTree } from './validate';

export function readDOM(container: ParentNode): Result<VRoot> {
  function read(node: Node): VNode {
    if (node.nodeType === 3) return { kind: 'text', identity: identity(), text: node.nodeValue ?? '' };
    if (node.nodeType === 8) return { kind: 'comment', identity: identity(), text: node.nodeValue ?? '', placeholder: false };
    if (node.nodeType !== 1) throw new Error(`미지원 DOM nodeType: ${node.nodeType}`);
    const element = node as HTMLElement;
    if (element.namespaceURI !== 'http://www.w3.org/1999/xhtml') throw new Error('HTML namespace만 지원합니다.');
    if (element.shadowRoot) throw new Error('Shadow DOM은 지원하지 않습니다.');
    const attrs = createAttrMap();
    for (const attr of element.attributes) if (attr.name !== 'style') attrs[attr.name] = attr.value;
    finishAttrMap(attrs);
    const style: Record<string, StyleValue> = {};
    for (const name of element.style) style[name] = {
      value: element.style.getPropertyValue(name),
      priority: element.style.getPropertyPriority(name) === 'important' ? 'important' : '',
    };
    return {
      kind: 'element', identity: identity(element.getAttribute('data-key')), tag: element.localName,
      attrs, style, events: {}, form: readForm(element), children: Array.from(element.childNodes, read),
    };
  }
  try {
    const snapshot = freezeTree<VRoot>({ kind: 'root', children: Array.from(container.childNodes, read) });
    return validateTree(snapshot);
  } catch (error) { return fail('CAPTURE_ERROR', error instanceof Error ? error.message : String(error)); }
}

export function captureDOM(mount: MountHandle): Result<CaptureResult> {
  if (mount.disposed || mount.faulted) return fail('MOUNT_UNAVAILABLE', '해제되었거나 오류 상태인 mount입니다.');
  const captured = readDOM(mount.container);
  if (!captured.ok) return captured;
  const bindings = new Map<string, Node>([[mount.view.rootRef, mount.container]]);
  function bind(vnode: VNode, node: Node): ViewNode {
    const ref = mount.refs.get(node) ?? `${mount.id}/capture-${++mount.nextCaptureRef}`;
    bindings.set(ref, node);
    return {
      ref, vnode,
      children: vnode.kind === 'element' ? vnode.children.map((child, i) => bind(child, node.childNodes[i])) : [],
    };
  }
  const snapshot = captured.value;
  const children = snapshot.children.map((child, i) => bind(child, mount.container.childNodes[i]));
  return ok({
    snapshot, bindings, visitedNodes: bindings.size - 1, createdVNodes: bindings.size - 1,
    view: { mountId: mount.id, revision: mount.revision, rootRef: mount.view.rootRef, snapshot, children },
  });
}

export function adoptCapture(mount: MountHandle, captured: CaptureResult): Result<MountView> {
  if (mount.disposed || mount.faulted || captured.view.mountId !== mount.id || captured.view.revision !== mount.revision) {
    return fail('STALE_CAPTURE', '다른 mount 또는 오래된 revision의 캡처입니다.');
  }
  // 같은 revision이라도 외부 편집은 가능하다. 값과 실제 Node 정체성을 모두 확인한다.
  const current = captureDOM(mount);
  if (!current.ok) return current;
  const oldNodes = Array.from(captured.bindings.values()), newNodes = Array.from(current.value.bindings.values());
  if (!equalData(current.value.snapshot, captured.snapshot) || oldNodes.length !== newNodes.length || oldNodes.some((n, i) => n !== newNodes[i])) {
    return fail('STALE_CAPTURE', '캡처 후 DOM이 변경되었습니다. 다시 캡처하세요.');
  }
  const surviving = new Set(captured.bindings.values());
  for (const node of mount.nodes.values()) {
    if (!surviving.has(node)) clearEvents(node);
    mount.refs.delete(node);
  }
  mount.nodes.clear();
  for (const [ref, node] of captured.bindings) { mount.nodes.set(ref, node); mount.refs.set(node, ref); }
  mount.revision++;
  mount.view = { ...captured.view, revision: mount.revision };
  return ok(mount.view);
}
