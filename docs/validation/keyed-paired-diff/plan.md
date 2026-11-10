# 같은 페이지에서 B0·C1 전체 Diff 비교 사전 계획

2026-11-10 KST. 첫 커밋에서 하네스와 함께 고정한다. 정식 성능 측정은 아래 한 묶음이다.

## 비교 범위

B0는 `8ae389e`의 `src/core/reconcile.ts`와 기본 planner다. C1은 같은 파일에서 `planKeyedChildren` 바인딩만 보존된 `planKeyedChildrenCandidate`로 연결한다. `keyedEligibility`와 `validateTree`를 포함한 나머지 Diff 소스 및 의존성, `8ae389e`의 SYNC_FORM 사전 검증 보완, A2/E9/입력 복원 정책을 공유한다. Vite의 같은 production 설정으로 한 페이지에 두 함수를 번들한다. C1 import 역변환이 원본과 바이트 수준에서 같고 모듈 그래프의 추가 의존성이 후보뿐인지 빌드에서 단언한다. 원본·변환본·planner·하네스·앱·설정·번들의 SHA-256을 남긴다. 기본 planner는 이번 작업에서 교체하지 않는다.

실제 A2 TaskApp을 production Hook 평가와 VDOM resolver로 렌더링한다. 기존 TaskApp 벤치마크의 고정 seed 행을 100개 사용한다. 슬롯 0의 items만 바꾸고 한 baseline 평가에서 각 target을 따로 얻는다. 기본 memo 정책, TaskRow의 컴포넌트 boundary·함수 참조·자식 및 controlled checkbox/text input을 유지한다. Diff용 `MountView`는 실제 baseline snapshot으로 미리 만든 preorder ref/child 구조다. DOM 마운트·Effect·사용자 이벤트는 필요하지 않다. 따라서 실제 TaskApp 전체 VDOM의 Diff를 다루며, 전체 사용자 작업 시간을 재는 실험과는 범위가 다르다.

| 조건 | 변경 | 같은 행 VNode | 일치 구간 |
|---|---|---:|---|
| A | 50번째 행의 이름만 변경 | 99/100 | 앞 100 |
| B | 50·51번째 행을 교환 | 100/100 | 앞 49, 뒤 49 |
| C | 전체 역순 | 100/100 | 앞 0, 뒤 0 |
| A/A | 조건 A의 같은 B0 함수에 `B0`와 `B0-repeat` 이름 사용 | 99/100 | 앞 100 |

한 라운드에서 모든 조건은 같은 baseline `MountView`를 공유한다. 각 조건의 두 함수는 동일한 base와 target 객체, `strategy: 'lis'`와 고정 `planId: 'paired-diff'`를 사용한다. `reuseVNode`는 기본값을 사용한다. 정식 측정에서는 commit과 dirty 입력을 실행하지 않는다. VDOM 준비, oracle, 직렬화는 batch 구간 밖에 둔다. base와 target은 쌍 사이에도 갱신하지 않는다. 실제 TaskApp 렌더링에서 새로 생기는 상위 이벤트 handler 참조도 그대로 포함한다.

## 측정 전에 통과할 검사

- 기존 Keyed 단위 차등·통합 테스트와 typecheck를 실행한다. 통합 테스트는 전체 명령 및 관측 동작을 확인한다.
- Chromium preflight에서 별도 audit 번들의 실제 planner 본문에서 호출을 센다. 각 Diff는 자기 planner만 호출하고 크기 100인 호출이 정확히 한 번이어야 한다. 정식 timing 번들에는 호출 계측을 삽입하지 않는다.
- 두 번들에서 조건별로 기존 통합 테스트 방식의 전체 `PatchPlan` 차등 검증과 독립 배치 재생을 수행한다. `equalData`는 함수 참조를 비교하고, target 및 재사용 VNode와 ViewNode에는 직접 참조 단언을 추가한다. 각 Diff 호출 뒤 원래 입력 객체의 속성 및 참조가 보존되는지도 확인한다.

## 한 번의 정식 측정

- Headless Chromium 한 브라우저 프로세스에서 한 페이지를 열고, 각 라운드 시작에 같은 페이지를 새로고침한다. 라운드별 순서는 `A B C A/A`, `B C A A/A`, `C A B A/A`다. 이 라운드들은 독립 기기나 독립 브라우저 프로세스가 아니다.
- A/B/C 각 조건마다 warm-up 10쌍과 기록 표본 60쌍, A/A는 라운드마다 warm-up 10쌍과 기록 표본 30쌍이다. 한 쌍에서 B0 20회와 C1 20회 또는 B0-repeat 20회의 batch를 연속 실행한다. 짝수 표본 번호는 B0 먼저, 홀수는 상대 먼저다. warm-up 번호는 −10부터 −1, 기록 번호는 0부터다.
- `performance.now()`로 각 batch의 벽시계를 잰다. 성공한 계획의 `operations.length`를 양쪽에서 같은 방식으로 누적한다. 한 쌍 안에 await, DOM 접근 또는 출력이 없다. 쌍 사이에서만 결과를 반환받아 JSONL에 한 줄씩 추가한다. warm-up도 보관하되 요약 통계에서는 제외한다.
- 첫 라운드 새로고침 직전부터 마지막 쌍 저장까지 누적 벽시계 120초를 한 번 적용한다. 이 상한에는 warm-up과 A/A, 라운드 준비 및 저장 비용이 포함된다. 호스트와 페이지에서 마감 전에만 새 쌍을 시작하고, watchdog은 마감 시 측정 브라우저를 닫는다. 중단 시 저장된 쌍과 상태를 남긴다. 정식 측정 중 다른 테스트·빌드·프로파일러를 병행하지 않는다. 사용자 앱을 종료하거나 결과에 따라 재측정하지 않는다.

## 통계와 사전 판정

모든 기록 표본으로 batch median·p95와 각 값을 20으로 나눈 호출당 환산값을 구한다. p95의 관측 단위는 batch다. 각 쌍의 `(상대 − B0) / 20`을 µs로 바꾸고 median·사분위·부호 수를 전체, 라운드별, 실행 순서별, 라운드와 실행 순서의 교차별로 공개한다. 분위수는 정렬한 표본의 `(n−1)p` 위치에서 선형 보간한다. 느린 표본도 포함한다.

채택 판단의 **비교 참고값**은 A/A에서 라운드 전체 3개, 실행 순서별 전체 2개, 전체 1개의 쌍별 median 절댓값 중 최대다. 아래에서 판단에 쓸 변화 크기는 해당 조건 전체 B0 호출당 환산 median의 1%와 이 참고값 중 큰 쪽을 초과해야 한다. 1%는 이 실험에서 도입 비용을 비교하기 위해 둔 최소 기준이다. A/A 참고값은 이 실행에서 본 대조용 기술통계이며 신뢰구간이나 모든 조건의 확정 잡음 한계로 해석하지 않는다. 기준 통과 여부와 함께 사분위·부호·p95·실행 순서 민감도를 본다.

- **채택 권고**는 정확성·관측 동작 검증을 통과하고 A와 B 각각에서 전체 쌍별 median과 3개 중 최소 2개 라운드의 median이 위 크기를 넘게 감소할 때 검토한다. 각 조건의 B0 먼저·C1 먼저 전체 집계에서 median이 모두 음수이고, 각각 과반 표본이 감소해야 한다. 다른 라운드에서 의미 있는 반대 방향, C의 반복 악화, 분포나 A/A에서 비슷한 방향·크기의 설명되지 않는 순서 효과가 있으면 보류한다. 목표 입력의 기존 Map·Set 절감, 역순 결과와 planner 복잡성을 종합해 가치가 있을 때에만 Diff 단계 최적화로 권고한다.
- **보류**는 비교 미완료, 방향의 라운드·순서 의존, 위 기준을 뒷받침하지 못하는 분포, 또는 역순 회귀나 유지 비용을 정당화할 근거 부족에 적용한다. C가 위 크기를 초과해 느린 라운드가 2개 이상이면 반복 악화로 보고, 한 라운드 또는 꼬리에만 나타난 악화도 보고서에 남긴다.
- **기각**은 정확성·identity·이동 대상·명령 순서 위반에 적용한다. 비용으로 기각하려면 의미 있는 악화가 2개 이상 라운드에 반복되고 두 순서 전체 집계에서도 양수여야 한다. 그 크기가 A/B의 반복 이득을 웃돌고 작업량 절감으로도 도입 비용을 정당화할 수 없어야 한다. 판단이 모호하면 보류한다. 과거 p95 허용치를 적용하거나 단일 p95만으로 결정하지 않는다.

이 비교의 범위는 같은 페이지의 전체 `diff()` 비용이다. GC·JIT·실행 순서·외부 부하는 여전히 영향을 줄 수 있다. TaskApp 전체 시간, 기존 `crud/100` 회귀의 해소, Patch·paint·GC 비용이나 React와의 비교에는 별도 증거가 필요하다.

## 측정 전 검증 기록과 실행 명령

`8ae389e` 엔진에서 typecheck와 Keyed 단위 차등·통합 테스트 72/72를 통과했다. 두 production 번들의 Chromium preflight에서 전체 계획 일치, 입력 보존, planner 라우팅, 행 이동 0/1/99개를 확인했다. 이 기록 시점에는 성능 표본을 수집하지 않았다.

```sh
pnpm typecheck
pnpm exec vitest run tests/unit/keyed-boundaries.test.ts tests/integration/keyed-boundaries.test.ts
node scripts/keyed-paired-diff/build.mjs
node scripts/keyed-paired-diff/run.mjs --verify
# 아래 명령을 한 번 실행한다. 기존 결과가 없는 고유 태그를 사용한다.
node scripts/keyed-paired-diff/run.mjs --tag=keyed-paired-diff-<unique>
node scripts/keyed-paired-diff/analyze.mjs docs/bench/keyed-paired-diff-<unique>
```
