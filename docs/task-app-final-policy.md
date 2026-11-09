# TaskApp 후속 작업의 최종 정책: E1 매회 검증 + 기본 앱 A0

2026-11-09 결정. E4 후보(`2a21ec7`)의 정식 비교와 완료한 10개·100개 보충까지 검토한 뒤 정했다. 이 문서는 선택한 정책, 근거, 실제 소스 변경, 최종 검증을 연결한다. 비교 기준과 허용 범위는 [사전 계획](task-app-comparison-plan.md)을 소급 수정하지 않고 그대로 따랐다.

## 결정

| 대상 | 기본 경로 | 비교 전용으로 유지 |
|---|---|---|
| 엔진 검증 | **E1 방식.** `validateTree`가 호출될 때마다 전체 VRoot의 문맥을 검사한다. 같은 VRoot 참조가 다시 와도 이전 결과를 재사용하지 않는다. | E2~E4의 장기 불변성 인증과 전체 root 검증 캐시는 고정 비교 build(`c4a2fe1`, `ff9e24e`, `2a21ec7`)에만 남는다. |
| 동결 안전 조건 | 먼저 동결하고 동결 후의 own data만 따라간다. accessor는 실행하지 않는다. 순환·재진입은 `순환 데이터` 오류로 거절한다. 함수와 상속 prototype 데이터는 동결하지 않는다. 호출 사이에 아무 증명도 보관하지 않는다. | — |
| 앱 | **A0.** 기본 `TaskApp`은 매 루트 render마다 행 콜백과 행 표현을 다시 만든다(`4d5a66f`의 동작). | **A1** `TaskAppWithRowReuse`. 목록 표현과 행 콜백을 루트 `useMemo`로 재사용한다(`5ed7f34`의 동작). 고정 비교 build는 계속 `5ed7f34`의 Git 객체를 사용한다. |

E3의 Proxy 반례 수정은 성능 정책과 별개의 정확성 수정이므로 유지한다. 인증 보관 자체를 없앴으므로 E4의 호출당 64개 상한도 더 이상 필요 없다.

## 근거

**E4 엔진은 일반 채택을 기각했다.** 정식 480조건에서 1,000·10,000개 draft·counter·equal의 median은 E1 대비 3/3세션 모두 44.6~52.7% 감소했다. 그러나 엔진 비교 68조건 중 6개가 사전 허용 범위를 넘었다. 새 3세션 n=180 100개 보충에서도 이름 수정 median이 S1에서 +14.29%(+1.450ms), 완료 상태 변경 median이 S1·S2에서 +13.73%(+1.400ms)·+9.32%(+1.100ms)로 다시 넘었다. 검색 p95도 S3에서 +11.05%(+2.475ms) 초과했다. [정식 판단](bench/task-candidate-v2/policy-review-e4.md) · [100개 보충](bench/task-candidate-v2-tail-persistent-100-v1/policy-review-e4.md)

앞선 후보도 같은 결론이었다. E2는 A1 고정 1,000개 검색의 median·p95가 세 세션 모두 범위를 넘었다. E3는 1,000개 CRUD n=180 보충에서 toggle 회귀가 세 세션 모두 남았다. [E2 비교](task-app-baseline-results.md) · [E3 기각](task-app-tail-results.md)

**A1 앱은 일반 채택을 보류하고 기본값으로 쓰지 않는다.** 선택한 E1 엔진을 고정한 A0→A1 첫 정식 3세션에서 1,000·10,000개 draft·counter·equal median은 53.2~56.7% 감소했다. A1은 해당 작업량 측정 18건에서 행을 다시 실행하지 않았다. 반면 68개 판정 조건 중 13개가 한 번 이상 허용 범위를 넘었다(median 9개, p95 7개, 둘 다 넘은 조건은 한 번만 셈). E4에서 측정한 앱 비교도 10개 정렬 p95(S2 +32.76%, +1.705ms)와 100개 완료 상태 변경 p95(S2 +10.52%, +1.905ms)가 보충에서 범위를 넘었다. [E1 앱 판정](bench/task-matrix-v1/decisions.json) · [10개 보충](bench/task-candidate-v2-tail-persistent-10-v1/policy-review-e4.md)

작업명이나 목록 크기로 A1을 자동 전환하는 경로는 이를 뒷받침할 측정이 없어 추가하지 않았다.

**10,000개 보충은 미완료다.** 사용자 요청으로 첫 조건의 95/180 표본에서 중단했고 완료 조건은 0개다. 부분 원자료는 바이트 단위로 보존했지만 판정에 쓰지 않는다. 10,000개 stress 회귀의 해소 여부는 **미해소·보류**로 남긴다. 사용자가 다시 허락하기 전까지 10,000개 측정은 실행하지 않는다. [중단 기록](bench/task-candidate-v2-tail-persistent-10000-v1/stopped-run-inventory.json)

## 소스 변경

| 파일 | 변경 |
|---|---|
| `src/core/validate.ts` | `validatedRoots` WeakSet 캐시 제거. 매 호출 전체 root 검사(E1과 같은 검증 의미). |
| `src/core/vdom.ts` | `isImmutableData`, 장기 `immutableData` WeakSet, 64개 보관 상한 제거. `freezeTree`는 동결 우선·동결 후 data descriptor만 추적·accessor 미실행·순환/재진입 거절을 유지한다. 한 호출 안에서만 쓰는 WeakSet으로 공유 참조의 중복 방문을 줄인다. 새 `freezeOwnedNode`·`freezeBoundaryNode`가 resolver가 방금 만든 VNode를 봉인한다. |
| `src/runtime/resolve.ts` | 각 VNode를 생성 시점에 `freezeOwnedNode`로 봉인한다. 자체 데이터(identity·attrs·style·events·form)는 깊게 동결하고, `children` 배열은 얕게 동결한다. children의 항목은 생성될 때 이미 봉인된 엔진 VNode다. 컴포넌트 경계 노드 `{...child, identity}`는 `freezeBoundaryNode`로 새 identity만 동결한다. 자식 데이터를 다시 순회하지 않는다. 자식이 봉인되지 않았거나 경계 노드가 자식과 다른 데이터를 가지면 오류로 거절한다(검증용 확인이며 건너뛰기 근거가 아니다). 재사용한 하위 트리는 다시 순회하지 않는다. |
| `src/app/tasks.ts` | `TaskApp` = A0, `TaskAppWithRowReuse` = A1. 두 앱은 같은 화면·State·Effect 코드를 공유하고 목록 생성 전략만 다르다. 각 전략은 언제나 같은 Hook을 같은 순서로 호출한다. |

**E1 고정 build와의 차이.** E1(`8b302de`)의 `freezeTree`는 `Object.isFrozen`인 객체를 건너뛰었다. 그래서 얕게 동결된 wrapper 아래의 mutable 데이터나 Proxy를 놓칠 수 있었고, 값을 꺼내는 과정에서 accessor를 실행했다. 최종 소스는 이 건너뛰기를 쓰지 않는다. 대신 resolver가 만든 노드를 생성 시점에 봉인해 E1처럼 새 노드만 동결하는 비용 구조를 유지한다. 이 차이 때문에 최종 소스를 E1 고정 build와 같은 것으로 취급하지 않는다. 새 timing 측정은 하지 않았으므로 최종 소스의 성능 수치를 E1 측정값으로 대신 주장하지 않는다.

## 테스트 변경

| 테스트 | 변경 |
|---|---|
| T-N06 `immutable-proof-regression`, `immutable-validation` | 인증 여부 단언을 동결 상태·accessor 미실행·매 호출 재검증 단언으로 바꿨다. Proxy의 상속 데이터, 동결 trap의 최종 참조 교체, 중단 후 재시도, 순환·재진입 거절 반례는 그대로 둔다. |
| T-N07 | 그대로 둔다. 같은 subtree를 다른 form/radio/select 문맥의 새 root에 놓으면 다시 검사한다. |
| T-N08 `immutable-per-call`(이전 `immutable-retention-budget`) | 보관 상한 대신 다음을 확인한다. 넓은 트리의 모든 객체가 동결되고 같은 root를 두 번 검증하면 accessor를 두 배 읽는다(결과 미보관). 늦은 accessor는 동결 중 실행하지 않고 변경 값을 거절한다. resolver가 봉인한 새 노드와 재사용 노드는 렌더를 거쳐도 깊게 동결되고, 이벤트 handler는 동결하지 않는다. 새 부모 아래 재사용한 keyed 자식과 컴포넌트 경계를 포함한 렌더도 확인한다. 봉인되지 않은 자식이나 자식과 다른 데이터를 가진 경계 노드는 거절한다. |
| T-A04/T-A05 `task-reuse`, `task-benchmark` | 측정 어댑터가 기본 A0를 쓰므로 행 실행 횟수 기대값을 10으로 바꿨다. A0의 행 재평가(8회)와 A1의 생략(0회)을 직접 비교하는 테스트를 추가했다. 엔진 재사용을 끄면 A1도 8회 실행함을 확인한다(두 useMemo만으로는 행 평가를 건너뛰지 않음). 최신 FIFO State 콜백 테스트는 A0와 A1 모두에서 실행한다. |

## 최종 검증

선택한 정책의 기능·테스트 소스를 `9b52323`(phase1)에 커밋한 뒤 `node scripts/validate-task-final.mjs task-final-20261109-v1`로 검증했다. 2026-11-09 15:15:22~15:20:40 KST, 측정·진단 포트 4178/4179는 비어 있었다.

| 단계 | 결과 |
|---|---|
| typecheck | 통과 |
| 단위·통합 | **213/213** 통과(21개 파일, pending·todo 0). 이전 E4 후보 205개보다 4개 늘어난 이유는 A0/A1 직접 비교와 봉인 전제 테스트 추가다. 기대 하한(205)은 낮추지 않았다. |
| production build | 통과 |
| 기본 Chromium+Firefox | **33/33 × 3회**, 매 회 새 서버·브라우저. 125.4초 / 87.1초 / 89.2초. skipped·unexpected·flaky 0, worker 2, timeout 30초, retry 0 |
| 소스 hash | 검증 전후 src·tests·설정 파일 hash 동일, HEAD와 브랜치 불변 |

[검증 결과 JSON](validation/task-final-20261109-v1/result.json)에 명령별 로그, unit 보고서, 브라우저 실행별 결과와 서버 시작 시각, 모든 소스 파일의 SHA-256이 있다.

**검증하지 않은 것.** 최종 소스로 새 timing·진단 측정은 하지 않았다. 실제 Windows 한글 IME는 2026-11-07 사용자 직접 확인(브라우저명 미제공)이 마지막 수동 근거이며, 이번 소스에서는 브라우저 테스트의 합성 composition 회귀로만 확인했다. 10,000개 stress 보충은 중단 상태이고 회귀 해소는 미확인이다. 팀 합의·다른 후보 비교·팀원 설명 연습·원격 CI는 미확인이며, push·PR·배포는 하지 않았다.
