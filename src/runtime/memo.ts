import type { PureComponent } from '../core/types';

// Explicit, opt-in row reuse. Only components wrapped with memo() are compared;
// every other component keeps running on each render (no automatic props memo).
const memoComponents = new WeakSet<PureComponent>();

/**
 * Returns a new pure component that the resolver may skip when the previous
 * committed evaluation at the same logical position has the same component type,
 * the same key, and props that are equal by Object.is for every own key (string
 * and symbol) — including event handler functions, so a changed handler is never
 * left stale.
 *
 * Contract: call memo() once at module scope. Calling it inside a render creates a
 * new component type every time, so nothing is reused and the subtree is recreated.
 * When a memo component is skipped, its whole subtree is skipped too, including
 * unwrapped child components. The subtree must depend only on its props (compared
 * by Object.is), never on module state, time or objects mutated in place.
 */
export function memo<P>(component: PureComponent<P>): PureComponent<P> {
  if (typeof component !== 'function') throw new Error('memo에는 순수 함수 컴포넌트를 전달해야 합니다.');
  const wrapped: PureComponent<P> = props => component(props);
  Object.defineProperty(wrapped, 'name', { value: component.name || 'anonymous' });
  memoComponents.add(wrapped);
  return wrapped;
}
export const isMemoComponent = (type: PureComponent): boolean => memoComponents.has(type);

export function sameProps(a: Readonly<Record<PropertyKey, unknown>> | null | undefined, b: Readonly<Record<PropertyKey, unknown>> | null | undefined): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  const keys = Reflect.ownKeys(a);
  if (keys.length !== Reflect.ownKeys(b).length) return false;
  for (const key of keys) if (!Object.hasOwn(b, key) || !Object.is(a[key], b[key])) return false;
  return true;
}
