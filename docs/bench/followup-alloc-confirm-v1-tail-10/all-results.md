# TaskApp — 세션별 전체 작업 결과

단위 ms. steady-state workload 합계와 fresh 초기화 포함 lifecycle을 구분한다. 상세 action/render/diff/commit/Effect는 summary.csv/JSON에 있다.

| session/regime/workload/size/build/scope | n | median | IQR | p95 |
|---|---:|---:|---:|---:|
| 1,persistent,crud,10,task-e5-a0-v1,workload | 180 | 12.600 | 2.300 | 16.470 |
| 1,persistent,crud,10,task-e7-a0-v1,workload | 180 | 9.800 | 1.400 | 12.205 |
| 1,persistent,search,10,task-e7-a0-v1,workload | 180 | 1.600 | 0.500 | 2.710 |
| 1,persistent,search,10,task-e5-a0-v1,workload | 180 | 1.900 | 0.500 | 2.505 |
| 2,persistent,search,10,task-e5-a0-v1,workload | 180 | 1.950 | 0.500 | 2.705 |
| 2,persistent,search,10,task-e7-a0-v1,workload | 180 | 1.600 | 0.400 | 2.405 |
| 2,persistent,crud,10,task-e7-a0-v1,workload | 180 | 9.900 | 1.400 | 12.005 |
| 2,persistent,crud,10,task-e5-a0-v1,workload | 180 | 12.200 | 2.300 | 15.300 |
| 3,persistent,crud,10,task-e5-a0-v1,workload | 180 | 13.500 | 3.750 | 21.750 |
| 3,persistent,crud,10,task-e7-a0-v1,workload | 180 | 10.900 | 1.700 | 14.735 |
| 3,persistent,search,10,task-e7-a0-v1,workload | 180 | 1.700 | 0.400 | 2.505 |
| 3,persistent,search,10,task-e5-a0-v1,workload | 180 | 2.100 | 0.600 | 2.905 |
