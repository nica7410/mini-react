# 속성 맵 표현 후보(R1) — 측정 전 계획

2026-11-10 KST. 이 문서는 후보·테스트·하네스와 같은 커밋에 넣고, 그 커밋 **뒤에** 정식 측정을 한다. 아래 기준은 Chromium 쌍 비교 표본을 한 개도 보지 않은 상태에서 고정했다.

## 왜 이 지점인가

[검증 이름 검사 V1 채택](../../followup-validate-names.md) 뒤에도 `diff()` 시간의 대부분은 두 번의 `validateTree`다. 그 안에서 `Object.keys(attrs)`가 요소마다 한 번 호출되는데, 엔진이 만드는 속성 맵은 `Object.create(null)`이고 V8은 이런 객체를 항상 사전(dictionary) 방식으로 둔다. Node 24에서 잰 탐색 수치(판정 자료 아님, TaskApp과 비슷한 모양의 속성 맵 728개):

| 만드는 방법 | 생성 (ns/개) | `Object.keys` + 값 읽기 (ns/개) | V8 fast 속성 | prototype |
|---|---:|---:|---|---|
| `Object.create(null)` + 대입 (현재) | 397 | 131 | 0/728 | null |
| 빈 동결 prototype을 가진 생성자 + 대입 | 102 | 31 | 728/728 | 빈 동결 객체 |
| 위와 같이 만든 뒤 `setPrototypeOf(null)` (**R1**) | 297 | 29 | 728/728 | null |
| `{}` + `defineProperty` + `setPrototypeOf(null)` | 839 | 30 | 728/728 | null |

R1은 관찰 가능한 모습이 현재와 같으면서(null prototype, 같은 own 키와 순서) 순회가 약 4배 빠르고 생성도 느려지지 않는 유일한 선택지였다. 두 번째 줄은 생성이 가장 빠르지만 prototype이 null이 아니게 되어 관찰 가능한 차이가 생기므로 택하지 않았다.

## 후보 R1

- `research/attr-maps/attrMap.ts`: `createAttrMap()`은 "prototype이 없는 빈 동결 객체"만을 prototype으로 가진 객체를 만든다. 그 객체에 대입하면 항상 own 데이터 속성이 생기고 `Object.prototype`은 조회되지 않는다. `finishAttrMap()`이 prototype을 null로 바꾼다.
- `research/attr-maps/resolve.candidate.ts`, `capture.candidate.ts`: 각각 `src/runtime/resolve.ts`, `src/core/capture.ts`에서 속성 맵을 만드는 한 줄을 위 두 함수 호출로 바꾼 사본이다. 엔진이 속성 맵을 만드는 곳은 이 두 곳뿐이다.

바뀌지 않는 것: 완성된 맵의 prototype(null), own 키·순서·값·속성 서술자(동결 후), `__proto__`·`constructor` 같은 이름의 처리, 오염되거나 잠긴 `Object.prototype`에 대한 무관함, 검증 정책(E1), Diff·Patch 코드. 바뀌는 것은 V8 내부 표현뿐이다. 사용자 코드가 넘긴 값의 `String()` 변환은 구성 중에 실행되지만 그 코드는 구성 중인 맵에 접근할 수 없다.

## 측정 전에 통과할 검사

- `tests/unit/attr-maps.test.ts`: 기대값을 테스트 안에서 예전 알고리즘으로 따로 계산해 비교한다(기본 엔진과 후보 모두).
  - resolver: 일반 이름, `__proto__`(JSON으로 만든 own 속성), `Object.prototype` 멤버 이름, 대소문자 충돌, boolean·null·undefined·숫자 값, 빈 맵, 속성 24개, 구두점 이름. prototype·own 키 순서·서술자·동결·`in`·`for-in`·상속 부재.
  - 기본 resolver와 노드 단위로 같은 트리, 같은 JSON.
  - `Object.prototype`에 accessor와 쓰기 금지 값을 심어도 읽기·쓰기가 한 번도 일어나지 않음.
  - `__proto__`·`constructor` 속성이 DOM까지 가고 Diff·commit으로 다시 제거됨.
  - DOM에서 읽은 맵(`readDOM`)도 같은 조건.
- 변이 4개(`scripts/attr-map-mutations.mjs`)가 모두 검출될 것.
- typecheck, 하네스 사전 검증(`run.mjs --verify`): 세 arm의 트리·전체 계획이 같고, 모든 속성 맵이 null prototype·동결이며 재사용 수가 기대값과 같다. 빌드는 후보 arm에 교체 대상 모듈이 없고 나머지 모듈이 같은지 단언한다.

## 측정

표현이 바뀌는 대상이 데이터라서, 기존 하네스처럼 한 페이지에서 `diff()` 함수만 바꿔 끼울 수 없다. 같은 페이지 코드(`src/bench/attr-map-arm.ts`)를 기본 소스와 후보 소스로 각각 빌드하고, 한 페이지의 같은 출처 iframe 세 개(B0, B0-repeat, R1)에 올린다. 한 스레드에서 번갈아 실행하되 각 arm은 자기 코드와 자기 VDOM 객체만 다룬다(실제 앱처럼 한 종류의 객체만 본다). 나머지는 기존 쌍 비교와 같다: 같은 A2 TaskApp 100행 VDOM과 seed, 짝수 표본은 B0 먼저, 라운드마다 새로고침, headless Chromium 한 프로세스, 모든 쌍 저장.

| 조건 | 재는 것 | batch |
|---|---|---:|
| A | `diff()` — 한 행 이름 변경 | 20회 |
| B | `diff()` — 인접 행 교환 | 20회 |
| C | `diff()` — 전체 역순 | 20회 |
| U | 한 행이 바뀐 재렌더링(Hook 평가 + resolve, 99행 memo 재사용) + `diff()` | 20회 |
| F | 이전 상태 없이 100행 전체를 새로 렌더링(Hook 평가 + resolve + 동결 + 검증) | 5회 |
| AA | 조건 A를 B0와 B0-repeat로 | 20회 |
| FF | 조건 F를 B0와 B0-repeat로 | 5회 |

조건마다 warm-up 10쌍 + 기록 240쌍, 3라운드(`A B C U F AA FF`, `B C U F A AA FF`, `C U F A B AA FF`). 누적 벽시계 상한 400초(예상 약 2분). 한 번만 실행한다. 결과를 보고 다시 측정하지 않는다. 첫 기록 표본 전에 실행 자체가 실패한 경우에만 새 태그로 한 번 다시 시작할 수 있고 그 사실을 기록한다. 측정 중 다른 테스트·빌드를 병행하지 않고, 사용자 앱을 종료하지 않으며, 10,000개 측정은 하지 않는다.

## 판정 규칙

`scripts/attr-map-paired/analyze.mjs`가 기계적으로 계산한다. 통계 정의는 이전 실험과 같다(쌍별 `(R1 − B0) / batch`, 선형 보간 분위수, 느린 표본 포함). 참고값은 대조군(A·B·C·U는 AA, F는 FF)의 전체 1개·라운드별 3개·순서별 2개 쌍별 median 절댓값의 최대다. 조건별 기준 크기 T = max(그 조건 B0 호출당 median의 1%, 대조군 참고값).

**채택**은 아래를 모두 만족할 때다.

1. 기본 규칙 (a)~(e)를 A·B·U 각각이 만족한다. [V1 계획](../followup-validate-names/plan.md)과 같은 규칙이다: (a) 전체 감소 > T, (b) 2개 이상 라운드 감소 > T, (c) 두 순서 집계 모두 median 음수이고 과반 감소, (d) T를 넘게 증가한 라운드 없음, (e) 두 순서 집계의 감소가 각각 대조군 순서별 median 절댓값의 최대보다 큼.
2. "뚜렷한 개선": A·B·C 각각에서 전체·3개 라운드 전부·두 순서 집계 전부의 감소가 B0 호출당 median의 10% 이상.
3. C에서 T를 넘게 증가한 라운드가 2개 미만.
4. 새 렌더링 F가 나빠지지 않는다: F의 전체 median 증가가 T 이하이고, T를 넘게 증가한 라운드가 2개 미만.

하나라도 못 미치면 **보류**다. **기각**은 정확성·계획 불일치가 발견될 때다. p95는 공개하지만 단독으로 판정에 쓰지 않는다. 과거 p95 게이트는 적용하지 않는다. 10%라는 값은 위 Node 탐색 수치를 본 뒤, Chromium 쌍 비교를 보기 전에 정했다.

## 채택 시 할 일과 주장 범위

- 채택: `src/core/attrMap.ts`를 추가하고 `resolve.ts`·`capture.ts`를 후보 내용으로 바꾼다. typecheck·전체 단위/통합·build·Chromium+Firefox 브라우저 suite를 각 1회, 변이 검사를 기본 소스에 다시 실행한다.
- 이 실험이 보이는 것은 100행 TaskApp의 `diff()`·재렌더링+`diff()`·새 렌더링 계산 비용이다(DOM commit 제외). TaskApp 전체 사용자 작업 시간, Patch·paint·GC, 다른 행 수, Firefox 성능은 주장하지 않는다.
- 테스트·벤치마크 명령의 실행은 별도 실행 전용 에이전트가 하고, 코드·문서·판정은 작성자가 한다.

## 실행 명령

```sh
node node_modules/typescript/bin/tsc --noEmit
node node_modules/vitest/vitest.mjs run tests/unit/attr-maps.test.ts
node scripts/attr-map-mutations.mjs --stage=candidate
node scripts/attr-map-paired/build.mjs
node scripts/attr-map-paired/run.mjs --verify
node scripts/attr-map-paired/run.mjs --tag=attr-map-paired-<unique>   # 한 번
node scripts/attr-map-paired/analyze.mjs docs/bench/attr-map-paired-<unique>
```
