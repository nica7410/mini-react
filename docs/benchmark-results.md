# 실제 TaskApp 성능 비교와 캐시 정책

**최종 정책을 결정한 보고서다(2026-11-09).** 첫 여섯 조합 비교·별도 진단, E3 후보의 정식 3세션 비교·1,000개 보충, E4 후보의 정식 3세션 480조건과 완료한 10개·100개 n=180 보충을 감사했다. 결론은 **엔진 E1 방식의 매회 검증 + 기본 앱 A0**이며 E2~E4의 캐시와 A1은 비교 build에만 남긴다. 10,000개 보충은 사용자 요청으로 중단했고 판정에 쓰지 않는다. 10,000개 stress 회귀는 미해소·보류다. 성능 채택은 결과를 보기 전에 고정한 [사전 기준](task-app-comparison-plan.md)을 따른다. [최종 정책·근거·검증](task-app-final-policy.md)

이전 성능 보고서는 [no-op 역사적 원문](benchmark-results-noop.md)에 보존했다. 최초 M8은 [M8 보고서](benchmark-results-m8.md)에 있다. 원본의 정확한 bytes·Git 출처·SHA-256은 [보존 영수증](validation/task-app-previous-report.json)으로 확인한다. 서로 다른 실험의 절대 시간이나 개선율을 합치지 않는다.

## 비교 정의와 출처

실제 src/app/tasks.ts를 import한 production 실행이다. 고정 seed 539365639와 같은 CSS·의존성·하네스를 사용한다. 앱 효과는 같은 엔진의 A0→A1, 엔진 효과는 같은 앱의 E1→E2/E3로 분리한다. 각 build의 전체 Git commit·소스·asset·빌드 도구 hash는 실행별 environment와 보존 manifest에 있다.

| 대상 | Git 소스 | 정의 | 엔진 또는 앱 SHA-256 |
|---|---|---|---|
| E0 | 7757e3c | 후속 no-op 최적화 전 | 1e42089a7970b7458b24377d2242c035abbcc10cee8d368f239ac9e0dbbd5ff1 |
| E1 | 8b302de | host 비교용 임시 객체 제거 | 316644555d301258a51b84b03940f5319a21cbecc82154dfda03062fceb48f87 |
| E2 | c4a2fe1 | 깊은 불변성 증명·전체 root 검증 캐시 | fffff850c0f88407a6eb0f5da5d466809cb3e8bf19071827120d0955c396bc3c |
| E3 후보 | ff9e24e | 동결 후 증명·VNode/root 중심 인증 보관 | 8474eccbd9c630c829d942b68cb11d7c5f99d4fb3f2e21d75437594c7f74212e |
| E4 후보 | 2a21ec7 | E3 정확성 유지·호출당 새 인증 최대 64개 보관. 일반 채택 기각 | 9b75615d34ee58b34a59ea9504a7a7fc293fe7522c90b32b9c8e5f1b785a4997 |
| A0 | 4d5a66f | 시작 시 실제 TaskApp | 3a65ef055819b5de0433cf811365d83e54b4e3a693971a66f8c71ad348c378f8 |
| A1 | 5ed7f34 | 루트 Memo의 목록 표현·함수형 callback 재사용 | 221da911183359db10c1412138896deb53557461ca632a4fa2f30d4666d5ef45 |

공통 하네스 SHA-256은 3eab1f4b92fbbfae06313bde46eff416293ecd737a41ee614683683f1dda8d55, 의존성 정의 hash는 ea8b1a2bcae3a1230d67321ff39dcb4037f0bc176b32684ade4d1cee29724f21이다. [첫 행렬 환경](bench/task-matrix-v1/environment.json), [후보 행렬 환경](bench/task-candidate-v1/environment.json)을 참고한다. 과거 엔진은 별도 Git archive에서 빌드했으며 현재 checkout을 되돌리지 않았다.

## 측정 범위

10/100/1,000개를 일반 조건, 10,000개를 stress로 구분한다. 같은 앱·DOM의 draft/counter/search/filter/sort/move/CRUD/dirty/equal 반복과, 매번 새 앱 root를 mount하는 fresh equal을 측정한다. 독립 3세션이며 유지 조건은 warm-up 10(stress 5) 뒤 n=60, fresh는 warm-up 3 뒤 n=30이다. 비교군별 새 브라우저와 균형화된 실행 순서를 사용하며 세션을 합치지 않는다.

매 action의 State·DOM·입력값·행 순서·생존 key의 identity·focus/selection·Effect를 독립 모델과 대조한다. counts와 timing은 별도 realm이다. 느린 표본을 버리거나 실패를 자동 재시도하지 않는다. p95 판단에 걸리는 최종 정책 조건은 사전 계획의 **새 3세션 n=180**으로 보충한다.

총 처리 시간은 dispatch closure와 겹치지 않는 후속 flush/Effect의 경과 시간 합계다. 실제 VDOM 생성은 render 안에 포함한다. 중첩 render/expression/VDOM 구간이나 각 구간의 median을 더하지 않는다. fresh lifecycle은 정의된 초기화+갱신의 표본별 합이다. OS 스레드 CPU, 물리 키 입력 지연, 앱 프로세스 전체 생명주기 비용 또는 화면 표시 완료 시간을 뜻하지 않는다. [정확한 경계](bench/task-matrix-v1/measurement-boundaries.json).

## 첫 비교에서 확인한 이득과 회귀

E0/E1/E2 × A0/A1의 720개 조건 모두 통과했다. raw 48,294행, 측정 작업 41,040개와 action 58,320개, 통계 12,024개, 그래프 240점을 독립 검산했다. [전체 세션별 median/IQR/p95/n](bench/task-matrix-v1/all-results.md), [앱·엔진 모든 비교](bench/task-matrix-v1/comparisons.md), [통계 감사](bench/task-matrix-v1/statistics-audit.json), [대표 수치 감사](bench/task-matrix-v1/overview-audit.json).

아래는 같은 세션의 짝이다. 음수는 개선, 양수는 악화다. 모든 세션과 불리한 조건은 [첫 결과 해석](task-app-baseline-results.md)에 남겼다.

| 고정 축 / 비교 | 작업 | median 변화 S1 / S2 / S3 | p95 변화 S1 / S2 / S3 |
|---|---|---|---|
| E2 고정, A0→A1 | counter / 10,000 | −78.78% / −78.69% / −78.27% | −90.70% / −90.99% / −90.71% |
| E2 고정, A0→A1 | CRUD / 10,000 | −44.06% / −44.65% / −45.39% | −28.37% / −29.14% / −26.74% |
| E2 고정, A0→A1 | sort / 10,000 | +3.76% / +2.49% / +6.55% | −0.32% / +49.46% / −13.21% |
| A1 고정, E1→E2 | counter / 10,000 | −50.08% / −48.77% / −47.77% | −55.45% / −49.11% / −47.85% |
| A1 고정, E1→E2 | search / 1,000 | +10.69% / +16.09% / +18.40% | +28.04% / +30.24% / +28.20% |
| A1 고정, E1→E2 | move / 10,000 | +9.55% / +12.18% / +9.12% | +71.15% / +23.90% / +103.64% |

A1은 무관한 draft/counter/equal에서 행 실행을 0으로 줄였고, 세 엔진 모두 1,000/10,000개에서 세 세션 전부 10% 이상 median 감소를 확인했다. 목록이 바뀌면 필요한 행 평가를 수행한다. CRUD 묶음의 이득만으로 rename/toggle 하위 action의 회귀를 숨기지 않는다. 새 mount와 반복 사용의 누적 비용은 [회수 경로](bench/task-matrix-v1/recovery.json)에 따로 있다.

## 별도 진단과 E3 후보

CPU/할당/GC/long task/forced-GC heap/정의된 Paint 경계 진단 24개 조건도 수집·분석을 통과했다. E2의 10,000개 sort/CRUD에서 동결 증명 self 표본은 primary 창의 21.20%/34.36%였다. 같은 혼합 작업 후 dispose한 JS used heap은 E1 1.920MiB, E2 65.919MiB였지만 DOM nodes/listeners는 둘 다 초기 관찰값으로 돌아왔다. 정확한 보유 객체 원인을 heap snapshot으로 확정하지 않았다. [진단 수치·원자료](bench/task-diagnostic-baseline-v1/diagnostics.md).

이 근거로 E3는 동결 이후 최종 참조를 증명하고, 자식 증명 결과를 직접 전달하며, 장기 인증을 모든 보조 객체 대신 VNode/root 경계에 보관한다. Proxy 반례 두 개는 변경 전 E2에서 실제 실패했고 수정 후 통과했다. 관련 19개·전체 단위/통합 203개·타입·production build와 작은/stress smoke도 통과했다. [후보 정의·정확성 증거](task-app-engine-candidate.md).

E1 A1/E2 A1/E3 A0/E3 A1의 새 정식 3세션은 2026-11-09 02:08 KST에 정상 종료했다. 480개 조건, raw 32,196행, 측정 작업 27,360회/action 38,880개, 통계·비교 각 8,016개와 그래프 480점의 검산을 통과했다. [후보 전체 분포](bench/task-candidate-v1/all-results.md), [통계 감사](bench/task-candidate-v1/statistics-audit.json), [판정 감사](bench/task-candidate-v1/policy-audit.json).

A1의 반복 재사용 조건에서 E3는 E1 대비 1,000/10,000개 draft·counter·equal median 감소 목표를 세 세션 모두 충족했다. 그러나 stress 검색/정렬의 S1 회귀와 이동 p95 초과 등을 남겼다. 사전 범위를 넘은 조건은 엔진 비교 5개, 앱 비교 6개이며 작은 조건과 CRUD 하위 action도 포함한다. [후보 결과·대표 수치·모든 초과 조건](task-app-engine-candidate.md), [새 3세션 n=180 보충 계획](bench/task-candidate-v1/tail-supplement-plan-e3.json).

후보의 별도 진단 36개도 수집·분석 감사를 통과했다. 10,000개 sort/CRUD의 동결·증명 self 비중은 E2 20.956%/33.378%에서 E3 9.886%/24.957%였다. 같은 혼합 수명 궤적의 dispose 뒤 heap은 E1 1.914MiB, E2 65.923MiB, E3 9.927MiB였다. E3의 allocation 추정량은 E2보다 줄지 않았고 E1보다 큰 잔류 heap도 남았다. 모든 비교군의 DOM nodes/listeners는 초기값으로 돌아왔다. [전체 진단](bench/task-diagnostic-candidate-v1/diagnostics.md), [한계와 Paint 관측](task-app-engine-candidate.md). 계측된 이 수치로 정식 성능 순위를 대체하지 않는다.

## E4 후보와 최종 정책

E1 A1/E2 A1/E4 A0/E4 A1의 정식 3세션 `task-candidate-v2`는 2026-11-09 06:17~11:13 KST에 480/480조건을 완료했다. raw 32,196행, 측정 작업 27,360회, 분포·비교 각 8,016개를 독립 재계산했고, 204개 조건의 세션별 판정 612개를 다시 확인했다. [전체 분포](bench/task-candidate-v2/all-results.md) · [통계 감사](bench/task-candidate-v2/statistics-audit.json) · [판정 감사](bench/task-candidate-v2/policy-audit.json)

| 비교 | 1,000·10,000개 draft·counter·equal median | 사전 허용 범위 초과 |
|---|---|---|
| A1 고정 E1→E4 | 6개 조건 모두 3/3세션 10% 목표 달성, 44.6~52.7% 감소 | 68개 중 6개(median 3, p95 4) |
| E4 고정 A0→A1 | 6개 조건 모두 3/3세션 10% 목표 달성, 73.3~78.5% 감소 | 68개 중 5개(median 3, p95 2) |

초과 11개 조건은 모두 세션 3에 있었다. 그중 10개·100개 조건을 새 3세션 n=180으로 보충했다(48조건, raw 9,216행, 본 측정 8,640회 감사).

| 비교 | 보충에서 범위를 넘은 작업 | 세션 | 변화 |
|---|---|---|---|
| A1 고정 E1→E4 | 100개 이름 수정 median | S1 | +14.29% (+1.450ms) |
| A1 고정 E1→E4 | 100개 완료 상태 변경 median | S1, S2 | +13.73% (+1.400ms), +9.32% (+1.100ms) |
| A1 고정 E1→E4 | 100개 검색 p95 | S3 | +11.05% (+2.475ms) |
| E4 고정 A0→A1 | 10개 정렬 p95 | S2 | +32.76% (+1.705ms) |
| E4 고정 A0→A1 | 100개 완료 상태 변경 p95 | S2 | +10.52% (+1.905ms) |

[100개 보충 판정](bench/task-candidate-v2-tail-persistent-100-v1/policy-review-e4.md) · [10개 보충 판정](bench/task-candidate-v2-tail-persistent-10-v1/policy-review-e4.md) · [10,000개 중단 기록](bench/task-candidate-v2-tail-persistent-10000-v1/stopped-run-inventory.json)

**최종 정책.** 엔진은 E1 방식의 매회 전체 root 검증을 사용하고, 동결 안전 조건은 유지한다. E2~E4의 인증·검증 캐시는 반복 재사용의 이득에도 사전 허용 범위를 넘는 회귀가 새 세션에서 반복돼 기본 경로에서 제외했다. 기본 TaskApp은 A0다. E1 고정 A0→A1도 반복 재사용 median은 53.2~56.7% 줄였지만 68개 판정 조건 중 13개가 범위를 넘었다(median 9, p95 7). A1은 비교용 `TaskAppWithRowReuse`로만 남긴다.

최종 소스는 E1 고정 build와 같지 않다. 동결 안전 조건과 resolver의 생성 시점 봉인을 더했다. 최종 소스로 새 timing을 측정하지 않았으므로, 위 E1 측정값을 최종 소스의 성능 수치로 주장하지 않는다. 최종 소스의 정확성 검증은 [최종 정책 문서](task-app-final-policy.md)에 있다. 검사 생략이나 생성 비용을 측정 구간 밖으로 옮기는 방식은 채택하지 않았다.

## 재현·한계·인수 상태

고정 소스/asset 복원과 새 tag 실행 명령은 [첫 결과의 재현 절차](task-app-baseline-results.md), 조건과 채택 기준은 [사전 계획](task-app-comparison-plan.md)에 있다. Node 통계 도구와 Python/matplotlib PNG·SVG를 사용한다. timing 4178, 별도 진단 4179 포트를 사용하며 테스트·build·profiling을 정식 시간 측정과 병행하지 않는다.

진단 sampling·GC trace에는 계측 비용이 있으며 정식 표본과 합산하지 않는다. first same-renderer Paint end는 물리 화면 표시 완료가 아니다. 10,000개는 stress이고 전체 편집기·Inspector가 아닌 독립 TaskApp 하네스다. 프로그램 DOM 이벤트는 물리 입력/실제 한글 IME와 다르다. OS 백그라운드 부하·온도·주파수는 통제하지 않았으며 세션별 차이를 공개한다.

[진행 기록](progress.md), [현재 인수 상태](m8-acceptance.md), [외부 체크리스트 최종 영수증](validation/task-checklist-final.json)에 완료·미완료·미확인을 구분했다. 이전 실제 IME 사용자 확인은 2026-11-07 기록이며 이번 후보의 새 수동 PASS가 아니다. 팀 활동·원격 CI·배포는 미확인 또는 범위 밖이다.
