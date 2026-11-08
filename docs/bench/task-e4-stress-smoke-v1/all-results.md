# TaskApp — 세션별 전체 작업 결과

단위 ms. steady-state workload 합계와 fresh 초기화 포함 lifecycle을 구분한다. 상세 action/render/diff/commit/Effect는 summary.csv/JSON에 있다.

| session/regime/workload/size/build/scope | n | median | IQR | p95 |
|---|---:|---:|---:|---:|
| 1,persistent,draft,10000,task-e4-a1-v1,workload | 2 | 240.850 | 1.050 | 241.795 |
| 1,persistent,counter,10000,task-e4-a1-v1,workload | 2 | 252.900 | 3.400 | 255.960 |
| 1,persistent,search,10000,task-e4-a1-v1,workload | 2 | 872.100 | 137.500 | 995.850 |
| 1,persistent,filter,10000,task-e4-a1-v1,workload | 2 | 855.100 | 198.900 | 1034.110 |
| 1,persistent,sort,10000,task-e4-a1-v1,workload | 2 | 2886.750 | 283.750 | 3142.125 |
| 1,persistent,move,10000,task-e4-a1-v1,workload | 2 | 1188.400 | 70.700 | 1252.030 |
| 1,persistent,crud,10000,task-e4-a1-v1,workload | 2 | 4897.100 | 23.500 | 4918.250 |
| 1,persistent,dirty,10000,task-e4-a1-v1,workload | 2 | 184.150 | 4.950 | 188.605 |
| 1,persistent,equal,10000,task-e4-a1-v1,workload | 2 | 245.000 | 2.700 | 247.430 |
| 1,fresh,equal,10000,task-e4-a1-v1,workload | 2 | 267.950 | 12.650 | 279.335 |
| 1,fresh,equal,10000,task-e4-a1-v1,lifecycle | 2 | 1662.100 | 69.900 | 1725.010 |
