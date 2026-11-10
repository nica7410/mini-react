# 후속 연구: 관측 동작을 보존하는 Keyed 구간 분할 (2026-11-10)

이 문서는 ④ 채택(`c2dbbf6`) 이후의 한 회차 기록이다. 다음 여섯 가지를 섞지 않고 적는다.

| 구분 | 내용 | 위치 |
|---|---|---|
| 기존 채택 상태 | `c2dbbf6`: E9 memo 지원 + 기본 앱 A2 + SYNC_FORM 전용 사전 검증 | [채택 기록](row-memo-adoption.md) |
| 이번에 재현·수정한 정확성 문제 | memo 전환 예외, 가려진 금지 Patch 명령 | §2 |
| 정확성 수정 후 기준선 B0 | `ab5a9b8` | §2.3 |
| 이번 Keyed 후보 C1 | 앞뒤 일치 구간 분리 | §3~§6 |
| 작업량 절감과 실제 시간 | 따로 측정하고 따로 적는다 | §7 |
| 판정과 남은 미검증 | | §8, §9 |

과거 p95 허용치는 이 문서에서 **회귀 경고 지표**로만 쓴다. ④ 채택을 다시 판정하지 않는다.

**결론 요약.**

- 정확성 결함 두 종류를 `c2dbbf6`에서 재현하고 최소 수정했다(`ab5a9b8`, 이것이 새 기준선 B0이자 **현재 기본 소스**다).
- Keyed 구간 분할 후보 C1은 B0와 같은 계획을 낸다는 것을 논증·차등 검증·독립 모델·변이 4개로 확인했다. 목표 입력에서 planner의 Map 연산이 0이 되고 Set 연산이 절반이 되며, planner 단독 시간은 21개 비교 모두에서 줄었다(이득 입력 약 −20%).
- 그러나 실제 TaskApp 전체 시간에서는 이득을 보이지 못했고, `crud/100`의 3세션 중 2세션에서 C1의 median이 경고 폭을 넘게 컸다(1세션은 더 크게 작았다). 측정 전에 적어 둔 기준("A/A 폭 안")을 충족하지 못했으므로 기준을 완화하지 않고 **연구용 보존(B)** 으로 판정했다.
- 기본 planner는 B0 그대로다. 후보는 `research/keyed-boundaries/`에 코드·patch로, 계약 테스트와 측정 원자료와 함께 남겼다.

## 1. 범위와 예산

- 순서: S0 상태 확인 → S1 정확성 반례 → S2 Keyed 후보 → S3 좁은 측정 → S4 검증·문서·커밋.
- 상한: 전체 180분, 성능 실험 실행 누적 15분, 새 생성·차등 탐색 실행 누적 5분. 사용량은 §10.
- 제외: 10,000개 측정, SYNC_FORM fast path 재개발, fresh/equal/100 원인 규명, Dirty 인덱스·캐시, 범용 Patch Fast Path, 자식 Hooks/Fiber, 실제 React 비교.
- 시작 상태(2026-11-10 10:35 KST): 브랜치 `phase1`, HEAD `c2dbbf6`, 작업 트리에는 사용자의 미커밋 `docs/followup-row-memo.md`만 있었다. 이 파일은 이번 커밋에 넣지 않았다. 이 저장소에서 실행 중인 서버·benchmark 프로세스는 없었다.

## 2. S1 — 채택 후 기본 경로의 정확성 보강

두 반례는 이전 프롬프트의 **과거 보고**였다. 아래는 `c2dbbf6`에서 **이번에 직접 재현한 결과**다.

### 2.1 null/placeholder → memo 컴포넌트

- 재현: `evaluateExpression(null, …)` 뒤 같은 슬롯에 `h(memo(Row), …)`를 평가하면 reuse=on에서 `TypeError: Cannot read properties of null (reading 'props')`. 루트 반환값과 부모 아래 슬롯 모두 재현됐다. `FunctionComponent`에서는 이 예외가 `ENGINE_ERROR`로 보고되고 루트가 멈췄다.
- 원인: `sameExpressionType`이 `typeof null === 'object'` 때문에 `null`과 컴포넌트 표현식을 같은 종류로 보았고, memo 분기가 이전 표현식이 컴포넌트인지 확인하지 않고 `props`를 읽었다.
- 재현되지 않은 전환: `undefined`/boolean/text/number/element/다른 컴포넌트 → memo, 그리고 memo → 그 값들(역방향). `typeof` 또는 `kind`가 달라 이전 기록이 이미 버려졌다. reuse=off는 memo 분기에 들어가지 않는다.
- 수정(`src/runtime/resolve.ts`): 표현식 객체(element/component)는 `null`·원시값·배열과 같은 종류가 아니다. memo props 비교는 이전 기록이 **같은 type·같은 key의 컴포넌트 표현식**임을 확인한 뒤에만 한다. memo를 끄거나 `null`의 출력을 바꾸지 않았다. State와 Hooks는 여전히 루트에만 있다.
- 회귀 테스트(`tests/integration/memo-placeholder.test.ts`, 39개): 9종 값 × 루트/자식 슬롯 × reuse on/off의 `값 → memo → 같은 memo → 값 → memo`, type·key 변경, `FunctionComponent`에서 최종 DOM·identity·최신 callback·Effect 횟수·실패 렌더 후 재시도(실패 후보 미확정).

### 2.2 최종 target이 합법이어도 금지된 중간 명령은 거절

- 재현: 최종 모의 상태가 유효한 target과 같아서 통과하던 계획(가려진 명령 20종 + 생성 후 정리)이 `c2dbbf6`의 일반 경로에서 모두 수락됐다. 예:
  - `SET_ATTR onclick` → `REMOVE_ATTR onclick` (host에는 `setAttribute('onclick', …)`가 실행된다)
  - `SET_STYLE background: url(javascript:…)` → `REMOVE_STYLE`
  - controlled 입력에 `SET_ATTR value` → `REMOVE_ATTR value`
  - `CREATE_SUBTREE`(금지 속성 포함) → 같은 계획에서 `REMOVE_ATTR`로 정리
  - 같은 ref에 위조 `SYNC_FORM` → 정상 `SYNC_FORM`. SYNC_FORM 전용 경로는 정책을 `Map`에 마지막 값으로 합쳤으므로 앞 정책이 가려졌다. 일반 경로도 같은 계획을 수락했다. **두 경로의 결과가 같다는 차등 테스트로는 이 결함이 보이지 않았다.**
  - radio 예: 그룹에서 a가 선택된 상태에서 `SYNC_FORM b {checked:true}` → `SYNC_FORM b {checked:false}`. 첫 쓰기가 a의 선택을 native로 풀고 둘째 쓰기는 b만 다시 푼다. VDOM은 a 선택인데 DOM은 아무것도 선택되지 않는다.
- 계약(작게 유지):
  1. **단계 순서·대상 type**: 기존 규칙 그대로.
  2. **payload**: 값을 쓰는 명령(`SET_ATTR`/`SET_STYLE`/`SET_EVENT`)은 그 명령 하나만으로 `validateTree`가 같은 필드에 적용하는 규칙을 통과해야 한다(`attributeProblem`, `style` 속성 금지, style 규칙, 이벤트 이름 규칙, 비-snapshot 폼의 `value/checked/selected` 속성 금지, 비-snapshot select 아래 option의 `selected` 금지). 문자열이 아닌 값도 거절한다. 제거 명령은 payload가 없으므로 판정하지 않는다.
  3. **SYNC_FORM**: 같은 ref의 모든 `SYNC_FORM` 정책은 서로 같아야 한다. 그러면 모든 정책이 최종 정책과 같고, 최종 정책은 target 전체 검증(라디오 그룹 포함)을 통과한 값이다. 폼 정책은 host에서 "마지막 값이 이긴다"가 성립하지 않기 때문에(위 radio 예) 속성과 다르게 다룬다.
  4. **새로 만든 노드**: `CREATE_SUBTREE`의 노드는 주어진 그대로 host에 쓰이므로 같은 계획에서 수정할 수 없다(planner는 이런 명령을 만들지 않는다).
- 만들지 않은 규칙: "모든 중간 상태가 최종 VDOM과 같아야 한다"는 규칙은 없다. `class=a → class=base`, `title 제거 → title 설정`, 이벤트 handler 교체, 동일한 `SYNC_FORM` 반복, planner가 만든 radio a→b 전환과 option 목록 변경은 그대로 수락된다(테스트로 고정). 명령마다 트리를 다시 검증하지 않는다. 외부에서 바뀐 속성값을 감시하지 않는다.
- 수정: `src/core/validate.ts`의 `commandProblem`(규칙은 `validateTree`와 공유), `src/core/planValidation.ts`의 일반 경로와 SYNC_FORM 전용 경로.
- 회귀 테스트(`tests/integration/plan-command-contract.test.ts`, 23개): 가려진 명령 20종 + 생성 후 정리 3종이 **두 경로 모두에서** 거절되고, `commit` 호출 동안 host 쓰기 spy 15종이 한 번도 호출되지 않으며 MutationObserver 기록이 없다. DOM 구조·텍스트·속성·스타일, value·checked·선택, 이벤트 binding, focus·selection, registry·view·revision·dirty/held가 그대로다. 합법 순차 계획 2종은 수락된다.
- 기존 테스트 변경 1건: `sync-form-validation.test.ts`의 "last policy wins" 제목을 새 계약("같은 정책은 수락, 다른 정책은 거절")으로 바꿨다. 단언은 그대로 통과한다.
- 남은 범위 밖 사항: `attributeProblem`의 금지 이름 목록(`srcdoc` 등)과 `style` 검사는 소문자 이름 기준이다. resolver와 DOM 캡처는 이름을 소문자로 만들지만, 손으로 만든 VNode/명령의 대문자 이름은 `validateTree`와 명령 계약 모두에서 걸러지지 않는다. 이번 두 반례의 범위가 아니어서 고치지 않았다.

### 2.3 기준선 B0

`ab5a9b8` = `c2dbbf6` + 위 두 수정. 이 소스에서 typecheck, 단위·통합 330/330, production build, Chromium+Firefox 33/33(1회)을 통과했다. A2·E9·복원 패치 정책은 그대로다. 이후의 성능 비교는 모두 **B0 대 C1, 같은 A2 앱, 같은 LIS 전략**이다.

## 3. S2 — 연구 질문과 보존 계약

질문: 전체 key 유효성 검사와 Greedy/LIS의 관측 동작을 그대로 두고, 앞뒤의 이미 대응되는 구간을 분리해서 중간 구간의 Map·배열 생성과 탐색을 줄일 수 있는가?

기호: 형제 목록의 이전 길이 n, 새 길이 m, N = max(n, m). 앞 일치 길이 p, 뒤 일치 길이 s. 중간 구간은 이전 `[p, n-s)`, 새 `[p, m-s)`이고 그 크기를 M이라 한다.

보존하는 것(소비자를 확인한 뒤 정했다):

| 항목 | 소비자 | 보존 방법 |
|---|---|---|
| 슬롯별 매칭(`newIndex`, `oldIndex`, `previous`, `vnode`) | `reconcile.ts`: 하위 Diff 입력과 순서 | 동일 |
| `removedRefs`(이전 목록 순서) | `REMOVE_SUBTREE` 순서 | 동일 |
| `insertNewIndices`, `moveNewIndices`(오름차순, 전체 목록 index) | 배치 대상·`ReconcileDecision` | 동일 |
| `usedLIS`(재배치가 있을 때만 true) | `ReconcileDecision`, Inspector | 동일 |
| `stableNewIndices`의 **구성원** | 엔진 코드에는 소비자가 없다(테스트·모델만 읽음) | 구성원 동일. 처음 읽을 때 만든다 |
| 실패 코드·메시지·우선순위(`NOT_KEYED` → `DUPLICATE_KEY`) | `diff`의 fallback 이유 | 검사 코드를 바꾸지 않음 |
| anchor와 `PLACE_BEFORE` 순서, host 이동·생략 횟수 | `patch.ts` | `reconcile.ts`를 바꾸지 않았고 입력이 같다 |
| commit/deferred/rejected, focus·selection·controlled 값·IME | `patch.ts`, `browserState.ts` | 이동 **대상**이 같으므로 같다 |

계약으로 만들지 않은 것: `stableNewIndices`의 내부 삽입 순서(B0의 LIS 경로는 역추적 순서였다), 한 호출 안의 객체 생성 순서. 읽는 코드가 없다.

`stableNewIndices`는 "매칭된 슬롯 중 이동하지 않는 것"과 정확히 같다. B0에서 `moveNewIndices`가 `매칭 ∧ ¬stable`로 정의되고 stable은 매칭된 슬롯만 담기 때문이다. C1은 이 항등식으로 처음 접근할 때 집합을 만든다.

## 4. 알고리즘과 불변식

```
1. 전체 목록 eligibility 검사           (B0와 같은 코드)
2. 전체 목록의 빈 key·중복 key 검사      (B0와 같은 코드, 이전 목록 먼저)
3. p = 앞에서부터 같은 위치의 key가 같고 compatible()인 최대 길이
   s = 뒤에서부터 같은 조건의 최대 길이, 단 p + s ≤ min(n, m)
4. 앞 구간 슬롯: (i, i) 대응
5. 중간 구간: 이전 [p, n-s)의 key → 전체 index Map(중간이 비지 않을 때만),
   새 [p, m-s)를 새 목록 순서로 조회·compatible() 검사,
   Greedy 판정(maximum은 p-1에서 시작)과 monotonic 플래그 계산
6. 뒤 구간 슬롯: (m-s+k, n-s+k) 대응
7. 재배치가 있으면: LIS는 중간 슬롯만, Greedy는 중간만 다시 훑어 이동 대상 결정
8. 제거 대상: 매칭되지 않은 중간 이전 노드(이전 목록 순서)
```

`compatible()`은 identity 전체(key, renderedRootKey, 컴포넌트 boundary의 type·key)와 host tag를 본다. 3의 key 비교는 깊은 비교를 건너뛰는 지름길일 뿐이고 의미는 `compatible()`이 정한다. 같은 key라도 tag·boundary·renderedRootKey가 다르면 구간이 그 자리에서 끝나고, 그 노드는 중간 구간에서 B0와 똑같이 "새로 삽입 + 이전 것 삭제"가 된다.

**불변식 1 — 매칭.** 두 목록의 key는 각각 유일하다(2에서 전체를 검사). 앞 구간의 위치 i에서 `new[i].key = old[i].key`이므로 B0의 전체 Map 조회 결과도 `old[i]`이고 compatible하므로 (i, i)가 된다. 뒤 구간도 같다.

**불변식 2 — 경계 노드는 다시 쓰이지 않는다.** 중간의 새 노드 key는 새 목록에서 유일하므로 앞뒤 구간의 새 key와 다르고, 그 key들은 앞뒤 구간의 이전 key와 같다. 따라서 중간의 새 노드가 전체 Map에서 찾을 수 있는 이전 노드는 중간에만 있다. 중간만 담은 Map의 조회 결과는 전체 Map과 같다.

**불변식 3 — 제거·삽입.** 앞뒤 구간의 이전 노드는 모두 재사용된다. 제거 대상은 매칭되지 않은 중간 이전 노드이고 이전 목록 순서로 나열하면 B0의 `old.filter(...)` 순서와 같다. 삽입은 매칭되지 않은 중간 새 노드뿐이다.

**불변식 4 — index.** 슬롯의 `oldIndex/newIndex`, Map 값, 이동·삽입 index는 처음부터 전체 목록 기준이다. 중간 기준 번호는 함수 안의 두 임시 배열(`kept[oldIndex - p]`, `predecessors[index - p]`)에만 쓰인다. `reconcile.ts`의 anchor 계산(`result[i + 1]`)은 바뀌지 않았으므로 변환 규칙이 필요 없다.

**불변식 5 — Greedy.** B0의 판정은 새 목록 순서로 "지금까지 유지된 것의 최대 oldIndex보다 작으면 이동"이다. 앞 구간 슬롯의 oldIndex는 0..p-1로 증가하므로 모두 유지되고 앞 구간이 끝난 시점의 maximum은 p-1이다. C1은 중간을 maximum = p-1에서 시작해 같은 순서로 훑는다. 뒤 구간의 oldIndex는 모든 중간 oldIndex보다 크므로 뒤 구간은 모두 유지되고, 새 목록 순서상 중간보다 **나중에** 판정되므로 중간의 판정에 영향을 줄 수 없다. C1은 뒤 구간을 maximum에 미리 넣지 않는다(넣으면 `A B C Q → C A B Q`에서 C까지 이동 대상이 된다. 변이 M1).

**불변식 6 — LIS 동률.** B0의 LIS는 전체 슬롯에 대한 patience 방식이다: 새 목록 순서로 각 슬롯에 대해 `tails`에서 oldIndex가 자기보다 작지 않은 첫 위치 `low`를 이분 탐색으로 찾고, `predecessors[x] = tails[low-1]`, `tails[low] = x`. 끝나면 `tails`의 마지막부터 역추적한다.

- 앞 구간: oldIndex가 0..p-1로 증가하므로 `tails = [0, …, p-1]`.
- 중간: 중간의 모든 oldIndex는 p 이상이다. `tails`의 앞 p칸은 중간 원소보다 항상 작으므로 교체되지 않고, 이분 탐색의 결과는 `p + low'`이다. 여기서 `low'`는 **중간만으로 실행했을 때**의 결과다(`tails`가 oldIndex 순으로 정렬돼 있어 "첫 위치"는 탐색 경로와 무관하게 하나로 정해진다). 귀납적으로 `tails[p..]`는 중간 전용 실행의 `tails`와 같고, predecessor도 같다. 단 `low' = 0`인 원소의 predecessor만 "없음" 대신 앞 구간의 마지막 원소가 된다.
- 뒤 구간: oldIndex가 그때까지의 모든 값보다 크므로 매번 `tails` 끝에 붙고 predecessor는 직전의 마지막 tail이다.
- 역추적: 뒤 구간 전체 → 중간 실행의 마지막 tail → 중간 전용 실행과 같은 predecessor 사슬 → 앞 구간 전체.

따라서 전체 실행이 고르는 집합은 `앞 구간 ∪ (중간 전용 실행이 고르는 집합) ∪ 뒤 구간`이고, 최적해가 여러 개일 때 고르는 원소까지 같다. C1의 `increasingPositions(slots, p, m-s)`는 순회 방향·이분 탐색·역추적을 B0와 같게 두고 범위만 받는다.

**불변식 7 — LIS 실행 여부.** `usedLIS = (strategy = lis) ∧ ¬monotonic`. 앞뒤 구간은 단조성을 깨지 못하므로 전체의 monotonic은 중간의 monotonic과 같다. B0도 순서가 단조이면 LIS를 호출하지 않았다. **C1이 "원래 하던 LIS 계산을 없앤" 경우는 없다.** 재배치가 있을 때 LIS 입력이 m에서 M으로 줄 뿐이다.

**fallback.** 별도의 fallback 분기가 없다. p = s = 0이면 5~8이 전체 목록에 대해 실행되어 일반 경로가 된다. keyed가 아닌 목록(`missing-key`, `mixed-node-kinds`)과 중복 key는 1·2에서 B0와 같은 순서·메시지로 끝난다.

**하위 Diff.** 앞뒤 구간의 노드도 `reconcile.ts`가 슬롯 순서(새 목록 순서)대로 `reconcileNode`를 호출한다. key가 같다는 이유로 속성·자식 Diff를 건너뛰지 않는다.

**전제.** 이전 view의 ref는 유일하다(커밋된 view는 사전 검증이 보장한다). B0는 재사용 여부를 ref 집합으로 기록했고 C1은 index로 기록하므로, ref가 중복된 잘못된 view에서만 둘이 달라질 수 있다.

## 5. 비용: 줄어든 것과 남는 것

한 번의 keyed 형제 목록 계획에서(코드에서 읽은 구조. 실측 횟수는 §7.1):

| 작업 | B0 | C1 |
|---|---|---|
| eligibility: 2N 임시 배열 2개, 순회 2회 | 있음 | **그대로** |
| key 검사: `Set` 2개, has n+m, add n+m, 이전 vnode 배열 | 있음 | **그대로** |
| 매칭 Map | n개 항목 + 항목마다 `[key, 값]` 배열과 `{node, index}` 레코드 | 중간 이전 노드 수만큼, 값은 숫자. 중간이 한쪽이라도 비면 Map 없음 |
| Map 조회 | m | 중간 새 노드 수 |
| `compatible()` | key가 맞은 슬롯마다 1 | 같음 + 경계에서 최대 2회 추가(key는 같은데 호환되지 않는 경계 노드) |
| 재사용 ref `Set` | 매칭 수만큼 add, n회 has | 없음. 제거가 있을 때만 `Uint8Array(중간 이전 크기)` |
| 슬롯 레코드 m개 + 배열 | 있음 | **그대로** |
| Greedy stable `Set` | 매칭 수만큼 add | 없음(플래그와 최대값만) |
| LIS(재배치 시) | 입력 m, predecessor 배열 m | 입력 M, predecessor 배열 M |
| 결과 배열 | `filter`+`map` 3쌍(임시 배열 6개, 콜백 2m+n회) | 배열 3개에 직접 push |
| `stableNewIndices` | 매 계획 생성 | 읽을 때만 생성(엔진 경로에서는 생성 안 함) |

- **M = 0이어도 O(N)이다.** eligibility, key 검사, 경계 비교, 슬롯 N개 생성은 남는다. 줄어드는 것은 상수 배수와 임시 객체 수다.
- 전체 공간복잡도는 O(N) 그대로다. 줄어드는 것은 **임시 Map/Set의 크기**(N → M 또는 0)다.
- 임시 객체 수가 줄었다는 사실을 GC 시간이나 heap 바이트 감소로 바꿔 말하지 않는다. 측정하지 않았다.
- 구간 분할과 무관한 구현 차이도 있다(Map 값이 레코드에서 숫자로, `filter/map`에서 push로, stable 집합 지연). p = s = 0인 불리한 입력에서 보이는 차이는 구간 분할이 아니라 이 차이에서 온다. §7에서 따로 적는다.
- 자식이 없는 element의 자식 목록(크기 0)도 keyed 목록으로 분류되어 planner를 거친다. 이 경우 C1은 Map·Set 생성 없이 끝난다.

## 6. 검증: 증명 외에 세 가지 수단

**A. B0 대 C1 차등.** `tests/fixtures/keyed-baseline.ts`는 `ab5a9b8:src/core/keyed.ts`의 planner를 고정한 사본이다(import 경로·이름만 다름). 후보는 `research/keyed-boundaries/keyed.candidate.ts`(`e382bd7:src/core/keyed.ts`와 같은 코드)다. 계획의 모든 필드를 비교한다: 슬롯(index, `previous`·`vnode`의 객체 동일성), stable 구성원, 이동·삽입·제거, `usedLIS`, 실패 진단. 통합 수준에서는 엔진 모듈을 한 번 더 불러 keyed planner만 후보로 바꾸고(`vi.doMock`), 같은 입력의 **계획 전체**(명령 순서, anchor, ref, `ReconcileDecision`, nextView)가 기본 엔진과 깊은 비교로 같은지 본다. 판정이 연구용 보존이 된 뒤에는 같은 테스트가 기본 planner와 후보를 **둘 다** 검사한다.

**B. 독립 모델.** `tests/fixtures/keyed-model.ts`의 배열 executor로 최종 순서를 실행한다. 정답은 계획의 `slots`/stable에서 읽지 않는다.
- 매칭 정답: key·tag·renderedRootKey·boundary(type, key)를 직접 비교하는 `sameModelIdentity`(엔진의 `compatible()`/`equalData()`를 쓰지 않음). 이번에 컴포넌트 boundary 의미를 모델에 추가했다.
- Greedy 정답: "새 목록에서 자기보다 앞에 놓인 재사용 노드 중 이전 위치가 더 뒤인 것이 있으면 이동"이라는 선언적 정의.
- LIS 정답: 유지된 노드가 이전 순서로 증가하고, 그 개수가 2중 반복 점화식으로 구한 최장 증가 부분열 길이와 같다. 기존 T-L02의 BFS 최단 이동 oracle(n ≤ 7)은 그대로 통과한다.
- 통합 수준: 한 목록의 `REMOVE_SUBTREE`/`PLACE_BEFORE`를 ref 배열에 순서대로 실행한 결과가 nextView와 같아야 한다(anchor가 그 시점에 배치돼 있는지 포함). 커밋 뒤 DOM 순서, 호환 행의 DOM identity, 경계 행의 텍스트·속성·최신 handler 갱신, uncontrolled 입력값을 확인한다.

**C. 반례 탐색과 축소.** seed 20261110. 새 생성 검사는 planner 1,700쌍 + 통합 300쌍 = 2,000쌍이다. 실패하면 원본·seed·명령·차이를 `.validation/keyed-boundaries-failure.json`에 저장하고, 축소기가 "항목 하나 제거 / 항목 하나 단순화"를 실패가 유지되는 동안 반복한다(상한 300회 평가 또는 30초). 후보에서는 실패가 없었으므로, 일부러 틀린 planner로 탐지와 축소가 동작하는지 확인했다(34회 평가로 축소).

| 검사 | 수 | 결과 |
|---|---|---|
| 필수 경계 입력(빈 목록, 전체 동일, 전부 삽입·삭제, 앞·중간·뒤 삽입/삭제, 교체 혼합, 역순, 마지막→처음, type·boundary 변경, 구간을 가로지르는 중복 key, LIS 최적해 여럿) | 40 × 전략 2 | 통과 |
| key 검사·eligibility의 범위와 우선순위(빈 key, 중복, keyless, text 노드) | 7 × 전략 2 | B0와 진단 동일 |
| 4개 key의 모든 부분 순열 쌍 × 앞(없음/동일/tag 변경) × 뒤(없음/동일/owner 변경) | 38,025 × 2 | 통과 |
| 0~6개 key의 모든 순열을 2개짜리 앞뒤 구간 사이에 | 874 × 2 | 통과 |
| 생성 쌍(중복 key 89쌍 포함) | 1,700 × 2 | 통과 |
| 전체 Diff 차등 + DOM: 시나리오 19 × 전략 2, 생성 300 × 전략 2 | 638 | 통과 |
| 기존 T-L01~L04, T-K 계열(46,233 순열, BFS 5,913 상태, 4,225 쌍, seed 10,000쌍) | 그대로 | 통과 |

**의도적 변이 4개**(`scripts/keyed-boundary-mutations.mjs`, 결과 `docs/validation/followup-keyed-boundaries/mutations.json`):

| 변이 | 실패한 테스트 |
|---|---|
| M1 뒤 구간이 Greedy maximum을 먼저 올림 | 15/75 |
| M2 앞 일치 구간의 key를 중복 검사에서 제외 | 5/75 |
| M3 중간 Map에 중간 기준 index 저장(offset 오류) | 28/75 |
| M4 LIS를 오른쪽에서 왼쪽으로(동률에서 다른 최적해) | 20/75 |

위 수치는 후보를 research 파일로 옮긴 최종 구조에서 다시 실행한 결과다. 후보가 기본 소스였던 `e382bd7` 시점의 첫 실행에서도 네 변이가 모두 검출됐고(17/3/34/17, 77개 중), 그때 같은 테스트를 B0 planner 파일로 실행하면 모두 통과했다. 최종 구조에서는 같은 테스트가 기본 planner(B0)도 함께 검사하며 통과한다. 즉 이 테스트들은 새 동작이 아니라 **B0에서 이미 성립하던 동작**을 적은 것이다.

**브라우저 의미 사례.** `P A B C D Q → P B A D C Q`는 어느 전략이든 2번 이동하지만 대상이 다르다. LIS는 B·D를 옮기고 A·C를 둔다. Greedy는 A·C를 옮기고 B·D를 둔다. A행의 입력이 조합 중일 때:

- LIS: A는 이동 대상이 아니다 → 계획이 조합 중에 커밋되고(B·D만 이동, MutationObserver로 확인) A의 controlled 값만 `heldForms`에 보류된다(개별 폼 보류).
- Greedy: A가 이동 대상이다 → 계획 전체가 `deferred`(전체 계획 보류)가 되고 DOM·Hooks·Effect가 그대로다.
- 두 경우 모두 조합이 끝나면 **조합 중에 바뀐 최신 State**로 순서·텍스트·입력값이 맞춰지고 DOM identity가 유지된다.

M4처럼 동률 선택이 바뀌면 LIS에서도 A가 이동 대상이 되어 "커밋"이 "보류"로 바뀐다. 이동 횟수만 비교해서는 보이지 않는 차이다. jsdom 통합 테스트 11개를 기본 엔진과 후보 엔진 각각에서 실행하고(22개), Chromium·Firefox 테스트 1개(`browser-state.spec.ts`)가 기본 엔진의 동작을 고정한다. 이 브라우저 테스트는 후보가 기본 소스였던 `e382bd7` 상태에서도, B0 planner에서도 두 브라우저에서 통과했다. 조합 이벤트는 합성 이벤트다. 실제 한글 IME로는 확인하지 않았다.

## 7. S3 — 좁은 성능 검증

계획은 측정 전에 [plan.md](validation/followup-keyed-boundaries/plan.md)에 고정했다. 묶음은 한 번 실행했고 재실행·조건 변경은 없다. 비교는 B0 `ab5a9b8` 대 C1 `e382bd7`, 같은 A2 앱, LIS 전략이다. 두 커밋 사이에 `src`에서 달라진 파일은 `src/core/keyed.ts` 하나다.

### 7.1 작업량 (planner 1회, prototype 계측으로 센 값)

원자료: [counts.json](bench/followup-keyed-boundaries-counts/counts.json). `tests/unit/keyed-boundary-counts.test.ts`가 후보의 값을 단언으로 고정한다. 100개 기준(10개·1,000개는 같은 식으로 비례):

| 입력 | p / s / M | Map.set B0→C1 | Map.get B0→C1 | Set.add B0→C1 | Set.has B0→C1 | compatible | LIS 입력 B0→C1 |
|---|---|---:|---:|---:|---:|---:|---:|
| same(한 행 내용만 변경) | 100 / 0 / 0 | 100→0 | 100→0 | 400→200 | 400→200 | 100→100 | 호출 없음 |
| append(끝 추가) | 100 / 0 / 새 1 | 100→0 | 101→0 | 401→201 | 401→201 | 100→100 | 호출 없음 |
| remove-last(끝 삭제) | 99 / 0 / 이전 1 | 100→0 | 99→0 | 397→199 | 398→199 | 99→99 | 호출 없음 |
| insert-middle(가운데 삽입) | 50 / 50 / 새 1 | 100→0 | 101→0 | 401→201 | 401→201 | 100→100 | 호출 없음 |
| reverse | 0 / 0 / 100 | 100→100 | 100→100 | 302→201 | 400→300 | 100→100 | 100→100 |
| shuffle(seed 539365639) | 0 / 0 / 100 | 100→100 | 100→100 | 322→216 | 400→300 | 100→100 | 100→100 |
| last-to-first | 0 / 0 / 100 | 100→100 | 100→100 | 400→299 | 400→300 | 100→100 | 100→100 |

- 이득 입력에서 Map 연산이 없어지고, 남는 Set 연산 2N은 줄일 수 없는 전체 key 검사분이다.
- 이득 입력에서는 B0도 LIS를 호출하지 않았다. 줄어든 것은 LIS가 아니라 Map·Set·임시 배열이다.
- 불리한 입력에서 Map 항목 수와 LIS 입력 길이는 같다. Set 연산이 줄어든 것은 구간 분할이 아니라 구현 차이(재사용 ref Set, Greedy stable Set, stable 집합 지연) 때문이다.
- 코드에서 유도한 값(계측 아님): B0는 Map 항목마다 `[key, 값]` 배열 1개와 레코드 1개를 만들고 결과용 임시 배열 6개를 만든다. C1은 이 둘을 만들지 않는다. 슬롯 레코드 N개와 key 검사용 Set 2개·eligibility 배열은 양쪽 모두 만든다.
- 임시 객체 수가 줄었다는 것이지 GC 시간이나 heap 바이트가 줄었다는 측정은 아니다.

실제 TaskApp counts realm(같은 러너, 100개): 방문 노드·재사용 subtree·생성·삭제·삽입·이동·생략 host 호출 수가 B0와 C1에서 **모든 조건·세션에서 같다**([comparison.json](bench/followup-keyed-boundaries-task/comparison.json)). 예: `counter` 방문 146·재사용 101, `crud`의 추가 단계 생성 10·삽입 1, `sort` 이동 83.

### 7.2 planner 시간 (Node v24.22.2, production 번들)

원자료: [planner 실행](bench/followup-keyed-boundaries-planner/environment.json). N=100, 한 표본 = 200회 연속 호출, 입력마다 warm-up 10쌍 + 측정 60쌍, 쌍 안 순서 교대, 독립 프로세스 3회. 값은 1회 환산 median(µs), 세션 1/2/3 순서다. 벽시계 기준이다.

| 입력 | B0 | C1 | median 비 (C1/B0) | p95 비 |
|---|---|---|---|---|
| same | 84.0 / 76.6 / 88.6 | 66.2 / 60.8 / 63.7 | 0.787 / 0.794 / 0.719 | 0.712 / 0.796 / 0.729 |
| append | 79.6 / 104.0 / 82.8 | 64.4 / 86.4 / 58.0 | 0.810 / 0.832 / 0.701 | 0.917 / 0.869 / 0.691 |
| remove-last | 78.2 / 105.8 / 80.3 | 61.5 / 87.1 / 63.5 | 0.787 / 0.823 / 0.790 | 0.570 / 0.854 / 0.762 |
| insert-middle | 76.3 / 75.3 / 87.4 | 60.3 / 60.3 / 70.9 | 0.791 / 0.800 / 0.811 | 0.870 / 0.971 / 0.869 |
| reverse | 77.2 / 74.8 / 78.0 | 72.0 / 68.9 / 72.0 | 0.933 / 0.920 / 0.923 | 1.009 / 1.001 / 0.907 |
| shuffle | 82.5 / 78.1 / 87.4 | 76.3 / 71.9 / 74.6 | 0.924 / 0.920 / 0.853 | 1.054 / 0.904 / 0.923 |
| last-to-first | 97.1 / 81.2 / 91.6 | 91.8 / 75.1 / 76.8 | 0.946 / 0.925 / 0.838 | 0.919 / 0.950 / 0.820 |

- median은 21개 비교 모두에서 C1이 작다. 이득 입력은 호출당 약 15~25 µs(−17~−30%), 불리한 입력은 약 5~15 µs(−5~−16%) 감소다.
- p95는 3개 비교에서 C1이 컸다(reverse 세션 1 +0.9%, 세션 2 +0.1%, shuffle 세션 1 +5.4%).
- 같은 planner의 세션 간 차이가 크다(예: B0 append 79.6 / 104.0 / 82.8). 절대값보다 쌍 안의 비를 본다.
- planner 한 번은 약 60~100 µs다. 그 대부분은 줄이지 않은 부분(eligibility, key 검사, `compatible()`의 identity 깊은 비교, 슬롯 생성)이다.

### 7.3 실제 TaskApp 전체 작업 (Chromium, 100개, persistent, 3세션, warm-up 10 + 60)

원자료: [B0→C1](bench/followup-keyed-boundaries-task/environment.json), [A/A](bench/followup-keyed-boundaries-aa/environment.json). `totalCpuMs`는 벽시계 구간의 합이며 CPU 사용률이나 paint 완료 시간이 아니다. Chromium의 `performance.now()` 해상도는 0.1 ms다. `diffMs`는 그 안에 포함된 구간이므로 더하지 않고 따로 적는다. 반올림 전 `C1 − B0`이다.

| 조건 | 세션 | total median B0→C1 | 차이 | total p95 B0→C1 | 차이 | 경고 | diff median B0→C1 |
|---|---:|---|---:|---|---:|---|---|
| crud/100 (이득 대표) | 1 | 21.100→23.200 | +2.100 (+10.0%) | 28.495→47.420 | +18.925 | **median, p95** | 4.300→4.400 |
| | 2 | 25.800→20.850 | −4.950 | 47.275→44.085 | −3.190 | | 4.750→4.000 |
| | 3 | 21.100→23.750 | +2.650 (+12.6%) | 33.030→35.470 | +2.440 | **median** | 4.300→4.450 |
| counter/100 (이득 대표) | 1 | 3.300→4.800 | +1.500 (+45.5%) | 4.100→11.115 | +7.015 | **median, p95** | 0.800→1.000 |
| | 2 | 3.400→3.100 | −0.300 | 4.000→4.710 | +0.710 | | 0.800→0.800 |
| | 3 | 4.000→3.350 | −0.650 | 7.605→4.300 | −3.305 | | 0.900→0.800 |
| sort/100 (불리) | 1 | 12.750→13.300 | +0.550 | 20.240→17.820 | −2.420 | | 1.450→1.500 |
| | 2 | 13.300→13.450 | +0.150 | 25.765→24.345 | −1.420 | | 1.600→1.350 |
| | 3 | 12.600→12.450 | −0.150 | 16.415→16.010 | −0.405 | | 1.250→1.300 |

A/A (같은 B0 소스를 두 이름으로 빌드, crud/100, 한 차례):

| 세션 | total median x→y | 차이 | total p95 x→y | 차이 | 경고 |
|---:|---|---:|---|---:|---|
| 1 | 20.650→21.250 | +0.600 | 31.120→36.240 | +5.120 | p95 |
| 2 | 19.500→21.100 | +1.600 | 27.510→30.610 | +3.100 | median, p95 |
| 3 | 19.400→19.600 | +0.200 | 26.620→26.120 | −0.500 | |

경고 기준(엔진 비교, 경고 지표로만 사용): median 증가 > max(기준 × 5%, 1 ms), p95 증가 > max(기준 × 10%, 2 ms).

읽는 법과 한계:

- **전체 작업 시간의 개선은 보이지 않았다.** planner 절감(호출당 약 0.02 ms)은 timer 해상도 0.1 ms보다 작고 한 flush(counter 약 3 ms, crud 한 단계 약 21 ms)의 1% 안팎이다.
- **불리한 결과로 적는다(사전 규칙):** `crud/100`은 3세션 중 2세션에서 C1의 median이 경고 폭을 넘게 컸고, `counter/100`은 1세션에서 넘었다. 가장 나쁜 p95는 crud 세션 1의 +18.9 ms다.
- 이 차이는 A/A에서 본 폭(median +0.2~+1.6 ms)보다 크다(+2.1, −4.95, +2.65). 그래서 "측정 변동 안"이라고 쓰지 않는다.
- 동시에 이 차이를 planner 변경의 탓으로 돌릴 근거도 없다. 느렸던 두 crud 세션에서는 코드가 같은 구간이 함께 느렸다(세션 1: render 3.70→4.00, commit 7.00→7.70, 후속 5.80→6.25, diff 4.30→4.40. 세션 3도 같은 모양). 세션 2는 반대로 B0가 모든 구간에서 느렸다. 세 crud 세션 모두 **나중에 측정된 빌드가 느렸다**. 같은 코드의 A/A도 경고 기준을 넘었다. 작업량은 두 빌드가 같거나 C1이 적다.
- 같은 B0 코드의 crud median은 이번 실행 전체에서 19.4~25.8 ms로 흩어졌다(9개 세션 값). C1의 세 값(20.85, 23.2, 23.75)은 이 범위 안이지만, 그중 둘은 B0 값 9개 중 8개보다 크다. 표본이 3세션이어서 어느 쪽으로도 확정할 수 없다.
- `sort/100`(불리한 입력)에는 경고가 없고 median 차이는 −0.15~+0.55 ms다.
- 측정 중 사용자의 Chrome 등 다른 앱이 실행 중이었다(종료하지 않았다). 그것이 원인이라고 확정하지 않는다.
- 측정하지 않은 것: 10개·1,000개의 시간, fresh, Greedy 전략의 시간, heap·GC, Firefox, keyed 전용 하네스.

## 8. 판정

| 근거 | 결과 |
|---|---|
| 정확성·관측 동작 보존 | 충족. 논증(§4) + B0 차등 + 독립 모델 + 변이 4개 검출 + IME 사례(jsdom, Chromium·Firefox 합성 이벤트) |
| 작업량·임시 할당 | 목표 입력에서 결정적으로 감소(Map 0, Set 절반, 임시 배열·레코드 감소). 불리한 입력에서 증가 없음(경계 비교 2회 추가) |
| planner 시간 | median 21/21 감소. 이득 입력 −17~−30%, 불리한 입력 −5~−16%. p95는 3/21에서 +0.1~+5.4% |
| 전체 작업 median·p95 | **이득 미입증.** crud 2/3 세션·counter 1/3 세션에서 경고 초과, A/A 폭 밖. 원인이 후보라는 근거도 없음 |
| 불리한 입력의 추가 비용 | sort/100 경고 없음. 구조적 악화 없음 |
| 복잡성·유지 비용 | `keyed.ts` 76줄 → 147줄(세 구간, 지연 getter). 논증 문서와 테스트가 필요 |

**판정: B — 연구용 보존.**

- 사전 기준은 "전체 작업의 변화가 timer 해상도와 A/A 폭 안에 머물면 '작업량 최적화, 속도 이득 미입증'으로 채택 가능"이었다. 실제 차이는 A/A 폭 밖이었고, 같은 조건(crud/100)의 여러 세션에서 median 악화가 반복됐다. 이 경우 A/A를 이유로 무시하지 않고 적용 범위를 좁히거나 연구용으로 보존한다는 규칙을 그대로 적용했다. 결과를 본 뒤 기준을 완화하지 않았다.
- 이 판정은 "후보가 느리다"는 결론이 아니다. 전체 작업 수준의 효과가 이번 측정의 변동보다 작아서 **어느 쪽으로도 입증되지 않았다**는 뜻이다. 애매한 상태로 끝낸다.
- 기본 소스: `src/core/keyed.ts`는 B0(`ab5a9b8`)와 같다. S1의 정확성 수정과 A2/E9/복원 패치 정책은 유지한다.
- 보존: 후보 코드 `research/keyed-boundaries/keyed.candidate.ts`, 적용용 `candidate.patch`, 후보 커밋 `e382bd7`, 계약 테스트(기본 planner와 후보를 함께 검사), 변이 스크립트, counts·planner·TaskApp·A/A 원자료.
- 이 판정은 과거 ④ 채택을 취소하거나 과거 미측정 항목을 통과 처리하는 근거가 아니다. 실제 React와의 비교도 아니다.

## 9. 남은 미검증·한계

- 전체 작업 시간에서 후보의 효과(이득이든 악화든)는 확인되지 않았다. 프로세스 단위 변동을 없앤 비교(한 페이지 안에서 같은 입력에 두 planner의 `diff()`를 교대로 실행)가 없다.
- 1,000개에서의 시간은 재지 않았다(작업량만 확인). 10,000개는 금지 범위다.
- 실제 한글 IME, 원격 CI, 팀 활동은 이번에 확인하지 않았다.
- S1: 손으로 만든 VNode/명령의 대문자 속성 이름은 `validateTree`와 명령 계약 모두에서 걸러지지 않는다(§2.2). 제거 명령(`REMOVE_ATTR`/`REMOVE_STYLE`, `SET_EVENT null`)은 payload가 없어 판정하지 않는다. 외부에서 바뀐 속성값은 감시하지 않는다.
- S1의 명령 검사는 `SET_*` 명령마다 규칙 검사 1회를 추가한다. 이 비용의 시간은 따로 재지 않았다(B0와 C1 양쪽에 똑같이 들어 있어 §7의 비교에는 영향이 없다).
- 자식 없는 element의 크기 0 목록도 planner를 거친다는 점(§5)은 관찰만 했고 바꾸지 않았다.
- Dirty 인덱스, 범용 Patch Fast Path, eligibility·key 검사·`compatible()` 비용은 이번 범위가 아니다.

## 10. 사용 시간과 재현

| 항목 | 사용 | 상한 |
|---|---|---|
| 전체 작업(10:35 시작) | 약 70분 | 180분 |
| 성능 실험 실행(counts 1초, planner 50초, 빌드 3초, TaskApp 114초, A/A 91초) | 약 4분 20초 | 15분 |
| 새 생성·차등 탐색 실행(계약 테스트 반복 실행과 변이 묶음 2회) | 약 2분(각 실행 1~5초, 변이 묶음 약 15~20초) | 5분 |

```sh
# 계약·차등·모델·counts (기본 planner와 후보)
pnpm exec vitest run tests/unit/keyed-boundaries.test.ts tests/unit/keyed-boundary-counts.test.ts tests/integration/keyed-boundaries.test.ts
# S1 회귀
pnpm exec vitest run tests/integration/memo-placeholder.test.ts tests/integration/plan-command-contract.test.ts
# 변이 4개 (후보 파일을 잠시 바꾸고 복원한다)
node scripts/keyed-boundary-mutations.mjs
# 측정(새 tag 필요, 다른 테스트·빌드와 겹치지 않게)
node scripts/bench-keyed-planner.mjs --tag=<new> --b0=ab5a9b8 --c1=e382bd7
node scripts/analyze-keyed-boundaries.mjs docs/bench/followup-keyed-boundaries-task kb-b0-a2 kb-c1-a2
# 후보를 기본으로 적용해 보려면
git apply research/keyed-boundaries/candidate.patch
```

실패 반례가 생기면 `.validation/keyed-boundaries-failure.json`에 원본·축소본·seed·명령·차이가 저장된다. 이번 회차에서 후보의 실패 반례는 없었다.
