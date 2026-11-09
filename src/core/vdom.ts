import type { Diagnostic, Identity, Result, VNode, VRoot } from './types';

export const identity = (key: string | null = null): Identity => ({ key, renderedRootKey: null, boundaries: [] });
export const emptyRoot = (): VRoot => freezeTree({ kind: 'root', children: [] });
export const ok = <T>(value: T): Result<T> => ({ ok: true, value });
export const fail = (code: string, message: string, path?: string): Result<never> => ({ ok: false, diagnostics: [{ code, message, path }] });
export function unwrap<T>(result: Result<T>): T {
  if (!result.ok) throw new Error(result.diagnostics.map(d => `${d.code}: ${d.message}`).join('\n'));
  return result.value;
}
export function errorDiagnostic(error: unknown): Diagnostic {
  return { code: 'ENGINE_ERROR', message: error instanceof Error ? error.message : String(error) };
}

// 엔진이 새로 소유한 트리만 동결한다. 함수 객체와 상속 prototype 데이터는 동결하지 않는다.
// 단, VNode의 form·style·event 값에 넣은 중첩 객체는 VDOM 데이터의 일부로 함께 동결된다.
// 최종 정책(E1 방식): 불변성 인증이나 검증 결과를 호출 사이에 보관하지 않는다.
// validateTree는 매 호출 전체 root를 다시 검사하므로, 동결은 History와 이전 VDOM의
// 변형을 막는 안전장치이고 검증 생략의 근거로 쓰지 않는다.
const freezing = new Set<object>();
export function freezeTree<T>(value: T): T {
  freezeOwned(value, new WeakSet<object>());
  return value;
}
function freezeOwned(value: unknown, done: WeakSet<object>): void {
  if (!value || typeof value !== 'object' || done.has(value)) return;
  if (freezing.has(value)) throw new Error('순환 데이터는 VDOM에 사용할 수 없습니다.');
  freezing.add(value);
  try {
    // Freeze first: a Proxy's freeze trap can install a different final
    // reference, so only the post-freeze own data is inspected.
    Object.freeze(value);
    for (const key of Reflect.ownKeys(value)) {
      const property = Object.getOwnPropertyDescriptor(value, key);
      // Never invoke accessors. Their results are re-read by every validation.
      if (property && Object.hasOwn(property, 'value')) freezeOwned(property.value, done);
    }
    // `done` lives for this call only. It skips shared references within one
    // tree; an interrupted call leaves nothing behind for the next call.
    done.add(value);
  } finally { freezing.delete(value); }
}
/**
 * Seal a VNode/VRoot that the resolver has just created. Its own data is frozen
 * deeply, while each entry of `children` is an engine-created VNode that was
 * sealed when it was created (in this render or a reused earlier render).
 */
export function freezeOwnedNode<T extends VNode | VRoot>(node: T): T {
  for (const [key, value] of Object.entries(node)) if (key !== 'children') freezeTree(value);
  if ('children' in node) sealChildren(node.children);
  return Object.freeze(node);
}
/**
 * Seal a component boundary record `{ ...child, identity }`. Every field except
 * the new identity is a reference to data of the already sealed child VNode.
 */
export function freezeBoundaryNode<T extends VNode>(node: T, child: VNode): T {
  for (const [key, value] of Object.entries(node)) {
    if (key !== 'identity' && !Object.is(value, (child as unknown as Record<string, unknown>)[key])) throw new Error('컴포넌트 경계 노드는 자식 VNode의 데이터만 공유해야 합니다.');
  }
  if (!Object.isFrozen(child)) throw new Error('봉인되지 않은 자식 VNode입니다.');
  freezeTree(node.identity);
  return Object.freeze(node);
}
// A cheap precondition check (not a proof or a skip): every child must already
// be a sealed engine VNode. The resolver creates and seals each child first.
function sealChildren(children: readonly VNode[]): void {
  Object.freeze(children);
  for (const child of children) if (!Object.isFrozen(child)) throw new Error('봉인되지 않은 자식 VNode입니다.');
}
export function equalData(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const aa = a as Record<string, unknown>, bb = b as Record<string, unknown>;
  const keys = Object.keys(aa);
  return keys.length === Object.keys(bb).length && keys.every(k => Object.hasOwn(bb, k) && equalData(aa[k], bb[k]));
}
export function compatible(a: VNode, b: VNode): boolean {
  return a.kind === b.kind && equalData(a.identity, b.identity)
    && (a.kind !== 'element' || (b.kind === 'element' && a.tag === b.tag));
}
