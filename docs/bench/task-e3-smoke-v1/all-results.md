# TaskApp — 세션별 전체 작업 결과

단위 ms. steady-state workload 합계와 fresh 초기화 포함 lifecycle을 구분한다. 상세 action/render/diff/commit/Effect는 summary.csv/JSON에 있다.

| session/regime/workload/size/build/scope | n | median | IQR | p95 |
|---|---:|---:|---:|---:|
| 1,persistent,draft,10,task-e1-a1-v1,workload | 2 | 1.350 | 0.050 | 1.395 |
| 1,persistent,draft,10,task-e2-a1-v1,workload | 2 | 1.200 | 0.000 | 1.200 |
| 1,persistent,draft,10,task-e3-a0-v1,workload | 2 | 2.650 | 0.650 | 3.235 |
| 1,persistent,draft,10,task-e3-a1-v1,workload | 2 | 1.350 | 0.250 | 1.575 |
| 1,persistent,counter,10,task-e2-a1-v1,workload | 2 | 1.450 | 0.250 | 1.675 |
| 1,persistent,counter,10,task-e3-a0-v1,workload | 2 | 2.700 | 0.000 | 2.700 |
| 1,persistent,counter,10,task-e3-a1-v1,workload | 2 | 1.950 | 0.550 | 2.445 |
| 1,persistent,counter,10,task-e1-a1-v1,workload | 2 | 1.450 | 0.250 | 1.675 |
| 1,persistent,search,10,task-e3-a0-v1,workload | 2 | 2.250 | 0.150 | 2.385 |
| 1,persistent,search,10,task-e3-a1-v1,workload | 2 | 2.050 | 0.050 | 2.095 |
| 1,persistent,search,10,task-e1-a1-v1,workload | 2 | 2.550 | 0.050 | 2.595 |
| 1,persistent,search,10,task-e2-a1-v1,workload | 2 | 2.500 | 0.100 | 2.590 |
| 1,persistent,filter,10,task-e3-a1-v1,workload | 2 | 2.200 | 0.100 | 2.290 |
| 1,persistent,filter,10,task-e1-a1-v1,workload | 2 | 2.100 | 0.100 | 2.190 |
| 1,persistent,filter,10,task-e2-a1-v1,workload | 2 | 2.250 | 0.350 | 2.565 |
| 1,persistent,filter,10,task-e3-a0-v1,workload | 2 | 2.600 | 0.000 | 2.600 |
| 1,persistent,sort,10,task-e1-a1-v1,workload | 2 | 3.650 | 0.050 | 3.695 |
| 1,persistent,sort,10,task-e2-a1-v1,workload | 2 | 4.100 | 0.200 | 4.280 |
| 1,persistent,sort,10,task-e3-a0-v1,workload | 2 | 3.900 | 0.600 | 4.440 |
| 1,persistent,sort,10,task-e3-a1-v1,workload | 2 | 3.700 | 0.000 | 3.700 |
| 1,persistent,move,10,task-e2-a1-v1,workload | 2 | 4.250 | 0.850 | 5.015 |
| 1,persistent,move,10,task-e3-a0-v1,workload | 2 | 2.800 | 0.300 | 3.070 |
| 1,persistent,move,10,task-e3-a1-v1,workload | 2 | 2.800 | 0.300 | 3.070 |
| 1,persistent,move,10,task-e1-a1-v1,workload | 2 | 2.700 | 0.200 | 2.880 |
| 1,persistent,crud,10,task-e3-a0-v1,workload | 2 | 14.200 | 2.700 | 16.630 |
| 1,persistent,crud,10,task-e3-a1-v1,workload | 2 | 9.600 | 0.700 | 10.230 |
| 1,persistent,crud,10,task-e1-a1-v1,workload | 2 | 10.000 | 0.300 | 10.270 |
| 1,persistent,crud,10,task-e2-a1-v1,workload | 2 | 11.100 | 0.200 | 11.280 |
| 1,persistent,dirty,10,task-e3-a1-v1,workload | 2 | 0.400 | 0.100 | 0.490 |
| 1,persistent,dirty,10,task-e1-a1-v1,workload | 2 | 0.850 | 0.150 | 0.985 |
| 1,persistent,dirty,10,task-e2-a1-v1,workload | 2 | 0.400 | 0.100 | 0.490 |
| 1,persistent,dirty,10,task-e3-a0-v1,workload | 2 | 0.400 | 0.000 | 0.400 |
| 1,persistent,equal,10,task-e1-a1-v1,workload | 2 | 1.500 | 0.000 | 1.500 |
| 1,persistent,equal,10,task-e2-a1-v1,workload | 2 | 1.250 | 0.250 | 1.475 |
| 1,persistent,equal,10,task-e3-a0-v1,workload | 2 | 2.650 | 0.150 | 2.785 |
| 1,persistent,equal,10,task-e3-a1-v1,workload | 2 | 1.200 | 0.200 | 1.380 |
| 1,fresh,equal,10,task-e2-a1-v1,workload | 2 | 1.000 | 0.000 | 1.000 |
| 1,fresh,equal,10,task-e2-a1-v1,lifecycle | 2 | 6.500 | 0.400 | 6.860 |
| 1,fresh,equal,10,task-e3-a0-v1,workload | 2 | 1.850 | 0.150 | 1.985 |
| 1,fresh,equal,10,task-e3-a0-v1,lifecycle | 2 | 7.050 | 0.550 | 7.545 |
| 1,fresh,equal,10,task-e3-a1-v1,workload | 2 | 0.750 | 0.050 | 0.795 |
| 1,fresh,equal,10,task-e3-a1-v1,lifecycle | 2 | 5.950 | 0.050 | 5.995 |
| 1,fresh,equal,10,task-e1-a1-v1,workload | 2 | 1.100 | 0.100 | 1.190 |
| 1,fresh,equal,10,task-e1-a1-v1,lifecycle | 2 | 5.750 | 0.150 | 5.885 |
