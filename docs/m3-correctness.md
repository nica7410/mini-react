# M3 필수 정확성 보완

M3는 진행 중이다. 최종 명세의 폼·Hook·History 계약까지 검증한 뒤 Gate 완료를 판단한다.

## 1. Patch 사전 검증

이전 validator는 ref 존재만 검사했다. 잘못된 anchor가 뒤쪽 명령에 있으면 앞의 텍스트 변경이 먼저 수행될 수 있었다.

- `planValidation.ts`가 현재 DOM binding/parent/type/자식 구조를 확인한다.
- create/remove/update/place/form 순서를 검사하고, 명령을 DOM 없는 형제 연결 모델에서 모의 실행한다.
- 결과의 ref/순서/host 값이 nextView 및 target과 맞는지 확인한 후 실제 host 쓰기를 허용한다.
- 기존 identity와 호환되지 않는 ref 재사용, 잘못된 parent/anchor, 중복 ref, 배치되지 않은 subtree를 거절한다.
- 연결 목록으로 형제 배치를 모의 실행하여 이동마다 배열을 탐색하지 않는다.
- old/new snapshot 모두 중복 key·지원 입력 검사를 받는다.
- 실제 DOM API 예외는 faulted로 전환하고 후속 commit을 막는다. 예상하지 못한 host 예외의 전체 rollback은 보장하지 않는다.

검증: `pnpm typecheck` PASS, `pnpm test` **62/62 PASS** (2026-11-07). `plan-validation.test.ts`의 추가 10개 회귀가 잘못된 계획에 대해 생성/쓰기 0회, 마지막 화면 유지, fault 차단을 검증한다.

## 2. 다음 검증

- snapshot/controlled/uncontrolled 폼 소유, radio form 격리, select/option 갱신, file 선택 캡처 경계.
- 독립 native 입력 추적과 controlled no-op 복원.
- 마지막 정상 History 기준 fault 초기화, Hook/자원 회귀, 실제 브라우저 확인.
