# M6 관찰·재현·benchmark 진행 기록

## Inspector — 구현·검증 완료

실제 engine Trace를 `TraceRecorder`로 연결했다. 이전/이후 VDOM 접기, Patch 종류·ref·부모·anchor, 실제 생성/삭제/이동/property/listener 호출, DOM 객체 재사용, native event의 cause ID부터 Hook·Effect까지의 순서를 표시한다. 각 부모의 keyed/positional 선택과 fallback 이유도 표시한다. Patch를 선택하면 현재 DOM의 바깥에 overlay를 그린다. 관리 노드의 attribute나 focus를 변경하지 않는다. 제거된 ref는 이전 트리에서 확인한다.

최근 100개 plan 실행만 보관한다. 실행 전 세부 이벤트는 1,000개로 제한하며 생략 수를 표시한다. Diff/Patch 구조·카운터 이벤트는 보존한다. DOM·native Event·함수는 로그에서 문자열/데이터로 변환하여 live 객체를 장기 보관하지 않는다. Trace 저장 및 입력 fixture JSON 저장/재실행을 제공한다. 각 재실행은 원래 old DOM을 다시 준비한다.

검증: 단위·통합 **142/142**, Chromium **13/13**, typecheck/build PASS. `observe.test.ts`에서 실제 insertBefore 인자/호출 수와 ref/anchor/identity 기록을 대조했다. trace on/off 최종 결과, 105회 실행의 ring 상한, seed 재현, 잘못된 입력 거절을 확인했다. 브라우저 Inspector에서 8개 목록의 마지막→처음 이동이 LIS 1회/Greedy 7회이며 표시값도 일치했다. 전체 화면 screenshot을 열어 레이아웃을 확인했다.

## Benchmark harness — 구현·smoke 검증 완료

`pnpm build` 후 `pnpm bench:smoke`로 재현한다. `pnpm bench`는 기본 전체 행렬(10/100/1,000/10,000, payload 두 개, 독립 Chromium 프로세스 3세션)을 실행한다. 일반 입력은 warm-up 20 + 측정 100, 10,000 stress는 5 + 30이다. Greedy/LIS는 11개 시나리오 전체, Batching은 순수 +1 세 번, 재사용은 고정 Memo expression과 무관한 root state 갱신을 비교한다. 실행 순서는 고정 seed로 paired 무작위화한다. 결과가 불리하다는 이유로 표본을 제외하지 않는다.

각 variant/sample은 mount를 해제하고 old DOM을 다시 만든다. reset/fixture/oracle는 측정 구간 밖이다. stateful payload는 유지된 입력의 live value·checked를 별도 oracle로 검사한다. 정답 실패는 해당 입력/환경을 저장하고 성능 집계를 중단한다. counts run만 Trace를 받으며 timing run에는 sink가 없다. 기본 host counter 증가는 두 실행에 공통이다. Inspector는 benchmark 페이지에 없고 측정 중 강제 layout 읽기도 없다.

환경 JSON은 CPU/RAM/OS/브라우저/전원 scheme/빌드 모드/commit/소스 hash/seed/옵션을 기록한다. 표본마다 visibility/focus를 보존한다. 원본은 세션별 gzip JSONL, 통계는 JSON/CSV이며 median·Q1/Q3·IQR·p95·n을 세션별로 저장한다. 단일 runtime flush의 시간과 enqueue→다음 microtask까지의 cycle 시간을 구분한다. capture는 keyed 축의 초기 DOM을 따로 읽은 시간이며 flush에 더하지 않는다. commit은 preflight와 DOM 쓰기까지이고 paint 시간이 아니다. Effect loop도 따로 측정한다.

현재 검증: 단위·통합 **145/145**, Chromium **13/13**, typecheck/build PASS. T-Q03은 old 상태의 동일 checksum, root/child/Effect 실제 횟수, 측정/계수 분리, reset 후 빈 registry/DOM, 통계 계산을 검사한다. production smoke는 크기 10, 두 payload, 모든 시나리오/축에서 **52 counts + 52 warm-up + 156 측정 표본**을 실행했고 모든 정답 검사를 통과했다. [smoke raw·환경·통계](bench/m6-smoke-initial/environment.json). 이 smoke는 자동 브라우저 기능 테스트와 동시에 실행했고 표본도 작으므로 시간 성능 근거로 사용하지 않는다.

**전체 시간 행렬과 성능 해석은 아직 대기**다. M7에서 focus/selection 처리도 commit 경로에 추가되므로 최종 엔진으로 전체 행렬을 실행한다. M6 전체 Gate는 그 결과까지 확인한 뒤 판단한다. harness가 준비되었으므로 독립적인 M7 앱/브라우저 보호 구현을 이어간다.
