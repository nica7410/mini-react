import type { MountHandle, VRoot } from '../../src/core/types';
import { readDOM } from '../../src/core/capture';
import { createMount } from '../../src/core/mount';
import { diff } from '../../src/core/reconcile';
import { applySnapshot } from '../../src/core/patch';
import { unwrap } from '../../src/core/vdom';

export function container(html = ''): HTMLDivElement {
  const root = document.createElement('div');
  root.innerHTML = html;
  return root;
}
export const snapshot = (html: string): VRoot => unwrap(readDOM(container(html)));
export function apply(mount: MountHandle, target: VRoot) {
  const result = applySnapshot(mount, diff(mount.view, target));
  if (result.status === 'faulted') throw result.error;
  if (result.status === 'deferred') throw new Error('조합 때문에 보류된 계획입니다.');
  if (result.status === 'rejected') throw new Error(result.diagnostics.map(d => d.message).join('\n'));
  return result;
}
export function render(target: VRoot) {
  const root = container(), mount = createMount(root);
  apply(mount, target);
  return { root, mount };
}
