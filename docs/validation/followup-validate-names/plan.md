# 검증 이름 검사 후보(V1)와 C1 재판정 — 측정 전 계획

2026-11-10 KST. 이 문서는 후보·테스트·하네스와 같은 커밋에 넣고, 그 커밋 **뒤에** 정식 측정을 한다. 아래 기준은 Chromium 쌍 비교 표본을 한 개도 보지 않은 상태에서 고정했다.

## 왜 이 지점인가

[같은 페이지 전체 Diff 비교](../../followup-keyed-paired-diff.md)는 C1(Keyed 앞뒤 구간 분리)을 보류로 끝냈다. 원인을 찾기 위해 같은 TaskApp 100행 VDOM으로 `diff()` 한 번의 시간을 나눠 보았다(Node 24, production 번들, 탐색용이며 판정 자료가 아니다).

| 구간 | 한 번 호출 (µs) | 비중 |
|---|---:|---:|
| `diff()` 전체 | 약 745~800 | 100% |
| `validateTree(base.snapshot)` | 약 325 | 약 42% |
| `validateTree(target)` | 약 330 | 약 43% |
| 100행 목록의 planner (B0) | 약 30 | 약 4% |
| 같은 목록의 planner (C1) | 약 20~28 | — |

- planner 전체가 `diff()`의 약 4%다. C1이 planner 비용을 전부 없애더라도 전체 Diff의 4%를 넘게 줄일 수 없고, 실제 절감(10~20 µs)은 기존 실행의 A/A 참고값(약 20 µs)과 같은 크기다. 측정을 더 정밀하게 해도 "뚜렷한 개선"이 될 수 없는 구조다.
- 시간의 약 85%는 E1 정책이 요구하는 두 번의 전체 root 검증이다. 그 안에서는 속성 이름 정규식 두 개와 배열 `includes`가 약 37%(약 126 µs)를 차지했다(해당 호출을 뺀 변형과의 차이).
- 속성 맵이 `Object.create(null)`이어서 `Object.keys(attrs)`가 호출당 약 100 ns로 느린 점도 확인했다(검증 한 번에 약 80 µs). 이것은 데이터 표현의 문제라 이번 후보에 넣지 않는다.

## 후보 V1

`research/validate-names/validate.candidate.ts` = `8ae389e`의 `src/core/validate.ts`에서 아래 세 곳만 바꾼 파일.

1. `attributeProblem`: 이름 정규식 `/^[a-z_][a-z0-9_.:-]*$/i`와 `/^on/i`를 UTF-16 code unit 순회 하나로, 이름 목록 두 개를 `Set`으로 바꾼다. srcset·URL 값 검사는 그대로다.
2. `eventNameProblem`: 정규식과 `startsWith('on')`을 code unit 순회 하나로 바꾼다.
3. `validateTree`: `currentValueAttrs.some(closure)`를 같은 순서의 `Object.hasOwn` 세 번으로 바꾼다.

바뀌지 않는 것(E1 정책): 매 호출 전체 root 순회, 호출 사이에 결과·이름·판정을 보관하지 않음, 메시지와 경로, 검사 순서. 추가되는 모듈 상수 `Set` 두 개는 기존 `htmlTags`와 같은 고정 표이며 실행 중에 바뀌지 않는다.

동등성 근거: u 플래그 없는 `/i`는 비ASCII code unit을 ASCII 문자와 같다고 보지 않고(ECMAScript Canonicalize), `$`는 m 플래그 없이 입력 끝에서만 일치한다. 따라서 두 정규식은 ASCII 범위 비교로 정확히 옮겨진다. 이것은 논증이고, 아래 검사가 실제 일치를 확인한다.

## 측정 전에 통과할 검사

- `tests/unit/validate-names.test.ts`: `8ae389e` 사본(`tests/fixtures/validate-baseline.ts`)과 비교한다.
  - 모든 UTF-16 code unit(65,536개)을 이름의 첫째·둘째·뒤 위치에 넣은 `attributeProblem`(8개 형태)과 `eventNameProblem`(6개 형태).
  - 특수 이름의 대소문자 변형 × URL·srcset 값, 고정 seed 20261110의 생성 이름 30,000개.
  - 생성 트리 2,000개의 `validateTree` 결과(성공 여부·메시지·경로·반환 객체 동일성). 수락·거절·규칙 종류가 충분히 섞였는지도 단언한다.
  - Proxy로 관찰한 `attrs` 접근 순서 동일, 호출 사이에 판정을 보관하지 않음.
- 변이 4개(`scripts/validate-name-mutations.mjs`)가 모두 검출될 것.
- typecheck, 그리고 하네스 사전 검증(`run.mjs --verify`): 두 번들에서 전체 `PatchPlan` 일치·입력 보존, 각 `diff()`가 자기 `validateTree`만 두 번 호출.

## 측정

`scripts/keyed-paired-diff`의 페이지 코드(`src/bench/keyed-paired-diff.ts`)와 진입 HTML을 **수정 없이** 재사용한다. 같은 A2 TaskApp 100행 VDOM, 같은 조건 A(한 행 이름 변경)·B(인접 행 교환)·C(역순)·A/A, 같은 batch(`diff()` 20회), 같은 교대 순서, 같은 라운드 순환(`A B C A/A`, `B C A A/A`, `C A B A/A`), 라운드마다 새로고침, headless Chromium 한 프로세스다. 상대 구현만 `scripts/paired-diff-variants/build.mjs`가 바꾼다(reconcile.ts의 import 한 줄).

기존 실행과 다른 점은 표본 수뿐이다: 조건마다 warm-up 10쌍 + 기록 **240쌍**(기존 60), A/A도 **240쌍**(기존 30). 이유: 기존 A/A 참고값 20 µs는 30~45쌍 부분집합의 중앙값에서 나왔고, 그 크기의 표본에서는 중앙값 자체의 흔들림이 10 µs 안팎이다. 판정 기준은 그대로 두고 표본만 늘린다. 누적 벽시계 상한은 240초다(예상 약 90초).

- **실험 V**: B0(현재 기본 소스) 대 V1. 한 번.
- **실험 P**: 실험 V의 판정을 적용한 뒤의 기본 소스 대 그 위의 C1 planner. 한 번.
- 결과를 보고 다시 측정하지 않는다. 첫 기록 표본 전에 실행 자체가 실패한 경우에만 새 태그로 한 번 다시 시작할 수 있고, 그 사실을 기록한다. 측정 중 다른 테스트·빌드를 병행하지 않고 사용자 앱을 종료하지 않는다. 10,000개 측정은 하지 않는다.

## 판정 규칙

분석 스크립트(`scripts/paired-diff-variants/analyze.mjs`)가 아래를 기계적으로 계산한다. 통계 정의는 기존 분석과 같다(쌍별 `(상대 − B0) / 20`, 선형 보간 분위수, 느린 표본 포함). A/A 참고값 = A/A의 전체 1개·라운드별 3개·순서별 2개 쌍별 median 절댓값의 최대. 조건별 기준 크기 T = max(그 조건 B0 호출당 median의 1%, A/A 참고값).

**기본 규칙(기존 계획과 동일, A와 B 각각):**

- (a) 전체 쌍별 median 감소가 T를 넘는다.
- (b) 3개 라운드 중 2개 이상에서 라운드 median 감소가 T를 넘는다.
- (c) B0 먼저·상대 먼저 두 집계 모두 median이 음수이고 과반 표본이 감소한다.
- (d) T를 넘게 증가한 라운드가 없다.
- (e) 두 순서 집계의 감소가 각각 A/A 순서별 median 절댓값의 최대보다 크다. 기존 계획의 "A/A에서 비슷한 방향·크기의 순서 효과가 있으면 보류"를 숫자로 옮긴 것이다.
- C에서 T를 넘게 증가한 라운드가 2개 이상이면 반복 악화로 보고 보류한다.

**V1 채택**에는 기본 규칙에 더해 "뚜렷한 개선" 기준이 필요하다: A·B·C 각각에서 전체·3개 라운드 전부·두 순서 집계 전부의 쌍별 median 감소가 그 조건 B0 호출당 median의 **10% 이상**. 하나라도 못 미치면 보류다. 10%라는 값은 위 Node 탐색 수치(검증 한 번 약 24% 감소 → 전체 Diff 약 20% 감소 예상)를 본 뒤에 정했다. Chromium 쌍 비교는 아직 한 번도 실행하지 않았다.

**C1 채택**은 실험 P에서 기본 규칙을 만족할 때다. 사전 예상: planner가 Diff의 4~5%뿐이므로 (a)나 (e)를 넘지 못할 가능성이 높다. 그 경우 C1은 보류로 두고, "planner만으로는 전체 Diff의 뚜렷한 개선이 구조적으로 불가능하다"는 것을 결론으로 기록한다.

**기각**은 정확성·계획 불일치가 발견될 때, 또는 T를 넘는 악화가 2개 이상 라운드에서 반복되고 두 순서 집계 모두 양수일 때다. p95는 공개하지만 단독으로 판정에 쓰지 않는다. 과거 p95 게이트는 적용하지 않는다.

## 채택 시 할 일과 주장 범위

- V1 채택: `src/core/validate.ts`를 후보 내용으로 바꾸고, typecheck·전체 단위/통합·build·Chromium+Firefox 브라우저 suite를 각 1회 실행한다. 변이 검사를 기본 소스에 다시 실행한다.
- C1 채택: `src/core/keyed.ts`를 후보 planner로 바꾸고 같은 검증을 한다.
- 이 실험이 보이는 것은 같은 페이지에서 잰 전체 `diff()` 비용이다. TaskApp 전체 사용자 작업 시간, Patch·paint·GC, 10개·1,000개 규모, Firefox 성능, React와의 비교는 주장하지 않는다.

## 실행 명령

```sh
node node_modules/typescript/bin/tsc --noEmit
node node_modules/vitest/vitest.mjs run tests/unit/validate-names.test.ts
node scripts/validate-name-mutations.mjs --source=research/validate-names/validate.candidate.ts
node scripts/paired-diff-variants/build.mjs --variant=validate
node scripts/paired-diff-variants/run.mjs --variant=validate --verify
node scripts/paired-diff-variants/run.mjs --variant=validate --tag=paired-diff-validate-<unique>   # 한 번
node scripts/paired-diff-variants/analyze.mjs docs/bench/paired-diff-validate-<unique>
# 실험 P: --variant=planner 로 같은 순서
```
