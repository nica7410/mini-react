# E4 후보: 증명 보관 수 제한

2026-11-09. [E3 기각과 원인 진단](task-app-tail-results.md) 뒤 검토하는 후보다. 아직 성능 채택 결과가 아니다. E3의 동결 후 깊은 증명과 Proxy 반례 수정은 유지하고, 새 트리의 인증을 장기간 보관하는 범위만 제한한다.

## 변경 범위와 이유

E3는 모든 VNode/root 경계의 증명을 WeakSet에 등록했다. 새 트리를 반복해서 만드는 작업의 증명 비용과 메모리 비용이 관찰됐다. E3 A0/A1 별도 진단에서 CRUD 증명 self 비중은 각각 25.462%/23.800%였다. 이 수치가 toggle 회귀의 원인을 전부 설명하거나 WeakSet 내부 객체의 보유 경로를 입증하는 것은 아니다.

E4는 `freezeTree` 한 번에 **새 인증 최대 64개**를 보관하는 예산을 둔다. 명시적 인수와 순회에서 먼저 만나는 VNode 경계가 예산을 사용한다. 엔진이 만든 노드는 kind가 먼저 있는 표준 구조이므로 상위 경계를 먼저 예약한다. 한도는 메타데이터 보관 정책이며 트리의 크기·지원 기능을 제한하지 않는다. 64는 후보 시간을 보고 조정한 임계값이 아니며, 특정 앱·태그·작업 이름을 검사하지 않는다.

이는 한 호출의 새 등록량 상한이다. 이전 호출에서 증명된 공유 객체나 여러 History root를 포함한 전역 heap 전체에 64개 상한을 약속하는 정책은 아니다. 실제 보유 heap과 갱신 시간은 별도 측정으로 판단한다.

- 예산 소진 뒤에도 모든 하위 데이터의 동결·prototype·descriptor 검사를 계속한다.
- 완전한 깊은 증명에 성공한 객체만 등록한다. getter를 호출하거나 얕은 freeze를 증명으로 삼지 않는다.
- 예산 밖의 객체는 필요할 때 다시 증명한다. 이미 검증된 전체 root의 문맥 캐시는 그대로다.
- DOM binding/mount/revision/부모/anchor/PatchPlan, 폼 복원과 Effect 검사는 생략하지 않는다.
- 사용자 props/state, 앱 A1, dependency, CSS, 하네스와 사전 성능 gate는 변경하지 않는다.

`T-N08`은 큰 트리 전체의 동결과 인증 수 제한, 한도를 넘은 뒤 나타난 accessor가 root 인증을 막는지 확인한다. 기존 Proxy·순환·재진입·다른 form/radio/select 문맥 반례도 다시 실행한다.

## 검증·측정 순서

1. 새 보관 상한 테스트를 기존 E3에서 실행해 반례를 보존하고, 후보에서 관련 테스트·전체 단위/통합·typecheck/build를 실행한다.
2. 기능 소스를 현재 phase1에 커밋한 뒤 E4 A0/A1 production build를 고정한다.
3. E1 A1 / E2 A1 / E4 A0 / E4 A1을 같은 새 3세션에서 비교한다. 10/100/1,000/10,000, 모든 persistent 작업과 fresh equal, warm-up/n=60/30, seed·순서·oracle·계측 경계는 원 사전 계획과 같다.
4. 원자료·통계·gate를 감사하고, 정책 판단에 사용할 부족한 tail은 사전 정책대로 보충한다. 기준을 완화하거나 불리한 조건을 PASS로 바꾸지 않는다. 제한 정책도 정당화되지 않으면 안전한 무캐시 범위를 선택한다.
5. 실제 선택한 최종 소스에서 전체 브라우저 3회 등 인수를 새로 실행한다. 이전 E3 수치를 최종 검증으로 재인용하지 않는다.

E3와 E4가 서로 다른 정식 실행에 있으면 그 절대 시간이나 개선율을 직접 짝지어 비교하지 않는다. E4의 공식 엔진 기준은 같은 실행의 E1/E2 A1이며, 앱 효과는 같은 E4의 A0/A1이다.

## 후보 정확성 실행 결과

2026-11-09 06:08~06:09 KST에 실행했다. 기존 E3는 새 상한 테스트에서 인증 386개로 실패했고, late accessor 검사는 통과했다. 원본 [실패 기록](validation/task-e4-correctness/red.json)과 로그·JSON을 보존했다. E4는 불변성 관련 14개, 전체 단위/통합 205개, typecheck, production build를 모두 통과했다. [명령·시간·결과·소스 hash](validation/task-e4-correctness/result.json).

검증한 `src/core/vdom.ts` SHA-256은 `006f83c927aa7c713423e322333e14b5902fbf0bd1d4fb696eb2409198e55899`, 새 테스트는 `6a1f9fad64e1c3cdd134a8bd11191e997b42f6711bc96cd82dc7fa165b7bcdfb`다. 이 단계는 정식 성능 결과나 최종 기본 브라우저 3회 인수가 아니다.

기능 commit은 `2a21ec782af790faf881a5125a5e68fe17a2fee3`, E4 engine hash는 `9b75615d34ee58b34a59ea9504a7a7fc293fe7522c90b32b9c8e5f1b785a4997`다. A0/A1과 공통 하네스 hash는 기존 비교와 같다. 작은 네 비교군의 40개 조건(80개 측정 작업/112개 action)과 E4 A1의 10,000개 10개 조건(20개 작업/28개 action)을 실행하고 원자료·통계·판정 감사를 통과했다. [작은 smoke](bench/task-e4-smoke-v1/analysis.json), [stress smoke](bench/task-e4-stress-smoke-v1/analysis.json). n=2 smoke의 시간을 채택 근거로 사용하지 않는다.

정식 실행 tag는 `task-candidate-v2`이며 아래 명령으로 새 세션을 수집한다. 이 문서에 기록한 준비·smoke 결과는 정식 3세션 완료를 뜻하지 않는다.

```powershell
node scripts/benchmark-task.mjs --tag=task-candidate-v2 --builds=task-e1-a1-v1,task-e2-a1-v1,task-e4-a0-v1,task-e4-a1-v1
```

2026-11-09 06:17 KST(`2026-11-08T21:17:47.970Z`)에 위 정식 실행을 시작해 11:13 KST에 480/480조건으로 끝났다. runner commit은 `ae155cc3ea2982af7ac0365f6f62fc3ae5a03eb4`, 기능 엔진 E4는 `2a21ec7`의 고정 build다. [실행 환경](bench/task-candidate-v2/environment.json) · [판정 근거](bench/task-candidate-v2/policy-review-e4.md)

## 결과: 일반 채택 기각

반복 재사용 조건의 median 목표는 3/3세션 모두 달성했지만, 엔진 비교 68조건 중 6개와 앱 비교 68조건 중 5개가 사전 허용 범위를 넘었다. 새 3세션 n=180 100개 보충에서도 이름 수정·완료 상태 변경의 median 초과가 재현됐다. 10개 정렬의 앱 p95 초과도 재현됐다. 10,000개 보충은 사용자 요청으로 중단했으며 판정에 쓰지 않는다. 최종 기본 경로는 E1 방식의 매회 검증과 A0 앱이다. 이 문서의 64개 보관 상한은 고정 비교 build에만 남는다. [최종 정책](task-app-final-policy.md) · [100개 보충](bench/task-candidate-v2-tail-persistent-100-v1/policy-review-e4.md) · [10개 보충](bench/task-candidate-v2-tail-persistent-10-v1/policy-review-e4.md)
