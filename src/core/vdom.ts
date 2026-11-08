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

// 엔진이 새로 소유한 트리만 동결한다. 사용자 props/state나 함수 객체는 동결하지 않는다.
const immutableData = new WeakSet<object>();
const freezing = new Set<object>();
export const isImmutableData = (value: object): boolean => immutableData.has(value);
export function freezeTree<T>(value: T): T {
  proveImmutable(value, true);
  return value;
}
function proveImmutable(value: unknown, retain = false): boolean {
  if (!value || typeof value !== 'object' || immutableData.has(value)) return true;
  if (freezing.has(value)) throw new Error('순환 데이터는 VDOM에 사용할 수 없습니다.');
  freezing.add(value);
  try {
    // Freeze first: Proxy invariants then lock the prototype and final own data
    // references. A pre-freeze descriptor is not proof of the resulting object.
    Object.freeze(value);
    const prototype = Object.getPrototypeOf(value);
    let stable = prototype === null || prototype === Object.prototype || (Array.isArray(value) && prototype === Array.prototype);
    let vnode = false;
    for (const key of Reflect.ownKeys(value)) {
      const property = Object.getOwnPropertyDescriptor(value, key)!;
      // A frozen accessor can still return mutable data; never invoke it here.
      if (!Object.hasOwn(property, 'value')) { stable = false; continue; }
      if (key === 'kind') vnode = property.value === 'root' || property.value === 'element' || property.value === 'text' || property.value === 'comment';
      if (!proveImmutable(property.value)) stable = false;
    }
    // Retain reusable tree boundaries, not every attrs/style/identity container.
    // The kind chooses retention only after the complete deep proof succeeds.
    if (stable && (retain || vnode)) immutableData.add(value);
    return stable;
  } finally { freezing.delete(value); }
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
