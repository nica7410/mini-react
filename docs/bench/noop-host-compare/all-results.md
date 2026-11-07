# No-op 同조건 비교

각 세션 별 분포. core는 diff+commit, runtime은 enqueue→다음 microtask. 프로파일러/상세 Trace 없는 production timing.

| 세션 | 경로 | payload | 크기 | n | baseline median | candidate median | median 감소 % | baseline IQR | candidate IQR | baseline p95 | candidate p95 |
|---:|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 1 | same-ref | stateful | 10 | 3 | 0.40 | 0.40 | 0.00 | 0.05 | 0.05 | 0.49 | 0.40 |
| 1 | equal-fresh | stateful | 10 | 3 | 1.20 | 1.40 | -16.67 | 0.45 | 0.45 | 1.74 | 1.76 |
| 1 | memo-unrelated | stateful | 10 | 3 | 0.50 | 0.60 | -20.00 | 0.05 | 0.10 | 0.59 | 0.69 |
| 1 | dirty-controlled | stateful | 10 | 3 | 0.50 | 0.50 | 0.00 | 0.00 | 0.15 | 0.50 | 0.68 |
| 1 | reorder | stateful | 10 | 3 | 0.90 | 0.60 | 33.33 | 0.20 | 0.05 | 1.08 | 0.69 |
| 1 | form-update | stateful | 10 | 3 | 0.50 | 0.70 | -40.00 | 0.10 | 0.10 | 0.68 | 0.70 |
| 1 | same-ref | stateful | 10000 | 3 | 286.40 | 262.00 | 8.52 | 5.65 | 9.70 | 296.39 | 262.63 |
| 1 | equal-fresh | stateful | 10000 | 3 | 561.30 | 513.10 | 8.59 | 20.85 | 13.20 | 569.13 | 535.06 |
| 1 | memo-unrelated | stateful | 10000 | 3 | 323.40 | 291.10 | 9.99 | 4.50 | 8.15 | 327.54 | 294.70 |
| 1 | dirty-controlled | stateful | 10000 | 3 | 293.70 | 246.80 | 15.97 | 13.65 | 2.40 | 303.60 | 251.03 |
| 1 | reorder | stateful | 10000 | 3 | 453.90 | 422.30 | 6.96 | 20.15 | 33.55 | 466.59 | 453.53 |
| 1 | form-update | stateful | 10000 | 3 | 336.10 | 290.10 | 13.69 | 8.20 | 5.10 | 343.57 | 293.52 |
