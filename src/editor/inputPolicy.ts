import type { Result } from '../core/types';
import { readDOM } from '../core/capture';
import { ok } from '../core/vdom';

export function parseEditorHTML(doc: Document, html: string): Result<DocumentFragment> {
  // template 내부는 inert하다. 검사가 끝나기 전에 실제 문서에 연결하지 않는다.
  const template = doc.createElement('template');
  template.innerHTML = html;
  const checked = readDOM(template.content);
  return checked.ok ? ok(template.content) : checked;
}
export function replaceEditorHTML(container: HTMLElement, html: string): Result<void> {
  const parsed = parseEditorHTML(container.ownerDocument, html);
  if (!parsed.ok) return parsed;
  container.replaceChildren(parsed.value);
  return ok(undefined);
}
