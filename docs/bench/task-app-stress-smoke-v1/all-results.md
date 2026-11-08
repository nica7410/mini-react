# TaskApp — 세션별 전체 작업 결과

단위 ms. steady-state workload 합계와 fresh 초기화 포함 lifecycle을 구분한다. 상세 action/render/diff/commit/Effect는 summary.csv/JSON에 있다.

| session/regime/workload/size/build/scope | n | median | IQR | p95 |
|---|---:|---:|---:|---:|
| 1,persistent,draft,10000,task-e2-a1-v1,workload | 2 | 196.900 | 0.100 | 196.990 |
| 1,persistent,counter,10000,task-e2-a1-v1,workload | 2 | 199.600 | 0.000 | 199.600 |
| 1,persistent,search,10000,task-e2-a1-v1,workload | 2 | 949.000 | 185.600 | 1116.040 |
| 1,persistent,filter,10000,task-e2-a1-v1,workload | 2 | 891.200 | 247.500 | 1113.950 |
| 1,persistent,sort,10000,task-e2-a1-v1,workload | 2 | 2742.750 | 322.650 | 3033.135 |
| 1,persistent,move,10000,task-e2-a1-v1,workload | 2 | 1183.450 | 13.750 | 1195.825 |
| 1,persistent,crud,10000,task-e2-a1-v1,workload | 2 | 4875.400 | 100.100 | 4965.490 |
| 1,persistent,dirty,10000,task-e2-a1-v1,workload | 2 | 130.650 | 2.550 | 132.945 |
| 1,persistent,equal,10000,task-e2-a1-v1,workload | 2 | 190.600 | 1.800 | 192.220 |
| 1,fresh,equal,10000,task-e2-a1-v1,workload | 2 | 208.250 | 10.850 | 218.015 |
| 1,fresh,equal,10000,task-e2-a1-v1,lifecycle | 2 | 1727.050 | 229.050 | 1933.195 |
