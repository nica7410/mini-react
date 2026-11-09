# 후속 개선: 측정 범위 제한 · 추적/Inspector 비용 · VDOM 생성/검증 임시 할당

2026-11-09. 최종 정책(E1 매회 검증 + 동결 안전 조건, 기본 앱 A0, 소스 `9b52323`)을 바꾸지 않고, 남아 있는 구체적인 비용을 줄였다. 검증 캐시 재도입, 검증 단계 생략, Fiber·Scheduler는 다루지 않았다. **10,000개 측정은 실행하지 않았다(사용자 지시).**

| 순서 | 작업 | 커밋 |
|---|---|---|
| ⑤ | 측정 실행 범위 제한 | `f08366e`, 보완 `3e9a48c` |
| ① | 기록 OFF의 추적 작업 생략, Inspector 지연 생성·재사용 | `f86f25b`, 보완 `3e9a48c` |
| ② | resolve/validate의 임시 배열·문자열·closure 감소 | `f86f25b`, 보완 `3e9a48c` |

## ⑤ 측정 실행 범위 제한

- `benchmark-task`, `benchmark`, `benchmark-noop`, `diagnose-task`의 기본 크기는 10/100/1,000개다. 10,000개는 `--allow-10000`을 명시해야 실행되고, `--allow-10000=false`는 허용으로 보지 않는다. 10,000개로 고정된 `diagnose-noop-tails`와 `check-benchmark-resources`도 같은 플래그가 없으면 시작하지 않는다.
- `benchmark-task`에 `--max-minutes`(기본 60)를 추가했다. 세션과 각 build/조건을 시작하기 전에 확인하며, 이미 시작한 조건은 끝까지 실행한다. 상한에 도달하면 `environment.status = 'stopped-deadline'`과 `stoppedAt`을 기록하고 원자료를 보존한 채 종료 코드 3으로 끝난다. 자동 후속 실행은 없다.
- runner를 바꾸면 기존 실행의 runner hash 검사가 깨지므로, `analyze-task`는 현재 runner가 다를 때 기록된 `runnerCommit`의 runner와 hash를 대조한다. 기존 E4·E3 실행 모두 이 방식으로 일치를 확인했다.

## ① 추적과 Inspector 비용

**변경.** `TraceSink`에 `enabled`를 추가했다. 기록이 꺼져 있으면 엔진의 이벤트 생성 지점(patch, 이벤트 wrapper, enqueue, render/memo/component)이 이벤트 객체와 detail을 만들지 않는다. `TraceRecorder.detailed`는 `enabled`를 따르므로 기록 OFF에서 patch는 identity용 `Map` 복사본과 VDOM before/after 참조를 만들지 않는다. resolver는 component 추적 callback이 없으면 논리 경로 문자열을 만들지 않는다.

Inspector는 접힌 섹션(이전/이후 VDOM 트리, 각 트리 노드의 상세, keyed 경로, DOM identity, 이벤트 순서)을 처음 펼칠 때 만든다. 기본으로 열린 Patch 목록은 바로 만든다. 같은 run이 같은 이벤트 수·생략 수·완료 상태로 다시 그려지면 기존 DOM을 그대로 둔다. 실행 선택 목록은 run 목록이 바뀔 때만 다시 만든다.

**검증.** `tests/integration/trace-cost.test.ts`(T-Q03): 기록 ON/OFF의 앱 출력이 같고 OFF에서는 `emit`이 한 번도 호출되지 않는다. `enabled` 없는 sink는 계속 기록하고 `enabled: false` sink는 아무것도 받지 않는다. Inspector는 300행 patch 뒤 접힌 상태에서 트리를 만들지 않고, 펼치면 300개 행이 생기며, 새 run이 오면 내용을 바꾼다. 기존 브라우저 Inspector 테스트(T-Q01/Q02)도 통과한다.

**측정(jsdom, 참고용).** 같은 행 수로 두 번 patch한 뒤 Inspector 패널의 요소 수와, 이벤트만 추가되는 5프레임의 경과 시간이다. jsdom이므로 실제 브라우저 시간이 아니다. 이전 Inspector는 `9b52323`의 파일을 그대로 사용했다.

| 행 수 | 패널 요소 수 이전 → 이후 | 5프레임 경과 ms 이전 → 이후 |
|---:|---:|---:|
| 10 | 366 → 69 | 150.2 → 137.8 |
| 100 | 3,066 → 249 | 302.5 → 153.6 |
| 1,000 | 30,066 → 2,049 | 1,687.3 → 132.0 |

이후에도 남는 요소는 대부분 바로 열리는 Patch 목록이다(1,000행 재작성은 Patch 약 2,000개). TaskApp timing 하네스는 trace sink 없이 실행되므로 ①은 아래 엔진 측정에 영향을 주지 않는다. 데모 개선과 엔진 개선은 따로 판단한다.

## ② VDOM 생성·검증의 임시 할당

**변경.**
- resolve: 중첩 자식을 하나의 배열에 순서대로 추가한다(sparse 배열의 hole은 이전 `flatMap`처럼 건너뛴다). key는 자식마다 한 번만 계산하고, 이전 자식의 key Map은 중간 배열 없이 만든다. record 생성 함수와 상수 집합을 함수 밖으로 옮겼다. 경로 문자열은 추적할 때만 만든다.
- validate: 노드마다 만들던 경로 문자열과 reject closure를 없애고, index stack으로 첫 문제의 경로만 만든다. 형제 key Set은 key가 있을 때만 만든다. 상수 배열을 Set으로 옮기고 input의 type 소문자화는 input에서만 한다.
- 매회 전체 검증과 동결 안전 조건은 그대로다.

**동일성 검증.** `9b52323`의 원본 소스와 새 소스에 같은 입력을 넣는 임시 차분 테스트를 실행했다(저장소에는 스크립트만 보존: [differential-9b52323.test.ts.txt](validation/followup-trace-alloc/differential-9b52323.test.ts.txt)). seed 1~1,500의 무작위 트리(컴포넌트·keyed/위치 혼합·중복 key·폼·잘못된 태그/속성 포함)에서 VDOM, 오류 문구, 재사용·실행 수, component 추적 경로, Diff 연산, Patch 결과와 DOM이 같았다. 손으로 깨뜨린 raw 트리 1,500개의 첫 오류와 경로도 같았다. 이 차분 테스트는 sparse 배열을 만들지 않았고, 이 차이는 별도 리뷰에서 발견해 `3e9a48c`에서 고쳤다. 고정 회귀는 `tests/unit/validate-path.test.ts`(T-V05: 중첩 경로, 형제 이후 경로, 중복 key, sparse 자식)다.

**리뷰에서 확인했지만 그대로 둔 차이(raw 입력 한정).** h()/resolve/HTML 캡처를 거치지 않은 raw VRoot나 손으로 만든 expression에서만 다음이 달라진다. 정상 경로의 결과는 같다.
- input이 아닌 요소의 문자열이 아닌 `type` 속성: 이전에는 TypeError, 지금은 해당 검사를 하지 않는다.
- `children`이 배열이 아닌 객체: 이전에는 TypeError, 지금은 하위를 순회하지 않는다.
- 잘못된 `props.key`가 있는 손으로 만든 expression: key 오류가 앞 형제의 오류보다 먼저 보고될 수 있다.

**탐색 측정(1세션, 실행 전 계획: [timing-plan.md](validation/followup-trace-alloc/timing-plan.md)).** `followup-alloc-explore-v1`: `task-e5-a0-v1`(engine `9b52323`) 대 `task-e6-a0-v1`(engine `f86f25b`), 같은 A0 앱, persistent crud/search/counter × 10/100/1,000, n=60. 4분 8초, 18개 조건 모두 oracle 통과. 총 처리 시간 median은 30개 비교 모두 줄었다(−10.5~−31.0%). 100개 search의 p95는 +17.6%(+2.5ms) 늘었다. 1세션 탐색이므로 채택 근거로 쓰지 않았다. [분포](bench/followup-alloc-explore-v1/all-results.md) · [원자료 감사](bench/followup-alloc-explore-v1/analysis.json)

| 작업 / 크기 | median ms E5 → E6 | 변화 |
|---|---:|---:|
| counter / 1,000 | 98.70 → 82.75 | −16.2% |
| crud 이름 수정 / 100 | 10.55 → 9.05 | −14.2% |
| crud 완료 상태 변경 / 100 | 10.15 → 8.50 | −16.3% |
| crud 전체 / 1,000 | 775.2 → 650.7 | −16.1% |
| search / 100 | 11.05 → 9.25 | −16.3% |

**할당 진단(별도, 1,000개).** `followup-alloc-diagnostic-v1`: CPU 1ms·할당 32KiB sampling, warm-up 5 + 12회. 계측 비용이 있어 timing과 합치지 않는다. [진단 표](bench/followup-alloc-diagnostic-v1/diagnostics.md)

| 작업 | validateTree inclusive ms E5 → E6 | 전체 할당 추정 MiB E5 → E6 |
|---|---:|---:|
| counter | 438.2 → 229.9 | 1,522.8 → 1,206.0 (−20.8%) |
| sort | 437.5 → 247.4 | 1,560.6 → 1,206.3 (−22.7%) |
| crud | 1,948.2 → 998.7 | 9,998.3 → 7,888.3 (−21.1%) |

**확대 확인(독립 3세션).** `followup-alloc-confirm-v1`: `task-e5-a0-v1` 대 `task-e7-a0-v1`(engine `3e9a48c`, sparse 수정 포함), 9개 workload persistent + fresh equal × 10/100/1,000, persistent n=60·fresh n=30. 23분 10초, 180개 조건 모두 oracle 통과, raw 12,276행 감사 통과. 75개 판정 조건 중 73개는 세 세션 모두 median이 줄었다. 사전 엔진 허용 범위(median `max(5%, 1ms)`, p95 `max(10%, 2ms)`)를 넘은 것은 **10개 crud 전체 p95 S1 +25.8%(+4.0ms) 1건**이었다. 10개 search median S3 +1.0ms(1.5→3.0ms 표기상 +50%)는 허용 1ms와 같아 초과로 세지 않았다. [분포](bench/followup-alloc-confirm-v1/all-results.md) · [비교](bench/followup-alloc-confirm-v1/comparisons.md) · [원자료 감사](bench/followup-alloc-confirm-v1/analysis.json)

| 작업 / 크기 | median ms E5 → E7, S1 / S2 / S3 |
|---|---|
| counter / 1,000 | 95.85→82.35 (−14.1%) / 98.10→84.60 (−13.8%) / 98.45→83.80 (−14.9%) |
| crud 이름 수정 / 100 | 10.30→8.55 (−17.0%) / 10.70→8.60 (−19.6%) / 10.90→8.60 (−21.1%) |
| crud 완료 상태 변경 / 100 | 10.50→8.00 (−23.8%) / 9.80→8.40 (−14.3%) / 10.65→8.10 (−23.9%) |
| crud 전체 / 1,000 | 763.3→632.9 (−17.1%) / 890.1→680.7 (−23.5%) / 767.4→635.5 (−17.2%) |
| search / 100 | 10.25→8.80 (−14.1%) / 11.80→8.85 (−25.0%) / 10.95→8.70 (−20.5%) |
| sort / 1,000 | 183.9→171.6 (−6.7%) / 329.9→245.7 (−25.5%) / 185.3→170.5 (−8.0%) |
| move / 1,000 | 114.2→95.1 (−16.7%) / 169.8→145.3 (−14.4%) / 113.9→98.5 (−13.5%) |
| fresh 초기화+equal / 1,000 | 323.9→251.4 (−22.4%) / 327.6→266.8 (−18.6%) / 323.3→262.2 (−18.9%) |

**보충(n=180, 새 3세션).** `followup-alloc-confirm-v1-tail-10`: 10개 crud·search. 초과는 재현되지 않았다. crud 전체 median −18.9~−22.2%, p95 −21.5~−32.3%, 하위 action 모두 감소. search median −15.8~−19.0%, p95는 S1 +8.2%(+0.21ms, 허용 범위 안)·S2/S3 감소. [보충 분포](bench/followup-alloc-confirm-v1-tail-10/all-results.md)

**판정: ②를 채택한다.** 사전에 적은 기준대로 단일 세션 p95 초과는 새 세션에서 재현되지 않았다. 확인 측정의 이전 1세션 초과도 원자료와 함께 공개한다. 이 결과는 기본 앱 A0와 이 엔진의 비교이며, A1이나 10,000개 조건으로 일반화하지 않는다. **10,000개 stress는 측정하지 않았다.**

## 최종 검증

`3e9a48c`에서 `validate-task-final.mjs task-followup-20261109-v1`: typecheck 통과, 단위·통합 **219/219**(23개 파일), production build 통과, 기본 Chromium+Firefox **33/33 × 3회**(새 서버·브라우저, 38.9/37.3/37.3초, worker 2, timeout 30초, retry 0, skipped·flaky 0), 검증 전후 source hash 일치. [결과](validation/task-followup-20261109-v1/result.json)

## 다음 연구 후보(③·④)에 대한 근거

②를 적용한 1,000개 진단에서 측정 창의 CPU self 상위는 다음과 같다(1ms sampling 근사, 계측 비용 포함).

| 함수 | crud self 비중 | counter self 비중 | 의미 |
|---|---:|---:|---|
| `freezeOwned` | 16.3% | 13.8% | A0가 매 render 새로 만드는 행 VNode의 동결 |
| validate `children` | 12.3% | 13.3% | 매회 전체 검증 |
| `elementChanges`·`equalData`·`equalHostData` | 16.5% | 14.6% | 새 행 VNode와 이전 VNode의 host 비교 |
| `validatePlan` | 7.1% | 8.7% | commit 전 plan 검증 |
| `resolveOne`·`h` | 9.3% | 7.9% | 행 expression 평가 |
| `compareChildren`·`reconcileChildren`·keyed | 약 5% | 약 3.4% | keyed 목록 매칭 |

keyed 목록 매칭(③의 대상)은 약 3~5%다. 반면 바뀌지 않은 행을 다시 만들면서 생기는 동결·비교·평가 비용이 40% 안팎이다. 따라서 다음 연구로는 **④ 행 단위 재사용**이 더 큰 비용을 겨냥한다. 다만 전체 검증(약 13%)은 남으므로 한 행 수정이 O(1) 갱신이 되지는 않는다. 이 선택은 사용자 결정으로 남긴다. [CPU 진단 원자료](bench/followup-alloc-diagnostic-v1/diagnostic-summary.json)
