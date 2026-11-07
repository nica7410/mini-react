# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: batching.spec.ts >> regression: capture setter cannot flush before the native parent bubble input handler
- Location: tests\browser\batching.spec.ts:19:1

# Error details

```
Test timeout of 30000ms exceeded.
```

```
Error: page.goto: Test timeout of 30000ms exceeded.
Call log:
  - navigating to "http://127.0.0.1:4173/", waiting until "load"

```

# Page snapshot

```yaml
- main [ref=e2]:
  - generic [ref=e3]:
    - text: MINI REACT / ENGINE LAB
    - heading "작은 엔진, 같은 갱신 경로." [level=1] [ref=e4]
    - paragraph [ref=e5]: DOM 편집과 루트 State가 하나의 VDOM → Diff → Patch로 이어집니다.
    - paragraph [ref=e6]: Keyed LIS · FIFO Batching · 명시적 Memo · 실제 실행 기록
  - region [ref=e7]:
    - generic [ref=e8]:
      - generic [ref=e9]:
        - text: 01 / DOM → VDOM
        - heading "편집하고, 변경분만 적용하기" [level=2] [ref=e10]
      - generic [ref=e11]:
        - button "Patch" [ref=e12] [cursor=pointer]
        - button "뒤로가기" [ref=e13] [cursor=pointer]
        - button "앞으로가기" [ref=e14] [cursor=pointer]
        - button "편집기 초기화" [ref=e15] [cursor=pointer]
    - status
    - generic [ref=e16]:
      - generic [ref=e17]:
        - heading "실제 영역 확정된 화면" [level=3] [ref=e18]:
          - text: 실제 영역
          - generic [ref=e19]: 확정된 화면
        - article [ref=e21]:
          - heading "오늘의 학습" [level=3] [ref=e22]
          - paragraph [ref=e23]: 테스트 영역에서 이 문장을 수정해 보세요.
          - list [ref=e24]:
            - listitem [ref=e25]: DOM을 VDOM으로 읽기
            - listitem [ref=e26]: 바뀐 부분만 Patch하기
      - generic [ref=e27]:
        - heading "테스트 영역 텍스트 직접 편집 가능" [level=3] [ref=e28]:
          - text: 테스트 영역
          - generic [ref=e29]: 텍스트 직접 편집 가능
        - textbox "테스트 영역" [ref=e30]
    - group [ref=e31]:
      - generic "HTML로 구조·속성 편집하기" [ref=e32] [cursor=pointer]
  - region [ref=e33]:
    - text: 02 / STATE → VDOM
    - heading "루트 Hooks로 다시 그리기" [level=2] [ref=e34]
    - paragraph [ref=e35]: 루트가 두 State를 보관합니다. 자식은 props로 요약을 만들고, useMemo는 두 배 값을 계산하며, Effect는 문서 제목을 동기화합니다.
    - button "컴포넌트 초기화" [ref=e36] [cursor=pointer]
  - region [ref=e37]:
    - text: 03 / ROOT STATE APP
    - generic [ref=e38]:
      - heading "작은 학습 목록" [level=2] [ref=e39]
      - button "목록 앱 초기화" [ref=e40] [cursor=pointer]
    - paragraph [ref=e41]: 추가·이름 수정·완료·검색·정렬을 하나의 루트 State로 처리합니다.
  - region [ref=e42]:
    - text: 03 / RECONCILIATION LAB
    - heading "같은 입력, 다른 이동 계획" [level=2] [ref=e43]
    - paragraph [ref=e44]: 매번 같은 초기 목록을 만든 뒤 실행합니다. 이동 수와 시간 성능은 별개의 지표입니다.
    - generic [ref=e45]:
      - generic [ref=e46]:
        - text: 전략
        - combobox "전략" [ref=e47]:
          - option "LIS" [selected]
          - option "Greedy"
      - generic [ref=e48]:
        - text: 입력
        - combobox "입력" [ref=e49]:
          - option "마지막 → 처음" [selected]
          - option "no-op"
          - option "한 항목 수정"
          - option "맨 앞 삽입"
          - option "중간 삭제"
          - option "처음 → 마지막"
          - option "역순"
          - option "인접 교환"
          - option "양끝 교환"
          - option "seed 순열"
          - option "10% 혼합"
      - generic [ref=e50]:
        - text: 개수
        - spinbutton "개수" [ref=e51]: "8"
      - generic [ref=e52]:
        - text: seed
        - spinbutton "seed" [ref=e53]: "539365639"
      - generic [ref=e54]:
        - text: 내용
        - combobox "내용" [ref=e55]:
          - option "텍스트" [selected]
          - option "입력·checkbox·중첩"
      - button "초기 상태에서 실행" [ref=e56] [cursor=pointer]
      - button "실험 초기화" [ref=e57] [cursor=pointer]
    - status
    - group [ref=e59]:
      - generic "입력 JSON 저장·실패 입력 재실행" [ref=e60] [cursor=pointer]
  - region [ref=e61]:
    - text: 04 / INSPECTOR
    - heading "엔진이 실제로 수행한 작업" [level=2] [ref=e62]
  - generic [ref=e63]: "현재 단계: Batching·명시적 재사용·실행 관찰. 실제 IME와 시간 성능은 검증 기록의 범위를 따릅니다."
```

# Test source

```ts
  1  | import { expect, test } from '@playwright/test';
  2  | 
  3  | test('T-S03/T-S05: real clicks batch three requests, while later clicks remain separate', async ({ page }) => {
  4  |   await page.goto('/');
  5  |   await page.evaluate(async () => {
  6  |     const modulePath = '/src/runtime/index.ts'; const { FunctionComponent, h, useState } = await import(modulePath);
  7  |     const output = document.createElement('div'); output.id = 'batch-probe'; document.body.append(output);
  8  |     const events: any[] = []; (window as any).batchEvents = events;
  9  |     const root = new FunctionComponent(() => {
  10 |       const [n, set] = useState(0);
  11 |       return h('button', { events: { click: () => { set((v: number) => v + 1); set((v: number) => v + 1); set((v: number) => v + 1); } } }, String(n));
  12 |     }, {}, output, { trace: { emit: (event: any) => events.push(event) } }); root.mount(); events.length = 0;
  13 |   });
  14 |   const button = page.locator('#batch-probe button'); await button.click(); await expect(button).toHaveText('3');
  15 |   await button.click(); await expect(button).toHaveText('6');
  16 |   expect(await page.evaluate(() => (window as any).batchEvents.filter((e: any) => e.phase === 'patch').length)).toBe(2);
  17 | });
  18 | 
  19 | test('regression: capture setter cannot flush before the native parent bubble input handler', async ({ page }) => {
> 20 |   await page.goto('/');
     |              ^ Error: page.goto: Test timeout of 30000ms exceeded.
  21 |   await page.evaluate(async () => {
  22 |     const modulePath = '/src/runtime/index.ts'; const { FunctionComponent, h, useState } = await import(modulePath);
  23 |     const output = document.createElement('div'); document.body.append(output);
  24 |     const root = new FunctionComponent(() => {
  25 |       const [value, setValue] = useState('old'), [n, setN] = useState(0);
  26 |       return h('div', { events: { input: (event: Event) => setValue((event.target as HTMLInputElement).value) } },
  27 |         h('div', { events: { input: { capture: true, handler: () => setN((n: number) => n + 1) } } },
  28 |           h('input', { attrs: { 'aria-label': 'capture-probe' }, form: { mode: 'controlled', value } })),
  29 |         h('output', { attrs: { 'aria-label': 'capture-result' } }, `${value}:${n}`));
  30 |     }, {}, output); root.mount();
  31 |   });
  32 |   await page.getByLabel('capture-probe').fill('native new');
  33 |   await expect(page.getByLabel('capture-probe')).toHaveValue('native new');
  34 |   await expect(page.getByLabel('capture-result')).toHaveText('native new:1');
  35 | });
  36 | 
```