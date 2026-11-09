# TaskApp — 세션별 전체 작업 결과

단위 ms. steady-state workload 합계와 fresh 초기화 포함 lifecycle을 구분한다. 상세 action/render/diff/commit/Effect는 summary.csv/JSON에 있다.

| session/regime/workload/size/build/scope | n | median | IQR | p95 |
|---|---:|---:|---:|---:|
| 1,persistent,crud,10,task-e5-a0-v1,workload | 60 | 15.400 | 3.700 | 19.775 |
| 1,persistent,crud,10,task-e6-a0-v1,workload | 60 | 11.650 | 3.625 | 17.835 |
| 1,persistent,search,10,task-e6-a0-v1,workload | 60 | 1.700 | 0.350 | 2.200 |
| 1,persistent,search,10,task-e5-a0-v1,workload | 60 | 1.900 | 0.500 | 2.600 |
| 1,persistent,counter,10,task-e5-a0-v1,workload | 60 | 1.700 | 0.500 | 2.310 |
| 1,persistent,counter,10,task-e6-a0-v1,workload | 60 | 1.400 | 0.300 | 1.900 |
| 1,persistent,crud,100,task-e6-a0-v1,workload | 60 | 62.750 | 10.000 | 70.235 |
| 1,persistent,crud,100,task-e5-a0-v1,workload | 60 | 74.600 | 14.525 | 89.925 |
| 1,persistent,search,100,task-e5-a0-v1,workload | 60 | 11.050 | 3.075 | 14.205 |
| 1,persistent,search,100,task-e6-a0-v1,workload | 60 | 9.250 | 2.500 | 16.710 |
| 1,persistent,counter,100,task-e6-a0-v1,workload | 60 | 9.150 | 2.650 | 13.505 |
| 1,persistent,counter,100,task-e5-a0-v1,workload | 60 | 11.450 | 2.350 | 15.090 |
| 1,persistent,crud,1000,task-e5-a0-v1,workload | 60 | 775.200 | 63.725 | 885.495 |
| 1,persistent,crud,1000,task-e6-a0-v1,workload | 60 | 650.700 | 51.550 | 735.680 |
| 1,persistent,search,1000,task-e6-a0-v1,workload | 60 | 80.700 | 20.800 | 97.090 |
| 1,persistent,search,1000,task-e5-a0-v1,workload | 60 | 93.000 | 28.100 | 115.745 |
| 1,persistent,counter,1000,task-e5-a0-v1,workload | 60 | 98.700 | 15.425 | 132.730 |
| 1,persistent,counter,1000,task-e6-a0-v1,workload | 60 | 82.750 | 9.250 | 108.940 |
