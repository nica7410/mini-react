# TaskApp — 세션별 전체 작업 결과

단위 ms. steady-state workload 합계와 fresh 초기화 포함 lifecycle을 구분한다. 상세 action/render/diff/commit/Effect는 summary.csv/JSON에 있다.

| session/regime/workload/size/build/scope | n | median | IQR | p95 |
|---|---:|---:|---:|---:|
| 1,persistent,draft,10000,task-e3-a1-v1,workload | 2 | 200.950 | 0.350 | 201.265 |
| 1,persistent,counter,10000,task-e3-a1-v1,workload | 2 | 203.450 | 1.150 | 204.485 |
| 1,persistent,search,10000,task-e3-a1-v1,workload | 2 | 768.350 | 131.850 | 887.015 |
| 1,persistent,filter,10000,task-e3-a1-v1,workload | 2 | 733.400 | 166.600 | 883.340 |
| 1,persistent,sort,10000,task-e3-a1-v1,workload | 2 | 2532.400 | 246.300 | 2754.070 |
| 1,persistent,move,10000,task-e3-a1-v1,workload | 2 | 1057.700 | 31.100 | 1085.690 |
| 1,persistent,crud,10000,task-e3-a1-v1,workload | 2 | 4290.100 | 66.700 | 4350.130 |
| 1,persistent,dirty,10000,task-e3-a1-v1,workload | 2 | 137.550 | 5.050 | 142.095 |
| 1,persistent,equal,10000,task-e3-a1-v1,workload | 2 | 199.500 | 3.800 | 202.920 |
| 1,fresh,equal,10000,task-e3-a1-v1,workload | 2 | 212.200 | 11.100 | 222.190 |
| 1,fresh,equal,10000,task-e3-a1-v1,lifecycle | 2 | 1366.650 | 8.950 | 1374.705 |
