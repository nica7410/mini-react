import type { Result, VNode, VRoot } from './types';
import { fail, ok } from './vdom';

export const htmlTags = new Set(('a abbr address article aside b bdi bdo blockquote br button caption cite code col colgroup dd del details dfn div dl dt em fieldset figcaption figure footer form h1 h2 h3 h4 h5 h6 header hgroup hr i img input ins kbd label legend li main mark menu meter nav ol optgroup option output p picture pre progress q rp rt ruby s samp search section select small source span strong sub summary sup table tbody td textarea tfoot th thead time tr u ul var wbr').split(' '));
export const voidTags = new Set('br col hr img input source wbr'.split(' '));
export const booleanAttrs = new Set('allowfullscreen async autofocus autoplay checked controls default defer disabled formnovalidate hidden inert ismap itemscope loop multiple muted nomodule novalidate open playsinline readonly required reversed selected'.split(' '));

export function attributeProblem(name: string, value: string): string | null {
  if (!/^[a-z_][a-z0-9_.:-]*$/i.test(name)) return `잘못된 속성 이름: ${name}`;
  if (/^on/i.test(name) || ['srcdoc', 'is', 'xmlns', 'form', 'srcset'].includes(name)) return `지원하지 않는 속성: ${name}`;
  if (['href', 'src', 'action', 'formaction', 'poster', 'cite', 'xlink:href'].includes(name)) {
    const compact = value.replace(/[\u0000-\u0020\u007f]/g, '');
    const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(compact)?.[1].toLowerCase();
    if (scheme && !['https', 'http', 'mailto', 'tel'].includes(scheme)) return `허용하지 않는 URL: ${name}`;
  }
  return null;
}
export function validateTree(tree: VRoot): Result<VRoot> {
  let problem: string | null = null;
  let problemPath = 'root';
  function children(nodes: readonly VNode[], path: string) {
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
        if (!/^(--[\w-]+|[a-z-]+)$/.test(name) || /url\s*\(|expression\s*\(|@import/i.test(value.value)) reject(`미지원 CSS 입력: ${name}`);
      }
      if (node.tag === 'input' && ['file', 'radio'].includes((node.attrs.type ?? '').toLowerCase())) reject('M1에서는 file/radio input을 지원하지 않습니다.');
      if (node.form && !['input', 'textarea', 'select'].includes(node.tag)) reject('폼 정책은 input/textarea/select에만 사용합니다.');
      if (node.form && node.form.mode !== 'snapshot') {
        if (['value', 'checked', 'selected'].some(k => Object.hasOwn(node.attrs, k))) reject('현재 폼 값은 form 필드로만 지정합니다.');
        if (node.tag === 'textarea' && node.children.length) reject('textarea 값은 form 필드로 지정합니다.');
      }
      for (const name of Object.keys(node.events)) if (!/^[a-z][a-z0-9]*$/.test(name) || name.startsWith('on')) reject(`native 이벤트 이름을 사용하세요: ${name}`);
      children(node.children, here);
    });
  }
  children(tree.children, 'root');
  return problem ? fail('INVALID_TREE', problem, problemPath) : ok(tree);
}
