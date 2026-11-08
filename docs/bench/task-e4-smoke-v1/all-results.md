# TaskApp — 세션별 전체 작업 결과

단위 ms. steady-state workload 합계와 fresh 초기화 포함 lifecycle을 구분한다. 상세 action/render/diff/commit/Effect는 summary.csv/JSON에 있다.

| session/regime/workload/size/build/scope | n | median | IQR | p95 |
|---|---:|---:|---:|---:|
| 1,persistent,draft,10,task-e1-a1-v1,workload | 2 | 1.350 | 0.150 | 1.485 |
| 1,persistent,draft,10,task-e2-a1-v1,workload | 2 | 1.300 | 0.100 | 1.390 |
| 1,persistent,draft,10,task-e4-a0-v1,workload | 2 | 5.500 | 0.000 | 5.500 |
| 1,persistent,draft,10,task-e4-a1-v1,workload | 2 | 2.000 | 0.500 | 2.450 |
| 1,persistent,counter,10,task-e2-a1-v1,workload | 2 | 3.700 | 1.300 | 4.870 |
| 1,persistent,counter,10,task-e4-a0-v1,workload | 2 | 3.400 | 0.400 | 3.760 |
| 1,persistent,counter,10,task-e4-a1-v1,workload | 2 | 1.400 | 0.100 | 1.490 |
| 1,persistent,counter,10,task-e1-a1-v1,workload | 2 | 2.450 | 0.650 | 3.035 |
| 1,persistent,search,10,task-e4-a0-v1,workload | 2 | 2.550 | 0.250 | 2.775 |
| 1,persistent,search,10,task-e4-a1-v1,workload | 2 | 2.750 | 0.750 | 3.425 |
| 1,persistent,search,10,task-e1-a1-v1,workload | 2 | 2.600 | 0.400 | 2.960 |
| 1,persistent,search,10,task-e2-a1-v1,workload | 2 | 2.750 | 0.150 | 2.885 |
| 1,persistent,filter,10,task-e4-a1-v1,workload | 2 | 2.750 | 0.250 | 2.975 |
| 1,persistent,filter,10,task-e1-a1-v1,workload | 2 | 2.500 | 0.300 | 2.770 |
| 1,persistent,filter,10,task-e2-a1-v1,workload | 2 | 2.950 | 0.850 | 3.715 |
| 1,persistent,filter,10,task-e4-a0-v1,workload | 2 | 2.500 | 0.000 | 2.500 |
| 1,persistent,sort,10,task-e1-a1-v1,workload | 2 | 5.150 | 0.950 | 6.005 |
| 1,persistent,sort,10,task-e2-a1-v1,workload | 2 | 4.900 | 0.200 | 5.080 |
| 1,persistent,sort,10,task-e4-a0-v1,workload | 2 | 5.550 | 0.450 | 5.955 |
| 1,persistent,sort,10,task-e4-a1-v1,workload | 2 | 4.150 | 0.650 | 4.735 |
| 1,persistent,move,10,task-e2-a1-v1,workload | 2 | 4.550 | 0.050 | 4.595 |
| 1,persistent,move,10,task-e4-a0-v1,workload | 2 | 3.350 | 0.550 | 3.845 |
| 1,persistent,move,10,task-e4-a1-v1,workload | 2 | 3.300 | 0.300 | 3.570 |
| 1,persistent,move,10,task-e1-a1-v1,workload | 2 | 3.000 | 0.000 | 3.000 |
| 1,persistent,crud,10,task-e4-a0-v1,workload | 2 | 13.800 | 1.200 | 14.880 |
| 1,persistent,crud,10,task-e4-a1-v1,workload | 2 | 11.100 | 0.800 | 11.820 |
| 1,persistent,crud,10,task-e1-a1-v1,workload | 2 | 11.750 | 0.950 | 12.605 |
| 1,persistent,crud,10,task-e2-a1-v1,workload | 2 | 12.450 | 0.250 | 12.675 |
| 1,persistent,dirty,10,task-e4-a1-v1,workload | 2 | 0.600 | 0.000 | 0.600 |
| 1,persistent,dirty,10,task-e1-a1-v1,workload | 2 | 1.400 | 0.800 | 2.120 |
| 1,persistent,dirty,10,task-e2-a1-v1,workload | 2 | 0.450 | 0.050 | 0.495 |
| 1,persistent,dirty,10,task-e4-a0-v1,workload | 2 | 0.500 | 0.000 | 0.500 |
| 1,persistent,equal,10,task-e1-a1-v1,workload | 2 | 1.550 | 0.350 | 1.865 |
| 1,persistent,equal,10,task-e2-a1-v1,workload | 2 | 1.350 | 0.250 | 1.575 |
| 1,persistent,equal,10,task-e4-a0-v1,workload | 2 | 3.150 | 0.050 | 3.195 |
| 1,persistent,equal,10,task-e4-a1-v1,workload | 2 | 1.550 | 0.350 | 1.865 |
| 1,fresh,equal,10,task-e2-a1-v1,workload | 2 | 1.300 | 0.100 | 1.390 |
| 1,fresh,equal,10,task-e2-a1-v1,lifecycle | 2 | 9.600 | 0.700 | 10.230 |
| 1,fresh,equal,10,task-e4-a0-v1,workload | 2 | 2.100 | 0.000 | 2.100 |
| 1,fresh,equal,10,task-e4-a0-v1,lifecycle | 2 | 8.300 | 0.400 | 8.660 |
| 1,fresh,equal,10,task-e4-a1-v1,workload | 2 | 0.950 | 0.050 | 0.995 |
| 1,fresh,equal,10,task-e4-a1-v1,lifecycle | 2 | 6.400 | 0.500 | 6.850 |
| 1,fresh,equal,10,task-e1-a1-v1,workload | 2 | 1.550 | 0.050 | 1.595 |
| 1,fresh,equal,10,task-e1-a1-v1,lifecycle | 2 | 8.900 | 0.400 | 9.260 |
