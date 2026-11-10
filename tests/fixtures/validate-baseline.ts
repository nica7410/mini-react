// Frozen copy of src/core/validate.ts at commit 8ae389e (the validation used by baseline B0).
// Only the two import paths differ. Tests compare the current validation with this copy.
// Do not edit: it is the reference of the name-check study (docs/followup-validate-names.md).
import type { FormPolicy, PatchOp, Result, VElement, VNode, VRoot } from '../../src/core/types';
import { fail, ok } from '../../src/core/vdom';

export const htmlTags = new Set(('a abbr address area article aside audio b bdi bdo blockquote br button canvas caption cite code col colgroup datalist dd del details dfn div dl dt em fieldset figcaption figure footer form h1 h2 h3 h4 h5 h6 header hgroup hr i img input ins kbd label legend li main map mark menu meter nav ol optgroup option output p picture pre progress q rp rt ruby s samp search section select small source span strong sub summary sup table tbody td textarea tfoot th thead time tr track u ul var video wbr').split(' '));
export const voidTags = new Set('area br col hr img input source track wbr'.split(' '));
export const booleanAttrs = new Set('allowfullscreen async autofocus autoplay checked controls default defer disabled formnovalidate hidden inert ismap itemscope loop multiple muted nomodule novalidate open playsinline readonly required reversed selected'.split(' '));

export function attributeProblem(name: string, value: string): string | null {
  if (!/^[a-z_][a-z0-9_.:-]*$/i.test(name)) return `잘못된 속성 이름: ${name}`;
  if (/^on/i.test(name) || ['srcdoc', 'is', 'xmlns', 'form'].includes(name)) return `지원하지 않는 속성: ${name}`;
  if (name === 'srcset') {
    for (const candidate of value.split(',')) {
      const [url, ...descriptors] = candidate.trim().split(/\s+/);
      const problem = attributeProblem('src', url);
      if (problem || descriptors.length > 1 || descriptors.some(d => !/^(\d+w|(?:\d*\.)?\d+x)$/.test(d))) return problem ?? '잘못된 srcset 후보입니다.';
    }
  }
  if (['href', 'src', 'action', 'formaction', 'poster', 'cite', 'xlink:href'].includes(name)) {
    const compact = value.replace(/[\u0000-\u0020\u007f]/g, '');
    const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(compact)?.[1].toLowerCase();
    if (scheme && !['https', 'http', 'mailto', 'tel'].includes(scheme)) return `허용하지 않는 URL: ${name}`;
  }
  return null;
}
export function styleProblem(name: string, value: string): boolean {
  if (!/^(--[\w-]+|[a-z-]+)$/.test(name)) return true;
  const decoded = value.replace(/\\([a-f\d]{1,6})\s?|\\(.)/gi, (_, hex: string | undefined, char: string | undefined) => hex ? String.fromCodePoint(Math.min(parseInt(hex, 16), 0x10ffff)) : char ?? '');
  if (/expression\s*\(|@import|behavior\s*:/i.test(decoded) || ['behavior', '-moz-binding'].includes(name)) return true;
  for (const url of decoded.matchAll(/url\s*\(\s*(?:"([^"]*)"|'([^']*)'|([^)]*))\s*\)/gi)) {
    if (attributeProblem('src', (url[1] ?? url[2] ?? url[3]).trim())) return true;
  }
  return false;
}
const formTags = new Set(['input', 'textarea', 'select']);
const choiceTypes = new Set(['checkbox', 'radio']);
const valueLessTypes = new Set(['checkbox', 'radio', 'file']);
const formModes = new Set(['snapshot', 'controlled', 'uncontrolled']);
const currentValueAttrs = ['value', 'checked', 'selected'];
export const eventNameProblem = (name: string): boolean => !/^[a-z][a-z0-9]*$/.test(name) || name.startsWith('on');
const countOptions = (nodes: readonly VNode[]): number => {
  let count = 0;
  for (const child of nodes) if (child.kind === 'element') count += child.tag === 'option' ? 1 : countOptions(child.children);
  return count;
};

// Final policy (E1): every call checks the whole root, including radio/form/select
// and sibling-key context. No result is cached, even for the same frozen VRoot.
// The walk keeps an index stack and builds the error path only for the first problem.
export function validateTree(tree: VRoot): Result<VRoot> {
  let problem: string | null = null;
  let problemPath = 'root';
  const rootRadioGroups = new Set<string>();
  const indices: number[] = [];
  function reject(message: string) {
    if (problem) return;
    problem = message; problemPath = indices.length ? `root/${indices.join('/')}` : 'root';
  }
  function children(nodes: readonly VNode[], formGroups: Set<string> | null = null, selectMode: FormPolicy['mode'] | null = null) {
    let keys: Set<string> | null = null;
    const depth = indices.length; indices.push(0);
    for (let i = 0; i < nodes.length; i++) {
      indices[depth] = i;
      const node = nodes[i];
      if (node.identity.key === '') reject('빈 key는 허용하지 않습니다.');
      if (node.identity.key !== null) {
        keys ??= new Set();
        if (keys.has(node.identity.key)) reject(`중복 key: ${node.identity.key}`);
        keys.add(node.identity.key);
      }
      if (node.kind !== 'element') continue;
      if (!htmlTags.has(node.tag)) reject(`미지원 HTML 태그: ${node.tag}`);
      if (voidTags.has(node.tag) && node.children.length) reject(`${node.tag}에는 자식을 넣을 수 없습니다.`);
      const attrs = node.attrs;
      for (const name of Object.keys(attrs)) {
        const message = attributeProblem(name, attrs[name]);
        if (message) reject(message);
        if (name === 'style') reject('style은 별도 style 맵을 사용합니다.');
      }
      const style = node.style;
      for (const name of Object.keys(style)) {
        const value = style[name];
        if (styleProblem(name, value.value) || !(value.priority === '' || value.priority === 'important')) reject(`미지원 CSS 입력: ${name}`);
      }
      const inputType = node.tag === 'input' ? (attrs.type ?? 'text').toLowerCase() : '';
      const form = node.form;
      if (node.tag === 'form' && formGroups) reject('form 안에 form을 중첩할 수 없습니다.');
      if (inputType === 'radio') {
        if (form?.mode === 'snapshot' && !formGroups) reject('Phase 1 radio는 영역 내부의 독립된 form 안에 있어야 합니다.');
        const group = attrs.name;
        if (group && (form?.checked || (form?.mode === 'uncontrolled' && form.defaultChecked))) {
          const checked = formGroups ?? rootRadioGroups;
          if (checked.has(group)) reject('같은 radio 그룹에 checked=true를 여러 개 지정할 수 없습니다.');
          checked.add(group);
        }
      }
      if (inputType === 'file' && (form?.mode === 'controlled' || form?.value || form?.defaultValue)) reject('file input의 선택 파일/value 제어는 지원하지 않습니다.');
      if (form && !formTags.has(node.tag)) reject('폼 정책은 input/textarea/select에만 사용합니다.');
      if (form && !formModes.has(form.mode)) reject('잘못된 폼 소유 모드입니다.');
      if (form && form.mode !== 'snapshot') {
        if (currentValueAttrs.some(k => Object.hasOwn(attrs, k))) reject('현재 폼 값은 form 필드로만 지정합니다.');
        if (node.tag === 'textarea' && node.children.length) reject('textarea 값은 form 필드로 지정합니다.');
        if (form.mode === 'uncontrolled' && (form.value !== undefined || form.checked !== undefined)) reject('uncontrolled의 초기 값은 defaultValue/defaultChecked를 사용합니다.');
        if (form.mode === 'controlled' && (form.defaultValue !== undefined || form.defaultChecked !== undefined)) reject('controlled에는 default 값을 함께 지정할 수 없습니다.');
        if (form.mode === 'controlled') {
          if (node.tag === 'select' && form.selectedIndices === undefined) reject('controlled select는 selectedIndices가 필요합니다.');
          else if (choiceTypes.has(inputType) && form.checked === undefined) reject('controlled checkbox/radio는 checked가 필요합니다.');
          else if ((node.tag === 'textarea' || (node.tag === 'input' && !valueLessTypes.has(inputType))) && form.value === undefined) reject('controlled 입력에는 value가 필요합니다.');
        }
      }
      if (node.tag === 'option' && selectMode && selectMode !== 'snapshot' && Object.hasOwn(attrs, 'selected')) reject('Phase 2 option 선택은 select의 selectedIndices로만 지정합니다.');
      if (form) {
        if (form.value !== undefined && typeof form.value !== 'string') reject('form.value는 문자열이어야 합니다.');
        if (form.checked !== undefined && typeof form.checked !== 'boolean') reject('form.checked는 boolean이어야 합니다.');
        if (form.selectedIndices !== undefined) {
          if (node.tag !== 'select') reject('selectedIndices는 select에만 사용합니다.');
          const selected = form.selectedIndices;
          const count = countOptions(node.children);
          if (selected.some(index => !Number.isInteger(index) || index < 0 || index >= count) || new Set(selected).size !== selected.length) reject('selectedIndices에 중복 또는 범위 밖의 index가 있습니다.');
          if (!Object.hasOwn(attrs, 'multiple') && selected.length > 1) reject('single select는 최대 하나만 선택할 수 있습니다.');
        }
        if (node.tag === 'select' && (form.value !== undefined || form.defaultValue !== undefined || form.checked !== undefined)) reject('select의 현재/초기 선택은 selectedIndices로 지정합니다.');
      }
      for (const name of Object.keys(node.events)) if (eventNameProblem(name)) reject(`native 이벤트 이름을 사용하세요: ${name}`);
      if (node.children.length) children(node.children, node.tag === 'form' ? new Set() : formGroups, node.tag === 'select' ? form?.mode ?? 'uncontrolled' : selectMode);
    }
    indices.length = depth;
  }
  children(tree.children);
  return problem ? fail('INVALID_TREE', problem, problemPath) : ok(tree);
}

/**
 * Command admissibility (Patch preflight): the payload one host-writing command carries must
 * pass the same attribute/style/event rules validateTree applies to that field of that node.
 * A final state that equals a valid target does not excuse a forbidden payload that a later
 * command overwrites or removes: the host would still have received the write.
 * Removal commands carry no payload and are not judged here. SYNC_FORM is judged by the
 * caller (every policy for one node must be the final, tree-validated policy), because a form
 * policy is not last-wins on the host (a radio write changes other nodes of its group).
 * `target` is the simulated node at that command; `selectModeOf` gives the mode of the select
 * that owns a node and is only called for a `selected` attribute on an option.
 */
export function commandProblem(op: PatchOp, target: VElement, selectModeOf: (ref: string) => FormPolicy['mode'] | null): string | null {
  switch (op.kind) {
    case 'SET_ATTR': {
      if (typeof op.name !== 'string' || typeof op.value !== 'string') return '속성 이름과 값은 문자열이어야 합니다.';
      const problem = attributeProblem(op.name, op.value);
      if (problem) return problem;
      if (op.name === 'style') return 'style은 별도 style 맵을 사용합니다.';
      if (currentValueAttrs.includes(op.name)) {
        if (target.form && target.form.mode !== 'snapshot') return '현재 폼 값은 form 필드로만 지정합니다.';
        if (op.name === 'selected' && target.tag === 'option') {
          const mode = selectModeOf(op.node);
          if (mode && mode !== 'snapshot') return 'Phase 2 option 선택은 select의 selectedIndices로만 지정합니다.';
        }
      }
      return null;
    }
    case 'SET_STYLE': {
      const value = op.value;
      if (typeof op.name !== 'string' || !value || typeof value.value !== 'string' || styleProblem(op.name, value.value)
        || !(value.priority === '' || value.priority === 'important')) return `미지원 CSS 입력: ${String(op.name)}`;
      return null;
    }
    case 'SET_EVENT':
      if (op.binding !== null && (typeof op.name !== 'string' || eventNameProblem(op.name))) return `native 이벤트 이름을 사용하세요: ${String(op.name)}`;
      return null;
    default: return null;
  }
}
