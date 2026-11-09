import type { PureComponent } from '../core/types';

// Explicit, opt-in row reuse. Only components wrapped with memo() are compared;
// every other component keeps running on each render (no automatic props memo).
const memoComponents = new WeakSet<PureComponent>();

/**
 * Returns a new pure component that the resolver may skip when the previous
 * committed evaluation at the same logical position has the same component type,
 * the same key, and props that are equal by Object.is for every own key —
 * including event handler functions, so a changed handler is never left stale.
 */
export function memo<P>(component: PureComponent<P>): PureComponent<P> {
  if (typeof component !== 'function') throw new Error('memo에는 순수 함수 컴포넌트를 전달해야 합니다.');
  const wrapped: PureComponent<P> = props => component(props);
  Object.defineProperty(wrapped, 'name', { value: component.name || 'anonymous' });
  memoComponents.add(wrapped);
  return wrapped;
}
export const isMemoComponent = (type: PureComponent): boolean => memoComponents.has(type);

export function sameProps(a: Readonly<Record<string, unknown>>, b: Readonly<Record<string, unknown>>): boolean {
  if (a === b) return true;
  const keys = Object.keys(a);
  if (keys.length !== Object.keys(b).length) return false;
  for (const key of keys) if (!Object.hasOwn(b, key) || !Object.is(a[key], b[key])) return false;
  return true;
}
