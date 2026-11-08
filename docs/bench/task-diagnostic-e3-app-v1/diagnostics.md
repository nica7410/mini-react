# 별도 TaskApp 진단

정식 성능 표본과 분리한 unminified production 사본이다. 엔진·앱의 기능 소스 hash는 원본 timing build와 일치한다. CPU/할당 sampling·trace·observer가 실행에 영향을 주므로 아래 시간으로 정식 비교의 순위를 대체하지 않는다.

CPU는 warm-up 5회 후 12회이며 CRUD 한 회는 action 5개다. 표의 primary 시간은 측정 action 창들의 합계이고 40ms 대기·oracle·비동기 후속 flush를 포함하지 않는다. 별도 전체 profile에는 이 작업들이 남아 있다.

## CPU·할당·GC·긴 작업

CPU self는 서로 겹치지 않는 가중 표본이며 inclusive stack은 중첩되므로 합치지 않는다. GC는 같은 renderer 주 스레드의 기록된 GC category 구간 합집합과 primary 창의 교집합이다. 모든 GC 이벤트를 stop-the-world pause로 해석하지 않는다. 할당은 전체 진단(초기화·warm-up·oracle 포함)의 32KiB Poisson sampling 추정량이며 수거된 객체도 포함한다. 보유 메모리나 정확한 allocation byte count가 아니다. Long task도 전체 페이지 관찰값으로 계측/검증 작업을 포함한다.

| build / 크기 / 작업 | primary 창 합계 ms | 동결·증명 self ms / 비중 | validateTree inclusive ms | primary 내 GC category ms | 전체 할당 추정 MiB | 전체 long tasks |
|---|---:|---:|---:|---:|---:|---:|
| task-e3-a0-v1 / 1000 / counter | 1994.367 | 507.612 / 25.452% | 171.215 | 137.235 | 1230.564 | 19 |
| task-e3-a0-v1 / 1000 / sort | 2928.702 | 394.414 / 13.467% | 161.588 | 155.540 | 1214.489 | 18 |
| task-e3-a0-v1 / 1000 / crud | 6930.904 | 1764.739 / 25.462% | 667.737 | 448.669 | 7739.726 | 87 |
| task-e3-a1-v1 / 1000 / counter | 320.255 | 0.000 / 0.000% | 101.849 | 6.740 | 264.791 | 4 |
| task-e3-a1-v1 / 1000 / sort | 2687.662 | 378.518 / 14.084% | 140.560 | 150.405 | 1165.754 | 18 |
| task-e3-a1-v1 / 1000 / crud | 6400.249 | 1523.238 / 23.800% | 698.329 | 440.886 | 5200.221 | 71 |

원본에 음수 timeDelta가 있는 경우 모든 timestamp/sample 쌍을 함께 정렬한다. 표본 삭제·재시도·missing sample 보간은 하지 않는다. 각 표본은 정렬 후 직전 구간을 가중치로 받으며 표시한 창과의 교집합만 합산한다. 모든 창의 전체 시간과 self 합계를 검산했다. 1ms sampling 근사이므로 정확한 함수 실행 시간이 아니다.

## 보유 heap과 DOM 수명

각 checkpoint 직전 강제 GC를 수행한 별도 단일 궤적이다. reuse:CRUD 1:1을 먼저, 10:1을 나중에 같은 앱에서 실행했다. 비교군의 초기 데이터와 순서는 같다. JS used heap은 프로세스 RSS가 아니며 해제 후 남은 값만으로 객체 누수를 단정하지 않는다. JIT/runtime/내부 자료구조의 구분에는 별도 소유 경로 증거가 필요하다.

| build / 크기 | 전 / mount 후 / 마지막 작업 후 / dispose 후 MiB | DOM nodes 전→dispose | listeners 전→dispose |
|---|---:|---:|---:|
| task-e3-a0-v1 / 1000 | 1.086 / 8.077 / 10.350 / 3.893 | 20→20 | 13→13 |
| task-e3-a1-v1 / 1000 | 1.086 / 8.006 / 9.308 / 2.862 | 20→20 | 13→13 |

## 표시 경계

버튼을 미리 찾고 대상이 viewport 안에 있는지 확인한 뒤 programmatic click 직전에 시작한다. commit 후 같은 renderer 주 스레드의 첫 Paint 종료까지를 관찰한다. rAF callback·commit·DrawFrame을 물리 화면 표시 완료로 부르지 않는다. 각 조건의 3회 기록(작은 smoke는 1회)이며 브라우저 일반 지연 분포나 p95가 아니다. 정식 primary는 대상 검색 비용도 포함하므로 절대 경계가 다르다.

| build / 크기 / 작업 | click→commit ms (각 회) | click→첫 Paint 종료 ms (각 회) |
|---|---:|---:|

[기능 소스·분석 감사](diagnostic-audit.json), [모든 stack/GC/heap/표시 구간](diagnostic-summary.json), [조건별 출처](cases.json). `*.cpu.json.gz`, `*.allocations.json.gz`, `*.trace.json.gz`, `*.memory.json`, `*.marks.json`, `*.actions.json.gz`에 원자료가 있다.
