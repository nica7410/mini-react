# TaskApp — 세션별 전체 작업 결과

단위 ms. steady-state workload 합계와 fresh 초기화 포함 lifecycle을 구분한다. 상세 action/render/diff/commit/Effect는 summary.csv/JSON에 있다.

| session/regime/workload/size/build/scope | n | median | IQR | p95 |
|---|---:|---:|---:|---:|
| 1,persistent,draft,10,task-e0-a0-v1,workload | 2 | 3.000 | 0.200 | 3.180 |
| 1,persistent,draft,10,task-e1-a0-v1,workload | 2 | 2.650 | 0.550 | 3.145 |
| 1,persistent,draft,10,task-e2-a0-v1,workload | 2 | 2.750 | 0.350 | 3.065 |
| 1,persistent,counter,10,task-e1-a0-v1,workload | 2 | 2.550 | 0.150 | 2.685 |
| 1,persistent,counter,10,task-e2-a0-v1,workload | 2 | 3.100 | 0.200 | 3.280 |
| 1,persistent,counter,10,task-e0-a0-v1,workload | 2 | 2.600 | 0.200 | 2.780 |
| 1,persistent,search,10,task-e2-a0-v1,workload | 2 | 3.550 | 0.850 | 4.315 |
| 1,persistent,search,10,task-e0-a0-v1,workload | 2 | 2.300 | 0.200 | 2.480 |
| 1,persistent,search,10,task-e1-a0-v1,workload | 2 | 2.550 | 0.350 | 2.865 |
| 1,persistent,filter,10,task-e0-a0-v1,workload | 2 | 2.650 | 0.150 | 2.785 |
| 1,persistent,filter,10,task-e1-a0-v1,workload | 2 | 2.300 | 0.400 | 2.660 |
| 1,persistent,filter,10,task-e2-a0-v1,workload | 2 | 2.850 | 0.650 | 3.435 |
| 1,persistent,sort,10,task-e1-a0-v1,workload | 2 | 3.600 | 0.200 | 3.780 |
| 1,persistent,sort,10,task-e2-a0-v1,workload | 2 | 3.950 | 0.550 | 4.445 |
| 1,persistent,sort,10,task-e0-a0-v1,workload | 2 | 3.450 | 0.350 | 3.765 |
| 1,persistent,move,10,task-e2-a0-v1,workload | 2 | 2.950 | 0.450 | 3.355 |
| 1,persistent,move,10,task-e0-a0-v1,workload | 2 | 2.900 | 0.100 | 2.990 |
| 1,persistent,move,10,task-e1-a0-v1,workload | 2 | 2.800 | 0.300 | 3.070 |
| 1,persistent,crud,10,task-e0-a0-v1,workload | 2 | 12.300 | 0.500 | 12.750 |
| 1,persistent,crud,10,task-e1-a0-v1,workload | 2 | 12.300 | 0.100 | 12.390 |
| 1,persistent,crud,10,task-e2-a0-v1,workload | 2 | 14.550 | 0.150 | 14.685 |
| 1,persistent,dirty,10,task-e1-a0-v1,workload | 2 | 0.700 | 0.000 | 0.700 |
| 1,persistent,dirty,10,task-e2-a0-v1,workload | 2 | 0.350 | 0.050 | 0.395 |
| 1,persistent,dirty,10,task-e0-a0-v1,workload | 2 | 1.300 | 0.300 | 1.570 |
| 1,persistent,equal,10,task-e2-a0-v1,workload | 2 | 2.800 | 0.000 | 2.800 |
| 1,persistent,equal,10,task-e0-a0-v1,workload | 2 | 2.300 | 0.300 | 2.570 |
| 1,persistent,equal,10,task-e1-a0-v1,workload | 2 | 2.450 | 0.050 | 2.495 |
| 1,fresh,equal,10,task-e0-a0-v1,workload | 2 | 1.750 | 0.050 | 1.795 |
| 1,fresh,equal,10,task-e0-a0-v1,lifecycle | 2 | 7.400 | 0.600 | 7.940 |
| 1,fresh,equal,10,task-e1-a0-v1,workload | 2 | 1.450 | 0.050 | 1.495 |
| 1,fresh,equal,10,task-e1-a0-v1,lifecycle | 2 | 8.100 | 1.300 | 9.270 |
| 1,fresh,equal,10,task-e2-a0-v1,workload | 2 | 2.050 | 0.150 | 2.185 |
| 1,fresh,equal,10,task-e2-a0-v1,lifecycle | 2 | 8.200 | 0.800 | 8.920 |
