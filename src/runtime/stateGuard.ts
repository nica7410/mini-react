// 불변 state 계약의 개발 진단. 사용자 정의 클래스/DOM/Map 등은 동결하지 않는다.
// 참조를 복제하지 않으므로 Object.is와 setter의 값 의미는 유지된다.
export function guardState<T>(value: T, seen = new WeakSet<object>()): T {
  if (!import.meta.env.DEV || value === null || typeof value !== 'object' || seen.has(value)) return value;
  const prototype = Object.getPrototypeOf(value);
  if (!Array.isArray(value) && prototype !== Object.prototype && prototype !== null) return value;
  seen.add(value);
  for (const child of Object.values(value)) guardState(child, seen);
  return Object.freeze(value);
}
