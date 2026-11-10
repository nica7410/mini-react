# Keyed 구간 분할 후보의 비교 계획 (측정 전 기록, 2026-11-10 11:0x KST)

측정을 시작하기 전에 고정한다. 결과를 본 뒤 입력·표본·batch 길이·판정 기준을 바꾸지 않는다. 묶음은 한 번만 실행한다.

## 비교 대상

| | commit | `src/core/keyed.ts` blob | 비고 |
|---|---|---|---|
| B0 (기준선) | `ab5a9b8` | `git rev-parse ab5a9b8:src/core/keyed.ts` | c2dbbf6 + S1 정확성 수정 |
| C1 (후보) | `e382bd7` | `git rev-parse e382bd7:src/core/keyed.ts` | B0 + planner만 변경 |

`git diff ab5a9b8 e382bd7 -- src`의 변경 파일은 `src/core/keyed.ts` 하나다. 앱은 두 빌드 모두 A2(`e382bd7:src/app/tasks.ts`, c2dbbf6와 같은 내용), 전략은 LIS, 매칭 이후의 Diff·Patch 실행기·CSS·입력·oracle은 같다. 빌드 hash는 실행 디렉터리의 manifest에 남긴다.

## 1차: 작업량(counts)과 planner 시간

**counts** (`tests/unit/keyed-boundary-counts.test.ts`, 시간 측정과 분리): N = 10, 100, 1,000에서 B0·C1 planner 한 번 호출의 `Map.set/get`, `Set.add/has`, `compatible()` 호출 수를 prototype 계측으로 센다. LIS 호출 여부와 입력 길이는 `usedLIS`와 구간 길이에서 유도한다. 임시 배열·레코드 수는 코드에서 읽은 값으로 적고 "유도"라고 표시한다.

입력(행 identity는 A2 행과 같은 모양: key `task-i`, memo 컴포넌트 boundary 1개):

- 이득 기대: `same`(한 행의 내용만 변경 = key 전체 동일), `append`(끝 추가 1), `remove-last`(끝 삭제 1), `insert-middle`(가운데 삽입 1)
- 불리: `reverse`, `shuffle`(seed 539365639), `last-to-first`

**planner 시간** (`scripts/bench-keyed-planner.mjs`, Node, production 번들·minify): N = 100만. 한 표본 = 같은 입력으로 planner **200회 연속 호출**(고정 batch). 입력마다 warm-up 10쌍 뒤 60쌍 측정, 쌍 안의 순서는 교대(B0 먼저 / C1 먼저). 독립 프로세스 3회(세션), 세션마다 입력 순서를 회전. fixture 생성과 결과 일치 확인(oracle)은 측정 구간 밖에서 한다. batch당 ms와 1회 환산 µs를 함께 적는다. 느린 표본을 버리지 않는다.

## 2차: 실제 TaskApp (counts상 이득이 확인된 경우에만)

기존 `scripts/build-task.mjs` + `scripts/benchmark-task.mjs`, 100개, persistent, 독립 3세션, warm-up 10, 측정 60, `--alternate-pair-order`.

| 조건 | 성격 | 실제로 실행되는 keyed 변경 |
|---|---|---|
| `crud/100` | 이득 대표 1 | 끝 추가(M=1), 한 행 이름·완료 변경(M=0), 끝 삭제(M=1) |
| `counter/100` | 이득 대표 2 | 목록 불변(M=0), memo 행 재사용 |
| `sort/100` | 불리 | 이름순↔수동 정렬(p=s=0에 가까운 재배치) |

측정 구간은 러너 정의 그대로다: `primaryMs`(이벤트~주 flush+Effect), `totalCpuMs`(primary + 겹치지 않는 후속 flush/effect 합, 벽시계 기반), 그리고 그 안의 `diffMs`. 전체 VDOM 검증·DOM 사전 검증·reset·identity oracle·실제 40ms Effect를 유지한다. 중첩 구간의 통계를 더하지 않는다. fresh는 범위 밖이다. counts realm(같은 러너)의 방문 수·host 호출 수가 두 빌드에서 같은지 확인한다.

**A/A (한 차례, 조건 하나):** `crud/100`에서 B0 빌드를 두 이름으로 만들어 같은 절차로 한 번 측정한다. "변화가 측정 변동 안"이라는 문장을 쓰려면 이 분포가 필요하기 때문에 결과를 보기 전에 포함시킨다. 반복하지 않는다.

## 기대와 경고 지표

- 작업량: `same/append/remove-last/insert-middle`에서 C1의 `Map.set/get`이 0 또는 1 수준, `Set.add/has`는 key 검사분(2N 안팎)만 남는다. 불리한 입력에서는 Map 항목 수가 같고 LIS 입력 길이도 같다(경계 비교 2회 추가).
- planner 시간: 이득 입력에서 감소를 기대한다. 불리한 입력에서 증가하면 그대로 적는다.
- 전체 작업: planner는 한 flush의 작은 부분이므로 median 변화가 timer 해상도(0.1 ms)와 A/A 폭 안에 머물 수 있다. 그러면 "작업량 최적화, 사용자 작업 속도 이득 미입증"으로 적는다.
- 회귀 경고(엔진 비교, 반올림 전 `C1 - B0`): median 증가 > max(B0 median × 5%, 1 ms), p95 증가 > max(B0 p95 × 10%, 2 ms). 경고는 공개하되 한 번의 초과로 자동 재측정·자동 기각하지 않는다. 같은 조건의 여러 세션에서 median 악화가 반복되면 A/A와 무관하게 불리한 결과로 적는다.

## 시간 상한

성능 실험 실행 누적 15분(counts·planner·TaskApp·A/A·빌드 포함). TaskApp 러너는 `--max-minutes=6`, A/A는 `--max-minutes=3`. 상한에 닿으면 원자료를 남기고 멈춘다. 다른 테스트·빌드·benchmark와 겹치지 않게 실행한다. 사용자의 다른 앱(Chrome 등)은 종료하지 않는다.
