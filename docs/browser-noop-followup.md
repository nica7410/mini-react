# 브라우저 안정화와 no-op 비용 재검토

시작: phase1 / `9f3f3d3`, clean. 기존 M0–M8 및 `m8-full`을 보존하고 별도 후속 검증으로 진행한다. 이 문서는 아직 진행 중이다.

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

수정 직후 기본 명령 31/31 PASS, typecheck PASS. [기록](validation/browser-stability/stabilized-before-engine/context.json). 엔진 수정 후 최종 3회 연속 전체 검증은 별도로 수행한다. CI도 같은 서버/준비 조건을 사용하고 진단 JSON을 artifact에 포함한다. 원격 실행은 하지 않았다.

## no-op 실험 사전 정의

`scripts/build-noop.mjs`는 엔진/하네스 SHA 및 commit을 기록한 고정 production bundle을 만든다. 이미 있는 build/tag는 덮어쓰지 않는다. 별도 `--profile` 빌드에만 validation/equality/diff/preflight/DOM binding/host form·focus/evaluation span을 삽입한다. 중첩 span은 inclusive와 exclusive를 각각 기록하며 합산하지 않는다. 프로파일링 숫자는 최종 속도 비교에서 제외한다.

`scripts/benchmark-noop.mjs`의 기본 행렬은 10/100/1,000/10,000 × light/stateful × 6경로 × 3독립 세션이다. 같은 참조, 동등한 새 트리, Memo+무관 상태, 같은 State+dirty controlled, 마지막→처음 재배치, 폼 값 변경이다. 기존 rows fixture를 공유한다. controlled 경로는 목록 밖 제어 input 하나를 추가한다. native 이벤트 dispatch 자체는 시간 경계 밖이며 별도 브라우저 회귀가 담당한다.

일반 조건 warm-up 20+측정100, stress 5+30. counts는 별도 실행. 조건마다 새 Chromium, 엔진별 page/module realm, 매 표본 fresh DOM, paired 교대 순서와 세션별 역순으로 편향을 줄인다. 준비·정답 검사·프로세스 기동은 cycle 밖이다. core diff+commit 및 runtime enqueue→다음 microtask 경계는 기존 보고서와 같다. target 표현 생성은 별도 구간이다. 이 측정은 paint가 아니다.

각 실행에서 모든 row의 순서/identity/텍스트/속성/사용자 입력, controlled 복원, State/Effect/dirty 인정, unmount 자원 정리를 검사한다. 실패·시간초과는 전체 실행 중단과 부분 원본 보존으로 처리하고 재시도나 느린 표본 제외를 하지 않는다. 하네스 자체의 12개 counts/oracle 회귀와 타입 검사를 통과했다.
