# 실제 TaskApp 진단 뒤의 E3 후보

E2의 생성 포함 회귀와 별도 CPU/할당/보유 heap 진단은 [첫 정식 결과](task-app-baseline-results.md)에 보존했다. 그 결과를 확인한 뒤에만 이 후보를 작성했다. 최종 채택은 아직 하지 않았으며 아래 구현이 빨라졌다고 단정하지 않는다.

## 수정 범위와 원리

변경은 `src/core/vdom.ts`의 깊은 동결·증명 과정에 한정한다. 모든 own data property를 계속 검사하고 자식까지 동결한다. accessor를 호출하지 않으며, accessor 또는 사용자 정의 prototype이 있으면 불변으로 인정하지 않는다. 함수는 기존 계약대로 불투명한 참조로 취급하고 동결하지 않는다.

1. 먼저 객체를 동결하고, 이후 고정된 prototype과 최종 descriptor를 검사한다. Proxy가 동결 전에 prototype을 다르게 보고하거나 동결 중 자식 참조를 바꿀 수 있으므로 이전 순서의 증명은 충분하지 않았다.
2. 재귀 helper가 깊은 증명의 성공 여부를 직접 반환한다. 부모가 자식의 WeakSet 등록 여부를 다시 조회할 필요가 없다.
3. 장기 WeakSet 인증은 명시적인 freezeTree 인수와 VNode/root 경계에만 남긴다. attrs/style/identity와 배열도 깊게 검사·동결하지만 모두 등록하지는 않는다. kind 값은 검사 후 보관 여부만 정하며 임의 trusted flag로 검증을 생략하지 않는다.
4. 재귀 중인 객체는 임시 Set으로 관리하고 finally에서 항상 제거한다. 재진입 Proxy와 순환 데이터도 의도적인 오류로 중단한다.

전체 root의 문맥 검증 캐시는 유지한다. 하위 트리의 유효성, DOM binding, mount/revision, PatchPlan, 부모/anchor, 폼 복원, Effect 또는 IME 검사를 새로 생략하지 않는다. TaskApp A1, Hook 슬롯과 공통 Diff/Patch도 변경하지 않는다.

## 실제 반례와 정확성 검증

`immutable-proof-regression.test.ts`의 네 테스트를 변경 전 E2에서 먼저 실행했다. 두 Proxy 반례가 실제 실패했고, 오류 후 재시도와 순환/재진입 검사는 통과했다. 실패 원문을 삭제하거나 재시도로 덮어쓰지 않았다. 수정 후 같은 네 반례를 포함한 관련 19/19, 전체 단위·통합 203/203, typecheck와 production build가 통과했다. [실패 원문](validation/task-e3-correctness/red.json), [명령·소스 hash·통과 결과](validation/task-e3-correctness/result.json).

이 검증은 후보의 정확성 증거이며 최종 선택 뒤의 전체 브라우저 3회 검증을 대신하지 않는다.

## 후보 시간 결과를 보기 전 고정한 재비교

- E1 A1, E2 A1, E3 A1을 같은 새 세션에서 비교한다. 최종 엔진에서 앱 효과도 따로 확인하도록 E3 A0를 함께 포함한다.
- 기존 A0/A1 Git 소스, seed, CSS, 의존성, production 하네스와 모든 oracle을 그대로 사용한다.
- 기존 사전 계획대로 10/100/1,000/10,000, 모든 persistent 작업과 fresh equal, 독립 3세션, warm-up 10/stress 5/fresh 3, 표본 60/fresh 30이다.
- 비교군 순서는 기존 runner의 회전/반전을 따른다. 시간 측정 중 테스트·build·profiling을 병행하지 않는다.
- 최종 정책에 해당하는 gate 초과와 tail 불확실성은 기존 기준에 따라 3개 새 세션 n=180으로 보충한다. 기존 raw와 합치거나 기준을 완화하지 않는다.
- 후보의 생성/재사용/폼/CRUD/재배치/초기화와 별도 CPU·메모리·화면 trace를 함께 판단한다. 회귀가 남으면 좁은 캐시 또는 안전한 무캐시 정책을 검토하고 불리한 후보도 보존한다.

후보 성능·최종 정책·최종 전체 검증은 진행 중이다.
