# B안 구현 및 후속 검증 기록

이 문서는 현재 진행 상태를 기록한다. [M0~M1 기록](m0-m1.md)은 당시 검증의 역사적 스냅샷으로 보존한다.

- 목표: B안 명세 M8 및 브라우저 안정화/no-op 후속 개선의 구현·검증·문서화와 단계별 로컬 커밋.
- 작업 시작 브랜치: **phase1**. 같은 브랜치에서 계속한다.
- 현재 단계: **브라우저 안정화/no-op 후속 기술 검증 완료. 기능 소스 c4a2fe1의 184개 테스트·전체 브라우저 31개×3회·타입·빌드 통과. 동일 하네스 3세션의 측정 23,760개·통계 2,016개 감사 PASS. 생성 비용 증가와 일부 p95 악화도 공개했다.** 기존 m8-full 결과는 과거 기능 소스의 실험으로 보존한다.
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
| M6 | 전체 Gate 통과 | [관찰 기록](m6-observability.md), [최초 M8 결과](benchmark-results-m8.md): 3세션, timing 51,480개, 원본/통계 일치. 초기 할당 실패 보존 |
| M7 | 필수 검증 충족 | [M7 기록](m7-app-browser.md): 157 unit/integration, Chromium 19 + Firefox 10, 실제 Performance trace, 사용자 IME 확인 |
| M8 | 기술 인수 충족, 외부 확인 별도 | [최종 인수](m8-acceptance.md), [기능·76개 테스트 ID](requirements-tests.md), [구조/한계](architecture.md), [데모/설명](demo-and-explanation.md). 원격 CI·팀원 활동은 미확인 |

## 커밋 기록

후속 목표: 기본 브라우저 26/29 timeout을 재검토하고 대규모 no-op을 측정·개선한다. [진단·설계·진행](browser-noop-followup.md), [최종 정확성 검증](validation/noop-followup.json).

| 후속 해시 | 목적·검증 |
|---|---|
| 7757e3c | 실패 trace/원본 보존, worker/서버/네트워크/action 진단, no-op 6경로 하네스와 분리 프로파일러. browser 29/29×worker 2/1, harness 12개, 타입 통과 |
| b56f290 | 모듈 준비 health endpoint와 앱 ready 확인, 긴 CRUD 목적별 분리. worker/timeout/retry 유지, browser 31/31 |
| 8b302de | preflight host 비교용 객체 할당 제거. 관련 78개 테스트·typecheck/build, 기준선/프로파일/paired smoke 보존 |
| c4a2fe1 | 깊은 불변성이 증명된 전체 root의 검증 재사용. 전체 184개·브라우저 31/31×3 fresh runs·typecheck/build 통과. 생성 비용 증가도 보존, 최종 3세션 비교는 dbdc4de에서 인수 |
| dbdc4de | 전후 고정 build·3세션 raw/통계/그림·GC/CPU 진단 인수. 28,728 raw / 23,760 timing / 2,016 통계 일치. 생성+cycle 및 p95 악화 보존, 65개 현재 소스 hash 일치 |

최종 문서 커밋은 이 기록 뒤의 git log에서 확인한다. 후속 원본/분석은 [성능 보고서](benchmark-results.md)와 [검증 JSON](validation/noop-followup.json)에 연결했다.

이하 표는 최초 M0–M8의 역사적 기록이다.

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
| 07b6f27 | M8 | 기능/69개 테스트 ID·아키텍처·데모/설명·CI 구성, 실제 IME 사용자 확인. 원격 CI 미실행 |
| ebc8f46 | M6·M8 | 대용량 측정의 Chromium 할당 실패 보존, 조건별 프로세스 격리·timeout·부분 raw 저장. 집중/전체 축 smoke·자원 진단·의도적 timeout 검증 |
| 0d1cfea | M6·M8 | 전체 3세션 raw·통계·그래프·해석 인수. 624 counts / 10,140 warm-up / 51,480 timing, 4,368 구간 통계 일치 |

전체 benchmark 원본과 필수 구현·검증을 대조해 M8 기술 인수를 충족했다. [최종 감사](validation/m8.json)를 확인한다. 팀 합의·다른 후보·팀원 설명/연습/실제 발표·원격 CI 실행은 완료로 표시하지 않았다. 최종 인수 문서 커밋은 이 기록 이후의 `git log`에서 확인할 수 있다. 모든 작업은 phase1의 로컬 커밋이며 push·PR·원격 배포는 하지 않았다.
