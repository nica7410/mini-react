# dirty/100 입력 복원 경로 연구 계획 (후보 구현 전 기록, 2026-11-09)

- **질문:** 같은 State에서 controlled 입력값만 복원하는 공통 Diff/Patch 경로(`SYNC_FORM`만 있는 계획)의 비용을, 검증 항목을 줄이지 않고 줄일 수 있는가?
- **범위:** `src/core/planValidation.ts`의 사전 검증 한 곳. memo·props 비교·앱 표현, reconciliation/LIS, Hooks·batching·Effect, `syncForm`·focus·selection·IME, dirty sequence 확인·정리는 바꾸지 않는다. diff의 dirty 탐색은 계측만 한다.
- **기준 엔진·앱:** 고정 E9 `a1b070f`. 앱 A0 = `task-e9-a0-v1`의 `9b52323` 소스, A2 = `task-e9-a2-v1`의 `a1b070f` 소스. 체크아웃의 기본 `src`(E7/A0)는 그대로 둔다.

## 진단 결과 (후보 작성 전)

[A/A 원자료](../../bench/followup-dirty-restore-aa/environment.json) · [진단 원자료](../../bench/followup-dirty-restore-diag/diagnostic.json)

- **재현 빌드 확인:** 연구용 빌드 도구에 patch 없이 E9+A0를 빌드하면 JS·CSS·HTML SHA-256이 `task-e9-a0-v1`과 같다(`df419946…`, `a89a2c34…`, `55045bb3…`).
- **A/A (같은 `task-e9-a0-v1` 파일을 두 이름으로, 3세션 × 180, 순서 교대, 11.4초):** 전체 median은 세 세션 모두 2.100 → 2.100 ms, p95 차이는 +0.105 / −0.005 / +0.005 ms였다. 이번 환경에서 같은 코드의 차이는 작았다. 후보 효과 해석의 불확실성으로만 기록한다.
- **분리 진단 (계측 빌드, 2라운드 × A0·A2, warm-up 10 + 60, 8.4초):** 100개 앱의 mount는 DOM binding 1,048개(ViewNode 1,047개 + root)다. `visitedNodes=1`은 root 아래 단일 자식 1개를 재사용했다는 뜻이고, dirty 탐색이 그 아래 **1,047개 ViewNode 전체**를 순회한다.

  같은 mount에서 diff+validatePlan을 300회 반복한 호출당 구간 시간(ms, A0/A2 4회 범위):

  | 구간 | 호출당 | 비고 |
  |---|---:|---|
  | diff: base `validateTree` | 0.297–0.303 | 매회 전체 검사 유지 |
  | diff: target `validateTree` | 0.288–0.301 | 매회 전체 검사 유지 |
  | diff: 재사용 + dirty 하위 트리 순회 | 0.023–0.031 | 1,047개 방문 |
  | validatePlan: `validateTree(target)` | 0.291–0.302 | 유지 |
  | validatePlan: 검증 그래프 구축 | 0.213–0.225 | Map 1,048개 항목 + PlannedNode 1,048개 + original Map 1,047개 |
  | validatePlan: DOM binding·부모·type·자식 순서 | 0.491–0.525 | DOM 자식 1,047개 방문 |
  | validatePlan: 명령 모의 실행 | ≤0.001 | `SYNC_FORM` 1개 |
  | validatePlan: nextView 대조 | 0.139–0.143 | visited Set 1,048개 |
  | validatePlan 전체(계측 없이) | 1.103–1.274 | |

  실제 dirty step(in-flow, 60회 평균)에서 commit의 거의 전부가 `validatePlan`(1.32–1.36 ms)이었다. composition 확인 ≤0.003, selection 저장 ≤0.013, `syncForm` ≤0.018, selection 복원 ≤0.010 ms였다. A0와 A2는 방문 수·자료구조 수·구간 시간이 같은 범위였다.

- **해석:** 이 진단은 정식 성능 수치가 아니다. 이번 후보가 겨냥하는 구간(그래프 구축·중복 Map 조회·nextView 재순회)은 commit의 약 40–60%를 차지한다. `validateTree` 3회(약 0.9 ms)와 DOM 전체 검사는 유지하므로 경로는 여전히 O(N)이다.

## 후보 정의

“동일 snapshot이고 `SYNC_FORM`만 수행하는 계획에서, 재배치용 검증 그래프와 모의 실행 대신 현재 view·nextView·DOM을 한 번에 함께 순회하는 동등한 사전 검증.”

- **적용 조건(모두 만족할 때만):** 기존 mount·revision 검사와 `validateTree(target)` 통과, `plan.target === mount.view.snapshot`, 명령이 1개 이상이고 모두 `mode: 'controlled'`인 `SYNC_FORM`. 기존 nextView 검사(mountId·rootRef·revision+1·snapshot)는 공통으로 먼저 수행한다. 하나라도 어긋나면 기존 일반 경로를 그대로 실행한다.
- **유지할 검사:** 중복 ref, ViewNode↔VNode 자식, 모든 DOM binding과 역방향 ref, root=container, 부모·자식 순서·노드 type/tag, registry 누락·여분, 명령 대상 존재·element 여부·root 금지, nextView 순서·ref·identity 호환·host 값(폼 정책 포함)·자식 VNode, nextView↔target. 결과 캐시·trusted 플래그·이전 commit 결과 재사용은 쓰지 않는다. 모든 검사는 DOM 쓰기 전에 끝난다.
- **정확성:** 일반 경로와 후보의 수락/거절을 정상·잘못된 계획에서 대조한다(요청 7장의 반례 목록). 후보 소스에서 typecheck, 단위·통합 전체, build, Chromium·Firefox 폼·포커스·composition 브라우저 시나리오 1회.

## 최종 측정 (한 번만)

진단 계측이 없는 production 후보 `dr-cand-e9-a0`·`dr-cand-e9-a2`를 고정한 뒤 실행한다. 모든 조건에서 baseline을 다시 측정한다. 독립 새 세션 3회, warm-up 10, 정식 180, `--alternate-pair-order`, 공통 마감.

| # | 조건 | 비교 | 판정 |
|---:|---|---|---|
| 1 | persistent/dirty/100 | E9+A0 → 후보+A0 | 개선 목표 + 엔진 허용치 |
| 2 | persistent/dirty/100 | E9+A2 → 후보+A2 | 개선 목표 + 엔진 허용치 |
| 3 | persistent/dirty/100 | 후보+A0 → 후보+A2 | 앱 허용치 |
| 4 | persistent/equal/100 | E9+A0 → 후보+A0 | 엔진 허용치 |
| 5 | persistent/counter/10 | E9+A2 → 후보+A2 | 엔진 허용치 |
| 6 | persistent/crud/10 | E9+A0 → 후보+A0 | 엔진 허용치 |

- **개선 목표(사전):** 1·2 각각 3세션 중 2세션 이상에서 median이 10% 이상이면서 0.2 ms 이상 감소.
- **허용치(변경 없음):** 엔진 median `max(5%, 1 ms)`, p95 `max(10%, 2 ms)`. 앱 median `max(5%, 0.5 ms)`, p95 `max(10%, 1 ms)`. 반올림 전 값으로 판정.
- **예산:** 진단+측정 합계 15분(진단 19.8초 사용), 최종 묶음 마감 12분. 결과와 무관하게 재실행·조건 변경 없음. 10,000개·fresh·나머지 엔진 조건은 실행하지 않는다.
