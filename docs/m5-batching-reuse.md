# M5 FIFO Batching · 명시적 expression 재사용

2026-11-07: 기본 `FunctionComponent` 갱신을 microtask로 전환했다. `RootOptions.batching: 'sync'`는 각 외부 setter 뒤 동기 flush하는 비교 모드다. `reuseVNode: false`는 expression 평가와 같은 VNode 재사용을 끈다. root State·Hook 전용 제약과 공통 Diff/Patch는 유지한다.

## 큐와 확정 경계

`updateQueue.ts`는 확정 슬롯의 복사본에 sequence 순서로 모든 action을 적용한다. 값 action은 대체, 함수 action은 직전 후보값을 입력으로 받는다. `+1` 세 번은 최종 3이며 기본 모드에서 render/commit 한 번이다. `SET 1 → SET 0`은 초기값 0이면 render를 생략한다. `Object.is`에 따라 NaN은 같고 +0/-0은 다르다.

루트당 microtask 하나만 예약한다. flush 시작 시 복사한 요청까지만 처리하고, 성공한 commit 뒤 그 sequence까지만 큐에서 제거한다. host callback·Effect가 넣은 새 요청은 다음 flush로 넘어간다. sync에서도 진행 중인 commit/Effect에 재진입하지 않는다. 한 연쇄의 flush가 50회를 초과하면 진단하고 자동 재시도를 멈춘다. 명시적 `update()`로 실패 요청을 다시 시도할 수 있다. `flushForTest()`는 기존 예약을 무효화하며 unmount도 남은 예약·큐·평가 기록을 해제한다.

render/정규화/Diff 실패는 state·Memo·평가 기록·Effect를 확정하지 않는다. 실제 host 예외는 기존 M3의 fault 경계를 유지한다. 완전한 DOM rollback은 제공하지 않는다.

## 입력 이벤트와 no-op

상태 no-op과 폼 property 복원은 다르다. dirty controlled ref는 캐시가 재사용되어도 현재 VDOM 정책으로 공통 Patch를 거친다. render 없이 폼만 복원하면 Effect를 실행하지 않는다.

M3에서 확인한 native listener 사이 microtask checkpoint 때문에, 기본 모드는 input/change가 관리 container의 capture에 들어온 뒤 bubble 경계를 빠져나올 때까지 flush를 미룬다. 전파가 중단되면 다음 task가 경계를 마무리한다. 사용자 이벤트의 일반 위임 시스템은 추가하지 않았다. sync 비교 모드는 기존 동기 setter 의미를 유지하므로 사용자가 capture handler에서 동기 상태 변경을 하면 뒤의 listener에 변경이 보일 수 있다.

## 위치별 재사용

`evaluateExpression()`은 mount별 이전 성공 기록만 받는다. 같은 표현식 객체가 같은 부모의 같은 슬롯에 오면 순수 자식 평가를 생략한다. 직접 자식이 모두 keyed expression이면 key를 논리 슬롯으로 사용하고, 그렇지 않으면 위치로 대응한다. type/key/부모/mount 경계는 넘지 않는다. 하나의 expression을 두 위치에 두면 최초에는 각각 평가하고 DOM도 두 개 생성한다. 제거한 슬롯의 기록은 다음 성공 기록에서 사라진다.

`useMemo`는 직전 deps/결과 하나만 유지한다. 같은 props를 가진 **새 expression**은 다시 평가한다. 자동 shallow memo·행별 Hook·LRU는 없다. handler가 캡처한 값은 deps에 포함해야 한다. host expression은 attrs/style/events/form/children 배열을 복사해 소유하고, component props의 중첩 객체 불변성은 호출자 계약이다.

Diff의 `visitedNodes`는 비교에 진입한 노드 수다. 검증 단계는 안전성을 위해 여전히 전체 트리를 검사하므로 이 수치를 전체 엔진 작업량·시간 절감으로 해석하지 않는다.

## 실제 검증

- 단위·통합 **138/138**, Chromium **12/12**, typecheck/build PASS.
- `batching.test.ts`: FIFO 조합·100개 다중 슬롯 action·await 경계·Object.is·실패/재시도·Effect 연쇄·commit 중 native callback·unmount 취소·sync/microtask 최종 결과 비교.
- `reuse.test.ts`: on/off 결과·DOM identity·평가/방문 수·두 위치·key 이동·부모 이동·재마운트·제거 캐시·최신 closure·실패한 후보 폐기·dirty 폼 복원.
- 기존 M1 Hook 회귀는 명시적 sync fixture에서 보존했다. 기본 모드는 새 테스트와 실제 앱 브라우저 검증으로 검사한다. 기존 폼 회귀는 기본 모드의 비동기 flush를 기다린 뒤 같은 기대값을 검사한다.
- Chromium: 실제 두 클릭에서 6개 요청→2번 commit, capture setter 뒤 부모 bubble handler가 새 native 입력값을 읽는 회귀 PASS. M3 parent-only 회귀도 PASS.

순수 action 비교에서 sync는 Effect `[0,1,2,3]`, microtask는 `[0,3]`이다. 최종 State/DOM은 같지만 중간 commit/Effect 횟수까지 같다고 주장하지 않는다. 시간 성능·실제 IME는 이 단계의 결과가 아니다.

재현: `pnpm test`, `pnpm test:browser`, `pnpm typecheck`, `pnpm build`. [실행 요약](validation/m5.json).
