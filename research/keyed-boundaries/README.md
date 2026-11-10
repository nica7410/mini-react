# Keyed 구간 분할 후보 (연구용 보존, 2026-11-10)

기본 planner가 아니다. 기본은 `src/core/keyed.ts`(기준선 B0 `ab5a9b8`와 같은 코드)다.
판정과 근거: [docs/followup-keyed-boundaries.md](../../docs/followup-keyed-boundaries.md) §7~§8.

| 파일 | 내용 |
|---|---|
| `keyed.candidate.ts` | 후보 C1. `e382bd7:src/core/keyed.ts`와 같은 코드(import 경로와 export 이름만 다름). 테스트가 이 파일을 직접 불러 검사한다. |
| `candidate.patch` | `git diff ab5a9b8 e382bd7 -- src/core/keyed.ts`. `git apply`로 기본 planner에 적용할 수 있다. |

- 보존한 것: B0와 같은 계획(슬롯, 제거·삽입·이동 대상, `usedLIS`, stable 구성원, 실패 진단)을 낸다는 계약과 그 테스트
  (`tests/unit/keyed-boundaries.test.ts`, `tests/unit/keyed-boundary-counts.test.ts`, `tests/integration/keyed-boundaries.test.ts`),
  변이 확인 스크립트 `scripts/keyed-boundary-mutations.mjs`, 측정 스크립트 `scripts/bench-keyed-planner.mjs`·`scripts/analyze-keyed-boundaries.mjs`.
- 확인된 것: 목표 입력에서 planner의 Map 연산 0, Set 연산 절반. planner 단독 시간 median 21/21 감소.
- 확인되지 않은 것: 실제 TaskApp 전체 작업 시간의 이득. `crud/100` 3세션 중 2세션에서 median이 경고 폭을 넘게 컸고 A/A 폭 밖이었다. 원인이 후보라는 근거도 없다.
- 다음에 이어갈 한 지점: 한 페이지 안에서 같은 mount·같은 target에 두 planner의 `diff()`를 교대로 실행해 프로세스 단위 변동을 없앤 비교를 한 번 한다. 그 결과로 채택 여부를 다시 판정한다.
