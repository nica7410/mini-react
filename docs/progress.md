# B안 M8 목표 진행 기록

이 문서는 현재 진행 상태를 기록한다. [M0~M1 기록](m0-m1.md)은 당시 검증의 역사적 스냅샷으로 보존한다.

- 목표: B안 명세 M8까지 기술 구현·검증·문서화 및 단계별 로컬 커밋.
- 작업 시작 브랜치: **phase1**. 같은 브랜치에서 계속한다.
- 현재 단계: **M7 필수 검증 충족(실제 IME 사용자 확인 포함). 최종 benchmark 실행 중, M8 문서·CI·인수 감사 진행**.
- 외부 확인: M0 팀 합의/일정, 다른 후보, 팀원 설명/변경 연습, 원격 CI 실행은 확인되지 않았다. 실제 IME는 사용자 직접 확인 PASS이며 브라우저명·버전은 미제공이다.
- 원격 push/PR 병합/원격 배포는 요청 범위 밖이다. 최종 산출물은 로컬 데모와 재현 절차다.

| 단계 | 실제 상태 | 증거/남은 조건 |
|---|---|---|
| M0 | 기술 계약 준비, 팀 확인 대기 | [M0~M1](m0-m1.md) |
| M1 | 현재 후보 구현·재검증 완료 | 705fde0; unit 52/browser 4/typecheck/build |
| M2 | 현재 후보 잠정 선정 | [선정 기록](m2-selection.md); 다른 후보 비교 없음 |
| M3 | 기본 정확성 Gate 통과 | [M3 기록](m3-correctness.md): 95개 단위·통합, Chromium 9개, 타입·빌드 통과 |
| M4 | Gate 통과, LIS 기본 활성화 | [M4 기록](m4-keyed.md): 113개 단위·통합, Chromium 10개, 전수/seed/BFS·400회 DOM smoke |
| M5 | Gate 통과 | [M5 기록](m5-batching-reuse.md): 138개 단위·통합, Chromium 12개, 타입·빌드 통과 |
| M6 | Inspector/harness 검증 완료, 전체 측정 대기 | [관찰 기록](m6-observability.md): 145+13 테스트, production smoke; 최종 엔진 전체 시간 행렬 필요 |
| M7 | 필수 검증 충족 | [M7 기록](m7-app-browser.md): 157 unit/integration, Chromium 19 + Firefox 10, 실제 Performance trace, 사용자 IME 확인 |
| M8 | 문서·CI 구성 완료, 최종 실험 인수 진행 | [기능·69개 테스트 ID](requirements-tests.md), [구조/한계](architecture.md), [데모/설명](demo-and-explanation.md). 원격 CI는 미실행 |

## 커밋 기록

| 해시 | 단계 | 목적·검증 |
|---|---|---|
| 705fde0 | M0~M1 | 공통 VDOM/Diff/Patch·History·루트 Hooks 기준 구현. 52+4 테스트, 타입·빌드 통과 |
| 086aea9 | M2 | 현재 구현 잠정 선정과 M3 보완 목록. 다른 후보 비교·팀 합의 미수행 |
| 2683c0d | M3 | DOM 쓰기 전 Patch 계획의 구조/순서/대상 검증. 62개 테스트와 타입 검사 통과 |
| c36cead | M3 | 폼 소유·native 입력 복원 순서·fault 복구·불변 state 진단. 95+9 테스트, 타입·빌드 통과 |
| 171f2ab | M4 | 동일 매칭/executor의 Greedy·LIS, 전수/독립 BFS/실제 DOM 검증 후 LIS 기본 활성화. 113+10 테스트 |
| 5899203 | M5 | FIFO microtask Batching·위치별 expression 재사용·native input 경계. 138+12 테스트 |
| 82af5b0 | M6 | 실제 Inspector·bounded Trace·seed/JSON 재실행. 142+13 테스트 |
| c8db719 | M6 | counts/timing 분리·동일 old reset·원본/통계/환경 저장 harness. 145+13 테스트와 production smoke |
| 3190268 | M7 | focus/selection·composition 보류·root 목록 앱·브라우저 확장. 157+29 테스트, 타입·빌드, 실제 Performance trace |

M8 완료는 전체 benchmark 원본과 모든 필수 구현·검증 증거를 대조한 뒤 판단한다. 실제 IME는 사용자의 확인 문구를 기록했고, 팀 확인을 개발자 추정으로 대체하지 않는다.
