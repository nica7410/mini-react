import type { ComponentExpr, ElementExpr, EventBinding, RenderValue, StyleValue, VNode, VRoot } from '../core/types';
import { booleanAttrs, validateTree } from '../core/validate';
import { freezeBoundaryNode, freezeOwnedNode, identity, unwrap } from '../core/vdom';
import { normalizeKey } from './expression';
import { pureComputation } from './hooks';

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
}
function keyOf(value: RenderValue): string | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const expression = value as ElementExpr | ComponentExpr;
  return expression.kind === 'component-expr' ? expression.key : normalizeKey(expression.props.key);
}
function sameExpressionType(a: RenderValue, b: RenderValue): boolean {
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object' || Array.isArray(a) || Array.isArray(b)) return typeof a === typeof b;
  const aa = a as ElementExpr | ComponentExpr, bb = b as ElementExpr | ComponentExpr;
  if (aa.kind !== bb.kind || keyOf(aa) !== keyOf(bb)) return false;
  return aa.kind === 'element-expr' ? bb.kind === 'element-expr' && aa.tag === bb.tag : bb.kind === 'component-expr' && aa.type === bb.type;
}

export function evaluateExpression(value: RenderValue, previous: EvaluationState | null, reuse: boolean, onComponent?: (detail: Record<string, unknown>) => void): EvaluationResult {
  let componentExecutions = 0, reusedExpressions = 0;
  function resolveOne(value: RenderValue, old: EvaluationRecord | undefined, path: string): EvaluationRecord {
    if (old && !sameExpressionType(old.expression, value)) old = undefined;
    if (reuse && old && value && typeof value === 'object' && old.expression === value) {
      reusedExpressions++; onComponent?.({ path, reused: true }); return old;
    }
    // Each new VNode is sealed here, so a reused child is never walked again.
    const record = (vnode: VNode, children: readonly EvaluationRecord[] = [], result?: EvaluationRecord): EvaluationRecord =>
      ({ expression: value, vnode: result ? freezeBoundaryNode(vnode, result.vnode) : freezeOwnedNode(vnode), children, result });
    if (Array.isArray(value)) throw new Error('컴포넌트는 하나의 root만 반환해야 합니다.');
    if (value === null || value === undefined || typeof value === 'boolean') {
      return record({ kind: 'comment', identity: identity(), text: '', placeholder: true });
    }
    if (typeof value === 'string' || typeof value === 'number') return record({ kind: 'text', identity: identity(), text: String(value) });
    const expr = value as ElementExpr | ComponentExpr;
    if (expr.kind === 'component-expr') {
      componentExecutions++; onComponent?.({ path, reused: false, name: expr.type.name || 'anonymous', key: expr.key });
      const result = resolveOne(pureComputation(() => expr.type(expr.props)), old?.result, `${path}/result`);
      const child = result.vnode;
      return record({
        ...child,
        identity: {
          key: expr.key,
          renderedRootKey: child.identity.boundaries.length ? child.identity.renderedRootKey : child.identity.key,
          boundaries: [{ type: expr.type, key: expr.key }, ...child.identity.boundaries],
        },
      }, [], result);
    }
    if (expr.kind !== 'element-expr') throw new Error('잘못된 render 결과입니다.');
    if (expr.props.form?.selectedIndices !== undefined && !Array.isArray(expr.props.form.selectedIndices)) throw new Error('selectedIndices는 index 배열이어야 합니다.');
    const attrs: Record<string, string> = Object.create(null), style: Record<string, StyleValue> = {}, events: Record<string, EventBinding> = {};
    for (const [rawName, input] of Object.entries(expr.props.attrs ?? {})) {
      const name = rawName.toLowerCase();
      if (input === null || input === undefined) continue;
      if (booleanAttrs.has(name)) { if (input !== false) attrs[name] = ''; }
      else attrs[name] = String(input);
    }
    for (const [name, value] of Object.entries(expr.props.style ?? {})) style[name] = typeof value === 'string' ? { value, priority: '' } : { ...value };
    for (const [name, binding] of Object.entries(expr.props.events ?? {})) events[name] = typeof binding === 'function' ? { handler: binding, capture: false } : { ...binding };
    function flatten(values: readonly RenderValue[]): RenderValue[] {
      return values.flatMap(child => Array.isArray(child) ? flatten(child) : [child]);
    }
    const values = flatten(expr.children), oldChildren = old?.children ?? [];
    // 캐시도 부모 범위를 넘지 않는다. 고유 key가 없는 목록은 위치 슬롯으로 대응한다.
    const keyed = values.every(child => keyOf(child) !== null) && oldChildren.every(child => keyOf(child.expression) !== null);
    const byKey = keyed ? new Map(oldChildren.map(child => [keyOf(child.expression), child])) : null;
    const children = values.map((child, i) => resolveOne(child, byKey ? byKey.get(keyOf(child)) : oldChildren[i], `${path}/${keyed ? `key:${keyOf(child)}` : i}`));
    return record({
      kind: 'element', identity: identity(normalizeKey(expr.props.key)), tag: expr.tag,
      attrs, style, events,
      form: expr.props.form ? { ...expr.props.form, ...(expr.props.form.selectedIndices ? { selectedIndices: [...expr.props.form.selectedIndices] } : {}) }
        : ['input', 'textarea', 'select'].includes(expr.tag) ? { mode: 'uncontrolled' } : null,
      children: children.map(child => child.vnode),
    }, children);
  }
  const root = resolveOne(value, previous?.root, 'root');
  const snapshot = freezeOwnedNode<VRoot>({ kind: 'root', children: [root.vnode] });
  unwrap(validateTree(snapshot));
  return { snapshot, nextState: { root }, componentExecutions, reusedExpressions };
}

export function resolveExpression(value: RenderValue): VRoot { return evaluateExpression(value, null, false).snapshot; }
