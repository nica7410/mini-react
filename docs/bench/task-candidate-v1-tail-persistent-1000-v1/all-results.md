# TaskApp — 세션별 전체 작업 결과

단위 ms. steady-state workload 합계와 fresh 초기화 포함 lifecycle을 구분한다. 상세 action/render/diff/commit/Effect는 summary.csv/JSON에 있다.

| session/regime/workload/size/build/scope | n | median | IQR | p95 |
|---|---:|---:|---:|---:|
| 1,persistent,crud,1000,task-e1-a1-v1,workload | 180 | 560.500 | 20.225 | 613.910 |
| 1,persistent,crud,1000,task-e2-a1-v1,workload | 180 | 519.750 | 68.175 | 591.255 |
| 1,persistent,crud,1000,task-e3-a0-v1,workload | 180 | 717.750 | 13.275 | 735.005 |
| 1,persistent,crud,1000,task-e3-a1-v1,workload | 180 | 554.300 | 102.825 | 652.595 |
| 2,persistent,crud,1000,task-e1-a1-v1,workload | 180 | 563.150 | 20.500 | 591.120 |
| 2,persistent,crud,1000,task-e3-a1-v1,workload | 180 | 503.950 | 19.950 | 527.155 |
| 2,persistent,crud,1000,task-e3-a0-v1,workload | 180 | 721.950 | 13.275 | 747.420 |
| 2,persistent,crud,1000,task-e2-a1-v1,workload | 180 | 525.500 | 74.925 | 594.605 |
| 3,persistent,crud,1000,task-e3-a0-v1,workload | 180 | 718.800 | 13.975 | 750.900 |
| 3,persistent,crud,1000,task-e3-a1-v1,workload | 180 | 506.150 | 21.250 | 528.700 |
| 3,persistent,crud,1000,task-e1-a1-v1,workload | 180 | 559.950 | 18.100 | 586.270 |
| 3,persistent,crud,1000,task-e2-a1-v1,workload | 180 | 526.600 | 70.875 | 594.560 |
