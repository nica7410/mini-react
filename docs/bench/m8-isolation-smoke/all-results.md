# 전체 조건의 세션별 결과

기능 commit: `07b6f27006c1edee2009145bda9eae76d5902bce`. 세션 1개. 값의 단위는 ms. A/B는 아래 비교 축의 baseline/candidate다.

주 지표는 `scheduledCycleMs`: keyed는 diff+commit, runtime은 enqueue부터 다음 microtask까지다. paint·사용자 지각 지연이 아니다. 각 셀의 순서는 세션 1이며 세션을 합쳐 하나의 표본으로 취급하지 않는다.

median만으로 유의성을 주장하지 않는다. 각 조건의 IQR·p95·capture/render/diff/commit/flush/effect는 [summary.csv](summary.csv)와 [analysis.json](analysis.json)에 있다. raw 표본과 대조한 재계산이 모두 일치한다.

| 축 (A→B) | 크기 | payload | 입력 | A median | B median | B−A median |
|---|---:|---|---|---|---|---|
| keyed (greedy→lis) | 10 | light | noop | 0.300 | 0.600 | 0.300 |
| keyed (greedy→lis) | 10 | light | one-change | 0.300 | 0.500 | 0.200 |
| keyed (greedy→lis) | 10 | light | prepend | 0.700 | 0.900 | 0.200 |
| keyed (greedy→lis) | 10 | light | delete-middle | 0.300 | 0.400 | 0.100 |
| keyed (greedy→lis) | 10 | light | last-to-front | 0.400 | 0.400 | -0.000 |
| keyed (greedy→lis) | 10 | light | first-to-back | 0.200 | 0.500 | 0.300 |
| keyed (greedy→lis) | 10 | light | reverse | 0.600 | 0.400 | -0.200 |
| keyed (greedy→lis) | 10 | light | adjacent | 0.300 | 0.700 | 0.400 |
| keyed (greedy→lis) | 10 | light | swap-ends | 0.400 | 0.500 | 0.100 |
| keyed (greedy→lis) | 10 | light | shuffle | 0.500 | 0.300 | -0.200 |
| keyed (greedy→lis) | 10 | light | mixed | 0.500 | 0.400 | -0.100 |
| batching (sync→microtask) | 10 | light | noop | 1.100 | 0.300 | -0.800 |
| reuse (off→on) | 10 | light | noop | 0.700 | 0.300 | -0.400 |
| keyed (greedy→lis) | 10 | stateful | noop | 1.600 | 0.800 | -0.800 |
| keyed (greedy→lis) | 10 | stateful | one-change | 0.800 | 0.800 | 0.000 |
| keyed (greedy→lis) | 10 | stateful | prepend | 0.800 | 1.000 | 0.200 |
| keyed (greedy→lis) | 10 | stateful | delete-middle | 1.500 | 1.300 | -0.200 |
| keyed (greedy→lis) | 10 | stateful | last-to-front | 0.900 | 1.100 | 0.200 |
| keyed (greedy→lis) | 10 | stateful | first-to-back | 1.700 | 1.500 | -0.200 |
| keyed (greedy→lis) | 10 | stateful | reverse | 1.600 | 2.200 | 0.600 |
| keyed (greedy→lis) | 10 | stateful | adjacent | 1.700 | 0.800 | -0.900 |
| keyed (greedy→lis) | 10 | stateful | swap-ends | 1.300 | 1.000 | -0.300 |
| keyed (greedy→lis) | 10 | stateful | shuffle | 1.000 | 0.600 | -0.400 |
| keyed (greedy→lis) | 10 | stateful | mixed | 0.900 | 1.000 | 0.100 |
| batching (sync→microtask) | 10 | stateful | noop | 1.900 | 1.100 | -0.800 |
| reuse (off→on) | 10 | stateful | noop | 1.500 | 0.600 | -0.900 |

## Raw 감사

- counts 52, warm-up 52, measured samples 156; 조건 52.
- hidden 0, unfocused 0. 해당 표본을 사후 제외하지 않았다.
- 모든 condition의 표본 수/seed/mode/reset checksum, counts 원본, 통계 재계산을 검사했다.
- 실제 순서·객체 identity·텍스트·삭제·live 입력 oracle는 측정 직후 harness에서 실행했다. checksum은 이 oracle의 대체물이 아니다.
- no-op·역순·작은 목록·stress를 포함해 전체 조건을 보존했다. 결과를 보고 조건을 삭제하지 않았다.

재생성: `node scripts/analyze-benchmark.mjs docs/bench/m8-isolation-smoke` (Node 24). 전체 gzip raw를 읽으므로 측정 완료 후 실행한다.
