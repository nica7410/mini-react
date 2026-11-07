import type { ComponentExpr, ElementExpr, ElementInputProps, PureComponent, RenderValue } from '../core/types';

export function normalizeKey(key: string | number | undefined): string | null {
  if (key === undefined) return null;
  if (typeof key !== 'string' && typeof key !== 'number') throw new Error('key는 string 또는 number여야 합니다.');
  const normalized = String(key);
  if (!normalized) throw new Error('빈 key는 허용하지 않습니다.');
  return normalized;
}

export function h(tag: string, props: ElementInputProps | null, ...children: RenderValue[]): ElementExpr;
export function h<P>(component: PureComponent<P>, props: P & { key?: string | number }): ComponentExpr<P>;
export function h(type: string | PureComponent, props: any, ...children: RenderValue[]): ElementExpr | ComponentExpr {
  if (typeof type === 'function') {
    const { key, ...childProps } = props ?? {};
    return Object.freeze({ kind: 'component-expr', type, key: normalizeKey(key), props: Object.freeze(childProps) });
  }
  normalizeKey(props?.key);
  return Object.freeze({ kind: 'element-expr', tag: type.toLowerCase(), props: { ...props }, children });
}
