# 브라우저 안정화와 no-op 비용 재검토

시작: phase1 / `9f3f3d3`, clean. 기존 M0–M8 및 `m8-full`을 보존하고 별도 후속 검증으로 진행한다. 기능 수정·정확성·3세션 비교와 원본 감사를 완료했다.

## 실패 원본과 재현

- 후속 검토: 26/29, flaky/skip 0, 128.66초. [원본](validation/browser-stability/review-before/evidence.json), [trace 분석](validation/browser-stability/review-before/trace-analysis.json).
- Chromium 두 테스트는 assertion 이전 `goto`에서 약 29.85초를 사용했다. `/@vite/client`와 CSS 응답은 약 22.6초, main/runtime/editor 모듈은 약 11.2–11.4초였다. 대부분 network `wait`이며, 기능 assertion 실패와 구별한다. 그 서버가 지연된 더 낮은 계층의 원인은 현재 증거만으로 확정하지 않는다.
- Firefox CRUD는 정상 action 여러 개가 누적되어 30초 전체 제한에 도달했다. 단일 action의 정답 실패가 기록된 것은 아니다.
- 같은 HEAD의 기본 재실행: 29/29, 56.31초. 간헐성을 보존하며 과거 29/29 또는 이후 26/29를 서로 덮어쓰지 않는다.
- 진단 fixture/reporter/server: 서버 listen·각 요청, browser navigation·DOM 준비·앱 초기화, 모든 Playwright action/expect 및 worker/순서를 별도 기록한다. 실패 screenshot/trace 유지. 상세 trace를 켠 worker 2와 1 비교는 각각 29/29, 65.35초 / 99.36초였다. trace 없는 최초 실행과 동일 계측 조건의 속도 비교로 해석하지 않는다.

## 브라우저 실행 수정

기본 worker 2, test timeout 30초, retry 0을 유지한다. worker 1은 Firefox CRUD를 19.78→14.58초로 줄였지만 전체 시간을 52% 늘렸고 cold 모듈 응답 최대 시간(약 1.5초)을 해소하지 않았다. 원인별로 준비/시나리오를 고친다.

- 테스트 서버는 실제 HTTP로 앱·공통 엔진 모듈과 CSS/Vite client를 준비한 뒤 `/__browser_ready`를 200으로 바꾼다. 준비 실패는 서버 단계에서 드러나며 기존 Playwright 서버 준비 제한을 사용한다. 단순 HTML 200을 앱 모듈 준비로 간주하지 않는다.
- 공통 `openApp`은 load와 루트 앱 초기화 확인을 서로 다른 step으로 기록한다. 초기 목록·History·오류 상태를 실제 DOM으로 확인한다.
- 원래 CRUD 흐름의 모든 action/assertion을 유지하며, create/update/filter/search/sort/delete와 batching/reorder/bulk-delete/empty 검증을 별도 fresh page 테스트로 나눈다. 각 목적에 30초가 적용되며 테스트 전체 한도를 임의로 늘리지 않는다. 총 개수는 Chromium 20 + Firefox 11 = 31이 됐다.
- 취소한 1.5초 타이머를 기다리는 기존 1.7초 wait는 해당 취소 계약의 관찰 구간으로 유지한다. 새 임의 sleep은 없다.

수정 직후 기본 명령 31/31 PASS, typecheck PASS. [기록](validation/browser-stability/stabilized-before-engine/context.json). 엔진 수정 후 최종 3회 연속 전체 검증도 아래 기록처럼 완료했다. CI도 같은 서버/준비 조건을 사용하고 진단 JSON을 artifact에 포함한다. 원격 실행은 하지 않았다.

최종 엔진으로 **기본 명령을 새 서버/브라우저에서 3회 연속** 통과했다. 31/31씩, skip/unexpected/flaky/retry 0. [검증·소스 hash](validation/noop-followup.json).

| 실행 | 전체 초 | 서버 listen ms | 모듈 준비 완료 ms | Firefox CRUD ms | Firefox bulk/empty ms | 가장 긴 test ms |
|---:|---:|---:|---:|---:|---:|---:|
| 1 | 67.84 | 89.63 | 2,201.79 | 12,777 | 8,577 | 12,777 |
| 2 | 67.57 | 102.58 | 2,333.32 | 12,016 | 7,976 | 12,016 |
| 3 | 68.41 | 86.54 | 2,466.06 | 12,556 | 8,132 | 12,556 |

서버 PID는 각각 104364/62328/105000이다. 30초 test 한도를 유지했고 실제 모듈 준비 비용을 숨기지 않았다. 약 2.2–2.5초를 서버 준비 단계에서 사용한다. 과거의 느린 Vite 응답 자체를 OS/엔진 결함으로 단정하지 않으며, 모든 환경에서 간헐성이 사라진다는 보장은 하지 않는다.

이전 실패와 같은 첫 Chromium batching test의 browser navigation은 195.6/211.8/197.9ms, 앱 준비 mark는 navigation 시작 후 181.1/188.4/180.7ms였다. mark는 모듈 로딩과 초기화가 끝난 관찰 시각이며 순수 앱 CPU 시간은 아니다. action/expect 시간은 `browser-timings.json`, 각 모듈의 request timing과 navigation/ready mark는 `browser-results.json`의 diagnostics attachment에 있다. 서버 표의 ms는 서버 스크립트 초기화 기준이며 Node 실행 파일 생성 시간만 따로 측정한 값은 아니다.

## no-op 실험 사전 정의

`scripts/build-noop.mjs`는 엔진/하네스 SHA 및 commit을 기록한 고정 production bundle을 만든다. 이미 있는 build/tag는 덮어쓰지 않는다. 별도 `--profile` 빌드에만 validation/equality/diff/preflight/DOM binding/host form·focus/evaluation span을 삽입한다. 중첩 span은 inclusive와 exclusive를 각각 기록하며 합산하지 않는다. 프로파일링 숫자는 최종 속도 비교에서 제외한다.

`scripts/benchmark-noop.mjs`의 기본 행렬은 10/100/1,000/10,000 × light/stateful × 6경로 × 3독립 세션이다. 같은 참조, 동등한 새 트리, Memo+무관 상태, 같은 State+dirty controlled, 마지막→처음 재배치, 폼 값 변경이다. 기존 rows fixture를 공유한다. controlled 경로는 목록 밖 제어 input 하나를 추가한다. native 이벤트 dispatch 자체는 시간 경계 밖이며 별도 브라우저 회귀가 담당한다.

일반 조건 warm-up 20+측정100, stress 5+30. counts는 별도 실행. 조건마다 새 Chromium, 엔진별 page/module realm, 매 표본 fresh DOM, paired 교대 순서와 세션별 역순으로 편향을 줄인다. 준비·정답 검사·프로세스 기동은 cycle 밖이다. core diff+commit 및 runtime enqueue→다음 microtask 경계는 기존 보고서와 같다. target 표현 생성은 별도 구간이다. 이 측정은 paint가 아니다.

각 실행에서 모든 row의 순서/identity/텍스트/속성/사용자 입력, controlled 복원, State/Effect/dirty 인정, unmount 자원 정리를 검사한다. 실패·시간초과는 전체 실행 중단과 부분 원본 보존으로 처리하고 재시도나 느린 표본 제외를 하지 않는다. 하네스 자체의 12개 counts/oracle 회귀와 타입 검사를 통과했다.

## 프로파일링과 첫 개선

최적화 전 `7757e3c`의 엔진을 고정 bundle로 보존했다. [4크기/6경로 기준선 smoke](bench/noop-baseline-before/analysis.json)는 oracle 240회, [별도 계측 실행](bench/noop-profile-before/profile-summary.json)은 1,000/10,000개에서 120회 통과했다. smoke의 표본 3개를 최종 성능 결론으로 쓰지 않는다.

계측 빌드에서 10,000 stateful의 같은 참조 경로에도 트리 검증 3회와 약 80,000개 ViewNode의 preflight가 실행된다. 새로 만든 동등한 트리는 snapshot 비교도 반복된다. 계측의 treeValidation/equality/preflight self/DOM binding span은 각 비용을 구별하며, host/forms/focus는 이 입력에서 작은 부분이었다. 실제 노드 교체를 검출하는 DOM 검사는 제거하지 않는다.

첫 개선은 `equalHostData`: 기존 preflight의 `{ ...hostData }` 두 객체와 노드별 함수를 만들지 않고 같은 own 필드를 직접 비교한다. 동일 VNode 참조는 즉시 동등하다. identity/children는 기존 별도 검사로 남고, 추가 own 필드도 기존처럼 비교한다. 캐시·revision·계획 신뢰 경로를 추가하지 않았다.

관련 7파일 78개 테스트, typecheck와 production bundle 통과. 새 회귀는 두 종류 no-op, 동일 내용의 외부 Node 교체와 재캡처, mount/revision/위조 view/registry, 같은 화면의 Effect와 실패 후보 보존, handler 교체/제거 및 form 소유 정책을 확인한다. [paired smoke](bench/noop-host-compare/all-results.md)에서 10,000 stateful 6경로 median은 7–16% 낮았으나 표본 3개인 예비 결과다. 최종 3세션 검증 전에는 확정적 개선율로 사용하지 않는다.

## 깊은 불변성에 한정한 검증 재사용

두 번째 개선은 검증을 성공한 immutable **전체 VRoot**의 WeakSet 캐시다. 자세한 유효/무효 조건은 [아키텍처](architecture.md)의 no-op 절을 따른다. root 객체를 새로 만들면 radio/form/select 문맥도 다시 검사한다. 불변 데이터 증명 없이 `Object.isFrozen` 하나로 캐시하거나, subtree가 다른 부모로 옮겨도 검증을 생략하는 해법은 사용하지 않는다. PatchPlan/DOM binding을 신뢰하고 preflight를 건너뛰는 해법도 제외했다.

전체 단위·통합 184/184(17파일), typecheck, production build를 통과했다. 추가 8개 검증 테스트는 얕은 freeze, mutable 자식, accessor, custom prototype, 함수 비동결과 새로운 radio/select 문맥을 확인한다.

[두 개선을 적용한 paired smoke](bench/noop-immutable-compare/all-results.md)에서 10,000 stateful cycle median은 같은 참조 296.3→124.6ms, 동등한 새 트리 571.0→386.3ms, Memo 328.8→168.1ms, dirty controlled 285.5→134.1ms였다. **불리한 비용:** 새 트리 생성은 229.0→395.9ms로 증가했다. 깊은 불변성 증명이 최초 생성에 드는 비용이다. 생성과 cycle의 개별 median을 더해 총 median으로 표현하지 않으며, 최종 raw의 표본별 생성+cycle도 별도로 분석한다. 새 트리를 매번 만드는 앱 전체가 같은 비율로 빨라졌다는 주장은 하지 않는다. 이 예비 표본 역시 3개이며 최종 3세션 결과로 대체해 판단한다.

## 최종 성능 검증과 채택 범위

고정 baseline-v1(7757e3c)와 candidate-v1(c4a2fe1)을 동일 하네스로 3세션 비교했다. 측정 23,760개 / 전체 raw 28,728개 / 통계 2,016개가 재계산과 일치했고 counts와 oracle도 모두 통과했다. 47.03분 동안 조건별 새 Chromium 144개를 사용했으며 측정 중 전체 테스트·빌드를 병행하지 않았다. [최종 보고서·전체 표·그림](benchmark-results.md), [감사](bench/noop-full/analysis.json).

10,000 stateful의 cycle median 감소율은 같은 참조 59.8–61.7%, 새 동등 트리 29.0–31.8%, Memo 53.0–54.1%, dirty controlled 57.8–59.4%였다. 생성까지 포함하면 새 동등 트리는 4.7–4.9%, 재배치는 2.7–17.5% 느려졌다. cycle p95는 폼 S1/S2에서 6.2%/5.6%, 재배치 S2에서 8.9% 증가했다. 작은 목록의 해상도 수준 차이와 모든 불리한 결과도 유지한다.

별도 trace에서는 일부 긴 재배치에 MajorGC/weak 처리가 겹쳤으며, CPU sampling은 폼 render의 긴 표본에서 freezeTree 등록 비용도 확인했다. 원본의 모든 지연을 GC로 단정하지 않는다. 최초 증명·대용량 수거 비용과 계속 O(n)인 DOM 검사라는 한계가 남는다. [진단](bench/noop-tail-diagnostic/analysis.json), [CPU 근거](bench/noop-cpu-diagnostic/cpu-analysis.json).

채택한 변경은 참조/Memo를 실제로 재사용하는 큰 목록에서 반복 검증을 줄인다. 새로운 트리를 매번 만드는 경우의 전체 속도 개선, 모든 p95 개선, React 대비 우위나 paint 개선으로 확대 해석하지 않는다. 잘못된 plan·현재 DOM 검사를 건너뛰는 빠른 경로는 추가하지 않았다. 원격 CI·팀원 활동·새 실제 IME 환경 검증은 수행한 것으로 기록하지 않는다.
