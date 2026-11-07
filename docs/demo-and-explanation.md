# 실행 · 시연 · 핵심 원리 설명

## 실행 및 인수 명령

설치부터의 명령은 [README](../README.md)에 있다. Windows 검증 환경은 Node 24.22.1/pnpm 11.25.0이다. `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm test:browser`가 통과했고 실제 실행 시점·소스 hash는 [M7 JSON](validation/m7.json)에 있다. 다른 환경에서는 이 명령을 다시 실행해 확인한다.

`pnpm dev`는 5173, `pnpm preview`는 Vite 기본 preview 주소를 출력한다. 브라우저 테스트 전용 4173과 실험 전용 4175를 수동 서버로 점유하지 않는다. 데모를 종료할 때 서버 터미널에서 Ctrl+C를 누른다. 공개 URL 배포·원격 push는 이 작업 범위에 없다.

## 5분 시연 순서

| 순서 | 조작 | 관찰하고 설명할 것 |
|---|---|---|
| 1 | Phase 1 테스트 영역 텍스트 편집→Patch | 실제 DOM 캡처에서 출발, 필요한 부분만 변경, History version 증가 |
| 2 | 새 내용을 편집하되 Patch하지 않고 Undo→Redo | 현재 편집 DOM 재캡처, 남은 노드 없이 두 영역이 같은 snapshot |
| 3 | 목록 앱 새 항목·이름 수정·완료·검색·필터·정렬 | root State가 모든 동작을 소유, 자식은 props, key는 데이터 ID |
| 4 | `+1 세 번` | enqueue 3개, 후보값 3, 성공 commit 1회. 함수형 action을 버린 것이 아님 |
| 5 | 실험실 size 8, 마지막→처음, LIS/Greedy 각각 실행 | fresh old reset, 계획·실제 이동 1/7, DOM 객체와 입력값 유지 |
| 6 | 같은 실험의 역순/no-op·작은 목록 | LIS 이득 없음, 횟수와 시간은 별개; 전체 raw 결과도 같이 제시 |
| 7 | Inspector의 plan·ref/parent/anchor·이벤트 순서와 JSON | 하드코딩 그림이 아닌 실제 실행, fixture를 다시 넣어 동일 입력 재현 |
| 8 | 지연 이동 버튼 뒤 마지막 이름에서 한글 조합 | 조합 중 충돌 plan 보류, 종료 뒤 최신 상태 재계산. [수동 증거와 범위](m7-app-browser.md) |

순수 자식이나 setter/update가 DOM을 직접 바꾸는 지름길은 없다. Inspector overlay는 별도 UI이므로 엔진 갱신과 구분한다.

## 열 가지 핵심 질문

1. **VDOM과 mount binding을 왜 분리하나?** VDOM은 과거를 보존하는 값이고 DOM은 변경되는 객체다. 같은 값으로 독립된 두 영역을 만들고 History를 안전하게 저장하기 위해 분리한다.
2. **같은 key인데 왜 교체하나?** key는 같은 부모의 후보를 찾는 이름이다. host tag나 컴포넌트 경계 type/key가 달라지면 이전 identity와 호환되지 않는다.
3. **HABCDEFG에서 Greedy는 왜 7번인가?** old index 7을 먼저 최대값으로 유지하면 이후 0~6을 모두 이동해야 한다. LIS는 0~6을 유지해 H만 옮긴다.
4. **역순에서는 왜 LIS도 n−1번인가?** 재사용 노드의 증가 부분 수열이 하나뿐이다. 남길 수 있는 상대 순서가 하나라 나머지를 옮긴다.
5. **anchor가 index면 무엇이 문제인가?** 앞의 삭제·이동이 index 의미를 바꾼다. 오른쪽 확정 형제의 ref로 `insertBefore`하면 계획의 대상이 바뀌지 않는다.
6. **HTML이 같으면 정답인가?** 아니다. input의 live property, native handler, 실제 Node identity, focus/selection은 HTML 문자열만으로 확인할 수 없다. 각각 별도 oracle가 있다.
7. **Hook 슬롯과 closure의 차이는?** setter는 고정 슬롯을 가리키고 closure의 값은 해당 render 시점 값이다. updater 함수는 큐에서 직전 후보값을 받아 여러 요청을 이어 계산한다.
8. **요청 3개인데 commit 1개가 어떻게 가능한가?** 큐의 3개 action을 순서대로 모두 fold한 최종 후보를 한 번 렌더링한다. Effect 등 처리 중 추가 요청은 다음 prefix에 남긴다.
9. **VDOM History로 앱 state도 복원할 수 있나?** 이력에는 Hook 슬롯, 함수 closure, timer·외부 응답이 없다. Phase 1의 관리 DOM snapshot 복원이며 Phase 2 Time Travel은 범위 밖이다.
10. **이동 수가 줄면 왜 항상 빠르지 않나?** LIS·검증 계산 비용, 노드/서브트리 크기, 브라우저 style/layout/paint와 OS 변동이 남는다. diff·commit·cycle 시간과 별도 Performance trace를 구분해 설명한다.

자세한 데이터 흐름과 지원 조건은 [아키텍처](architecture.md)에 있다.

## 실제 실패 설명 예시

“처음에는 native input의 target capture에서 복원 microtask를 예약했다. jsdom 검사는 통과했지만 Chromium에서 부모 bubble handler 전에 복원이 실행되어 handler가 옛 값을 읽었다. capture에서는 dirty 표시만 하고 관리 container의 bubble 경계에서 flush하도록 바꿨다. 전파 중단은 다음 task로 처리한다. 부모 bubble 및 capture setter가 있는 브라우저 회귀 두 개를 고정했다.”

재현/검증 파일은 [m3.spec.ts](../tests/browser/m3.spec.ts)와 [batching.spec.ts](../tests/browser/batching.spec.ts)다. 실제 실패 내용과 수정 범위는 [M3](m3-correctness.md), [M5](m5-batching-reuse.md)를 참조한다.

## 학습자가 직접 수행할 작은 변경 연습

다음은 **제공한 연습 절차**이며 팀원 수행 완료 기록이 아니다. 깨끗한 작업 상태를 확인하고 변경한 부분만 되돌리며, 다른 작업을 덮어쓰지 않는다.

1. `batching.test.ts`의 초기값 1인 `+1 then *2` 예를 직접 추적한다. 순서를 바꾸면 예상값이 3이 됨을 설명하고 action/expected를 함께 바꾼 뒤 해당 파일만 실행한다.
2. 실험실에서 마지막→처음과 첫 번째→마지막을 비교한다. old index 배열과 Greedy 최대값을 종이에 쓰고 Inspector 이동 수와 대조한다.
3. `reuse.test.ts`의 mode 캡처 예를 읽고 deps에 mode가 필요한 이유를 설명한다. 결과가 오래되는 의도적 실험은 분리한 상태에서 하고 정상 계약으로 복원한 후 검사한다.

```sh
pnpm exec vitest run tests/integration/batching.test.ts
pnpm exec vitest run tests/integration/reuse.test.ts
pnpm exec playwright test tests/browser/batching.spec.ts --project=chromium
```

## CI와 재현성

[workflow](../.github/workflows/ci.yml)는 Ubuntu 24.04, Node 24.22.1, packageManager의 pnpm 버전, frozen lockfile을 사용한다. 타입→단위/통합→production build→Chromium/Firefox 설치→브라우저 순서로 검사하고 결과 JSON·실패 trace만 artifact로 보관한다. 벤치마크 전체 시간 비교는 공유 CI 머신의 통과 조건으로 넣지 않았다.

Action 버전은 2026-11-07 공식 저장소에서 확인한 commit SHA로 고정했다: [checkout v7](https://github.com/actions/checkout/tree/3d3c42e5aac5ba805825da76410c181273ba90b1), [setup-node v7](https://github.com/actions/setup-node/tree/949feb2413d6458794dcd2491c4babbbce0c15c1), [pnpm/action-setup v6](https://github.com/pnpm/action-setup/tree/73e46992e05b19abd31f2f3c20e0e7370d762115), [upload-artifact v7](https://github.com/actions/upload-artifact/tree/cf430e030ddbb5b0abf93d22962f4752f3646cd9).

**로컬 명령 통과와 CI 설정 작성까지 확인했으며 원격 CI 실행은 하지 않았다.** 따라서 badge나 “CI green”을 표시하지 않는다. 팀 합의·팀원 설명/변경 연습도 수행 사실이 확인되지 않았다.

## 증거에 맞는 포트폴리오 문구

- “Vanilla TypeScript로 두 Phase가 공유하는 불변 VDOM·Diff·Patch와 root Hooks를 구현했다.”
- “같은 identity/host 계약으로 Greedy와 LIS를 비교하고, 8개 항목의 마지막→처음 이동을 7회에서 1회로 줄였다. 전수·BFS oracle·실제 브라우저로 정답을 검증했다.”
- “FIFO 함수형 업데이트를 보존하며 +1 요청 3개의 commit을 1회로 합쳤다.”
- “157개 단위·통합, Chromium 19개와 Firefox smoke 10개로 History·폼·이벤트·Hook 회귀를 확인했고, 실제 Windows 한글 IME는 사용자 수동 검증을 받았다.”
- “실제 Trace Inspector, seed/JSON 재실행, counts와 timing을 분리하는 비교 환경을 만들었다.”

시간 개선 수치는 완료된 benchmark 보고서의 특정 환경·입력·지표·세션 범위와 함께만 사용한다. React 원본 개선, 일반적 React 대비 우위, LIS 발명, 이동 횟수 비율을 속도 비율로 바꾼 문구, 모든 브라우저/IME 호환성 주장은 하지 않는다.
