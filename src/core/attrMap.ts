// Builder of engine-made attribute maps (study: docs/followup-attr-maps.md).
//
// An attribute map must not inherit anything: names such as `constructor` or `__proto__` are
// plain attribute data, and Object.prototype (even a hardened or polluted one) must never be
// read or written through the map. A plain `Object.create(null)` map would do that, but V8
// always keeps such an object in dictionary mode; Object.keys on it is several times slower
// than on an object with fast properties, and validateTree calls it for every element.
//
// The map is therefore built on an object whose only prototype is an empty frozen object
// (itself without a prototype), so every assignment still creates an own data property and
// no setter or inherited value can interfere. finishAttrMap then sets the prototype to null.
// The finished map is observably the same as before: null prototype, the same own keys in
// the same order, the same values. Only V8's internal representation differs.
const AttrMap = function () { /* empty: properties are assigned by the caller */ } as unknown as { new (): Record<string, string>; prototype: object };
AttrMap.prototype = Object.freeze(Object.create(null));

/** A new, empty attribute map under construction. Call finishAttrMap before it leaves the builder. */
export function createAttrMap(): Record<string, string> { return new AttrMap(); }

/** Ends construction: the map gets the null prototype every engine-built attribute map has. */
export function finishAttrMap(attrs: Record<string, string>): Record<string, string> { return Object.setPrototypeOf(attrs, null); }
