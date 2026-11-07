import type { FormPolicy, Result, VNode, VRoot } from './types';
import { fail, ok } from './vdom';

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
function styleProblem(name: string, value: string): boolean {
  if (!/^(--[\w-]+|[a-z-]+)$/.test(name)) return true;
  const decoded = value.replace(/\\([a-f\d]{1,6})\s?|\\(.)/gi, (_, hex: string | undefined, char: string | undefined) => hex ? String.fromCodePoint(Math.min(parseInt(hex, 16), 0x10ffff)) : char ?? '');
  if (/expression\s*\(|@import|behavior\s*:/i.test(decoded) || ['behavior', '-moz-binding'].includes(name)) return true;
  for (const url of decoded.matchAll(/url\s*\(\s*(?:"([^"]*)"|'([^']*)'|([^)]*))\s*\)/gi)) {
    if (attributeProblem('src', (url[1] ?? url[2] ?? url[3]).trim())) return true;
  }
  return false;
}
export function validateTree(tree: VRoot): Result<VRoot> {
  let problem: string | null = null;
  let problemPath = 'root';
  const rootRadioGroups = new Set<string>();
  function children(nodes: readonly VNode[], path: string, formGroups: Set<string> | null = null, selectMode: FormPolicy['mode'] | null = null) {
    const keys = new Set<string>();
    nodes.forEach((node, i) => {
      const here = `${path}/${i}`;
      function reject(message: string) { if (!problem) { problem = message; problemPath = here; } }
      if (node.identity.key === '') reject('빈 key는 허용하지 않습니다.');
      if (node.identity.key !== null) {
        if (keys.has(node.identity.key)) reject(`중복 key: ${node.identity.key}`);
        keys.add(node.identity.key);
      }
      if (node.kind !== 'element') return;
      if (!htmlTags.has(node.tag)) reject(`미지원 HTML 태그: ${node.tag}`);
      if (voidTags.has(node.tag) && node.children.length) reject(`${node.tag}에는 자식을 넣을 수 없습니다.`);
      for (const [name, value] of Object.entries(node.attrs)) {
        const message = attributeProblem(name, value);
        if (message) reject(message);
        if (name === 'style') reject('style은 별도 style 맵을 사용합니다.');
      }
      for (const [name, value] of Object.entries(node.style)) {
        if (styleProblem(name, value.value) || !['', 'important'].includes(value.priority)) reject(`미지원 CSS 입력: ${name}`);
      }
      const inputType = (node.attrs.type ?? 'text').toLowerCase();
      if (node.tag === 'form' && formGroups) reject('form 안에 form을 중첩할 수 없습니다.');
      if (node.tag === 'input' && inputType === 'radio') {
        if (node.form?.mode === 'snapshot' && !formGroups) reject('Phase 1 radio는 영역 내부의 독립된 form 안에 있어야 합니다.');
        const group = node.attrs.name;
        if (group && (node.form?.checked || (node.form?.mode === 'uncontrolled' && node.form.defaultChecked))) {
          const checked = formGroups ?? rootRadioGroups;
          if (checked.has(group)) reject('같은 radio 그룹에 checked=true를 여러 개 지정할 수 없습니다.');
          checked.add(group);
        }
      }
      if (node.tag === 'input' && inputType === 'file' && (node.form?.mode === 'controlled' || node.form?.value || node.form?.defaultValue)) reject('file input의 선택 파일/value 제어는 지원하지 않습니다.');
      if (node.form && !['input', 'textarea', 'select'].includes(node.tag)) reject('폼 정책은 input/textarea/select에만 사용합니다.');
      if (node.form && !['snapshot', 'controlled', 'uncontrolled'].includes(node.form.mode)) reject('잘못된 폼 소유 모드입니다.');
      if (node.form && node.form.mode !== 'snapshot') {
        if (['value', 'checked', 'selected'].some(k => Object.hasOwn(node.attrs, k))) reject('현재 폼 값은 form 필드로만 지정합니다.');
        if (node.tag === 'textarea' && node.children.length) reject('textarea 값은 form 필드로 지정합니다.');
        if (node.form.mode === 'uncontrolled' && (node.form.value !== undefined || node.form.checked !== undefined)) reject('uncontrolled의 초기 값은 defaultValue/defaultChecked를 사용합니다.');
        if (node.form.mode === 'controlled' && (node.form.defaultValue !== undefined || node.form.defaultChecked !== undefined)) reject('controlled에는 default 값을 함께 지정할 수 없습니다.');
        if (node.form.mode === 'controlled') {
          if (node.tag === 'select' && node.form.selectedIndices === undefined) reject('controlled select는 selectedIndices가 필요합니다.');
          else if (node.tag === 'input' && ['checkbox', 'radio'].includes(inputType) && node.form.checked === undefined) reject('controlled checkbox/radio는 checked가 필요합니다.');
          else if ((node.tag === 'textarea' || (node.tag === 'input' && !['checkbox', 'radio', 'file'].includes(inputType))) && node.form.value === undefined) reject('controlled 입력에는 value가 필요합니다.');
        }
      }
      if (node.tag === 'option' && selectMode && selectMode !== 'snapshot' && Object.hasOwn(node.attrs, 'selected')) reject('Phase 2 option 선택은 select의 selectedIndices로만 지정합니다.');
      if (node.form) {
        if (node.form.value !== undefined && typeof node.form.value !== 'string') reject('form.value는 문자열이어야 합니다.');
        if (node.form.checked !== undefined && typeof node.form.checked !== 'boolean') reject('form.checked는 boolean이어야 합니다.');
        if (node.form.selectedIndices !== undefined) {
          if (node.tag !== 'select') reject('selectedIndices는 select에만 사용합니다.');
          const indices = node.form.selectedIndices;
          const countOptions = (nodes: readonly VNode[]): number => nodes.reduce((n, child) => n + (child.kind === 'element' ? (child.tag === 'option' ? 1 : countOptions(child.children)) : 0), 0);
          const count = countOptions(node.children);
          if (indices.some(index => !Number.isInteger(index) || index < 0 || index >= count) || new Set(indices).size !== indices.length) reject('selectedIndices에 중복 또는 범위 밖의 index가 있습니다.');
          if (!Object.hasOwn(node.attrs, 'multiple') && indices.length > 1) reject('single select는 최대 하나만 선택할 수 있습니다.');
        }
        if (node.tag === 'select' && (node.form.value !== undefined || node.form.defaultValue !== undefined || node.form.checked !== undefined)) reject('select의 현재/초기 선택은 selectedIndices로 지정합니다.');
      }
      for (const name of Object.keys(node.events)) if (!/^[a-z][a-z0-9]*$/.test(name) || name.startsWith('on')) reject(`native 이벤트 이름을 사용하세요: ${name}`);
      children(node.children, here, node.tag === 'form' ? new Set() : formGroups, node.tag === 'select' ? node.form?.mode ?? 'uncontrolled' : selectMode);
    });
  }
  children(tree.children, 'root');
  return problem ? fail('INVALID_TREE', problem, problemPath) : ok(tree);
}
