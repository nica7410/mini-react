# No-op 同조건 비교

각 세션 별 분포. core는 diff+commit, runtime은 enqueue→다음 microtask. 프로파일러/상세 Trace 없는 production timing.

| 세션 | 경로 | payload | 크기 | n | baseline median | candidate median | median 감소 % | baseline IQR | candidate IQR | baseline p95 | candidate p95 |
|---:|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
