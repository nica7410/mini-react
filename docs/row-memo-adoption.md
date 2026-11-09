# ④ 행 단위 재사용과 입력 복원 사전 검증 채택 기록

2026-11-09, 사용자 결정으로 다음 세 가지를 기본 소스에 채택했다.

| 구성 | 내용 | 출처 |
|---|---|---|
| 엔진 `memo()` 지원(E9) | `src/runtime/memo.ts`, `resolve.ts`, `index.ts`. 명시적으로 `memo()`로 감싼 컴포넌트만 이전 평가를 재사용한다. | `a1b070f` |
| 기본 앱 A2 | `TaskApp` = 안정된 행 콜백 + `memo(TaskRow)`. A0는 `TaskAppA0`, A1은 `TaskAppWithRowReuse`로 비교용으로 남긴다. | `a1b070f` |
| `SYNC_FORM` 전용 사전 검증 | 같은 snapshot이고 controlled `SYNC_FORM`만 있는 계획을 한 번의 순회로 같은 검사 항목을 수행해 검증한다. | [`candidate.patch`](../research/dirty-restore/candidate.patch) |

기본 소스는 `a1b070f`의 엔진·앱에 복원 패치를 더한 것과 같다. 앱 파일은 정책 주석만 다르다.

## 판단 근거가 바뀌었다는 점

원래 사전 기준은 세션별 median과 p95 허용치였다. 엔진은 median `max(5%, 1 ms)`, p95 `max(10%, 2 ms)`, 앱은 median `max(5%, 0.5 ms)`, p95 `max(10%, 1 ms)`다. **이번 채택은 이 p95 기준을 모두 통과해서 내린 결정이 아니다.** 정적 분석(코드 경로와 작업량)과 median 측정, 측정 한계에 대한 근거를 바탕으로 한 사용자 결정이다. 원래 기준으로 남은 초과와 미검증 범위는 아래에 그대로 공개한다.

## 근거

### 1. 정적 분석: 코드가 줄이거나 더하는 작업

- **A2(행 memo):** 행 props(`item`과 콜백 3개)가 같으면 이전 평가를 재사용한다. 행 컴포넌트 실행, VNode 생성·동결, 그 행의 diff 비교가 사라진다. 대신 기록이 있는 행마다 `sameProps`(키 4개)와 래퍼 호출 한 단계가 더해진다.
- **E9(엔진):** memo를 쓰지 않는 앱에서 더해지는 작업은 이전 기록이 있는 컴포넌트마다 `WeakSet.has` 1회뿐이다. `sameProps`는 실행되지 않는다. 그 밖의 추가는 카운터와 반환 필드 하나다.
- **복원 패치:** 적용 조건이 맞으면 검증 그래프용 Map, PlannedNode 객체, original Map, visited Set(각각 노드 수 N개 규모)을 만들지 않는다. nextView도 다시 순회하지 않는다. 조건이 맞지 않는 계획에는 O(1) 비교 한 번만 더한다.
- **남는 비용:** 매 갱신마다 전체 VDOM 검증(`validateTree`)과 DOM binding 사전 검증은 여전히 O(N)이다. 따라서 이득의 상한은 render와 diff가 전체 시간에서 차지하는 비중이다.

### 2. 작업량 기록(측정마다 같은 결정적 counts)

[`followup-rowmemo-confirm-v2`](bench/followup-rowmemo-confirm-v2/) S1 counts realm에서 같은 E9 엔진의 A0와 A2를 비교했다.

| 작업 | 행 실행 A0 → A2 | diff 방문 노드 A0 → A2 |
|---|---:|---:|
| counter·draft·equal·sort / 1,000개 | 1,000 → 0 | 10,046 → 1,046 |
| move / 1,000개 | 1,000 → 0 | 10,047 → 1,047 |
| search / 1,000개 | 500 → 0 | 5,046 → 546 |
| filter / 1,000개 | 334 → 0 | 3,386 → 380 |
| crud(동작 5개 합) / 1,000개 | 7,004 → 3 | 70,357 → 7,348 |
| 같은 작업 / 100개 | 100 → 0 | 1,046 → 146 |
| dirty(같은 State 입력 복원) | 0 → 0 | 1 → 1 |

- fresh 초기화에서는 E7+A0와 E9+복원 패치+A0의 counts가 같았다: 생성 노드 1,047, 루트 실행 3, 하위 실행 210, 동일한 DOM 쓰기와 Effect. [fresh 분석](followup-fresh-init.md)

### 3. median 측정(실행 순서 교대, 같은 세션 비교)

- **A0→A2(E9):**
  - v1에서는 75개 조건 중 69개가 세 세션 모두 median 감소였다. [④ 보고서](followup-row-memo.md)
  - v1·v2 6개 세션의 감소 범위 예: 1,000개 counter −69.6~−76.9%, 100개 rename −55.9~−75.9%.
  - 보충 측정(n=180)에서는 counter/10, search/100, filter/1000 모두 세 세션 median이 감소했다. [보충](bench/followup-rowmemo-supplement-20261109-1952/report.md)
- **복원 패치:** dirty/100 median이 A0·A2 모두 세 세션에서 −0.5~−0.8 ms(−24~−35%) 줄었다. equal/100, counter/10, crud/10은 엔진 허용치 이내였다. [복원 연구](followup-dirty-restore.md)
- **E7+A0 → E9+복원 패치+A0:** persistent equal/1000, counter/1000, move/1000은 세 세션 모두 허용치 이내였다(`bench/engine-supp-20261109-2113-{1,2,3}-*`).

### 4. 측정 한계에 대한 근거

- 같은 `task-e7-a0-v1` 빌드의 fresh/equal/100 초기화 p95가 이날 5번의 측정에서 23.9–49.3 ms로 흔들렸다. median은 20.9–24.8 ms였다.
- 바이트가 같은 번들의 A/A에서도 초기화 p95 차이 3.715 ms(허용 2.953 ms), 생명주기 p95 차이 5.710 ms(허용 4.462 ms)가 나왔다. [fresh-init-aa](bench/fresh-init-aa/decision.json)
- 위 정적 분석으로 보면 엔진 차이가 만드는 비용은 이 흔들림보다 수 자릿수 작다.

## 원래 기준으로 남는 초과와 미검증 범위

- **fresh/equal/100(E7→E9+패치, 엔진 기준):** 결과 혼재.
  - 보충 측정 S2에서 초기화·생명주기 p95가 초과했다.
  - 같은 비교의 1회차 재측정은 통과했다.
  - 2회차 재측정에서는 S3 갱신 p95가 초과했다.
  - 같은 2회차의 E7→E9(패치 없음)에서도 S1·S2 초과가 있었다. [fresh-init-three](bench/fresh-init-three/execution.json) · [r2](bench/fresh-init-three-r2/execution.json)
- **A2 dirty/100:** E9에서는 앱 허용치 초과가 재현됐다(S1·S3). 복원 패치를 넣은 엔진에서는 A0→A2 초과가 관찰되지 않았다. 다만 같은 묶음에서 E9 A0→A2를 다시 비교하지 않았으므로 해소됐다고 입증하지는 않았다.
- **엔진 보충:** 과거 초과 23개 조건 중 crud/10, persistent equal·counter·move/1000, fresh equal/100만 다시 확인했다. 나머지는 미측정이다.
- **그 밖의 미검증:** 10,000개 stress, Firefox 성능, 실제 한글 IME(복원 패치 이후).
- 모든 항목에 대해 코드가 원인이라는 증거도, 잡음이라는 확정 증거도 없다. 측정 한계는 가정이며 원인은 미확인이다.

## 채택 후 검증 (기본 소스)

| 항목 | 결과 |
|---|---|
| typecheck (`tsc --noEmit`) | 통과 |
| 단위·통합 (`vitest run`) | 268/268 통과 (memo 행 테스트, `SYNC_FORM` 차등 테스트 41개 포함) |
| production build (`vite build`) | 통과 |
| 브라우저 (`playwright test`, Chromium·Firefox) | 33/33 통과, 1회 실행 |

이전 최종 정책(A0 기본)의 기록은 [task-app-final-policy.md](task-app-final-policy.md)에 그대로 보존한다.
