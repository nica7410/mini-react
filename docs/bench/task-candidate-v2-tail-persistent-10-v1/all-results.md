# TaskApp — 세션별 전체 작업 결과

단위 ms. steady-state workload 합계와 fresh 초기화 포함 lifecycle을 구분한다. 상세 action/render/diff/commit/Effect는 summary.csv/JSON에 있다.

| session/regime/workload/size/build/scope | n | median | IQR | p95 |
|---|---:|---:|---:|---:|
| 1,persistent,sort,10,task-e1-a1-v1,workload | 180 | 5.300 | 2.725 | 9.205 |
| 1,persistent,sort,10,task-e2-a1-v1,workload | 180 | 4.300 | 1.300 | 8.020 |
| 1,persistent,sort,10,task-e4-a0-v1,workload | 180 | 4.500 | 1.650 | 8.205 |
| 1,persistent,sort,10,task-e4-a1-v1,workload | 180 | 3.950 | 1.125 | 6.305 |
| 2,persistent,sort,10,task-e1-a1-v1,workload | 180 | 4.200 | 1.100 | 6.400 |
| 2,persistent,sort,10,task-e4-a1-v1,workload | 180 | 3.900 | 1.100 | 6.910 |
| 2,persistent,sort,10,task-e4-a0-v1,workload | 180 | 3.900 | 0.925 | 5.205 |
| 2,persistent,sort,10,task-e2-a1-v1,workload | 180 | 4.450 | 1.225 | 7.405 |
| 3,persistent,sort,10,task-e4-a0-v1,workload | 180 | 4.300 | 1.300 | 7.200 |
| 3,persistent,sort,10,task-e4-a1-v1,workload | 180 | 4.000 | 0.900 | 5.810 |
| 3,persistent,sort,10,task-e1-a1-v1,workload | 180 | 4.000 | 1.200 | 6.600 |
| 3,persistent,sort,10,task-e2-a1-v1,workload | 180 | 5.050 | 1.400 | 7.400 |
