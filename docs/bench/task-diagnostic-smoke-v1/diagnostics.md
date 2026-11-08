# 별도 TaskApp 진단

정식 성능 표본과 분리한 unminified production 사본이다. 엔진·앱의 기능 소스 hash는 원본 timing build와 일치한다. CPU/할당 sampling·trace·observer가 실행에 영향을 주므로 아래 시간으로 정식 비교의 순위를 대체하지 않는다.

CPU는 warm-up 1회 후 2회이며 CRUD 한 회는 action 5개다. 표의 primary 시간은 측정 action 창들의 합계이고 40ms 대기·oracle·비동기 후속 flush를 포함하지 않는다. 별도 전체 profile에는 이 작업들이 남아 있다.

## CPU·할당·GC·긴 작업

CPU self는 서로 겹치지 않는 가중 표본이며 inclusive stack은 중첩되므로 합치지 않는다. GC는 같은 renderer 주 스레드의 기록된 GC category 구간 합집합과 primary 창의 교집합이다. 모든 GC 이벤트를 stop-the-world pause로 해석하지 않는다. 할당은 전체 진단(초기화·warm-up·oracle 포함)의 32KiB Poisson sampling 추정량이며 수거된 객체도 포함한다. 보유 메모리나 정확한 allocation byte count가 아니다. Long task도 전체 페이지 관찰값으로 계측/검증 작업을 포함한다.

| build / 크기 / 작업 | primary 창 합계 ms | 동결·증명 self ms / 비중 | validateTree inclusive ms | primary 내 GC category ms | 전체 할당 추정 MiB | 전체 long tasks |
|---|---:|---:|---:|---:|---:|---:|
| task-e1-a1-v1 / 10 / counter | 4.004 | 0.000 / 0.000% | 0.000 | 0.000 | 4.602 | 0 |
| task-e1-a1-v1 / 10 / sort | 10.964 | 1.456 / 13.280% | 0.000 | 1.022 | 5.726 | 0 |
| task-e1-a1-v1 / 10 / crud | 39.771 | 1.388 / 3.490% | 7.046 | 4.606 | 23.828 | 0 |
| task-e2-a1-v1 / 10 / counter | 9.983 | 1.954 / 19.573% | 0.000 | 0.000 | 4.307 | 0 |
| task-e2-a1-v1 / 10 / sort | 17.369 | 3.229 / 18.591% | 0.000 | 1.427 | 5.480 | 0 |
| task-e2-a1-v1 / 10 / crud | 34.822 | 1.892 / 5.433% | 2.408 | 5.760 | 20.111 | 0 |

원본에 음수 timeDelta가 있는 경우 모든 timestamp/sample 쌍을 함께 정렬한다. 표본 삭제·재시도·missing sample 보간은 하지 않는다. 각 표본은 정렬 후 직전 구간을 가중치로 받으며 표시한 창과의 교집합만 합산한다. 모든 창의 전체 시간과 self 합계를 검산했다. 1ms sampling 근사이므로 정확한 함수 실행 시간이 아니다.

## 보유 heap과 DOM 수명

각 checkpoint 직전 강제 GC를 수행한 별도 단일 궤적이다. reuse:CRUD 1:1을 먼저, 10:1을 나중에 같은 앱에서 실행했다. 두 엔진의 초기 데이터와 순서는 같다. JS used heap은 프로세스 RSS가 아니며 해제 후 남은 값만으로 객체 누수를 단정하지 않는다. JIT/runtime/내부 자료구조의 구분에는 별도 소유 경로 증거가 필요하다.

| build / 크기 | 전 / mount 후 / 마지막 작업 후 / dispose 후 MiB | DOM nodes 전→dispose | listeners 전→dispose |
|---|---:|---:|---:|
| task-e1-a1-v1 / 10 | 1.086 / 1.662 / 1.892 / 1.773 | 20→20 | 13→13 |
| task-e2-a1-v1 / 10 | 1.086 / 1.697 / 1.957 / 1.843 | 20→266 | 13→13 |

## 표시 경계

버튼을 미리 찾고 대상이 viewport 안에 있는지 확인한 뒤 programmatic click 직전에 시작한다. commit 후 같은 renderer 주 스레드의 첫 Paint 종료까지를 관찰한다. rAF callback·commit·DrawFrame을 물리 화면 표시 완료로 부르지 않는다. 각 조건의 3회 기록(작은 smoke는 1회)이며 브라우저 일반 지연 분포나 p95가 아니다. 정식 primary는 대상 검색 비용도 포함하므로 절대 경계가 다르다.

| build / 크기 / 작업 | click→commit ms (각 회) | click→첫 Paint 종료 ms (각 회) |
|---|---:|---:|
| task-e1-a1-v1 / 10 / counter | 2.231 | 3.106 |
| task-e1-a1-v1 / 10 / move | 3.232 | 4.085 |
| task-e2-a1-v1 / 10 / counter | 4.960 | 6.859 |
| task-e2-a1-v1 / 10 / move | 4.041 | 5.269 |

[기능 소스·분석 감사](diagnostic-audit.json), [모든 stack/GC/heap/표시 구간](diagnostic-summary.json), [조건별 출처](cases.json). `*.cpu.json.gz`, `*.allocations.json.gz`, `*.trace.json.gz`, `*.memory.json`, `*.marks.json`, `*.actions.json.gz`에 원자료가 있다.
