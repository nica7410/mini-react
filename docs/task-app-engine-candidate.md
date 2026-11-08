# 실제 TaskApp 진단 뒤의 E3 후보

E2의 생성 포함 회귀와 별도 CPU/할당/보유 heap 진단은 [첫 정식 결과](task-app-baseline-results.md)에 보존했다. 그 결과를 확인한 뒤에만 이 후보를 작성했다. 최종 채택은 아직 하지 않았으며 아래 구현이 빨라졌다고 단정하지 않는다.

## 수정 범위와 원리

변경은 `src/core/vdom.ts`의 깊은 동결·증명 과정에 한정한다. 모든 own data property를 계속 검사하고 자식까지 동결한다. accessor를 호출하지 않으며, accessor 또는 사용자 정의 prototype이 있으면 불변으로 인정하지 않는다. 함수는 기존 계약대로 불투명한 참조로 취급하고 동결하지 않는다.

1. 먼저 객체를 동결하고, 이후 고정된 prototype과 최종 descriptor를 검사한다. Proxy가 동결 전에 prototype을 다르게 보고하거나 동결 중 자식 참조를 바꿀 수 있으므로 이전 순서의 증명은 충분하지 않았다.
2. 재귀 helper가 깊은 증명의 성공 여부를 직접 반환한다. 부모가 자식의 WeakSet 등록 여부를 다시 조회할 필요가 없다.
3. 장기 WeakSet 인증은 명시적인 freezeTree 인수와 VNode/root 경계에만 남긴다. attrs/style/identity와 배열도 깊게 검사·동결하지만 모두 등록하지는 않는다. kind 값은 검사 후 보관 여부만 정하며 임의 trusted flag로 검증을 생략하지 않는다.
4. 재귀 중인 객체는 임시 Set으로 관리하고 finally에서 항상 제거한다. 재진입 Proxy와 순환 데이터도 의도적인 오류로 중단한다.

전체 root의 문맥 검증 캐시는 유지한다. 하위 트리의 유효성, DOM binding, mount/revision, PatchPlan, 부모/anchor, 폼 복원, Effect 또는 IME 검사를 새로 생략하지 않는다. TaskApp A1, Hook 슬롯과 공통 Diff/Patch도 변경하지 않는다.

두 종류의 증명을 구분해야 한다. VNode의 불변성 인증은 “이 데이터가 바뀌지 않는다”는 뜻이다. “이 부모와 함께 사용해도 유효하다”는 뜻은 아니다. 같은 option/radio 데이터를 다른 select/form 아래에 놓으면 새 전체 root의 문맥 검사를 다시 받는다. T-N07이 이 차이를 검증한다.

동결 순서의 언어 계약도 공식 명세와 대조했다. Object.freeze는 확장을 막고 own data property를 변경·재설정할 수 없게 만든다. 확장이 막힌 Proxy는 실제 target과 다른 prototype을 보고할 수 없으며, 동결된 own data property의 값을 다르게 보고할 수도 없다. 이 제약을 이용해 동결 이후의 최종 구조를 증명한다. [Object.freeze / SetIntegrityLevel](https://tc39.es/ecma262/multipage/abstract-operations.html#sec-setintegritylevel), [Proxy prototype 제약](https://tc39.es/ecma262/multipage/ordinary-and-exotic-objects-behaviours.html#sec-proxy-object-internal-methods-and-internal-slots-getprototypeof), [Proxy data value 제약](https://tc39.es/ecma262/multipage/ordinary-and-exotic-objects-behaviours.html#sec-proxy-object-internal-methods-and-internal-slots-get-p-receiver). 표준의 동결은 하위 객체 전체의 불변성을 대신 증명하지 않으므로 재귀 검사와 accessor/prototype 경계는 계속 필요하다.

## 실제 반례와 정확성 검증

`immutable-proof-regression.test.ts`의 네 테스트를 변경 전 E2에서 먼저 실행했다. 두 Proxy 반례가 실제 실패했고, 오류 후 재시도와 순환/재진입 검사는 통과했다. 실패 원문을 삭제하거나 재시도로 덮어쓰지 않았다. 수정 후 같은 네 반례를 포함한 관련 19/19, 전체 단위·통합 203/203, typecheck와 production build가 통과했다. [실패 원문](validation/task-e3-correctness/red.json), [명령·소스 hash·통과 결과](validation/task-e3-correctness/result.json).

이 검증은 후보의 정확성 증거이며 최종 선택 뒤의 전체 브라우저 3회 검증을 대신하지 않는다.

## 후보 시간 결과를 보기 전 고정한 재비교

- E1 A1, E2 A1, E3 A1을 같은 새 세션에서 비교한다. 최종 엔진에서 앱 효과도 따로 확인하도록 E3 A0를 함께 포함한다.
- 기존 A0/A1 Git 소스, seed, CSS, 의존성, production 하네스와 모든 oracle을 그대로 사용한다.
- 기존 사전 계획대로 10/100/1,000/10,000, 모든 persistent 작업과 fresh equal, 독립 3세션, warm-up 10/stress 5/fresh 3, 표본 60/fresh 30이다.
- 비교군 순서는 기존 runner의 회전/반전을 따른다. 시간 측정 중 테스트·build·profiling을 병행하지 않는다.
- 최종 정책에 해당하는 gate 초과와 tail 불확실성은 기존 기준에 따라 3개 새 세션 n=180으로 보충한다. 기존 raw와 합치거나 기준을 완화하지 않는다.
- 후보의 생성/재사용/폼/CRUD/재배치/초기화와 별도 CPU·메모리·화면 trace를 함께 판단한다. 회귀가 남으면 좁은 캐시 또는 안전한 무캐시 정책을 검토하고 불리한 후보도 보존한다.

E3의 기능 소스는 `ff9e24e1a4486e0589fc29c1b6483fabeb884e50`, 엔진 hash는 `8474eccbd9c630c829d942b68cb11d7c5f99d4fb3f2e21d75437594c7f74212e`다. A0/A1 소스와 공통 하네스는 기존 고정본이다. 새 production build `task-e3-a0-v1`/`task-e3-a1-v1`은 [작은 네 조합 smoke](bench/task-e3-smoke-v1/analysis.json) 40개 조건과 [E3 A1 stress smoke](bench/task-e3-stress-smoke-v1/analysis.json) 10개 조건의 oracle·통계 감사를 통과했다. 표본 2회의 시간은 성능 결론으로 사용하지 않는다.

`task-candidate-v1`의 정식 재비교는 2026-11-08 21:04부터 2026-11-09 02:08 KST까지 실행했다. 세 세션 각각 160개 조건, 전체 480개 조건이 모두 통과했다. 기능 소스·하네스·runner·사전 기준을 변경하거나 테스트/build/profiling을 병행하지 않았다. 최종 정책·최종 전체 검증은 아직 진행 중이다.

정식 실행 종료 뒤 같은 A1의 E1/E2/E3를 별도 진단 프로세스로 비교했다. 기존 진단 도구·1,000/10,000개 조건·CPU counter/sort/CRUD·메모리 혼합 작업·시각 counter/move의 절차를 유지했다. 2026-11-09 02:12~02:31 KST에 36개 조건을 수집하고 원자료 분석·표의 구간 합계·기능 소스 hash 감사를 통과했다. 정식 timing과 병행하지 않았다.

```powershell
node scripts/diagnose-task.mjs --tag=task-diagnostic-candidate-v1 --source-run=task-candidate-v1 --builds=task-e1-a1-v1,task-e2-a1-v1,task-e3-a1-v1 --sizes=1000,10000
node scripts/analyze-task-diagnostics.mjs docs/bench/task-diagnostic-candidate-v1
node scripts/report-task-diagnostics.mjs docs/bench/task-diagnostic-candidate-v1
```

10,000개 stress의 동결·증명 self 비중은 E2 sort 20.956%에서 E3 9.886%, CRUD 33.378%에서 24.957%로 줄었다. primary 창에 겹치는 GC category 시간은 E2/E3 sort 1839.039/1759.494ms, CRUD 9318.210/4982.632ms였다. 반면 전체 allocation 추정량은 sort 10215.340→10369.356MiB, CRUD 45084.672→45954.227MiB로 줄지 않았다. 이 값은 초기화·warm-up·oracle을 포함한 별도 sampling 추정량이며 정식 p95 표본의 원인을 직접 확정하거나 보유 메모리와 같게 해석하지 않는다.

| 혼합 작업의 강제 GC 뒤 보유 heap / 10,000개 | E1 A1 | E2 A1 | E3 A1 |
|---|---:|---:|---:|
| mount 직후 MiB | 62.621 | 72.151 | 66.154 |
| 마지막 작업 뒤 MiB | 65.163 | 129.171 | 73.178 |
| dispose 뒤 MiB | 1.914 | 65.923 | 9.927 |

세 비교군 모두 DOM nodes 20→20, listeners 13→13으로 돌아왔다. E3의 보유 heap은 E2보다 작지만 E1보다 여전히 크다. 단일 진단 궤적이며 정확한 잔류 객체·누수 원인은 heap snapshot으로 확인하지 않았다.

정의한 click→첫 같은 renderer Paint 종료의 10,000개 counter는 E1 580.537/559.550/583.449ms, E3 384.425/357.704/362.016ms였다. move는 E1 1377.187/1260.929/1281.524ms, E3 1349.452/1260.628/1500.419ms로 마지막 관측에서 더 느렸다. 각각 세 번의 instrumented 관측이며 물리 화면 표시 완료나 p95 분포가 아니다. E3 counter/move의 실제 viewport PNG도 확인했다. [모든 진단 수치](bench/task-diagnostic-candidate-v1/diagnostics.md), [분석 감사](bench/task-diagnostic-candidate-v1/diagnostic-audit.json), [화면 확인](bench/task-diagnostic-candidate-v1/visual-review.json).

## 첫 후보 비교의 감사와 보충 대상

raw 32,196행 = counts 480 + 초기화 432 + warm-up 3,924 + 측정 작업 27,360이며 action은 38,880개다. 소스/asset/하네스/seed·모델·누락/중복·처리 구간 합산을 확인했고 hidden/unfocused는 0이었다. 독립 재계산은 통계 8,016개, 비교 8,016개, 누적 경로 29,700점과 그래프 480점을 통과했다. 의도적으로 바꾼 p95와 중복 행, 뒤집은 gate 판정도 거절했다. [원자료 감사](bench/task-candidate-v1/analysis.json), [통계 감사](bench/task-candidate-v1/statistics-audit.json), [판정 감사](bench/task-candidate-v1/policy-audit.json), [실제 확인한 네 그림](bench/task-candidate-v1/plot-validation.json).

고정 A1의 E1→E3 비교에서 1,000/10,000개 draft·counter·equal은 세 세션 모두 10% 이상 median 감소 목표를 충족했다. 반면 아래 회귀가 남아 있으므로 E3의 일반 채택을 확정하지 않는다. 시간은 정의된 처리 창의 경과 시간 합계이며 OS CPU 시간이나 화면 표시 완료 시간이 아니다.

| A1 고정, E1→E3 | median 변화 S1 / S2 / S3 | p95 변화 S1 / S2 / S3 |
|---|---|---|
| counter / 10,000 | −49.22% / −45.12% / −46.55% | −47.98% / −42.82% / −43.79% |
| search / 10,000 | +67.86% / +0.95% / +0.35% | +89.92% / +6.10% / +5.16% |
| sort / 10,000 | +62.97% / +1.30% / −1.12% | +32.49% / +1.06% / +0.51% |
| move / 10,000 | −10.06% / −0.73% / −2.43% | −7.34% / +10.02% / +17.69% |

초과 조건은 엔진 비교 68개 중 5개, E3의 앱 비교 68개 중 6개다. CRUD 하위 toggle, 작은 입력 복원 등도 포함하며 큰 그래프의 대표 작업만으로 판단하지 않는다. 각 세션의 ms·IQR·p95·n과 초과하지 않은 세션까지 [전체 판정 근거](bench/task-candidate-v1/policy-review-e3.md)에 남겼다. 특히 S1의 큰 검색/정렬 회귀를 제외하거나 다른 세션으로 대체하지 않는다.

[보충 계획](bench/task-candidate-v1/tail-supplement-plan-e3.json)은 두 비교의 초과 조건 11개를 모두 포함한다. 작업 묶음 기준으로 100개 search/filter/dirty, 1,000개 CRUD, 10,000개 search/sort/move/CRUD다. 기존 네 비교군·하네스·warm-up을 유지한 새 3세션 n=180으로 확인한다. 원래 표본과 합치지 않으며 아직 실행·채택 완료를 의미하지 않는다. 별도 진단은 완료했으며 보충 결과를 확인한 뒤 유지·수정·적용 범위 축소를 결정한다.
