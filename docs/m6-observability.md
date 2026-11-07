# M6 관찰·재현·benchmark 진행 기록

## Inspector — 구현·검증 완료

실제 engine Trace를 `TraceRecorder`로 연결했다. 이전/이후 VDOM 접기, Patch 종류·ref·부모·anchor, 실제 생성/삭제/이동/property/listener 호출, DOM 객체 재사용, native event의 cause ID부터 Hook·Effect까지의 순서를 표시한다. 각 부모의 keyed/positional 선택과 fallback 이유도 표시한다. Patch를 선택하면 현재 DOM의 바깥에 overlay를 그린다. 관리 노드의 attribute나 focus를 변경하지 않는다. 제거된 ref는 이전 트리에서 확인한다.

최근 100개 plan 실행만 보관한다. 실행 전 세부 이벤트는 1,000개로 제한하며 생략 수를 표시한다. Diff/Patch 구조·카운터 이벤트는 보존한다. DOM·native Event·함수는 로그에서 문자열/데이터로 변환하여 live 객체를 장기 보관하지 않는다. Trace 저장 및 입력 fixture JSON 저장/재실행을 제공한다. 각 재실행은 원래 old DOM을 다시 준비한다.

검증: 단위·통합 **142/142**, Chromium **13/13**, typecheck/build PASS. `observe.test.ts`에서 실제 insertBefore 인자/호출 수와 ref/anchor/identity 기록을 대조했다. trace on/off 최종 결과, 105회 실행의 ring 상한, seed 재현, 잘못된 입력 거절을 확인했다. 브라우저 Inspector에서 8개 목록의 마지막→처음 이동이 LIS 1회/Greedy 7회이며 표시값도 일치했다. 전체 화면 screenshot을 열어 레이아웃을 확인했다.

## Benchmark — 다음 작업

동일 초기 상태의 counts/timing 분리 harness, 전체 raw 결과·환경 기록·통계는 아직 완료하지 않았다. 위 이동 수를 시간 성능으로 해석하지 않는다. M6 전체 Gate는 benchmark 검증까지 확인한 뒤 판단한다.
