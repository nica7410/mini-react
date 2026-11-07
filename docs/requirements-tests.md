# 요구사항 · 테스트 · 완료 증거

기능 소스 `3190268`, 2026-11-07 검증 기준이다. 테스트 ID는 명세의 계약 단위이며 테스트 함수 개수와 일대일 대응하지 않는다. 같은 계약을 여러 입력과 계층에서 확인한다. ID가 제목에 없더라도 아래에 정확한 의미와 파일을 연결했다. [M7 실행 요약·source hash](validation/m7.json), [단계별 기록](progress.md)을 함께 본다.

## 기능 ID

| 기능 ID | 실제 구현 | 검증/근거 |
|---|---|---|
| P1-01 | `core/vdom.ts`, `capture.ts`, `mount.ts`, `validate.ts` | T-V01~V06 |
| P1-02 | `core/reconcile.ts`, `planValidation.ts` | T-D01~D04, E01 |
| P1-03 | `core/keyed.ts`, 공통 reconcile/patch | T-K01~K07, L01~L04 |
| P1-04 | `core/patch.ts`, `host/forms.ts`, `events.ts`, `inputs.ts`, `browserState.ts` | T-P01~P06, B01~B05 |
| P1-05 | `editor/controller.ts`, `history.ts`, 편집 UI | T-H01~H06 |
| P1-06 | `editor/inputPolicy.ts`, tree/plan 검증, 오류 UI | T-V05, E01~E03 |
| P2-01 | `runtime/FunctionComponent.ts`, `expression.ts`, `resolve.ts` | T-C01~C04 |
| P2-02 | `runtime/hooks.ts`, `updateQueue.ts`, `stateGuard.ts` | T-S01~S07 |
| P2-03 | 루트 commit 이후 Effect/cleanup, 앱 timer/listener | T-F01~F07 |
| P2-04 | Memo 슬롯, 위치별 expression 평가 기록 | T-M01~M04 |
| APP-01 | `app/tasks.ts`, root State + props 순수 자식 | T-A01~A03 |
| Q-01 | `observe/recorder.ts`, `inspector.ts`, `app/lab.ts` | T-Q01~Q03 |
| Q-02 | 실제 planner 전수/BFS/seed + 실제 DOM/browser | 아래 전체 테스트 대응, M4/M7 증거 |
| Q-03 | `bench/harness.ts`, `fixtures.ts`, `scripts/benchmark.mjs` | [M6 방법](m6-observability.md), [전체 raw·그래프·해석](benchmark-results.md), [원본 감사](bench/m8-full/analysis.json) |
| Q-04 | 로컬 데모·이 문서·아키텍처·설명·CI | [데모/명령](demo-and-explanation.md), `.github/workflows/ci.yml`; 원격 CI 실행 미수행 |

## DOM · Diff · Patch (16개 ID)

| ID | 증명하는 동작 | 실제 테스트 |
|---|---|---|
| T-V01 | element/text/comment/공백/빈 root 왕복과 빈 text 슬롯 | [vdom](../tests/unit/vdom.test.ts) |
| T-V02 | attribute/default와 live value/checked/선택 구분 | [vdom](../tests/unit/vdom.test.ts), [forms](../tests/integration/forms.test.ts), [M3 browser](../tests/browser/m3.spec.ts) |
| T-V03 | 0/빈 문자열/placeholder/중첩 배열 순서 | [vdom](../tests/unit/vdom.test.ts) |
| T-V04 | 같은 VDOM 두 mount의 DOM/ref 독립 | [vdom](../tests/unit/vdom.test.ts) |
| T-V05 | 위험/미지원 입력을 연결 전 거절, 기존 화면 유지 | [vdom](../tests/unit/vdom.test.ts), [forms](../tests/integration/forms.test.ts), [M1 browser](../tests/browser/m1.spec.ts), [M3 browser](../tests/browser/m3.spec.ts) |
| T-V06 | 외부 편집 capture/adopt/revision, 오래된 capture·같은 HTML의 객체 교체 거절 | [vdom](../tests/unit/vdom.test.ts) |
| T-D01 | 순수 Node 환경 Diff와 추가/삭제/교체/쓰기 결과 | [diff](../tests/unit/diff.test.ts), [patch](../tests/integration/patch.test.ts) |
| T-D02 | 동등한 새 트리/no-op의 DOM 쓰기 0·identity | [patch](../tests/integration/patch.test.ts), [reuse](../tests/integration/reuse.test.ts) |
| T-D03 | 삭제+이동+수정에서 ref 대상 정확 | [patch](../tests/integration/patch.test.ts), [plan-validation](../tests/integration/plan-validation.test.ts), [keyed](../tests/integration/keyed.test.ts) |
| T-D04 | 다중 root·전체 삭제·교체에서 container 보존 | [patch](../tests/integration/patch.test.ts) |
| T-P01 | 속성/style 추가·변경·삭제와 boolean 존재 의미 | [patch](../tests/integration/patch.test.ts) |
| T-P02 | handler A→B→없음·capture 변경·해제 | [patch](../tests/integration/patch.test.ts), [reuse](../tests/integration/reuse.test.ts) |
| T-P03 | keyed 이동 시 같은 DOM·live 입력 보존 | [keyed](../tests/integration/keyed.test.ts), [keyed browser](../tests/browser/keyed.spec.ts) |
| T-P04 | option/optgroup 변경 뒤 선택 복원·빈 선택·multiple | [forms](../tests/integration/forms.test.ts) |
| T-P05 | subtree root 배치와 내부 생성/삭제 수 분리 | [patch](../tests/integration/patch.test.ts) |
| T-P06 | 동일 State/동일 VNode에서도 dirty controlled 복원 | [forms](../tests/integration/forms.test.ts), [reuse](../tests/integration/reuse.test.ts), [M3 browser](../tests/browser/m3.spec.ts) |

## Keyed · LIS (11개 ID)

| ID | 증명하는 동작 | 실제 테스트 |
|---|---|---|
| T-K01 | 호환 key/type 이동의 객체 identity 유지 | [keyed](../tests/integration/keyed.test.ts), [browser](../tests/browser/keyed.spec.ts) |
| T-K02 | 같은 key의 host/component type 교체 | [keyed](../tests/integration/keyed.test.ts), [hooks](../tests/integration/hooks.test.ts) |
| T-K03 | 변경/삭제/신규 key의 생성·제거·재사용 구분 | [keyed](../tests/integration/keyed.test.ts), [browser](../tests/browser/keyed.spec.ts) |
| T-K04 | 양쪽 중복 key commit 전 거절, History 유지 | [keyed](../tests/integration/keyed.test.ts), [history](../tests/integration/history.test.ts) |
| T-K05 | 공백/text/placeholder/누락 key fallback, 이유 기록 | [keyed](../tests/integration/keyed.test.ts), [planner](../tests/unit/keyed-exhaustive.test.ts) |
| T-K06 | 다른 부모/mount의 동일 key는 binding 공유하지 않음 | [keyed](../tests/integration/keyed.test.ts), [vdom](../tests/unit/vdom.test.ts), [reuse](../tests/integration/reuse.test.ts) |
| T-K07 | 외부 key/host가 같아도 내부 경계/반환 root key 교체 | [keyed](../tests/integration/keyed.test.ts), [hooks](../tests/integration/hooks.test.ts) |
| T-L01 | n=1~8 실제 planner 모든 순열 46,233개 | [keyed-exhaustive](../tests/unit/keyed-exhaustive.test.ts) |
| T-L02 | n≤7 독립 BFS 5,913상태와 LIS 최소 이동 일치 | [keyed-exhaustive](../tests/unit/keyed-exhaustive.test.ts), [독립 모델 executor](../tests/fixtures/keyed-model.ts) |
| T-L03 | 4개 key 부분 순열 4,225쌍, 삽입/삭제/sentinel | [keyed-exhaustive](../tests/unit/keyed-exhaustive.test.ts) |
| T-L04 | type 변경 포함 seed 539365639의 10,000쌍 | [keyed-exhaustive](../tests/unit/keyed-exhaustive.test.ts) |

실패한 무작위 seed는 이 실행에서 발견되지 않았다. 없는 실패를 만들어 성과로 기록하지 않는다. 고정 seed와 실패 시 입력/seed를 출력하는 경로를 유지한다. 실제 실패로 수정한 사례는 아래 회귀 표에 있다.

## History (6개 ID)

| ID | 증명하는 동작 | 실제 테스트 |
|---|---|---|
| T-H01 | DOM 최초 캡처→편집→부분 Patch, 두 mount 일치 | [history](../tests/integration/history.test.ts), [M1 browser](../tests/browser/m1.spec.ts) |
| T-H02 | 세 번 Patch와 Undo/Redo, native 폼 복원 | [history](../tests/integration/history.test.ts), [M3 browser](../tests/browser/m3.spec.ts) |
| T-H03 | Undo 뒤 새 Patch는 미래 폐기·version 재사용 안 함 | [history](../tests/integration/history.test.ts) |
| T-H04 | 미확정 X가 Undo 후 남지 않음 | [history](../tests/integration/history.test.ts), [M1 browser](../tests/browser/m1.spec.ts) |
| T-H05 | 과거 snapshot은 이후 DOM 편집으로 변형되지 않음 | [history](../tests/integration/history.test.ts) |
| T-H06 | no-op/경계/오류/IME 중 보류에서 cursor 보존 | [history](../tests/integration/history.test.ts), [browser-state](../tests/integration/browser-state.test.ts) |

## Component · State · Effect · Memo (22개 ID)

| ID | 증명하는 동작 | 실제 테스트 |
|---|---|---|
| T-C01 | FunctionComponent mount/update의 공통 Diff/commit | [hooks](../tests/integration/hooks.test.ts) |
| T-C02 | 같은 자식 함수를 다른 props·위치에서 독립 평가 | [hooks](../tests/integration/hooks.test.ts) |
| T-C03 | 루트 밖/자식 Hook·슬롯 개수/종류 오류 | [hooks](../tests/integration/hooks.test.ts) |
| T-C04 | 같은 expression 두 위치의 평가 기록·DOM 독립 | [reuse](../tests/integration/reuse.test.ts), `one expression at two positions` |
| T-S01 | 여러 슬롯의 값과 setter identity | [hooks](../tests/integration/hooks.test.ts) |
| T-S02 | lazy initializer 한 번, 함수 값 저장 | [hooks](../tests/integration/hooks.test.ts) |
| T-S03 | 함수형 +1×3→+3/commit 1회 | [batching](../tests/integration/batching.test.ts), [browser](../tests/browser/batching.spec.ts) |
| T-S04 | +1→×2/SET→함수/같은 값 대체의 FIFO | [batching](../tests/integration/batching.test.ts) |
| T-S05 | await/실제 클릭 경계, native input event 경계 | [batching](../tests/integration/batching.test.ts), [browser](../tests/browser/batching.spec.ts) |
| T-S06 | flush/Effect 중 요청 보존, prefix 제거, 재진입 방지 | [batching](../tests/integration/batching.test.ts) |
| T-S07 | Object.is/NaN/부호 0/mutation 진단/unmount setter | [batching](../tests/integration/batching.test.ts), [hooks](../tests/integration/hooks.test.ts) |
| T-F01 | deps 생략/빈 배열/같음/변경의 setup 횟수 | [hooks](../tests/integration/hooks.test.ts) |
| T-F02 | 모든 이전 cleanup 뒤 setup, 마지막 unmount 정리 | [hooks](../tests/integration/hooks.test.ts) |
| T-F03 | 실패/보류 후보의 Effect 미실행 | [hooks](../tests/integration/hooks.test.ts), [batching](../tests/integration/batching.test.ts), [browser-state](../tests/integration/browser-state.test.ts) |
| T-F04 | Effect setter의 후속 flush, 중첩 commit 없음 | [hooks](../tests/integration/hooks.test.ts), [batching](../tests/integration/batching.test.ts) |
| T-F05 | cleanup/setup 예외·Promise 진단과 다른 정리 계속 | [hooks](../tests/integration/hooks.test.ts) |
| T-F06 | 반복 mount/unmount·취소 timer/listener·오래된 setter | [hooks](../tests/integration/hooks.test.ts), [browser-state](../tests/integration/browser-state.test.ts), [tasks browser](../tests/browser/tasks.spec.ts) |
| T-F07 | explicit render no-op Effect와 render 없는 dirty flush 구분 | [forms](../tests/integration/forms.test.ts) |
| T-M01 | deps 비교·계산 횟수·복사·실패 후보 폐기 | [hooks](../tests/integration/hooks.test.ts) |
| T-M02 | 같은 expression 평가/하위 Diff 재사용, 위치/부모/type 경계 | [reuse](../tests/integration/reuse.test.ts) |
| T-M03 | mode를 캡처한 최신 handler와 올바른 deps | [reuse](../tests/integration/reuse.test.ts) |
| T-M04 | reuse on/off 결과·identity·Effect 규칙, 실패 후보 폐기 | [reuse](../tests/integration/reuse.test.ts), [benchmark](../tests/integration/benchmark.test.ts) |

## Browser · 오류 · 관찰 · 앱 (14개 ID)

| ID | 증명하는 동작 | 실제 테스트/증거 |
|---|---|---|
| T-B01 | 실제 키보드·checkbox/radio/select의 native 상태 | [M3 browser](../tests/browser/m3.spec.ts) |
| T-B02 | 무관한 갱신 중 focus/selection과 같은 객체 유지 | [browser-state browser](../tests/browser/browser-state.spec.ts) |
| T-B03 | 이동/삭제/type 교체와 명시적 외부 focus | [browser-state browser](../tests/browser/browser-state.spec.ts), [tasks browser](../tests/browser/tasks.spec.ts) |
| T-B04 | 합성 composition의 보류·최신 재계산·정리 | [browser-state](../tests/integration/browser-state.test.ts), [browser](../tests/browser/browser-state.spec.ts) |
| T-B05 | 실제 Windows 한글 IME 입력 중 이동 보류/종료 후 이동·글자/focus | **사용자 직접 확인 PASS**, 2026-11-07 “직접 확인 완료 — 문제 없음”; [환경/절차/범위](m7-app-browser.md). 브라우저명·버전 미제공 |
| T-E01 | stale/wrong mount/잘못된 plan/외부 변경을 쓰기 전 거절 | [patch](../tests/integration/patch.test.ts), [plan-validation](../tests/integration/plan-validation.test.ts) |
| T-E02 | render/updater 예외에 마지막 정상 state/DOM/Memo/Effect 유지 | [hooks](../tests/integration/hooks.test.ts), [batching](../tests/integration/batching.test.ts) |
| T-E03 | 강제 host 예외 fault 차단과 초기화 복구 | [plan-validation](../tests/integration/plan-validation.test.ts), [history](../tests/integration/history.test.ts), [M3 browser](../tests/browser/m3.spec.ts) |
| T-Q01 | 계획 ref/anchor와 실제 host 호출·identity·Inspector 일치 | [observe](../tests/integration/observe.test.ts), [Inspector browser](../tests/browser/inspector.spec.ts) |
| T-Q02 | trace on/off 결과, ring 상한, JSON/seed 재실행 | [observe](../tests/integration/observe.test.ts), [Inspector browser](../tests/browser/inspector.spec.ts) |
| T-Q03 | counts/timing 분리, 동일 old reset, 하나의 축 비교 | [benchmark](../tests/integration/benchmark.test.ts), [M6](m6-observability.md) |
| T-A01 | 추가/수정/삭제/완료/검색/필터/정렬/집계 | [tasks browser](../tests/browser/tasks.spec.ts) |
| T-A02 | 빈 상태/키보드/라벨/오류/초기화 | [tasks browser](../tests/browser/tasks.spec.ts), [M1 browser](../tests/browser/m1.spec.ts) |
| T-A03 | 반복 reset에서 timer/listener 중복·잔류 없음 | [tasks browser](../tests/browser/tasks.spec.ts), [Inspector browser](../tests/browser/inspector.spec.ts) |

## 실제 실패에서 고정한 회귀

| 문제와 수정 이유 | 고정한 회귀 |
|---|---|
| 뒤쪽 잘못된 anchor 발견 전에 앞쪽 host 쓰기가 가능했던 plan 검증 → 전체 preflight 모의 실행 | `plan-validation.test.ts`의 7개 잘못된 plan 변형과 fault 처리 |
| native target capture microtask가 부모 bubble보다 먼저 복원 → 관리 container bubble 경계까지 지연 | `m3.spec.ts` 부모 bubble, `batching.spec.ts` capture setter 회귀 |
| Effect setup/cleanup 도중 unmount의 정리 누락·중복 가능 경로 → 소유 상태와 teardown 순서 처리 | `hooks.test.ts` setup/cleanup 중 unmount 각 1회 |
| 브라우저 8 workers에서 Firefox CRUD timeout → assertion/제한 유지, 기본 workers 2 | 전체 29/29 재실행; [M7 기록](m7-app-browser.md) |

이 표는 실제 회귀를 설명한다. 마지막 행은 기능 결함 수정이나 속도 개선 성과로 계산하지 않는다. 테스트 수 157/29와 전수 모델 입력 수를 더해 “수만 개 브라우저 테스트”로 표현하지 않는다.
