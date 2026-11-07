import type { ComponentExpr, ElementExpr, EventBinding, RenderValue, StyleValue, VNode, VRoot } from '../core/types';
import { booleanAttrs, validateTree } from '../core/validate';
import { freezeTree, identity, unwrap } from '../core/vdom';
import { normalizeKey } from './expression';
import { pureComputation } from './hooks';

// M1에서는 매번 순수 자식을 평가한다. expression 참조 재사용은 M5에서 추가한다.
export function resolveExpression(value: RenderValue): VRoot {
  function resolveOne(value: RenderValue): VNode {
    if (Array.isArray(value)) throw new Error('컴포넌트는 하나의 root만 반환해야 합니다.');
    if (value === null || value === undefined || typeof value === 'boolean') {
      return { kind: 'comment', identity: identity(), text: '', placeholder: true };
    }
    if (typeof value === 'string' || typeof value === 'number') return { kind: 'text', identity: identity(), text: String(value) };
    const expr = value as ElementExpr | ComponentExpr;
    if (expr.kind === 'component-expr') {
      const child = resolveOne(pureComputation(() => expr.type(expr.props)));
      return {
        ...child,
        identity: {
          key: expr.key,
          renderedRootKey: child.identity.boundaries.length ? child.identity.renderedRootKey : child.identity.key,
          boundaries: [{ type: expr.type, key: expr.key }, ...child.identity.boundaries],
        },
      };
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
    function flatten(values: readonly RenderValue[]): VNode[] {
      return values.flatMap(child => Array.isArray(child) ? flatten(child) : [resolveOne(child)]);
    }
    return {
      kind: 'element', identity: identity(normalizeKey(expr.props.key)), tag: expr.tag,
      attrs, style, events,
      form: expr.props.form ? { ...expr.props.form, ...(expr.props.form.selectedIndices ? { selectedIndices: [...expr.props.form.selectedIndices] } : {}) }
        : ['input', 'textarea', 'select'].includes(expr.tag) ? { mode: 'uncontrolled' } : null,
      children: flatten(expr.children),
    };
  }
  const snapshot: VRoot = { kind: 'root', children: [resolveOne(value)] };
  unwrap(validateTree(snapshot));
  return freezeTree(snapshot);
}
