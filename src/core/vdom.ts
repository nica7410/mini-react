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
const freezing = new WeakSet<object>();
export const isImmutableData = (value: object): boolean => immutableData.has(value);
export function freezeTree<T>(value: T): T {
  if (value && typeof value === 'object' && !immutableData.has(value)) {
    if (freezing.has(value)) throw new Error('순환 데이터는 VDOM에 사용할 수 없습니다.');
    freezing.add(value);
    try {
      const prototype = Object.getPrototypeOf(value);
      let stable = prototype === null || prototype === Object.prototype || (Array.isArray(value) && prototype === Array.prototype);
      // Object.isFrozen(outer) alone does not prove nested immutability. Accessors and
      // custom prototypes are never certified, even if the containing object is frozen.
      for (const key of Reflect.ownKeys(value)) {
        const property = Object.getOwnPropertyDescriptor(value, key)!;
        if (!Object.hasOwn(property, 'value')) { stable = false; continue; }
        const child = property.value;
        freezeTree(child);
        if (child && typeof child === 'object' && !immutableData.has(child)) stable = false;
      }
      Object.freeze(value);
      if (stable) immutableData.add(value);
    } finally { freezing.delete(value); }
  }
  return value;
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
