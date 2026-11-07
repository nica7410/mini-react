# M4 Keyed Greedy / LIS

2026-11-07: 순서·identity·제한 모델 최소 이동 검증 후 기본 전략을 **LIS**로 전환했다. `RootOptions.reconcile`, `EditorController.strategy`, `DiffOptions.strategy`에서 Greedy/위치 기반 비교 경로도 선택할 수 있다.

## 동일한 매칭, 서로 다른 안정 노드 선택

1. 같은 부모의 old/new 직접 자식이 모두 고유 key를 가진 element일 때만 keyed 경로를 사용한다. 빈 목록은 허용한다.
2. key로 후보를 찾은 후 node kind/tag·컴포넌트 경계 type/key·반환 host key가 호환되는지 공통 `compatible()`로 검사한다.
3. Greedy는 oldIndex의 running maximum보다 작은 기존 노드를 이동 대상으로 정한다.
4. LIS는 재사용 oldIndex의 증가 부분수열을 복원하고 그 밖의 기존 노드를 이동시킨다. 이미 증가 순서라면 LIS 계산을 생략한다.
5. 두 전략 모두 동일한 오른쪽부터의 ref/anchor 배치와 `commit()`의 `insertBefore`를 사용한다. 신규 oldIndex는 null이며 0을 신규 sentinel로 쓰지 않는다.

공백/텍스트/placeholder가 섞이거나 key가 빠지면 위치 기반으로 돌아간다. reason을 PatchPlan.reconciliations와 Trace에 기록한다. 중복/빈 key는 fallback이 아니라 오류다. 부모·mount가 다르면 같은 key여도 노드를 넘겨 재사용하지 않는다.

## 실제 검증

| 범위 | 결과 |
|---|---|
| 전체 단위·통합 | 113/113 PASS, 9 files |
| 전체 Chromium 기능 | 10/10 PASS |
| TypeScript / production build | PASS / PASS |
| T-L01: n=1~8 순열 | 46,233개, 두 전략 모두 순서·identity PASS |
| T-L02: n≤7 독립 BFS | 5,913상태, 실제 LIS 이동 수 = 최단 이동 수 |
| T-L03: 4개 key 부분 순열 | 4,225쌍, 삽입/삭제/이동/oldIndex 0 PASS |
| T-L04: 타입 변경 무작위 | seed 539365639, 10,000쌍, 두 전략 PASS |
| Chromium DOM seed smoke | 200쌍 × 두 전략 = 400회; 순서/실제 객체/live uncontrolled 값/텍스트 PASS |

테스트는 실제 `src/core/keyed.ts` planner를 호출한다. 모델 executor는 독립적인 배열 remove/insert만 사용한다. BFS는 임의 노드 하나를 임의 위치로 옮기는 그래프를 탐색하며 LIS 공식을 정답에 쓰지 않는다. 실제 Diff+DOM executor의 삭제/이동/삽입/type 변경과 중첩 컴포넌트 identity는 별도 통합/브라우저 테스트로 연결했다.

실패 시 `.validation/keyed-failure.json`에 seed·sample·old/new/type을 저장한다. 이번 실행에는 알고리즘 실패가 없었으므로 가짜 실패 fixture를 만들지 않았다. M3에서 발견한 native-input 회귀는 브라우저 테스트에 계속 포함된다.

| ABCDEFGH → | Greedy 계획 이동 | LIS 계획 이동 |
|---|---:|---:|
| HABCDEFG | 7 | 1 |
| BCDEFGHA | 1 | 1 |
| HGFEDCBA | 7 | 7 |
| HBCDEFGA | 7 | 2 |
| ACBDEFGH | 1 | 1 |

HABCDEFG는 실제 DOM executor에서도 Greedy 7회/LIS 1회 이동을 확인했다. `reconciliations.moves`는 계획 수이고 `CommitCounters.movedRoots`는 실제 host 호출 수다. 이미 올바른 위치여서 생략하면 skippedHostCalls로 구분한다.

이 결과는 **고유 key·동일 부모·호환 type·항목당 하나의 host root** 모델의 정확성과 이동 수 결과다. 전체 브라우저 속도 배율이 아니다. focus/selection/IME는 M7, 시간 benchmark는 M6에서 별도로 검증한다.

재현: `pnpm test`, `pnpm test:browser`, `pnpm build`. 전수 테스트는 `tests/unit/keyed-exhaustive.test.ts`, DOM/경계는 `tests/integration/keyed.test.ts`, 실제 브라우저 seed는 `tests/browser/keyed.spec.ts`. [실행 요약](validation/m4.json).
