# 검증 이름 검사 V1 채택과 C1 재판정 (2026-11-10)

[같은 페이지 전체 Diff 비교](followup-keyed-paired-diff.md)가 C1(Keyed 앞뒤 구간 분리)을 보류로 끝낸 뒤, "뚜렷한 성능 개선"이 가능한 지점을 찾아 진행한 후속 작업이다. 판정 기준은 측정 전에 고정했다. [측정 전 계획](validation/followup-validate-names/plan.md)

## 결론

- **보류의 원인은 측정 정밀도가 아니라 구조였다.** planner는 `diff()` 한 번의 약 4%뿐이고, 약 85%는 두 번의 `validateTree`였다. planner만 바꿔서는 전체 Diff의 뚜렷한 개선이 나올 수 없다.
- **V1(검증 이름 검사)을 채택했다(`89dbc56`).** 속성·이벤트 이름 정규식을 같은 판정을 내는 code unit 순회로 바꿨다. 같은 페이지 쌍 비교에서 전체 `diff()`가 조건 A/B/C 모두 **약 19~20%**(호출당 125~130 µs) 줄었고, 3개 라운드와 두 실행 순서 전부에서 사전 기준(10% 이상, A/A 참고값 초과)을 넘었다.
- **C1은 다시 보류다.** V1을 적용한 기본 소스 위에서 표본을 4배로 늘려 다시 쟀다. 9개 라운드 중앙값이 모두 감소 방향(−5~−20 µs, 전체 1.0~2.9%)이었지만 기준 크기 20 µs를 넘지 못했다. 기본 planner는 B0 그대로다.
- 검증 정책(E1: 매 호출 전체 root 검증, 결과 미보관)은 바꾸지 않았다. 판정 메시지·경로·검사 순서도 같다.

## 1. 왜 planner로는 안 되는가

기존 비교와 같은 A2 TaskApp 100행 VDOM으로 `diff()` 한 번을 구간별로 쟀다. Node 24의 production 번들에서 잰 탐색용 수치이고 판정에는 쓰지 않았다.

| 구간 | 호출당 (µs) | 비중 |
|---|---:|---:|
| `diff()` 전체 | 약 745~800 | 100% |
| `validateTree(base.snapshot)` | 약 325 | 약 42% |
| `validateTree(target)` | 약 330 | 약 43% |
| 100행 목록의 planner (B0) | 약 30 | 약 4% |
| 같은 목록의 planner (C1) | 약 20~28 | — |

검증 한 번(약 340 µs) 안에서는 속성 순회가 약 215 µs였다. 그중 `attributeProblem` 호출(정규식 2개 + 배열 `includes` 2개)이 약 126 µs, null-prototype 속성 맵의 `Object.keys`가 약 80 µs다. 각 구간을 뺀 변형과의 차이로 구한 값이다.

## 2. 후보 V1

`src/core/validate.ts`에서 세 곳만 바꿨다.

| 위치 | 전 | 후 |
|---|---|---|
| `attributeProblem` | `/^[a-z_][a-z0-9_.:-]*$/i`, `/^on/i`, 배열 `includes` 2개 | UTF-16 code unit 순회 1회, 상수 `Set` 2개 |
| `eventNameProblem` | `/^[a-z][a-z0-9]*$/`, `startsWith('on')` | code unit 순회 1회 |
| `validateTree`의 폼 값 속성 검사 | `currentValueAttrs.some(closure)` | 같은 순서의 `Object.hasOwn` 3회 |

srcset·URL 값 검사, 스타일 검사, 폼·radio·select·key 규칙, 순회 순서, 오류 메시지와 경로는 그대로다. 호출 사이에 보관하는 값은 없다. 추가한 `Set` 두 개는 `htmlTags`처럼 실행 중에 바뀌지 않는 고정 표다.

같은 판정이라는 근거는 두 가지다.

- **논증.** u 플래그가 없는 `/i`는 비ASCII code unit을 ASCII 문자와 같게 보지 않고, `$`는 m 플래그 없이 입력 끝에서만 일치한다. 그래서 두 정규식은 ASCII 범위 비교로 그대로 옮겨진다.
- **검사.** `8ae389e`의 검증 파일 사본과 결과를 비교한다([동등성 테스트](../tests/unit/validate-names.test.ts), [기준 사본](../tests/fixtures/validate-baseline.ts)).
  - 모든 UTF-16 code unit 65,536개를 이름의 첫째·둘째·뒤 위치에 넣은 비교: 속성 8개 형태, 이벤트 6개 형태.
  - 특수 이름의 대소문자 변형 × URL·srcset 값, 고정 seed 20261110의 생성 이름 30,000개.
  - 생성 트리 2,000개의 `validateTree` 결과(성공 여부·메시지·경로·반환 객체). 수락 300개 초과, 거절 600개 초과, 규칙 종류 20개 이상이 섞였는지도 단언한다.
  - Proxy로 관찰한 `attrs` 접근 순서가 같고, 수락한 뒤 이름을 바꾸면 다음 호출이 다시 판정한다.
  - 변이 4개(첫 글자 제한 제거, `:` 누락, `on` 대소문자, 이벤트 첫 글자)를 모두 검출했다. [후보 파일 기준](validation/followup-validate-names/mutations-candidate.json) · [기본 소스 기준](validation/followup-validate-names/mutations.json)
  - 측정 번들에서 두 구현의 전체 `PatchPlan`이 A/B/C 모두 같았고, 각 `diff()`는 자기 `validateTree`만 두 번 호출했다. [사전 검증](bench/paired-diff-validate-20261110-32cb659/preflight.json)

## 3. 실험 V: B0 대 V1 → 채택

Codex 실행의 페이지 코드와 조건을 수정 없이 재사용했다. 다른 점은 표본 수뿐이다(조건마다 기록 240쌍 × 3라운드, A/A도 240쌍). 2026-11-10 17:20 KST, headless Chromium 151.0.7922.34 한 프로세스, 한 번 실행, 80.196초에 완료했다. 기록 2,880쌍과 warm-up 120쌍을 모두 저장했다. [원자료](bench/paired-diff-validate-20261110-32cb659/pairs.jsonl) · [통계와 판정](bench/paired-diff-validate-20261110-32cb659/summary.json) · [환경](bench/paired-diff-validate-20261110-32cb659/environment.json) · [빌드 해시](bench/paired-diff-validate-20261110-32cb659/build.json)

화살표는 B0 → V1이다. batch는 `diff()` 20회, 호출당 값은 batch를 20으로 나눈 환산값이다. 타이머 해상도가 0.1 ms라서 호출당 값은 5 µs 단위다.

| 조건 | 라운드 | batch 중앙값 (ms) | batch p95 (ms) | 호출당 중앙값 (µs) | 쌍별 차이 중앙값 (µs) | B0 대비 |
|---|---|---:|---:|---:|---:|---:|
| A | 전체 | 13.000 → 10.400 | 15.600 → 12.700 | 650.0 → 520.0 | −125.0 | −19.2% |
| A | 1 / 2 / 3 | | | | −130.0 / −135.0 / −120.0 | −19.7% / −20.6% / −18.8% |
| B | 전체 | 12.900 → 10.350 | 15.400 → 12.300 | 645.0 → 517.5 | −130.0 | −20.2% |
| B | 1 / 2 / 3 | | | | −130.0 / −130.0 / −125.0 | −20.0% / −19.9% / −19.5% |
| C | 전체 | 13.000 → 10.400 | 15.600 → 12.800 | 650.0 → 520.0 | −130.0 | −20.0% |
| C | 1 / 2 / 3 | | | | −125.0 / −130.0 / −130.0 | −19.5% / −20.0% / −20.0% |
| A/A | 전체 | 13.100 → 13.100 | 16.510 → 16.400 | 655.0 → 655.0 | 0.0 | — |
| A/A | 1 / 2 / 3 | | | | +5.0 / 0.0 / −5.0 | — |

| 조건 | 먼저 실행 | 쌍별 중앙값 (µs) | Q1 ~ Q3 (µs) | 감소 / 동일 / 증가 |
|---|---|---:|---:|---:|
| A | B0 | −150.0 | −180.0 ~ −123.7 | 357 / 0 / 3 |
| A | V1 | −105.0 | −135.0 ~ −80.0 | 352 / 1 / 7 |
| B | B0 | −150.0 | −180.0 ~ −125.0 | 357 / 0 / 3 |
| B | V1 | −110.0 | −130.0 ~ −85.0 | 357 / 0 / 3 |
| C | B0 | −150.0 | −180.0 ~ −125.0 | 355 / 0 / 5 |
| C | V1 | −105.0 | −135.0 ~ −85.0 | 352 / 0 / 8 |
| A/A | B0 | −25.0 | −55.0 ~ +5.0 | 260 / 7 / 93 |
| A/A | B0-repeat | +20.0 | 0.0 ~ +55.0 | 84 / 13 / 263 |

- A/A에서 보이듯 한 쌍 안에서 **뒤에 실행한 batch가 약 20~25 µs 빠른 순서 효과**가 있다. 같은 함수끼리도 나타나므로 구현 차이가 아니다. 순서를 번갈아 실행했기 때문에 전체 중앙값에서는 상쇄되고, 순서별 값(−150 / −105)의 차이로만 남는다.
- A/A 참고값은 25.0 µs, 기준 크기 T도 25.0 µs였다. V1의 감소는 가장 작은 집계(V1 먼저, −105 µs)에서도 T의 4배가 넘고 B0 대비 16% 이상이다.
- 사전 규칙 (a)~(e)와 "10% 이상" 기준을 A·B·C 모두 통과했다. C의 악화 라운드는 없다. **판정: 채택.**

## 4. 실험 P: V1 적용 뒤의 기본 소스 대 C1 → 보류

같은 프로토콜로 `89dbc56`에서 한 번 실행했다(17:24 KST, 70.013초, 기록 2,880쌍). 화살표는 B0(V1 적용 소스) → C1이다. [원자료](bench/paired-diff-planner-20261110-89dbc56/pairs.jsonl) · [통계와 판정](bench/paired-diff-planner-20261110-89dbc56/summary.json) · [환경](bench/paired-diff-planner-20261110-89dbc56/environment.json) · [사전 검증](bench/paired-diff-planner-20261110-89dbc56/preflight.json)

| 조건 | 호출당 중앙값 (µs) | batch p95 (ms) | 쌍별 차이 중앙값 (µs) | B0 대비 | 라운드 1 / 2 / 3 (µs) | B0 먼저 / C1 먼저 (µs) |
|---|---:|---:|---:|---:|---:|---:|
| A | 525.0 → 520.0 | 12.500 → 12.300 | −10.0 | −1.9% | −15.0 / −10.0 / −10.0 | −30.0 / +5.0 |
| B | 525.0 → 505.0 | 12.600 → 12.200 | −15.0 | −2.9% | −15.0 / −10.0 / −20.0 | −35.0 / +5.0 |
| C | 525.0 → 525.0 | 13.305 → 13.500 | −5.0 | −1.0% | −5.0 / −5.0 / −5.0 | −25.0 / +17.5 |
| A/A | 515.0 → 515.0 | 12.100 → 12.000 | 0.0 | — | 0.0 / 0.0 / 0.0 | −20.0 / +20.0 |

- 이 실행의 B0 호출당 중앙값 525 µs는 실험 V의 V1 값(520 µs)과 맞는다.
- C1은 9개 라운드 중앙값이 모두 감소 방향이었다. 다만 크기가 5~20 µs로, A/A의 순서 효과(±20 µs)와 기준 크기 T(20.0 µs)를 넘지 못했다. C1 먼저 집계의 중앙값은 세 조건 모두 양수였다(순서 효과를 빼면 A·B에서 약 10~15 µs, C에서 약 4 µs 감소와 맞는 값이다).
- 규칙 (a) 전체 초과, (b) 라운드 2개 이상 초과, (c) 두 순서 모두 음수, (e) A/A 순서 효과 초과를 A·B 모두 만족하지 못했다. 악화 라운드는 없다. **판정: 보류.**
- 해석: C1의 이득은 있어 보이지만 전체 Diff의 1~3%다. planner 비용 전체가 이득의 상한이고 그 비중이 작으므로(1절의 탐색 수치로 V1 적용 전 약 4%), 측정을 더 늘려도 "뚜렷한 개선"이 될 수 없다. C1은 연구용으로 둔다.

## 5. 검증

| 대상 | 결과 |
|---|---|
| `32cb659` (후보 + 기본 소스 B0) | typecheck 통과, 동등성 테스트 16/16(기본·후보 각 8개), 변이 4/4 검출, Chromium 사전 검증 통과 |
| `89dbc56` (V1 적용) | typecheck 통과, 단위·통합 417/417, production build 통과, Chromium+Firefox 35/35(1회), 변이 4/4 검출, planner 변형 사전 검증 통과 |

독립 검토(작성과 분리한 읽기 전용 검토, `89dbc56` 대상)에서 확정 결함은 없었다. 검토자는 세 변경의 동치를 code unit 전수 조사로 다시 확인했고, 기준 사본이 `8ae389e`와 머리말·import 경로만 다른지, 분석 스크립트가 계획의 판정 규칙과 일치하는지, 원자료에서 다시 계산한 중앙값이 요약과 같은지를 확인했다. 남긴 참고 사항은 세 가지다.

- 문자열이 아닌 이름을 넘기면 이전 코드(문자열 변환)와 새 코드(TypeError)가 달라진다. 호출 지점 네 곳 모두 문자열만 넘기므로 도달할 수 없는 경로다.
- 분석 스크립트는 "기각" 조건을 계산하지 않고 채택·보류만 낸다. 두 실행 모두 기준 크기를 넘게 악화한 라운드가 0개여서 기각 조건에 해당하지 않는다는 것은 요약의 `worseningRounds`로 확인했다.
- 실험 P의 B 조건 3라운드 중앙값은 기준 크기와 같은 값(20 µs)이라 "초과"로 세지 않았다. 초과로 세어도 라운드 1개라 판정은 같다.

검토자가 실행하지 않은 것: typecheck, 변이 스크립트, 전체 테스트, 브라우저 테스트, 측정. 이 항목들은 위 표의 실행 결과가 근거다.

## 6. 주장 범위와 남은 것

- 확인한 것은 같은 페이지에서 잰 **전체 `diff()` 비용**이다(A2 TaskApp, 100행, Chromium, 한 기기, 한 프로세스의 3라운드). 실험은 각각 한 번 실행했다.
- 확인하지 않은 것: TaskApp 전체 사용자 작업 시간, Patch·paint·GC 비용, 10개·1,000개 규모, Firefox 성능, 실제 한글 IME, 원격 CI. 10,000개 측정은 하지 않았다.
- `validateTree`는 `resolve`·`validatePlan`·`capture`에서도 호출되므로 그 경로도 같은 코드로 빨라지지만, 이번에 따로 재지 않았다.
- 판정 기준의 10%는 Node 탐색 수치를 본 뒤, Chromium 쌍 비교를 보기 전에 정했다.
- 다음에 이어갈 수 있는 지점(시작하지 않음): 속성 맵이 `Object.create(null)`이라 `Object.keys(attrs)`가 호출당 약 100 ns다. V1 적용 뒤 검증 한 번(약 260 µs)의 약 30%다. 데이터 표현을 바꾸는 일이라 `__proto__` 같은 이름의 안전성과 생성 비용을 함께 검토해야 한다.

## 7. 재현

```sh
# 실험 V는 후보 파일이 있는 커밋에서만 빌드된다
git checkout 32cb659
node scripts/paired-diff-variants/build.mjs --variant=validate
node scripts/paired-diff-variants/run.mjs --variant=validate --verify
node scripts/paired-diff-variants/run.mjs --variant=validate --tag=paired-diff-validate-<unique>
node scripts/paired-diff-variants/analyze.mjs docs/bench/paired-diff-validate-<unique>

# 실험 P는 V1 적용 뒤의 소스에서
node scripts/paired-diff-variants/build.mjs --variant=planner
node scripts/paired-diff-variants/run.mjs --variant=planner --verify
node scripts/paired-diff-variants/run.mjs --variant=planner --tag=paired-diff-planner-<unique>
node scripts/paired-diff-variants/analyze.mjs docs/bench/paired-diff-planner-<unique>

# 동등성과 변이
node node_modules/vitest/vitest.mjs run tests/unit/validate-names.test.ts
node scripts/validate-name-mutations.mjs
```
