# no-op 동일 조건 비교

각 세션 별 분포. core는 diff+commit, runtime은 enqueue→다음 microtask. 프로파일러/상세 Trace 없는 production timing.

| 세션 | 경로 | payload | 크기 | n | baseline median | candidate median | median 감소 % | baseline IQR | candidate IQR | baseline p95 | candidate p95 |
|---:|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 1 | same-ref | stateful | 10 | 3 | 0.50 | 0.20 | 60.00 | 0.15 | 0.15 | 0.59 | 0.47 |
| 1 | equal-fresh | stateful | 10 | 3 | 0.90 | 0.80 | 11.11 | 0.15 | 0.15 | 1.08 | 1.07 |
| 1 | memo-unrelated | stateful | 10 | 3 | 0.60 | 0.60 | 0.00 | 0.20 | 0.05 | 0.96 | 0.69 |
| 1 | dirty-controlled | stateful | 10 | 3 | 0.50 | 0.30 | 40.00 | 0.15 | 0.10 | 0.68 | 0.39 |
| 1 | reorder | stateful | 10 | 3 | 0.80 | 0.70 | 12.50 | 0.15 | 0.10 | 0.89 | 0.70 |
| 1 | form-update | stateful | 10 | 3 | 0.60 | 0.60 | -0.00 | 0.00 | 0.20 | 0.60 | 0.87 |
| 1 | same-ref | stateful | 10000 | 3 | 296.30 | 124.60 | 57.95 | 14.75 | 23.45 | 309.89 | 156.10 |
| 1 | equal-fresh | stateful | 10000 | 3 | 571.00 | 386.30 | 32.35 | 21.00 | 29.10 | 574.78 | 433.73 |
| 1 | memo-unrelated | stateful | 10000 | 3 | 328.80 | 168.10 | 48.87 | 7.95 | 57.55 | 340.77 | 266.11 |
| 1 | dirty-controlled | stateful | 10000 | 3 | 285.50 | 134.10 | 53.03 | 7.55 | 10.35 | 289.46 | 135.36 |
| 1 | reorder | stateful | 10000 | 3 | 426.80 | 309.30 | 27.53 | 31.10 | 46.45 | 460.19 | 362.13 |
| 1 | form-update | stateful | 10000 | 3 | 343.50 | 163.30 | 52.46 | 13.00 | 3.65 | 347.19 | 167.80 |
