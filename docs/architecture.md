# 공통 엔진 구조와 지원 계약

최초 M8 기능 소스는 `3190268`, no-op 후속 엔진 소스는 `c4a2fe1`이다. 실제 TaskApp의 표현 재사용 변경은 `5ed7f34`다. 2026-11-09 최종 정책으로 엔진은 E1 방식의 매회 검증을, 기본 앱은 A0를 사용한다. A1은 비교용 `TaskAppWithRowReuse`로 남긴다. [최종 정책과 검증](task-app-final-policy.md) 문서·CI·실험 결과의 커밋은 별도로 [진행 기록](progress.md)에 남긴다. API 타입의 원본은 [types.ts](../src/core/types.ts)다.

## 두 Phase, 하나의 쓰기 경로

```text
Phase 1: 실제/편집 DOM → capture → VRoot
Phase 2: FIFO 후보 State → 루트 함수 → h 표현식 → resolve → VRoot
두 Phase의 VRoot → diff(MountView, target) → PatchPlan → commit → mount별 실제 Node
```

`h()`는 DOM을 만들거나 컴포넌트를 즉시 실행하지 않는다. resolver가 순수 자식을 평가하고 정규화한다. DOM을 읽지 않는 Diff는 필요한 명령을 만들고, Patch executor만 일반 엔진 갱신을 실제 DOM에 적용한다. 편집기의 직접 DOM 편집은 명시적인 입력이며 다음 capture/adopt에서 다시 연결한다. Inspector의 화면과 overlay는 관리 대상 DOM 밖에 있다.

| 자료 | 보유하는 것 | 보유하지 않는 것 |
|---|---|---|
| VRoot/VNode | 동결된 태그·텍스트·속성·폼 정책·identity | 실제 DOM 객체 |
| MountView | VNode와 논리 ref, 부모/자식 구조, revision | 실제 DOM 객체 |
| MountHandle | 해당 mount의 ref→Node, Node→ref, dirty/composition 상태 | 다른 mount의 binding |
| PatchPlan | mount/revision, 대상·부모·anchor ref, 명령과 다음 view | 실행 중 바뀌는 숫자 index에 대한 의존 |
| History | 불변 VRoot snapshot과 cursor/version | Node, Phase 2 Hook·closure·비동기 작업 |

같은 VDOM을 두 mount에 생성해도 DOM은 별개다. History가 DOM을 보관하면 나중의 편집이 과거 이력까지 바꾸고 다른 영역의 객체를 잘못 이동시킬 수 있다. capture는 관찰 결과만 만들며 adopt가 현재 DOM identity와 revision을 확인한 후 binding을 확정한다. 오래된 capture와 다른 mount의 plan은 거절한다.

## Keyed Greedy와 LIS

두 전략은 같은 매칭과 executor를 쓴다. 동일 부모의 old/new 직접 자식이 **모두 고유 key를 가진 element**일 때만 keyed 경로를 사용한다. 공백·텍스트·placeholder·누락 key는 삭제해서 조건을 맞추지 않고 위치 기반으로 처리하며 이유를 기록한다. 중복 key는 오류다.

key가 같아도 host tag, 컴포넌트 경계의 함수/type·key, 반환 root key가 달라지면 교체한다. 부모/mount가 다르면 이전 DOM이나 평가 캐시를 가져오지 않는다. key는 문자열로 정규화하므로 숫자 `1`과 문자열 `"1"`은 같은 key다.

예: `ABCDEFGH → HABCDEFG`에서 새 순서의 old index는 `[7,0,1,2,3,4,5,6]`이다.

- **Greedy:** 지금까지의 최대 old index보다 작은 항목을 이동 대상으로 잡는다. H를 유지한 뒤 A~G가 이동 대상이 되어 7개다.
- **LIS:** 증가 부분 수열 A~G를 유지하고 H만 이동하므로 1개다. 이진 탐색과 predecessor로 실제 유지 위치를 복원한다.
- **역순:** 증가 부분 수열 길이는 1이므로 두 전략 모두 n−1개를 이동한다.
- **원래 상대 순서 유지:** LIS 계산 자체를 생략한다. 신규 항목의 old index는 `null`이며 유효한 index 0과 구분한다.

유지할 수 있는 재사용 노드의 순서는 old/new 양쪽에서 증가해야 한다. 따라서 제한 모델에서 최소 재사용 root 이동은 `재사용 개수 − LIS 길이`다. 이 모델은 동일 부모·호환 identity·한 항목 한 host root·이동 비용 균일을 가정한다. 서브트리 크기나 브라우저 layout 비용을 최소화한다는 주장이 아니다.

배치는 **오른쪽에서 왼쪽으로**, 오른쪽의 확정된 형제 ref를 anchor로 삼아 `insertBefore`한다. 앞에서 삭제/삽입이 일어나도 숫자 index를 다시 해석하지 않는다. planner는 대략 O(n) 매칭 + 필요 시 O(n log n) LIS, 공간 O(n)이다. Diff/검증/host 처리와 실제 브라우저 비용은 별도다.

검증은 실제 planner에 대해 순열 46,233개, 독립 BFS 최단 거리 5,913상태, 부분 순열 4,225쌍, seed 10,000쌍을 실행했다. 브라우저에서도 200쌍×2전략의 순서·객체 identity·uncontrolled live 입력을 검사했다. [M4 증거](m4-keyed.md).

## Patch의 확정 경계

1. mount/revision, 현재 DOM binding, plan ref/parent/anchor를 확인한다.
2. 연결 목록 모델로 전체 명령을 모의 실행해 다음 view와 일치하는지 검증한다.
3. composition 대상과 충돌하면 **아직 DOM을 쓰지 않은 채 deferred**로 돌려준다.
4. 생성 → 제거 → 일반 변경 → 배치 → 폼 동기화 → 필요 시 focus/selection 보정을 수행한다.
5. 성공 후 view/revision을 확정하고 실제 host 작업 수를 반환한다.

preflight 거절은 DOM 쓰기 0회다. 실제 DOM API가 실행 도중 예외를 던지는 경우는 다르다. mount를 faulted로 표시하고 후속 쓰기를 막지만 이미 수행한 쓰기를 모두 rollback하지는 않는다. 편집기 복구는 마지막 정상 History로 두 mount를 다시 만든다. [실제 실패와 회귀](m3-correctness.md).

### no-op 검증 비용과 캐시 경계

후속 최적화에서는 preflight가 비교용 host 객체 두 개를 매 노드마다 복사하지 않는다. 같은 VNode 참조는 동등하고, 다른 참조는 기존과 같은 own host 필드를 직접 비교한다. identity/children 검사는 따로 유지한다. 명령 모의 실행과 **현재 DOM 객체·parent·형제 순서·양방향 binding 검사**는 매 commit에 수행한다. DOM 쓰기가 0이어도 외부에서 같은 HTML의 다른 Node를 끼워 넣으면 거절한다.

**최종 정책(2026-11-09): E1 방식의 매회 검증.** `validateTree`는 호출될 때마다 전체 VRoot를 검사한다. 같은 VRoot 참조가 다시 와도 이전 결과를 재사용하지 않는다. 그래서 형제 중복 key, form/radio 그룹, select/option 소유 문맥이 언제나 현재 root 기준으로 확인된다. 검증 결과나 불변성 인증을 호출 사이에 보관하지 않는다. [결정과 근거](task-app-final-policy.md)

`freezeTree`는 엔진이 소유한 plain object/array의 data property를 재귀 동결한다. 동결의 목적은 History와 이전 VDOM이 이후 갱신으로 변형되지 않게 하는 것(I-01)이며, 검증 생략의 근거로 쓰지 않는다. 안전 조건은 다음과 같다.

- 먼저 `Object.freeze`한 뒤 동결 후의 own data descriptor만 따라간다. Proxy의 동결 trap이 최종 참조를 바꿔도 실제로 남은 값을 동결한다.
- getter/setter는 실행하지 않는다. accessor가 돌려주는 값은 매 검증에서 다시 읽는다.
- 순환과 재진입은 `순환 데이터` 오류로 거절한다. 진행 중 표시는 finally에서 지운다. 같은 호출 안의 공유 참조만 그 호출의 WeakSet으로 한 번 방문한다.
- 함수는 identity로 취급하고 동결하지 않는다. 상속 prototype의 데이터와 호출자의 props/state도 동결하지 않는다.

resolver는 각 VNode를 만드는 시점에 `freezeOwnedNode`로 봉인한다. 노드의 자체 데이터(identity·attrs·style·events·form)를 깊게 동결하고 `children` 배열은 얕게 동결한다. children의 항목은 생성될 때 이미 봉인된 엔진 VNode다. 컴포넌트 경계 노드는 `freezeBoundaryNode`로 새 identity만 동결한다. 자식이 봉인되지 않았으면 오류로 거절한다(건너뛰기가 아닌 전제 확인). 따라서 재사용한 하위 트리를 다시 순회하지 않고 새 노드만 동결한다. E1 고정 build의 `Object.isFrozen` 건너뛰기는 얕게 동결된 wrapper나 Proxy를 놓칠 수 있어 사용하지 않는다.

E2(`c4a2fe1`)~E4(`2a21ec7`)는 깊은 불변성 인증과 동일 root 검증 캐시를 실험한 후보다. E3는 Proxy 반례를 고쳤고, E4는 호출당 새 인증을 64개로 제한했다. 반복 재사용 조건의 이득은 확인했지만 사전 회귀 허용 범위를 넘는 조건이 반복돼 기본 경로에서 제외했다. 이 후보들은 고정 비교 build와 [후보 기록](task-app-bounded-candidate.md)에만 남는다.

필요한 view 갱신, dirty controlled 복원, Effect, focus/IME 단계는 no-op에서도 그대로 실행한다. 캐시 후보의 생성 비용 증가와 반복 이득은 [성능 보고서](benchmark-results.md)에 기록했다.

## Root Hooks와 FIFO Batching

`FunctionComponent`는 루트 함수, `hooks` 배열, mount/update/unmount를 소유한다. 매 render의 Hook 호출 순서가 슬롯을 결정한다. setter는 슬롯에 고정되어 있고 렌더 당시 값의 closure와 다르다. 그래서 `setCount(count + 1)` 세 번은 같은 값 대체 요청인 반면 `setCount(n => n + 1)` 세 번은 앞 후보값에 차례로 적용된다.

기본 모드는 루트당 microtask 하나를 예약한다. flush는 큐 prefix를 복사하고 확정 Hook 값의 복사본에 모든 action을 FIFO로 적용한다. 초기 0에서 +1×3이면 후보 3을 한 번 render/commit한다. render 중 후보는 확정 state가 아니다. 실패하거나 IME로 보류하면 Hook·Memo·평가 기록·Effect를 확정하지 않는다. 성공한 prefix까지만 제거하므로 host callback/Effect가 넣은 새 요청은 보존된다.

Effect 중 setter는 다음 flush다. 처리 중인 commit에 재진입하지 않는다. 무한 연쇄는 50회 제한으로 진단한다. `Object.is` 같은 값이면 render를 생략할 수 있지만 dirty controlled form은 여전히 Patch한다. 이때 render 기준 Effect는 실행하지 않는다. `update()`로 요청한 실제 render의 DOM no-op에는 deps 규칙에 따라 Effect를 처리한다.

sync 비교 모드는 외부 setter마다 flush한다. 순수 action의 최종 State/DOM은 같아도 중간 commit/Effect 횟수는 달라질 수 있다. await/후속 사용자 이벤트는 하나의 거대한 batch로 합치지 않는다. [M5 계약과 테스트](m5-batching-reuse.md).

## Effect, Memo와 expression 재사용

- Effect는 성공한 DOM commit 뒤 실행한다. 변경된 Effect의 cleanup을 모두 먼저 실행한 다음 setup한다. unmount에서도 cleanup한다. 예외는 진단하되 나머지 정리를 계속하며 이미 끝난 commit을 되돌리지 않는다. Promise 반환은 cleanup으로 인정하지 않는다.
- deps 생략은 매 render, 빈 배열은 mount, 배열은 길이 고정과 원소별 `Object.is` 비교다. 배열 자체를 복사해 이후 외부 변경을 차단한다.
- useMemo는 이전 deps/결과 하나를 유지한다. 동일 expression 객체가 같은 논리 위치에 다시 오면 resolver 평가와 하위 Diff를 생략할 수 있다. 같은 props의 새 expression을 자동 memo하지 않는다.
- 하나의 expression을 두 위치에서 쓰면 첫 평가와 DOM은 각각 독립이다. 같은 부모의 keyed 슬롯은 재정렬해도 찾을 수 있지만 삭제·부모 이동·type 변경·remount 경계를 넘지 않는다.
- 함수가 캡처하는 값도 Memo deps에 넣어야 한다. native listener wrapper는 동일하게 유지하면서 현재 handler binding을 읽어 오래된 handler 호출을 막는다.

재사용은 검증을 없애지 않는다. 안전성 검사는 여전히 전체 트리를 방문할 수 있으므로 `visitedNodes` 감소를 전체 시간 감소와 같다고 해석하지 않는다.

기본 `TaskApp`(A0)은 매 루트 render마다 행 콜백과 TaskRow 표현을 다시 만든다. DOM identity는 keyed Diff가 유지한다. 비교용 `TaskAppWithRowReuse`(A1)는 루트에서 `[setItems]`에 의존하는 rename/toggle/remove 콜백 묶음과 `[visible, rowActions]`에 의존하는 목록 표현을 useMemo로 보관한다. 콜백은 `setItems(previous => ...)`로 최신 FIFO 후보 상태를 읽는다. 따라서 draft·카운터만 바뀌면 루트는 실행해도 기존 TaskRow는 다시 평가하지 않는다. items·검색·필터·정렬이 바뀌면 목록 표현을 새로 만들고 자식을 평가한다. 모든 행의 props를 자동 비교하는 정책은 아니다.

추가 callback은 draft·nextId를 읽으므로 render별 closure를 유지한다. items 변경의 기존 40ms Effect와 총개수 동기화도 유지하며, 그 후속 render에서 동일 목록 표현을 재사용한다. Hook은 루트의 고정 순서에만 있고 자식은 props 순수 함수다. [앱 원리·실행 횟수 근거](task-app-reuse.md), [실제 앱 비교 경계](task-app-followup.md)를 참고한다.

## History와 입력 상태

Undo/Redo 직전에 편집 영역의 **현재 DOM**을 다시 capture/adopt한다. 이력의 V1만 old로 쓰면 사용자가 아직 Patch하지 않은 X를 Diff가 모르므로 X가 남을 수 있다. 실제 현재 DOM에서 선택한 과거 snapshot으로 Diff하므로 잔여 노드 없이 두 영역이 동기화된다. no-op은 새 버전을 만들지 않고 Undo 뒤 새 Patch는 미래 이력을 버린다.

| 소유 | 의미 |
|---|---|
| snapshot | Phase 1 attribute/default와 live value/checked/선택을 구분해 저장·복원 |
| controlled | VDOM 정책이 현재 property의 기준. native 입력이 state를 바꾸지 않아도 dirty 복원 |
| uncontrolled | default는 최초 생성에만 적용. 재렌더·재정렬에서 live 입력 보존 |

select 선택은 option 변경 뒤 `selectedIndices`로 적용한다. 같은 value는 재대입하지 않는다. native input의 capture는 dirty를 표시하고 관리 container의 bubble이 끝난 뒤 flush한다. target capture에서 즉시 예약했을 때 브라우저의 listener 사이 microtask가 먼저 실행되어 부모 handler가 옛 값을 읽던 실제 회귀를 고쳤다. stopPropagation은 다음 task의 fallback으로 마무리한다.

focus는 같은 ref/객체가 살아 있고 입력 type과 명시적 focus 이동이 없을 때만 보정한다. selection은 지원 input/textarea의 offset을 value 길이로 clamp한다. 삭제/교체한 필드에 새 focus를 강제하지 않는다.

composition 중 대상/조상의 이동·삭제·교체·입력 방식을 바꾸는 변경은 plan 전체를 보류한다. 안전한 다른 영역은 갱신할 수 있고 조합 필드의 form 쓰기는 보류 목록에 둔다. 종료 후 최신 FIFO 상태에서 **새 plan**을 계산한다. 오래된 plan을 재실행하지 않는다. 자세한 지원·검증은 [M7](m7-app-browser.md).

## 지원 범위와 한계

| 범주 | 지원 / 제한 |
|---|---|
| HTML | allowlist의 일반 HTML, 텍스트·공백·주석·중첩·빈 root. 정확한 태그 목록은 `validate.ts` |
| 정규화 | 0/빈 문자열 보존; null/undefined/boolean은 comment placeholder; host child 중첩 배열 평탄화 |
| Component | 각 루트의 Hooks, props 순수 자식, 단일 host/text/빈 반환. 여러 데모 루트는 서로 독립 |
| 폼 | input/textarea/select/option/optgroup, checkbox/radio, multiple. 소유 모드 전환·이중 소유 거절 |
| radio | Phase 1은 각 영역 내부 form 필요; 외부 `form` 연결 거절 |
| file | 빈 file input만 snapshot 가능. 선택 파일·controlled file 복원 미지원 |
| 이벤트 | Phase 2의 native 이름·Event·capture/bubble. passive/once/React SyntheticEvent API 없음. Phase 1 DOM 캡처는 외부 코드가 등록한 listener를 직렬화·복원하지 않음 |
| focus/IME | 검증된 입력 범위에 한함. contenteditable Range·의미론적 caret mapping·모든 IME 보장 없음 |
| 입력 경계 | script/inline on*/위험 URL/iframe/SVG/MathML/Custom Element 등 거절. 범용 보안 sanitizer 제품 아님 |
| 상태 불변성 | 개발 모드 plain object/array 동결 진단. class/Map/DOM 전체 불변성 보장 없음; production 호출자 계약 |
| 오류 | preflight 거절은 쓰기 없음. 실제 host 예외는 faulted; 전체 transaction rollback 없음 |
| 브라우저 | 이전 no-op 전체 검증은 Chromium 20개+Firefox 11개. 이번 앱 회귀 추가 후 기본 구성은 21개+12개이며 최종 전체 재검증은 진행 중. Safari/WebKit·모바일 실기기 미검증 |
| 관찰 | 최근 100개 plan, 실행 전 이벤트 최대 1,000개; 생략 수 표시. 무제한 이력 아님 |
| 제외 | 자식 Hooks, 외부 Store, Fiber/Concurrent, SSR/Hydration, Phase 2 Time Travel, keyed Fragment, Adaptive |

속도 실험은 이 엔진의 선택지 비교다. React 원본을 수정하거나 React보다 일반적으로 빠르다는 실험은 하지 않았다.
