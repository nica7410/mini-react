# dirty/100 입력 복원 경로 후속 연구

2026-11-09, `phase1`의 `50d8b4f`에서 시작했다. 고정 E9 엔진 `a1b070f`에 `SYNC_FORM` 전용 사전 검증 후보 하나를 적용했다. 정확성을 검증한 뒤 한 번의 고정 측정 묶음으로 비교했다. 체크아웃의 기본 `src`(E7/A0)와 채택 정책은 바꾸지 않았다. 후보는 연구 경로의 patch와 고정 빌드로만 존재한다. [사전 계획](validation/followup-dirty-restore/plan.md)

## 결론

- **공통 복원 비용 개선: 사전 목표 달성.** `dirty/100` median이 A0 고정 E9→후보에서 세 세션 모두 줄었다. 감소폭은 −0.800 / −0.500 / −0.600 ms(−34.8 / −23.8 / −28.6%)다. A2 고정에서도 세 세션 모두 −0.700 / −0.700 / −0.600 ms(−31.8 / −31.8 / −28.6%) 줄었다. 목표는 각 앱 3세션 중 2세션 이상에서 10%와 0.2 ms 이상 감소하는 것이었다. 감소는 commit에서 나왔다. commit median은 1.20–1.40 ms에서 0.70 ms로 줄었고, diff median은 0.70–0.90 ms에서 0.70–0.80 ms로 거의 같았다. p95는 6개 세션 중 5개에서 줄었다. A0 S2만 +0.200 ms(+7.1%) 늘었으며 엔진 허용치 2.000 ms 이내다.
- **엔진 회귀: 허용치 초과 없음.** `equal/100`, `counter/10`, `crud/10` 및 crud 하위 동작 5개를 확인했다. 가장 큰 증가는 crud S1 workload의 median +0.300 ms와 p95 +0.595 ms였다. 허용치는 각각 1.000 ms와 2.000 ms다.
- **A2 상대 초과: 이번 측정에서 관찰되지 않았지만, 후보가 해소했다고 판단할 수 없다.** 같은 후보 엔진에서 A0→A2 median은 세 세션 모두 1.500 → 1.500 ms였다. p95 변화는 +0.100 / +0.005 / 0.000 ms로 앱 허용치 이내였다. 다만 이번 묶음에는 E9에서의 A0→A2 직접 비교가 없다(지정 범위 밖). 이번 A/A와 기준선도 모두 안정적이었다(아래). 따라서 기존 E9에서도 오늘은 A2 초과가 재현되지 않았을 가능성을 배제할 수 없다. 이번 결과는 “후보 엔진에서 A2 상대 초과 미관찰”로만 기록한다.
- **복잡도:** 검사 항목은 그대로이고 경로는 여전히 **O(N)**이다. 사전 검증은 매 호출마다 모든 노드, DOM binding, DOM 자식을 다시 검사한다. `validateTree` 3회와 diff의 dirty 하위 트리 순회도 그대로 남는다. O(1) 입력 복원이 아니다.

④ memo 기능 전체, 원본 체크리스트, 기본 앱·엔진 채택은 이 연구로 완료하거나 바꾸지 않는다.

## 확인된 사실과 원인 가설

보충 측정(`followup-rowmemo-supplement-20261109-1952`)의 `dirty/100`은 render·Effect·후속 flush가 0이고 DOM 프로퍼티 쓰기가 1회인 경로다. 시간 차이는 commit에서 가장 크게 나타났다. 이번 연구 전에 세운 가설은 다음과 같았다. 같은 snapshot의 `SYNC_FORM` 1개를 위해 재배치용 검증 그래프를 만들고 모의 실행하는 비용이 commit 대부분을 차지하고, 그 할당량이 시간 변동에 영향을 줄 수 있다. 기존 A0/A2 변동의 원인은 이번 연구에서도 **확정하지 않았다**. GC·JIT·다른 앱이 원인이라는 직접 증거는 없다.

## 진단에서 확인한 비용

계측 빌드는 [`diag-instrumentation.patch`](../research/dirty-restore/diag-instrumentation.patch)로 따로 만들었다. phase 경계에서만 시간을 읽었으며, 노드별 시간 측정은 하지 않았다. 원자료는 [diagnostic.json](bench/followup-dirty-restore-diag/diagnostic.json)이다. 이 수치는 정식 성능 결과로 쓰지 않는다.

- 100개 앱의 mount에는 DOM binding이 1,048개 있다(root + ViewNode 1,047개). 기존 `visitedNodes=1`은 root 아래 단일 자식 1개를 재사용했다는 뜻이다. 그 아래 dirty 탐색은 ViewNode **1,047개 전체**를 방문한다.
- 같은 mount에서 diff+validatePlan을 300회 반복하고 호출당 시간을 쟀다. 범위는 A0·A2 각 2라운드의 값이다.
  - diff: base `validateTree` 0.297–0.303 ms, target `validateTree` 0.288–0.301 ms, 재사용과 dirty 순회 0.023–0.031 ms.
  - validatePlan: `validateTree` 0.291–0.302 ms, **검증 그래프 구축 0.213–0.225 ms**, DOM 검사 0.491–0.525 ms, 모의 실행 ≤0.001 ms, **nextView 대조 0.139–0.143 ms**. 전체(계측 없음)는 1.103–1.274 ms였다.
  - 검증용 자료구조는 graph Map 1,048개 항목, PlannedNode 객체 1,048개, original Map 1,047개, visited Set 1,048개였다. DOM 자식 방문은 1,047회였다.
- 실제 dirty step 60회를 in-flow로 평균하면 commit 시간의 거의 전부가 validatePlan(1.32–1.36 ms)이었다. 그 밖의 구간은 composition 확인 ≤0.003, selection 저장 ≤0.013, `syncForm` ≤0.018, selection 복원 ≤0.010 ms였다.
- A0와 A2는 방문 수, 자료구조 수, 구간 시간이 같은 범위였다. 이 진단에서는 A2만 느려지는 내부 작업을 찾지 못했다.

**A/A 대조.** 같은 `task-e9-a0-v1` 파일을 두 이름으로 복사했다. JS·CSS·HTML SHA-256이 같은 것을 확인했다([aa-builds.json](bench/followup-dirty-restore-aa/aa-builds.json)). dirty/100을 3세션 × 180회, 순서를 교대해 실행했다. median은 세 세션 모두 2.100 → 2.100 ms였다. p95 차이는 +0.105 / −0.005 / +0.005 ms였다. 이번 환경은 조용했다. 이 결과로 과거 변동을 환경 잡음이라고 확정하거나 허용치를 완화하지 않는다. [A/A 통계](bench/followup-dirty-restore-aa/comparison.json)

## 구현한 후보

[`candidate.patch`](../research/dirty-restore/candidate.patch)(SHA-256 `1e029470…3b3e`)는 `src/core/planValidation.ts` 한 파일만 바꾼다. 원래 168줄에 79줄을 추가하고 1줄을 바꿨다.

- **적용 조건(`isSyncFormOnlyPlan`):** `plan.target === mount.view.snapshot`이고, 명령이 1개 이상이며 모두 `mode: 'controlled'`인 `SYNC_FORM`이어야 한다. 이 조건은 증명이 아니라 분기 조건이다. mount 해제·오류, mountId·baseRevision, `validateTree(target)`, nextView의 mountId·rootRef·revision+1·snapshot은 공통 선행 검사로 먼저 수행한다.
- **fallback:** 조건이 하나라도 다르면 기존 일반 경로를 **수정 없이** 실행한다. 대상은 명령이 0개인 계획, uncontrolled `SYNC_FORM`, 다른 명령이 섞인 계획, snapshot이 다른 객체인 계획이다.
- **바뀐 작업:** `SYNC_FORM`은 구조를 바꾸지 않는다. 따라서 일반 경로가 모의 실행한 그래프는 현재 view와 같다. 후보는 현재 view, nextView, DOM을 **한 번에 함께 순회**하며 같은 검사를 수행한다.
- 결과 캐시, trusted 플래그, 이전 commit 결과 재사용은 없다. DOM 쓰기는 기존처럼 검증이 끝난 뒤 `commit()`에서만 일어난다.

### 기존 검증 항목 대조

| 일반 경로 검사 | 일반 경로 위치 | 후보 위치 |
|---|---|---|
| mount 해제·오류, stale plan, `validateTree(target)` | 공통 선행 검사 | 동일(공통) |
| nextView mountId·rootRef·revision·snapshot | 공통 선행 검사 | 동일(공통) |
| 중복 ref | `load`의 `graph.has` | `walk`의 `seen` Set(root로 시작) |
| ViewNode↔VNode 자식(현재 view) | `load` | `walk`의 `viewMatchesVNode(tree)` |
| DOM binding + 역방향 ref, root=container | DOM 검사 루프 | root는 walk 전, 나머지는 walk |
| DOM 부모, type/tag | DOM 검사 루프 | walk(같은 식) |
| DOM 자식 순서·누락·여분 | `childNodes` + 연결 목록 | `firstChild`/`nextSibling` 위치 대조 + 마지막 `dom !== null` |
| registry 여분·누락 | `graph.size === mount.nodes.size` | `seen.size === mount.nodes.size` |
| 명령 대상 존재·root 금지·element 여부 | 모의 실행 | walk 중 element 확인, walk 뒤 존재·root 확인 |
| 같은 노드의 여러 `SYNC_FORM` | 순서대로 적용, 마지막 정책 | 정책 Map, 마지막 정책 |
| nextView 순서·ref·중복·누락·여분 | `compareChildren` + visited | 같은 위치의 ref 대조와 길이 확인. 현재 ref가 유일하므로 nextView 중복도 배제 |
| identity 호환, host 값(폼 정책 포함) | `compareChildren` | walk의 `compatible`, `equalHostData({...vnode, form})` |
| ViewNode↔VNode 자식(nextView), nextView↔target | `compareChildren` | walk의 `viewMatchesVNode(expected)`, walk 전 같은 식 |

**알려진 차이:** 거절 메시지는 결함이 여러 개일 때 다를 수 있다. 진단 코드는 같은 `INVALID_PLAN`이다. 또 하나의 차이는 리뷰에서 찾았다. 현재 view의 자식 배열에 hole이 있으면 후보는 TypeError로 거절한다. 일반 경로는 `forEach`/`some`이 hole을 건너뛰어 수락할 수 있다. 후보가 더 엄격한 방향이고, mount를 직접 변조하지 않으면 생기지 않는 상태여서 그대로 두었다.

### 코드적으로 줄어든 작업과 남은 O(N)

N = ViewNode 1,047개(100개 앱) 기준으로, 호출 1회에서 다음 작업이 사라졌다.

- graph Map 항목 N+1개와 PlannedNode 객체 N+1개
- original Map 항목 N개
- visited Set 항목 N+1개와 빈 `created` Set
- `forEach`/`some` 콜백 클로저
- 노드·자식마다 반복하던 `requireNode`·`original.get`·`mount.nodes.get(parent)` 조회
- nextView 두 번째 전체 순회(현재 view 순회와 합침)

새로 추가된 것은 `seen` Set N+1개 항목과 명령 수 크기의 정책 Map이다.

남은 작업은 노드마다 binding Map 조회, 역방향 WeakMap 조회, `seen` 추가, DOM 위치 대조, 자식 VNode `equalData`(대부분 identity 단축), identity·host 비교다. 사전 검증 밖에서는 `validateTree` 3회(diff 2회, validatePlan 1회, 진단 기준 약 0.9 ms)와 diff의 dirty 하위 트리 순회 1,047개가 그대로 남는다. 모두 O(N)이다. diff 탐색의 인덱스 최적화는 이번 범위에서 하지 않았다.

## 정확성 결과

모든 검증은 E9 전체 트리에 patch를 적용한 후보 트리에서 실행했다. 현재 기본 E7 소스의 테스트 결과는 쓰지 않았다. [검증 기록](validation/followup-dirty-restore/candidate-validation.json)

| 항목 | 결과 |
|---|---|
| 후보 `planValidation.ts` SHA-256 | `66e5b4b28248d0f043a8d99dd254f4d673ee5a19a60d4d0dd7dfc7e920dac2db`(테스트 트리 = 측정 빌드 소스) |
| typecheck (`tsc --noEmit`) | 통과 |
| 단위·통합 (`vitest run`) | **268/268** 통과: E9 기존 227개 + 연구 테스트 41개 |
| production build (`vite build`) | 통과 |
| 브라우저 (browser-state·tasks spec, Chromium·Firefox 1회) | **16/16** 통과 |

[연구 테스트](../research/dirty-restore/tests/sync-form-validation.test.ts)는 후보 경로와 `validatePlanGeneral`(같은 함수를 일반 경로로 강제)을 대조한다.

- **정상 계획:** dirty 0·1·여러 개(text input, textarea, checkbox, radio 그룹, select)와 같은 노드에 중복된 `SYNC_FORM`을 확인했다. 두 경로 모두 수락하고, uncontrolled 사용자 값은 보존된다.
- **잘못된 계획 32종:** 두 경로 모두 거절하고 진단 코드가 같았다. 실패 시 `value`·`checked`·textarea `value`·`selectedIndex` setter 호출과 DOM mutation이 모두 0이었다.
  - 잘못된 ref, root·텍스트 노드·다른 필드 대상
  - 잘못된 정책 값, uncontrolled 정책, 다른 명령 혼합
  - 잘못된 nextView: revision, mount, snapshot, 형제 교환, 누락, 여분, 중복 ref, 자식 vnode, VNode 자식, identity
  - stale revision, 다른 mount, 해제된 mount
  - 먼 형제의 삭제·교체·끝 이동·앞쪽 교환, 여분 텍스트, type 변경
  - 역방향 ref, registry 여분·누락, 현재 view의 중복 ref, ViewNode↔VNode 불일치(두 종류)
- **분기 증명:** 경로마다 `Map.set` 호출 수가 다른 점을 이용해 `validatePlan`이 실제로 후보 분기를 탔는지 확인한다. 분기 줄을 지우면 3개 테스트가 실패한다.
- **FunctionComponent:** 같은 State 복원에서 render·Effect 추가 실행 0회, focus·selection 보존, IME 조합 중 보류와 종료 뒤 복원을 확인했다. 처리 중 새로 생긴 dirty sequence는 지워지지 않고 다음 복원으로 이어졌다. explicit update와 실제 State 변경의 기존 동작도 유지됐다.
- **변이 검사:** 후보 검사를 하나씩 끈 사본에서 연구 테스트를 다시 실행했다.
  - 11개 검사는 끄면 테스트가 실패한다: 위치, 현재·nextView VNode 자식, binding, 명령 대상 3종, 여분 DOM, nextView ref, host 값, registry.
  - 4개 검사는 남아 있는 다른 검사가 같은 결함을 먼저 잡는다: 중복 ref, parentNode, `compatible`, nextView 길이. 그 근거는 검증 기록에 적었다. 일반 경로와 같은 계층을 유지하려고 이 검사들도 지우지 않았다.
- **독립 리뷰:** read-only 코드 리뷰에서 “일반 경로가 거절하는데 후보가 수락하는 상태 없음”, CRITICAL/HIGH 0건이라는 결과를 받았다. 테스트 지적(분기 미증명 MEDIUM, 보강 LOW 3건)은 반영했다.
- **브라우저 composition:** 합성 이벤트로만 확인했다. **실제 한글 IME는 수동 확인하지 않았다.**
- **줄바꿈 이력:** 첫 검증(typecheck, vitest 266, 브라우저 16)은 `git apply`가 CRLF로 쓴 사본(`9859d6d2…`)에서 실행했다. 줄바꿈만 다르고 내용은 같다. 리뷰 반영 뒤 LF 소스(`66e5b4b2…`)로 트리를 다시 만들어 typecheck와 vitest 268을 다시 실행했다. 브라우저 spec은 다시 실행하지 않았다. 두 소스로 만든 JS 번들은 byte 단위로 같다(`32bcd9c6…`).

## 후보 출처

| 빌드 | 엔진 = E9 + patch | 앱 | 엔진 SHA-256 | JS 번들 SHA-256 |
|---|---|---|---|---|
| `task-e9-a0-v1`(기존) | `a1b070f` | `9b52323` (A0) | `720e144e…2357` | `df419946…ad3e` |
| `task-e9-a2-v1`(기존) | `a1b070f` | `a1b070f` (A2) | `720e144e…2357` | `a478e0c7…98b1` |
| `dr-cand-e9-a0` | `a1b070f` + `1e029470…` | `9b52323` (A0) | `c13ea874…1b66` | `32bcd9c6…183a` |
| `dr-cand-e9-a2` | `a1b070f` + `1e029470…` | `a1b070f` (A2) | `c13ea874…1b66` | `a882e17e…beed` |

- 후보 빌드의 patch 적용 전 엔진 해시 `720e144e…`는 기존 E9와 같다. 바뀐 엔진 파일은 `src/core/planValidation.ts` 하나다. [manifest A0](validation/followup-dirty-restore/dr-cand-e9-a0.manifest.json) · [manifest A2](validation/followup-dirty-restore/dr-cand-e9-a2.manifest.json)
- 연구 빌드 도구는 patch 없이 E9+A0를 빌드했을 때 `task-e9-a0-v1`과 JS·CSS·HTML이 같은 것을 확인했다. [repro-build.json](bench/followup-dirty-restore-diag/repro-build.json)
- CSS(`a89a2c34…`), harness(`3eab1f4b…`), 의존성(`ea8b1a2b…`)은 기존 고정 빌드와 같다.

## 최종 측정

[실행 기록](bench/followup-dirty-restore-final/execution.json)은 한 번의 고정 묶음이다. 6개 조건이 모두 통과했고, 279.1초가 걸렸다(20:44:35–20:49:14 KST, 마감 12분).

- 실행 설정: 조건마다 새 Chromium 3세션, warm-up 10회, 정식 180회, `--alternate-pair-order`, 공통 마감
- 고정한 입력: seed `539365639`, viewport 1280×900, 실제 40 ms Effect와 전체 oracle(State·DOM·입력·순서·identity·focus·Effect)
- 실행 환경: Chromium `151.0.7922.34`, Node `v24.22.2`, runner `benchmark-task.mjs` SHA-256 `0f9fdfc5…`(보충 측정과 같음), runner commit `2b7af26`
- 기준선은 모두 이번 묶음에서 다시 측정했다. 측정 중 다른 테스트·빌드·프로파일링은 실행하지 않았다.

단위는 ms다. 앱 허용치는 median `max(5%, 0.5 ms)`, p95 `max(10%, 1 ms)`이고, 엔진 허용치는 median `max(5%, 1 ms)`, p95 `max(10%, 2 ms)`다. 개선 목표는 median이 10% 이상이면서 0.2 ms 이상 감소하는 것이다. 판정에는 반올림 전 값을 썼다. diff/commit 행은 `FunctionComponent`의 진단 구간이며 판정에 쓰지 않는다. 비교별 원자료와 통계는 [analysis](bench/followup-dirty-restore-final/analysis/)에 있다.

#### ① dirty/100 · A0 고정 E9→후보 (엔진)

| 구간 | 세션 | n/빌드 | 기준 median / IQR / p95 | 후보 median / IQR / p95 | median 변화 / 허용 | p95 변화 / 허용 | 개선 목표 |
|---|---|---:|---:|---:|---:|---:|---|
| workload | S1 | 180 | 2.300 / 0.500 / 3.915 | 1.500 / 0.300 / 2.000 | −0.800 (−34.8%) / 1.000 | −1.915 (−48.9%) / 2.000 | 달성 |
| diffMs | S1 | 180 | 0.900 / 0.200 / 1.505 | 0.800 / 0.200 / 1.200 | −0.100 (−11.1%) / 1.000 | −0.305 (−20.3%) / 2.000 | — |
| commitMs | S1 | 180 | 1.300 / 0.400 / 2.500 | 0.700 / 0.100 / 0.905 | −0.600 (−46.2%) / 1.000 | −1.595 (−63.8%) / 2.000 | — |
| workload | S2 | 180 | 2.100 / 0.300 / 2.800 | 1.600 / 0.400 / 3.000 | −0.500 (−23.8%) / 1.000 | +0.200 (+7.1%) / 2.000 | 달성 |
| diffMs | S2 | 180 | 0.800 / 0.200 / 1.100 | 0.800 / 0.300 / 1.605 | 0.000 (0.0%) / 1.000 | +0.505 (+45.9%) / 2.000 | — |
| commitMs | S2 | 180 | 1.250 / 0.200 / 1.700 | 0.700 / 0.200 / 1.500 | −0.550 (−44.0%) / 1.000 | −0.200 (−11.8%) / 2.000 | — |
| workload | S3 | 180 | 2.100 / 0.300 / 2.700 | 1.500 / 0.200 / 1.800 | −0.600 (−28.6%) / 1.000 | −0.900 (−33.3%) / 2.000 | 달성 |
| diffMs | S3 | 180 | 0.800 / 0.200 / 1.100 | 0.800 / 0.125 / 1.000 | 0.000 (0.0%) / 1.000 | −0.100 (−9.1%) / 2.000 | — |
| commitMs | S3 | 180 | 1.200 / 0.200 / 1.700 | 0.700 / 0.100 / 0.800 | −0.500 (−41.7%) / 1.000 | −0.900 (−52.9%) / 2.000 | — |

render+Effect+후속 flush: S1 max 0, S2 max 0, S3 max 0 ms. 실행 순서: S1 task-e9-a0-v1 → dr-cand-e9-a0 · S2 dr-cand-e9-a0 → task-e9-a0-v1 · S3 task-e9-a0-v1 → dr-cand-e9-a0

#### ② dirty/100 · A2 고정 E9→후보 (엔진)

| 구간 | 세션 | n/빌드 | 기준 median / IQR / p95 | 후보 median / IQR / p95 | median 변화 / 허용 | p95 변화 / 허용 | 개선 목표 |
|---|---|---:|---:|---:|---:|---:|---|
| workload | S1 | 180 | 2.200 / 0.400 / 2.800 | 1.500 / 0.200 / 2.010 | −0.700 (−31.8%) / 1.000 | −0.790 (−28.2%) / 2.000 | 달성 |
| diffMs | S1 | 180 | 0.800 / 0.100 / 1.000 | 0.700 / 0.100 / 1.100 | −0.100 (−12.5%) / 1.000 | +0.100 (+10.0%) / 2.000 | — |
| commitMs | S1 | 180 | 1.350 / 0.300 / 1.800 | 0.700 / 0.100 / 1.000 | −0.650 (−48.1%) / 1.000 | −0.800 (−44.4%) / 2.000 | — |
| workload | S2 | 180 | 2.200 / 0.400 / 2.900 | 1.500 / 0.300 / 2.305 | −0.700 (−31.8%) / 1.000 | −0.595 (−20.5%) / 2.000 | 달성 |
| diffMs | S2 | 180 | 0.700 / 0.100 / 1.100 | 0.800 / 0.100 / 1.200 | +0.100 (+14.3%) / 1.000 | +0.100 (+9.1%) / 2.000 | — |
| commitMs | S2 | 180 | 1.400 / 0.325 / 2.000 | 0.700 / 0.200 / 1.100 | −0.700 (−50.0%) / 1.000 | −0.900 (−45.0%) / 2.000 | — |
| workload | S3 | 180 | 2.100 / 0.400 / 3.100 | 1.500 / 0.200 / 2.100 | −0.600 (−28.6%) / 1.000 | −1.000 (−32.3%) / 2.000 | 달성 |
| diffMs | S3 | 180 | 0.750 / 0.100 / 1.100 | 0.800 / 0.200 / 1.100 | +0.050 (+6.7%) / 1.000 | 0.000 (0.0%) / 2.000 | — |
| commitMs | S3 | 180 | 1.300 / 0.300 / 2.100 | 0.700 / 0.100 / 1.100 | −0.600 (−46.2%) / 1.000 | −1.000 (−47.6%) / 2.000 | — |

render+Effect+후속 flush: S1 max 0, S2 max 0, S3 max 0 ms. 실행 순서: S1 dr-cand-e9-a2 → task-e9-a2-v1 · S2 task-e9-a2-v1 → dr-cand-e9-a2 · S3 dr-cand-e9-a2 → task-e9-a2-v1

#### ③ dirty/100 · 후보 엔진 A0→A2 (앱)

| 구간 | 세션 | n/빌드 | 기준 median / IQR / p95 | 후보 median / IQR / p95 | median 변화 / 허용 | p95 변화 / 허용 |
|---|---|---:|---:|---:|---:|---:|
| workload | S1 | 180 | 1.500 / 0.225 / 2.000 | 1.500 / 0.200 / 2.100 | 0.000 (0.0%) / 0.500 | +0.100 (+5.0%) / 1.000 |
| diffMs | S1 | 180 | 0.800 / 0.200 / 1.005 | 0.700 / 0.125 / 1.100 | −0.100 (−12.5%) / 0.500 | +0.095 (+9.5%) / 1.000 |
| commitMs | S1 | 180 | 0.700 / 0.100 / 0.905 | 0.700 / 0.100 / 1.000 | 0.000 (0.0%) / 0.500 | +0.095 (+10.5%) / 1.000 |
| workload | S2 | 180 | 1.500 / 0.300 / 2.100 | 1.500 / 0.200 / 2.105 | 0.000 (0.0%) / 0.500 | +0.005 (+0.2%) / 1.000 |
| diffMs | S2 | 180 | 0.800 / 0.200 / 1.200 | 0.700 / 0.100 / 1.100 | −0.100 (−12.5%) / 0.500 | −0.100 (−8.3%) / 1.000 |
| commitMs | S2 | 180 | 0.700 / 0.100 / 0.900 | 0.700 / 0.100 / 1.005 | 0.000 (0.0%) / 0.500 | +0.105 (+11.7%) / 1.000 |
| workload | S3 | 180 | 1.500 / 0.225 / 2.000 | 1.500 / 0.200 / 2.000 | 0.000 (0.0%) / 0.500 | 0.000 (0.0%) / 1.000 |
| diffMs | S3 | 180 | 0.800 / 0.125 / 1.100 | 0.700 / 0.100 / 1.100 | −0.100 (−12.5%) / 0.500 | 0.000 (0.0%) / 1.000 |
| commitMs | S3 | 180 | 0.700 / 0.100 / 0.900 | 0.700 / 0.200 / 0.900 | 0.000 (0.0%) / 0.500 | 0.000 (0.0%) / 1.000 |

render+Effect+후속 flush: S1 max 0, S2 max 0, S3 max 0 ms. 실행 순서: S1 dr-cand-e9-a0 → dr-cand-e9-a2 · S2 dr-cand-e9-a2 → dr-cand-e9-a0 · S3 dr-cand-e9-a0 → dr-cand-e9-a2

#### ④ equal/100 · A0 고정 E9→후보 (엔진)

| 구간 | 세션 | n/빌드 | 기준 median / IQR / p95 | 후보 median / IQR / p95 | median 변화 / 허용 | p95 변화 / 허용 |
|---|---|---:|---:|---:|---:|---:|
| workload | S1 | 180 | 10.100 / 2.425 / 14.205 | 9.800 / 2.100 / 13.105 | −0.300 (−3.0%) / 1.000 | −1.100 (−7.7%) / 2.000 |
| workload | S2 | 180 | 9.800 / 1.925 / 13.730 | 9.800 / 2.125 / 13.305 | 0.000 (0.0%) / 1.000 | −0.425 (−3.1%) / 2.000 |
| workload | S3 | 180 | 10.050 / 2.100 / 13.610 | 9.400 / 2.300 / 13.115 | −0.650 (−6.5%) / 1.000 | −0.495 (−3.6%) / 2.000 |

실행 순서: S1 dr-cand-e9-a0 → task-e9-a0-v1 · S2 task-e9-a0-v1 → dr-cand-e9-a0 · S3 dr-cand-e9-a0 → task-e9-a0-v1

#### ⑤ counter/10 · A2 고정 E9→후보 (엔진)

| 구간 | 세션 | n/빌드 | 기준 median / IQR / p95 | 후보 median / IQR / p95 | median 변화 / 허용 | p95 변화 / 허용 |
|---|---|---:|---:|---:|---:|---:|
| workload | S1 | 180 | 0.800 / 0.200 / 1.100 | 0.800 / 0.125 / 1.100 | 0.000 (0.0%) / 1.000 | 0.000 (0.0%) / 2.000 |
| workload | S2 | 180 | 0.800 / 0.200 / 1.005 | 0.800 / 0.200 / 1.200 | 0.000 (0.0%) / 1.000 | +0.195 (+19.4%) / 2.000 |
| workload | S3 | 180 | 0.800 / 0.200 / 1.200 | 0.800 / 0.200 / 1.200 | 0.000 (0.0%) / 1.000 | 0.000 (0.0%) / 2.000 |

실행 순서: S1 task-e9-a2-v1 → dr-cand-e9-a2 · S2 dr-cand-e9-a2 → task-e9-a2-v1 · S3 task-e9-a2-v1 → dr-cand-e9-a2

#### ⑥ crud/10 · A0 고정 E9→후보 (엔진)

| 구간 | 세션 | n/빌드 | 기준 median / IQR / p95 | 후보 median / IQR / p95 | median 변화 / 허용 | p95 변화 / 허용 |
|---|---|---:|---:|---:|---:|---:|
| workload | S1 | 180 | 10.400 / 1.425 / 12.710 | 10.700 / 1.500 / 13.305 | +0.300 (+2.9%) / 1.000 | +0.595 (+4.7%) / 2.000 |
| action-0-draft | S1 | 180 | 1.450 / 0.400 / 2.000 | 1.500 / 0.300 / 2.000 | +0.050 (+3.4%) / 1.000 | 0.000 (0.0%) / 2.000 |
| action-1-add | S1 | 180 | 3.000 / 0.525 / 3.800 | 3.000 / 0.600 / 4.005 | 0.000 (0.0%) / 1.000 | +0.205 (+5.4%) / 2.000 |
| action-2-rename | S1 | 180 | 1.400 / 0.300 / 1.900 | 1.400 / 0.300 / 2.000 | 0.000 (0.0%) / 1.000 | +0.100 (+5.3%) / 2.000 |
| action-3-toggle | S1 | 180 | 1.500 / 0.300 / 1.905 | 1.600 / 0.300 / 2.100 | +0.100 (+6.7%) / 1.000 | +0.195 (+10.2%) / 2.000 |
| action-4-delete | S1 | 180 | 3.000 / 0.500 / 3.900 | 3.050 / 0.400 / 3.810 | +0.050 (+1.7%) / 1.000 | −0.090 (−2.3%) / 2.000 |
| workload | S2 | 180 | 10.800 / 1.600 / 12.810 | 10.700 / 1.325 / 12.705 | −0.100 (−0.9%) / 1.000 | −0.105 (−0.8%) / 2.000 |
| action-0-draft | S2 | 180 | 1.500 / 0.300 / 1.900 | 1.500 / 0.400 / 2.000 | 0.000 (0.0%) / 1.000 | +0.100 (+5.3%) / 2.000 |
| action-1-add | S2 | 180 | 3.100 / 0.525 / 3.800 | 3.100 / 0.500 / 3.900 | 0.000 (0.0%) / 1.000 | +0.100 (+2.6%) / 2.000 |
| action-2-rename | S2 | 180 | 1.400 / 0.300 / 2.000 | 1.400 / 0.300 / 1.900 | 0.000 (0.0%) / 1.000 | −0.100 (−5.0%) / 2.000 |
| action-3-toggle | S2 | 180 | 1.500 / 0.300 / 2.105 | 1.500 / 0.200 / 2.000 | 0.000 (0.0%) / 1.000 | −0.105 (−5.0%) / 2.000 |
| action-4-delete | S2 | 180 | 3.100 / 0.500 / 4.000 | 3.000 / 0.500 / 3.600 | −0.100 (−3.2%) / 1.000 | −0.400 (−10.0%) / 2.000 |
| workload | S3 | 180 | 10.700 / 1.650 / 13.415 | 10.800 / 1.500 / 12.815 | +0.100 (+0.9%) / 1.000 | −0.600 (−4.5%) / 2.000 |
| action-0-draft | S3 | 180 | 1.500 / 0.400 / 2.200 | 1.500 / 0.300 / 1.905 | 0.000 (0.0%) / 1.000 | −0.295 (−13.4%) / 2.000 |
| action-1-add | S3 | 180 | 3.100 / 0.525 / 3.900 | 3.100 / 0.500 / 4.000 | 0.000 (0.0%) / 1.000 | +0.100 (+2.6%) / 2.000 |
| action-2-rename | S3 | 180 | 1.400 / 0.300 / 2.000 | 1.400 / 0.300 / 2.000 | 0.000 (0.0%) / 1.000 | 0.000 (0.0%) / 2.000 |
| action-3-toggle | S3 | 180 | 1.500 / 0.400 / 2.200 | 1.500 / 0.300 / 2.000 | 0.000 (0.0%) / 1.000 | −0.200 (−9.1%) / 2.000 |
| action-4-delete | S3 | 180 | 3.100 / 0.500 / 4.005 | 3.100 / 0.500 / 4.000 | 0.000 (0.0%) / 1.000 | −0.005 (−0.1%) / 2.000 |

실행 순서: S1 dr-cand-e9-a0 → task-e9-a0-v1 · S2 task-e9-a0-v1 → dr-cand-e9-a0 · S3 dr-cand-e9-a0 → task-e9-a0-v1

## 판정 요약

| 비교 | 판정 기준 | 결과 |
|---|---|---|
| ① A0 고정 E9→후보 dirty/100 | 개선 목표 / 엔진 허용치 | 목표 3/3 세션 달성 / 초과 0 |
| ② A2 고정 E9→후보 dirty/100 | 개선 목표 / 엔진 허용치 | 목표 3/3 세션 달성 / 초과 0 |
| ③ 후보 A0→A2 dirty/100 | 앱 허용치 | 초과 0 (median 차이 0, p95 최대 +0.100) |
| ④ equal/100 | 엔진 허용치 | 초과 0 |
| ⑤ counter/10 | 엔진 허용치 | 초과 0 |
| ⑥ crud/10 (workload + 하위 5개) | 엔진 허용치 | 초과 0 |

**해석의 한계:** 이번 날의 A/A와 기준선은 과거 확인 실행보다 안정적이었다. dirty/100 E9 기준 median은 2.100–2.300 ms였고, 보충 측정에서 A0 기준은 2.000–2.600 ms였다. 후보의 dirty/100 감소폭(−0.500~−0.800 ms)은 A/A 차이(median 0, p95 ≤0.105 ms)보다 크고, commit 구간에 집중됐다. 이는 진단에서 제거 대상으로 잡은 작업 위치와 일치한다. 다만 측정은 이 컴퓨터의 한 날짜, 한 브라우저(Chromium) 결과다. 1,000개·fresh·다른 작업과 나머지 엔진 22개 조건은 측정하지 않았다.

## 실제 시간

| 구분 | 시간 |
|---|---|
| 전체 작업(분석·구현·검증·문서화) | 20:24 시작, 약 30분 |
| A/A 측정 | 11.4초 |
| 분리 진단(계측 빌드) | 8.4초 |
| 최종 고정 묶음 | 279.1초 |
| **성능 측정 합계** | **298.9초(약 5.0분, 예산 15분)** |

구현 후보는 1개였고, 최종 묶음은 1회 실행했다. 재실행, 조건 변경, 표본 제외는 없었다. 10,000개와 fresh 행렬은 실행하지 않았다. 원자료는 모두 보존했다. 측정 외 단계(빌드, vitest, 브라우저 테스트, 리뷰)는 측정과 겹치지 않게 실행했다.

## 미검증·범위 밖

- 실제 한글 IME 수동 확인
- Firefox 성능 측정(정확성 spec만 실행)
- 1,000개 이상과 fresh 조건
- 기존 엔진 회귀 조건 22개
- 같은 묶음 안의 E9 A0→A2 직접 재비교(지정 범위 밖). 그래서 A2 상대 초과의 해소는 입증하지 못했다.
- 후보는 **기본 소스에 반영하지 않았다.** 체크아웃 `src`는 E7/A0 그대로다. 채택하려면 현재 기본 엔진(E7 계열)에 같은 patch를 옮기는 별도 작업과 검증이 필요하다.
- 기존 [④ 보고서](followup-row-memo.md)의 미커밋 구간 분석은 건드리지 않았다. ④의 보류 상태와 원본 체크리스트도 바꾸지 않았다.

## 재현

```sh
node research/dirty-restore/build-patched.mjs --tag=dr-cand-e9-a0 --engine=a1b070f --app=9b52323 --patches=research/dirty-restore/candidate.patch
node research/dirty-restore/build-patched.mjs --tag=dr-cand-e9-a2 --engine=a1b070f --app=a1b070f --patches=research/dirty-restore/candidate.patch
node research/dirty-restore/make-candidate-tree.mjs   # E9 전체 트리 + patch + 연구 테스트 → typecheck/vitest/playwright
node research/dirty-restore/run-final.mjs             # 한 번만 실행하는 최종 묶음(기존 결과가 있으면 거절)
node research/dirty-restore/compare.mjs <runDir> <before> <after> <app|engine>
```
