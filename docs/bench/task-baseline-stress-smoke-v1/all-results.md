# TaskApp — 세션별 전체 작업 결과

단위 ms. steady-state workload 합계와 fresh 초기화 포함 lifecycle을 구분한다. 상세 action/render/diff/commit/Effect는 summary.csv/JSON에 있다.

| session/regime/workload/size/build/scope | n | median | IQR | p95 |
|---|---:|---:|---:|---:|
| 1,persistent,equal,10000,task-e0-a0-v1,workload | 2 | 982.450 | 75.350 | 1050.265 |
| 1,fresh,equal,10000,task-e0-a0-v1,workload | 2 | 985.850 | 109.150 | 1084.085 |
| 1,fresh,equal,10000,task-e0-a0-v1,lifecycle | 2 | 2861.000 | 7.200 | 2867.480 |
