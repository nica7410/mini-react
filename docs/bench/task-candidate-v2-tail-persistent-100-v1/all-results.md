# TaskApp — 세션별 전체 작업 결과

단위 ms. steady-state workload 합계와 fresh 초기화 포함 lifecycle을 구분한다. 상세 action/render/diff/commit/Effect는 summary.csv/JSON에 있다.

| session/regime/workload/size/build/scope | n | median | IQR | p95 |
|---|---:|---:|---:|---:|
| 1,persistent,search,100,task-e1-a1-v1,workload | 180 | 12.300 | 3.950 | 19.110 |
| 1,persistent,search,100,task-e2-a1-v1,workload | 180 | 13.600 | 5.125 | 20.960 |
| 1,persistent,search,100,task-e4-a0-v1,workload | 180 | 12.500 | 4.425 | 19.605 |
| 1,persistent,search,100,task-e4-a1-v1,workload | 180 | 11.950 | 4.450 | 18.215 |
| 1,persistent,sort,100,task-e2-a1-v1,workload | 180 | 24.000 | 5.150 | 34.330 |
| 1,persistent,sort,100,task-e4-a0-v1,workload | 180 | 21.850 | 3.500 | 28.000 |
| 1,persistent,sort,100,task-e4-a1-v1,workload | 180 | 21.900 | 2.925 | 27.405 |
| 1,persistent,sort,100,task-e1-a1-v1,workload | 180 | 22.650 | 4.125 | 29.605 |
| 1,persistent,crud,100,task-e4-a0-v1,workload | 180 | 83.350 | 12.025 | 98.720 |
| 1,persistent,crud,100,task-e4-a1-v1,workload | 180 | 59.500 | 12.150 | 79.030 |
| 1,persistent,crud,100,task-e1-a1-v1,workload | 180 | 59.750 | 23.600 | 89.875 |
| 1,persistent,crud,100,task-e2-a1-v1,workload | 180 | 71.450 | 23.350 | 102.315 |
| 2,persistent,crud,100,task-e1-a1-v1,workload | 180 | 66.800 | 17.875 | 94.225 |
| 2,persistent,crud,100,task-e4-a1-v1,workload | 180 | 65.400 | 12.050 | 87.605 |
| 2,persistent,crud,100,task-e4-a0-v1,workload | 180 | 93.550 | 12.600 | 116.885 |
| 2,persistent,crud,100,task-e2-a1-v1,workload | 180 | 73.600 | 23.275 | 105.410 |
| 2,persistent,sort,100,task-e2-a1-v1,workload | 180 | 27.850 | 5.525 | 38.630 |
| 2,persistent,sort,100,task-e1-a1-v1,workload | 180 | 24.950 | 4.325 | 31.615 |
| 2,persistent,sort,100,task-e4-a1-v1,workload | 180 | 24.650 | 3.525 | 30.710 |
| 2,persistent,sort,100,task-e4-a0-v1,workload | 180 | 24.300 | 4.825 | 33.505 |
| 2,persistent,search,100,task-e4-a0-v1,workload | 180 | 12.750 | 5.425 | 18.245 |
| 2,persistent,search,100,task-e2-a1-v1,workload | 180 | 14.350 | 5.025 | 22.825 |
| 2,persistent,search,100,task-e1-a1-v1,workload | 180 | 12.600 | 4.500 | 20.020 |
| 2,persistent,search,100,task-e4-a1-v1,workload | 180 | 12.250 | 4.100 | 18.120 |
| 3,persistent,search,100,task-e4-a0-v1,workload | 180 | 13.150 | 4.750 | 22.805 |
| 3,persistent,search,100,task-e4-a1-v1,workload | 180 | 13.400 | 5.500 | 24.880 |
| 3,persistent,search,100,task-e1-a1-v1,workload | 180 | 14.050 | 4.850 | 22.405 |
| 3,persistent,search,100,task-e2-a1-v1,workload | 180 | 14.950 | 5.800 | 23.810 |
| 3,persistent,sort,100,task-e4-a1-v1,workload | 180 | 24.200 | 3.525 | 30.030 |
| 3,persistent,sort,100,task-e1-a1-v1,workload | 180 | 26.000 | 4.650 | 34.200 |
| 3,persistent,sort,100,task-e2-a1-v1,workload | 180 | 26.500 | 4.925 | 37.515 |
| 3,persistent,sort,100,task-e4-a0-v1,workload | 180 | 25.350 | 4.150 | 33.605 |
| 3,persistent,crud,100,task-e1-a1-v1,workload | 180 | 67.700 | 13.675 | 89.510 |
| 3,persistent,crud,100,task-e2-a1-v1,workload | 180 | 68.250 | 20.100 | 93.500 |
| 3,persistent,crud,100,task-e4-a0-v1,workload | 180 | 90.450 | 12.100 | 109.510 |
| 3,persistent,crud,100,task-e4-a1-v1,workload | 180 | 62.300 | 11.125 | 75.845 |
