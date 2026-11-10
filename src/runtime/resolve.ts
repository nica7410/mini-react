import type { ComponentExpr, ElementExpr, EventBinding, RenderValue, StyleValue, VNode, VRoot } from '../core/types';
import { booleanAttrs, validateTree } from '../core/validate';
import { freezeBoundaryNode, freezeOwnedNode, identity, unwrap } from '../core/vdom';
import { createAttrMap, finishAttrMap } from '../core/attrMap';
import { normalizeKey } from './expression';
import { pureComputation } from './hooks';
import { isMemoComponent, sameProps } from './memo';

export interface EvaluationRecord {
  readonly expression: RenderValue;
  readonly vnode: VNode;
  readonly children: readonly EvaluationRecord[];
  readonly result?: EvaluationRecord;
}
export interface EvaluationState { readonly root: EvaluationRecord }
export interface EvaluationResult {
  readonly snapshot: VRoot;
  readonly nextState: EvaluationState;
  readonly componentExecutions: number;
  readonly reusedExpressions: number;
  /** Records reused by memo() props equality (counted apart from identical expressions). */
  readonly memoReuses: number;
}
function keyOf(value: RenderValue): string | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const expression = value as ElementExpr | ComponentExpr;
  return expression.kind === 'component-expr' ? expression.key : normalizeKey(expression.props.key);
}
const isExpression = (value: RenderValue): value is ElementExpr | ComponentExpr => !!value && typeof value === 'object' && !Array.isArray(value);
// An expression object (element/component) never matches a primitive, null or an array,
// even though `typeof null === 'object'`. Primitives keep matching by typeof as before.
function sameExpressionType(a: RenderValue, b: RenderValue): boolean {
  const aExpression = isExpression(a);
  if (aExpression !== isExpression(b)) return false;
  if (!aExpression) return typeof a === typeof b;
  const aa = a as ElementExpr | ComponentExpr, bb = b as ElementExpr | ComponentExpr;
  if (aa.kind !== bb.kind || keyOf(aa) !== keyOf(bb)) return false;
  return aa.kind === 'element-expr' ? bb.kind === 'element-expr' && aa.tag === bb.tag : bb.kind === 'component-expr' && aa.type === bb.type;
}

const formTags = new Set(['input', 'textarea', 'select']);
// Nested child arrays are appended in order to one output array. Holes in sparse
// arrays are skipped, as Array.prototype.flatMap did before.
function flattenInto(values: readonly RenderValue[], out: RenderValue[]): RenderValue[] {
  for (let i = 0; i < values.length; i++) {
    if (!(i in values)) continue;
    const child = values[i];
    if (Array.isArray(child)) flattenInto(child, out); else out.push(child);
  }
  return out;
}
// Each new VNode is sealed here, so a reused child is never walked again.
function makeRecord(expression: RenderValue, vnode: VNode, children: readonly EvaluationRecord[] = [], result?: EvaluationRecord): EvaluationRecord {
  return { expression, vnode: result ? freezeBoundaryNode(vnode, result.vnode) : freezeOwnedNode(vnode), children, result };
}

export function evaluateExpression(value: RenderValue, previous: EvaluationState | null, reuse: boolean, onComponent?: (detail: Record<string, unknown>) => void): EvaluationResult {
  let componentExecutions = 0, reusedExpressions = 0, memoReuses = 0;
  // Logical paths exist only for the trace callback; without it no path string is built.
  const tracing = !!onComponent;
  function resolveOne(value: RenderValue, old: EvaluationRecord | undefined, path: string): EvaluationRecord {
    if (old && !sameExpressionType(old.expression, value)) old = undefined;
    if (reuse && old && value && typeof value === 'object' && old.expression === value) {
      reusedExpressions++; onComponent?.({ path, reused: true }); return old;
    }
    if (Array.isArray(value)) throw new Error('컴포넌트는 하나의 root만 반환해야 합니다.');
    if (value === null || value === undefined || typeof value === 'boolean') {
      return makeRecord(value, { kind: 'comment', identity: identity(), text: '', placeholder: true });
    }
    if (typeof value === 'string' || typeof value === 'number') return makeRecord(value, { kind: 'text', identity: identity(), text: String(value) });
    const expr = value as ElementExpr | ComponentExpr;
    if (expr.kind === 'component-expr') {
      // Explicit memo(): props are compared only after the previous record is confirmed to be
      // a component expression of the same type and key (sameExpressionType alone is not
      // relied on). The previous record comes from the last committed evaluation, so a
      // failed render never leaves a reusable record behind.
      const before = old?.expression;
      if (reuse && old && isExpression(before) && before.kind === 'component-expr' && before.type === expr.type && before.key === expr.key
        && isMemoComponent(expr.type) && sameProps(before.props, expr.props)) {
        memoReuses++; onComponent?.({ path, reused: true, memo: true, name: expr.type.name || 'anonymous', key: expr.key }); return old;
      }
      componentExecutions++; onComponent?.({ path, reused: false, name: expr.type.name || 'anonymous', key: expr.key });
      const result = resolveOne(pureComputation(() => expr.type(expr.props)), old?.result, tracing ? `${path}/result` : '');
      const child = result.vnode;
      return makeRecord(value, {
        ...child,
        identity: {
          key: expr.key,
          renderedRootKey: child.identity.boundaries.length ? child.identity.renderedRootKey : child.identity.key,
          boundaries: [{ type: expr.type, key: expr.key }, ...child.identity.boundaries],
        },
      }, [], result);
    }
    if (expr.kind !== 'element-expr') throw new Error('잘못된 render 결과입니다.');
    const props = expr.props;
    if (props.form?.selectedIndices !== undefined && !Array.isArray(props.form.selectedIndices)) throw new Error('selectedIndices는 index 배열이어야 합니다.');
    const attrs = createAttrMap(), style: Record<string, StyleValue> = {}, events: Record<string, EventBinding> = {};
    if (props.attrs) for (const rawName of Object.keys(props.attrs)) {
      const input = props.attrs[rawName], name = rawName.toLowerCase();
      if (input === null || input === undefined) continue;
      if (booleanAttrs.has(name)) { if (input !== false) attrs[name] = ''; }
      else attrs[name] = String(input);
    }
    finishAttrMap(attrs);
    if (props.style) for (const name of Object.keys(props.style)) { const value = props.style[name]; style[name] = typeof value === 'string' ? { value, priority: '' } : { ...value }; }
    if (props.events) for (const name of Object.keys(props.events)) { const binding = props.events[name]; events[name] = typeof binding === 'function' ? { handler: binding, capture: false } : { ...binding }; }
    const values = flattenInto(expr.children, []), oldChildren = old?.children ?? [];
    // 캐시도 부모 범위를 넘지 않는다. 고유 key가 없는 목록은 위치 슬롯으로 대응한다.
    const keys: (string | null)[] = [];
    let keyed = true;
    for (const child of values) { const key = keyOf(child); keys.push(key); if (key === null) keyed = false; }
    let byKey: Map<string | null, EvaluationRecord> | null = null;
    if (keyed) {
      byKey = new Map();
      for (const child of oldChildren) {
        const key = keyOf(child.expression);
        if (key === null) { keyed = false; byKey = null; break; }
        byKey.set(key, child);
      }
    }
    const records: EvaluationRecord[] = [], vnodes: VNode[] = [];
    for (let i = 0; i < values.length; i++) {
      const record = resolveOne(values[i], byKey ? byKey.get(keys[i]) : oldChildren[i], tracing ? `${path}/${keyed ? `key:${keys[i]}` : i}` : '');
      records.push(record); vnodes.push(record.vnode);
    }
    return makeRecord(value, {
      kind: 'element', identity: identity(normalizeKey(props.key)), tag: expr.tag,
      attrs, style, events,
      form: props.form ? { ...props.form, ...(props.form.selectedIndices ? { selectedIndices: [...props.form.selectedIndices] } : {}) }
        : formTags.has(expr.tag) ? { mode: 'uncontrolled' } : null,
      children: vnodes,
    }, records);
  }
  const root = resolveOne(value, previous?.root, 'root');
  const snapshot = freezeOwnedNode<VRoot>({ kind: 'root', children: [root.vnode] });
  unwrap(validateTree(snapshot));
  return { snapshot, nextState: { root }, componentExecutions, reusedExpressions, memoReuses };
}

export function resolveExpression(value: RenderValue): VRoot { return evaluateExpression(value, null, false).snapshot; }
