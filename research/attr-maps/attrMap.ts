// Candidate R1 of the attribute-map study (docs/validation/followup-attr-maps/plan.md).
//
// An attribute map must not inherit anything: names such as `constructor` or `__proto__` are
// plain attribute data, and Object.prototype (even a hardened or polluted one) must never be
// read or written through the map. Until now the map was `Object.create(null)`, which V8
// always keeps in dictionary mode; Object.keys on such an object is several times slower than
// on an object with fast properties, and validateTree calls it for every element.
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
