// Name-check study (docs/followup-validate-names.md): the validation under test must give the
// same verdict, message and path as the frozen baseline (tests/fixtures/validate-baseline.ts,
// src/core/validate.ts of 8ae389e) for every input. Generated inputs use a fixed seed.
import { describe, expect, it } from 'vitest';
import type { FormPolicy, VElement, VNode, VRoot } from '../../src/core/types';
import * as baseline from '../fixtures/validate-baseline';
import * as current from '../../src/core/validate';
import * as candidate from '../../research/validate-names/validate.candidate';

const implementations = { 'default validation': current, 'candidate V1': candidate };
const SEED = 20261110;

function random(seed: number) {
  let state = seed >>> 0 || 1;
  const next = () => { state ^= state << 13; state ^= state >>> 17; state ^= state << 5; return (state >>> 0) / 0x100000000; };
  const int = (limit: number) => Math.floor(next() * limit);
  return { next, int, pick: <T>(values: readonly T[]): T => values[int(values.length)], chance: (p: number) => next() < p };
}
const unit = (code: number) => String.fromCharCode(code);

// Code units whose case mapping or class could separate a regular expression from a scan:
// ASCII class borders, the Kelvin sign (K), long s (ſ), dotless i, dotted I, fullwidth letters,
// line terminators, NUL, a lone surrogate and combining marks.
const edgeUnits = [0, 9, 10, 13, 32, 45, 46, 47, 48, 57, 58, 59, 64, 65, 78, 79, 90, 91, 95, 96, 97, 110, 111, 122, 123, 127, 128,
  0x130, 0x131, 0x17f, 0x212a, 0x2028, 0x2029, 0x300, 0xd800, 0xdc00, 0xfeff, 0xff2f, 0xff4e, 0xff4f, 0xffff].map(unit);
const specialNames = ['srcdoc', 'is', 'xmlns', 'form', 'srcset', 'href', 'src', 'action', 'formaction', 'poster', 'cite', 'xlink:href',
  'style', 'class', 'id', 'type', 'value', 'checked', 'selected', 'on', 'onclick', 'one', 'o', 'n', 'no', 'data-on', 'aria-label',
  '__proto__', 'constructor', 'toString', 'hasOwnProperty', 'a.b', 'a:b', 'a-b', 'a_b', '_', '_on', 'x1', '1x', '-a', '.a', ':a'];
const values = ['', 'v', 'https://example.com/a', 'http://a', 'mailto:a@b', 'tel:1', 'javascript:alert(1)', 'JAVASCRIPT:alert(1)',
  ' java\tscript:alert(1)', 'java\nscript:x', '\u0000javascript:x', 'data:text/html,x', 'vbscript:x', '//host/path', '/path', 'a:b', 'a/b:c',
  '1:x', 'x 1x', 'x 1x, y 2x', 'x 100w, javascript:y 2x', 'x 1x 2x', 'x q', ' x  1.5x ,y', 'javascript:x 1x', ',', 'x,,y', 'ftp://a', 'blob:x'];
const caseVariants = (name: string) => [name, name.toUpperCase(), name[0].toUpperCase() + name.slice(1), name.slice(0, 1) + name.slice(1).toUpperCase()];

describe.each(Object.entries(implementations))('%s: same verdict as the 8ae389e validation', (_, validation) => {
  it('attributeProblem: every UTF-16 code unit in the first, second and later position', () => {
    const shapes = [(c: string) => c, (c: string) => `a${c}`, (c: string) => `${c}a`, (c: string) => `o${c}`, (c: string) => `${c}n`,
      (c: string) => `O${c}x`, (c: string) => `ab${c}`, (c: string) => `${c}${c}`];
    let compared = 0;
    const mismatches: string[] = [];
    for (let code = 0; code <= 0xffff; code++) {
      const c = unit(code);
      for (const shape of shapes) {
        const name = shape(c);
        compared++;
        if (validation.attributeProblem(name, 'v') !== baseline.attributeProblem(name, 'v') && mismatches.length < 5) mismatches.push(`U+${code.toString(16)} in ${JSON.stringify(name)}`);
      }
    }
    expect(mismatches).toEqual([]);
    expect(compared).toBe(65536 * shapes.length);
  });

  it('attributeProblem: special names in every case form, with URL and srcset values', () => {
    const names = [...new Set([...specialNames.flatMap(caseVariants), '', ...specialNames.flatMap(name => edgeUnits.flatMap(c => [`${name}${c}`, `${c}${name}`]))])];
    let rejected = 0, accepted = 0;
    for (const name of names) for (const value of values) {
      const expected = baseline.attributeProblem(name, value);
      expect(validation.attributeProblem(name, value), `${JSON.stringify(name)}=${JSON.stringify(value)}`).toBe(expected);
      if (expected) rejected++; else accepted++;
    }
    // The comparison is not vacuous: both outcomes and every message family occur.
    expect(rejected).toBeGreaterThan(1000);
    expect(accepted).toBeGreaterThan(1000);
    const messages = new Set(names.flatMap(name => values.map(value => baseline.attributeProblem(name, value)?.split(':')[0])));
    expect([...messages].filter(Boolean).sort()).toEqual(['잘못된 srcset 후보입니다.', '잘못된 속성 이름', '지원하지 않는 속성', '허용하지 않는 URL'].sort());
  });

  it('attributeProblem and eventNameProblem: 30,000 generated names (fixed seed)', () => {
    const rng = random(SEED);
    const alphabet = [...'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_.:-', ...'ononONOnoN', ...edgeUnits];
    const mismatches: string[] = [];
    for (let i = 0; i < 30000; i++) {
      const name = rng.chance(0.15) ? rng.pick(specialNames) + (rng.chance(0.5) ? rng.pick(alphabet) : '')
        : Array.from({ length: rng.int(7) }, () => rng.pick(alphabet)).join('');
      const value = rng.pick(values);
      if (validation.attributeProblem(name, value) !== baseline.attributeProblem(name, value)) mismatches.push(`attr ${JSON.stringify(name)}`);
      if (validation.eventNameProblem(name) !== baseline.eventNameProblem(name)) mismatches.push(`event ${JSON.stringify(name)}`);
    }
    expect(mismatches.slice(0, 5)).toEqual([]);
  });

  it('eventNameProblem: every UTF-16 code unit in the first, second and later position, and named cases', () => {
    const shapes = [(c: string) => c, (c: string) => `a${c}`, (c: string) => `${c}a`, (c: string) => `o${c}`, (c: string) => `${c}n`, (c: string) => `ab${c}`];
    const mismatches: string[] = [];
    for (let code = 0; code <= 0xffff; code++) for (const shape of shapes) {
      const name = shape(unit(code));
      if (validation.eventNameProblem(name) !== baseline.eventNameProblem(name) && mismatches.length < 5) mismatches.push(`U+${code.toString(16)} in ${JSON.stringify(name)}`);
    }
    expect(mismatches).toEqual([]);
    const named = { '': true, click: false, input: false, on: true, onclick: true, o: false, n: false, one: true, no: false, Click: true, cLick: true,
      click1: false, '1click': true, 'key-down': true, 'a.b': true, on1: true, o1n: false, ON: true, On: true, oN: true };
    for (const [name, expected] of Object.entries(named)) {
      expect(baseline.eventNameProblem(name), name).toBe(expected);
      expect(validation.eventNameProblem(name), name).toBe(expected);
    }
  });

  it('styleProblem (unchanged code that calls attributeProblem for url()) agrees on a corpus', () => {
    const styles = ['red', 'url(https://a/b.png)', 'url("javascript:x")', "url( 'data:x' )", 'URL(JAVASCRIPT:x)', 'u\\72l(javascript:x)', 'url(/a) url(vbscript:x)',
      'expression(1)', '@import x', 'behavior: x', 'url(a:b)', 'url()', 'url(x', '\\75rl(mailto:x)'];
    for (const name of ['color', 'background-image', '--x', 'behavior', '-moz-binding', 'Color', 'a b', '']) for (const value of styles) {
      expect(validation.styleProblem(name, value), `${name}: ${value}`).toBe(baseline.styleProblem(name, value));
    }
  });
});

// ---- whole trees ----------------------------------------------------------------------
const identity = (key: string | null) => ({ key, renderedRootKey: null, boundaries: [] });
const tags = ['div', 'span', 'ul', 'li', 'p', 'form', 'input', 'textarea', 'select', 'option', 'optgroup', 'br', 'img', 'a', 'button', 'label'];
const goodAttrs: [string, string][] = [['class', 'c'], ['id', 'i'], ['aria-label', 'l'], ['data-x', '1'], ['title', 't'], ['href', 'https://a'], ['src', '/a.png'],
  ['type', 'text'], ['type', 'radio'], ['type', 'checkbox'], ['type', 'file'], ['type', 'RADIO'], ['name', 'g'], ['name', 'h'], ['multiple', ''], ['placeholder', 'p'],
  ['srcset', 'a 1x, b 2x'], ['xlink:href', 'http://a'], ['a.b', 'x'], ['_x', 'x'], ['A', 'x']];
const badAttrs: [string, string][] = [['onclick', 'x'], ['ONLOAD', 'x'], ['On', 'x'], ['style', 'color:red'], ['srcdoc', 'x'], ['is', 'x'], ['xmlns', 'x'], ['form', 'f'],
  ['href', 'javascript:x'], ['src', ' java\tscript:x'], ['action', 'data:x'], ['srcset', 'a 1x 2x'], ['srcset', 'javascript:x 1x'], ['1a', 'x'], ['a b', 'x'], ['', 'x'],
  ['aK', 'x'], ['ſtyle', 'x'], ['value', 'v'], ['checked', ''], ['selected', '']];
const goodEvents = ['click', 'input', 'change', 'keydown', 'pointerdown2'];
const badEvents = ['onclick', 'on', 'Click', 'key-down', '', '1x', 'one'];
const goodStyles: [string, { value: string; priority: string }][] = [['color', { value: 'red', priority: '' }], ['--x', { value: '1', priority: 'important' }],
  ['background', { value: 'url(https://a/b.png)', priority: '' }]];
const badStyles: [string, { value: string; priority: string }][] = [['color', { value: 'url(javascript:x)', priority: '' }], ['Color', { value: 'red', priority: '' }],
  ['color', { value: 'red', priority: 'high' }], ['behavior', { value: 'x', priority: '' }], ['width', { value: 'expression(1)', priority: '' }]];
const forms: (FormPolicy | Record<string, unknown>)[] = [
  { mode: 'controlled', value: 'v' }, { mode: 'controlled', checked: true }, { mode: 'controlled', checked: false }, { mode: 'controlled' },
  { mode: 'uncontrolled' }, { mode: 'uncontrolled', defaultValue: 'd' }, { mode: 'uncontrolled', defaultChecked: true }, { mode: 'uncontrolled', value: 'v' },
  { mode: 'snapshot' }, { mode: 'snapshot', checked: true }, { mode: 'controlled', selectedIndices: [0] }, { mode: 'controlled', selectedIndices: [0, 1] },
  { mode: 'controlled', selectedIndices: [5] }, { mode: 'controlled', selectedIndices: [0, 0] }, { mode: 'controlled', value: 'v', defaultValue: 'd' },
  { mode: 'other' }, { mode: 'controlled', value: 1 }, { mode: 'controlled', checked: 'yes' }, { mode: 'controlled', value: 'v', selectedIndices: [0] },
];

function generateTree(rng: ReturnType<typeof random>, faultRate: number): VRoot {
  const build = (depth: number): VNode => {
    if (depth > 0 && rng.chance(0.25)) {
      return rng.chance(0.8) ? { kind: 'text', identity: identity(null), text: 't' } : { kind: 'comment', identity: identity(null), text: 'c', placeholder: false };
    }
    const fault = () => rng.chance(faultRate);
    const tag = fault() ? rng.pick(['blink', 'script', 'DIV', 'x-a']) : rng.pick(tags);
    const attrs: Record<string, string> = rng.chance(0.5) ? Object.create(null) : {};
    for (let i = rng.int(4); i > 0; i--) { const [name, value] = fault() ? rng.pick(badAttrs) : rng.pick(goodAttrs); attrs[name] = value; }
    const style: Record<string, { value: string; priority: string }> = {};
    if (rng.chance(0.2)) { const [name, value] = fault() ? rng.pick(badStyles) : rng.pick(goodStyles); style[name] = value; }
    const events: Record<string, { handler: () => void; capture: boolean }> = {};
    for (let i = rng.int(3); i > 0; i--) events[fault() ? rng.pick(badEvents) : rng.pick(goodEvents)] = { handler: () => {}, capture: false };
    const formTag = tag === 'input' || tag === 'textarea' || tag === 'select';
    const form = (formTag ? rng.chance(0.8) : fault()) ? rng.pick(forms) as FormPolicy : null;
    const keyed = rng.chance(0.3);
    const count = depth >= 4 || (tag === 'br' || tag === 'img' || tag === 'input' ? !fault() : false) ? 0 : rng.int(4);
    const children = Array.from({ length: count }, () => build(depth + 1)).map((child, index): VNode => {
      if (!keyed || child.kind !== 'element') return child;
      const key = fault() ? rng.pick(['', 'k0']) : `k${index}`;
      return { ...child, identity: identity(key) };
    });
    return { kind: 'element', identity: identity(null), tag, attrs, style: style as VElement['style'], events: events as VElement['events'], form, children };
  };
  return { kind: 'root', children: Array.from({ length: 1 + rng.int(3) }, () => build(0)) };
}

describe.each(Object.entries(implementations))('%s: validateTree equals the 8ae389e validateTree', (_, validation) => {
  it('2,000 generated trees: same result, message and path; an accepted tree is returned as is', () => {
    const rng = random(SEED);
    let accepted = 0;
    const messages = new Set<string>(), paths = new Set<string>();
    for (let i = 0; i < 2000; i++) {
      const tree = generateTree(rng, [0, 0.01, 0.04, 0.15][i % 4]);
      const expected = baseline.validateTree(tree), actual = validation.validateTree(tree);
      expect(actual, `tree ${i}`).toEqual(expected);
      if (expected.ok) { accepted++; expect(actual.ok && actual.value).toBe(tree); }
      else { messages.add(expected.diagnostics[0].message.split(':')[0]); paths.add(expected.diagnostics[0].path!); }
    }
    // Not vacuous: many accepted trees, many rejected ones, many rule families and positions.
    expect(accepted).toBeGreaterThan(300);
    expect(2000 - accepted).toBeGreaterThan(600);
    expect(messages.size).toBeGreaterThanOrEqual(20);
    expect(paths.size).toBeGreaterThan(100);
    for (const family of ['잘못된 속성 이름', '지원하지 않는 속성', '허용하지 않는 URL', 'style은 별도 style 맵을 사용합니다.', 'native 이벤트 이름을 사용하세요',
      '현재 폼 값은 form 필드로만 지정합니다.', '미지원 CSS 입력']) expect(messages, family).toContain(family);
  });

  it('the form-value test reads the same own properties of attrs in the same order (observed through a Proxy)', () => {
    const run = (validate: typeof baseline.validateTree, own: Record<string, string>, form: FormPolicy) => {
      const trace: string[] = [];
      const attrs = new Proxy(own, {
        ownKeys: target => { trace.push('ownKeys'); return Reflect.ownKeys(target); },
        getOwnPropertyDescriptor: (target, key) => { trace.push(`descriptor:${String(key)}`); return Reflect.getOwnPropertyDescriptor(target, key); },
        get: (target, key, receiver) => { trace.push(`get:${String(key)}`); return Reflect.get(target, key, receiver); },
        has: (target, key) => { trace.push(`has:${String(key)}`); return Reflect.has(target, key); },
      });
      const tree: VRoot = { kind: 'root', children: [{ kind: 'element', identity: identity(null), tag: 'input', attrs, style: {}, events: {}, form, children: [] }] };
      return { result: validate(tree), trace };
    };
    const cases: [Record<string, string>, FormPolicy][] = [
      [{ type: 'text' }, { mode: 'controlled', value: 'v' }], [{ type: 'text', value: 'x' }, { mode: 'controlled', value: 'v' }],
      [{ type: 'checkbox', checked: '' }, { mode: 'controlled', checked: true }], [{ selected: '', class: 'c' }, { mode: 'uncontrolled' }],
      [{ value: 'a', checked: '', selected: '' }, { mode: 'uncontrolled' }], [{ value: 'a' }, { mode: 'snapshot' }],
    ];
    for (const [own, form] of cases) {
      const expected = run(baseline.validateTree, own, form), actual = run(validation.validateTree, own, form);
      expect(actual.result).toEqual({ ...expected.result, ...(expected.result.ok ? { value: actual.result.ok ? actual.result.value : null } : {}) });
      expect(actual.trace).toEqual(expected.trace);
      expect(expected.trace.filter(entry => entry.startsWith('descriptor:value')).length).toBeGreaterThan(0);
    }
  });

  it('keeps no verdict between calls: a name changed after an accepted call is judged again (E1)', () => {
    const attrs: Record<string, string> = { title: 't' };
    const events: Record<string, { handler: () => void; capture: boolean }> = { click: { handler: () => {}, capture: false } };
    const tree: VRoot = { kind: 'root', children: [{ kind: 'element', identity: identity(null), tag: 'div', attrs, style: {}, events, form: null, children: [] }] };
    expect(validation.validateTree(tree).ok).toBe(true);
    attrs.onclick = 'x';
    expect(validation.validateTree(tree)).toEqual(baseline.validateTree(tree));
    expect(validation.validateTree(tree)).toMatchObject({ ok: false, diagnostics: [{ message: '지원하지 않는 속성: onclick', path: 'root/0' }] });
    delete attrs.onclick;
    expect(validation.validateTree(tree).ok).toBe(true);
    events.onclick = events.click;
    expect(validation.validateTree(tree)).toMatchObject({ ok: false, diagnostics: [{ message: 'native 이벤트 이름을 사용하세요: onclick' }] });
    delete events.onclick;
    for (let i = 0; i < 3; i++) expect(validation.validateTree(tree).ok).toBe(true);
  });
});
