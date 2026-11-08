# TaskApp 표현 재사용·캐시 정책 후속 작업

시작 phase1 / 4d5a66f, clean. [사전 비교·채택 계획](task-app-comparison-plan.md), [출처·초기 검증](validation/task-app-start.json). 이번 목표는 실제 앱의 행 표현 재사용과 E0/E1/E2 × A0/A1의 분리 비교, 측정에 따른 생성/p95 개선 또는 캐시 범위 조정이다. 진행 중이며 과거 통과 기록으로 완료 처리하지 않는다.

## A — 설계·기준선·실제 앱 하네스

TaskApp은 visible 배열과 Summary 표현만 Memo하고 row 표현과 세 callback은 매번 생성함을 확인했다. useState setter는 기존 슬롯에서 동일 함수이며 함수형 action은 FIFO 후보 상태에 적용된다. E0→E1은 planValidation host 비교, E1→E2는 동결/검증 캐시 관련 4개 기능 파일의 변경이다.

Git 객체의 엔진/앱/의존성과 공통 harness를 별도 경로에 복사해 production bundle을 만들었다. A0 앱 소스는 변형 없이 import하며 초기 데이터만 공개 root State setter로 주입한다. 실제 40ms Effect와 후속 render도 실행한다. 모든 조작에 State/DOM/입력/순서/identity/focus/selection oracle을 적용한다. row 실행 counts와 primary/후속/초기화 시간은 분리한다.

타입 검사, 하네스 11개 단위·통합 테스트, 세 엔진의 10개 작은 조건과 E0의 10000개 persistent/fresh equal smoke를 통과했다. [작은 조건](bench/task-baseline-smoke-v1/analysis.json), [stress](bench/task-baseline-stress-smoke-v1/analysis.json). 표본 2개의 smoke는 정식 성능 결론이 아니다.

## B — 실제 앱 표현·callback 재사용

루트 useMemo로 rowActions를 [setItems]에, 목록 표현을 [visible, rowActions]에 의존시켰다. 콜백은 items를 캡처하지 않고 함수형 updater의 최신 FIFO 후보를 사용한다. add는 draft/nextId를 사용하는 기존 render별 closure를 유지한다. 자식 Hook이나 함수 props 무시 비교는 추가하지 않았다.

관련 64개 테스트와 typecheck/production build, Chromium/Firefox TaskApp 8개 테스트를 통과했다. 10개 seeded row의 draft/counter/explicit render는 reuse on에서 행 실행 0, off에서 10회이며 State/DOM/입력/Effect sequence는 같다. 연속 rename/toggle/delete와 +1×3의 최신 상태·setter identity도 검증했다. [증거](validation/task-app-b/result.json). 정식 시간 결과는 아래 C에 기록하며, 최종 정책 채택과는 구분한다.

## C — 정식 비교·원자료 감사·분리 진단 완료

E0/E1/E2 × A0/A1의 10개 작은 조건 smoke는 120개 측정 작업/168개 action, A1 E2의 10,000개 모든 작업 smoke는 20개 측정 작업/28개 action의 oracle 및 원본 감사를 통과했다. [6조합 smoke](bench/task-matrix-smoke-v1/analysis.json), [A1 stress smoke](bench/task-app-stress-smoke-v1/analysis.json). 작은 smoke 표본을 성능 채택 근거로 사용하지 않는다.

`task-matrix-v1`은 2026-11-08 12:44~20:24 KST에 사전 계획의 3세션을 실행했다. 모든 조합의 production asset과 source archive를 먼저 고정했으며 측정 중 하네스·앱·엔진은 변경하지 않았다. 별도 테스트/build/profiler도 병행하지 않았고 문서 및 사후 분석 도구만 준비했다.

세 세션은 각각 15:04, 17:29, 20:24 KST에 240/240 조건을 통과했다. 전체 720건의 성공·종료·정리, 실패 0, 압축 원자료 저장과 실행 exit 0을 확인했다. raw 48,294행 = counts 720 + 초기화 648 + warm-up 5,886 + 측정 작업 41,040이며 측정 action은 58,320개다. [실행 환경](bench/task-matrix-v1/environment.json), [원자료 감사](bench/task-matrix-v1/analysis.json).

통계 도구는 같은 엔진의 A0/A1, 같은 앱의 E0/E1/E2를 짝지어 비교했다. 초기화와 warm-up을 포함한 누적 비용은 독립 표본 분포와 분리했다. 정식 측정 종료 뒤 도구 구문 검사와 두 smoke 원자료 검산을 통과한 다음, 전체 통계 12,024개·비교 18,036개·누적 경로 66,825점·그래프 240점을 독립 재계산했다. CSV/Markdown의 누락·중복과 변조된 p95 검출도 통과했다. 두 PNG의 축·라벨·범례·세션 표시를 실제로 확인했다. [통계 감사](bench/task-matrix-v1/statistics-audit.json), [첫 결과 해석](task-app-baseline-results.md).

경계 해석: raw의 `totalCpuMs`는 첫 처리와 겹치지 않는 후속 flush/Effect의 **경과 시간 합계**이며 OS 스레드 CPU 시간이 아니다. `initialization.cpuMs`는 실제 기본 mount·데이터 주입·동기화에서 발생한 flush/Effect 구간의 합이다. 독립 모델 준비, 초기 데이터 복사, root 생성자와 dispose 전체 시간까지 포함한 앱 프로세스 총비용을 뜻하지 않는다. fresh lifecycle도 이 정의의 초기화와 갱신을 합한 값이다. VDOM 생성·정규화·검증은 render에 포함되며 최적화 후보에서 이를 계측 구간 밖으로 옮기지 않는다.

하네스 코드 재검토로 더 정확히 구분한 경계: `primaryMs`는 **dispatch closure 진입 직전부터 첫 flush/Effect 뒤 microtask까지**다. counter/move의 버튼 검색, delete의 대상 검색, add의 form 검색, dirty의 기존 setter 조회가 이 closure 안에 들어 있다. 입력·검색·이름 수정·필터·정렬·완료 변경의 대상 조회와 native value 준비는 clock 밖이다. 따라서 `primaryMs`/`totalCpuMs`를 순수 엔진 CPU 또는 실제 이벤트 전달 시각부터의 지연이라고 부르지 않는다. 같은 작업·데이터·하네스를 사용한 비교에는 이 보조 비용도 모두 포함한다. render/diff/commit은 별도의 내부 구간이며, 향후 직접 click→Paint 진단은 버튼 조회를 먼저 마치므로 절대 시간을 이 표본과 합치거나 그대로 대조하지 않는다. 이 보완은 결과 수치를 분석하기 전 소스 확인으로 기록했으며 고정 하네스와 채택 기준은 변경하지 않았다.

누적 비용의 `updateCount`는 작업 묶음의 반복 횟수다. CRUD 한 묶음은 사용자 action 5개이고 나머지는 1개다. root render나 flush 횟수와 같지 않다. 비용 회수 시점은 같은 작업·세션의 두 누적 경로끼리 비교하며, 초기화와 warm-up을 포함한 관찰 구간의 교차점으로만 설명한다.

진단 도구는 고정 소스의 별도 unminified production 사본에서 CPU/할당 sampling, GC/longtask, forced-GC retained heap, 실제 Paint trace를 수집했다. 작은 진단 12개, 1,000/10,000개 진단 24개 조건 모두 수집·분석을 통과했다. [진단 결과](bench/task-diagnostic-baseline-v1/diagnostics.md). 진단의 계측 비용을 정식 시간 결과와 합치지 않는다. 새 트리의 동결·증명과 보유 heap 비용이 관찰돼 이 범위에 한해 후보를 검토한다.

진단 smoke의 최초 분석은 CPU sample accounting 검사에서 실패했다. Chrome 원자료에 음수 timeDelta가 있어 기존 순서 그대로 구간을 더하면 5.325ms 창이 5.336ms로 중복 합산됐다. 원본·실패 기록을 보존하고, 모든 delta로 절대 timestamp를 복원한 뒤 timestamp/sample 쌍을 함께 정렬하도록 수정했다. 이후 12개 조건의 모든 표시 구간 합계가 일치했다. [실패·수정 근거](bench/task-diagnostic-smoke-v1/analysis-failure-initial.json), [수정 후 감사](bench/task-diagnostic-smoke-v1/diagnostic-audit.json). [CDP 정의](https://raw.githubusercontent.com/ChromeDevTools/devtools-protocol/master/json/js_protocol.json)와 [DevTools의 쌍 정렬](https://raw.githubusercontent.com/ChromeDevTools/devtools-frontend/main/front_end/models/cpu_profile/CPUProfileDataModel.ts)을 확인했다. 자체 가중치는 정렬된 표본의 직전 구간을 사용하는 근사이며 DevTools UI의 모든 집계 방식과 동일하다는 뜻은 아니다.

기존 no-op 성능 보고서는 [역사적 사본](benchmark-results-noop.md)에 원문을 보존했다. 시작 시 파일과 사본의 SHA-256은 모두 `6292559a91d65b6bf9e6730979f5d1bb3e5898efff9823ab623871c8a5b6d75b`다. 줄바꿈까지 동일한 원본 gzip과 Git 출처는 [보존 영수증](validation/task-app-previous-report.json)에 있다. 현행 보고서를 새 결과로 갱신하더라도 이전 원문·원자료를 대체하지 않는다.

## D — 증명 보관 방식 수정, 정식 비교 감사 완료·진단/보충 진행

단계 C의 결과를 `dfd20dc`에 커밋한 뒤, `src/core/vdom.ts`만 바꾼 E3 후보 `ff9e24e`를 만들었다. 동결 이후의 최종 구조를 검사하고 자식 증명을 boolean으로 전달하며, 장기 인증을 모든 보조 객체 대신 명시적인 인수와 VNode/root 경계에 보관한다. 전체 root의 문맥 검증 캐시와 실제 DOM/plan/폼/Effect 검사는 유지한다. [후보 원리와 비교 정의](task-app-engine-candidate.md).

변경 전 E2에서 Proxy 반례 두 개가 실제 실패했다. 원본 실패를 보존했고, 수정 후 관련 19/19·전체 단위/통합 203/203·typecheck/build를 통과했다. 작은 40개 조건과 10,000개 stress 10개 조건의 oracle·통계 검산도 통과했다. 이 수치를 최종 전체 브라우저 인수로 바꿔 부르지 않는다.

`task-candidate-v1`은 2026-11-08 21:04부터 2026-11-09 02:08 KST까지 실행했다. 고정 A1에서 E1/E2/E3를 비교하고, E3 A0도 함께 실행해 후보 엔진에서의 앱 효과를 따로 확인했다. 원래 4크기·모든 작업·persistent/fresh·3세션·60/30 표본 정책을 유지했다. 측정 중 기능 소스·하네스·runner·사전 기준을 수정하지 않았고 테스트/build/profiling도 병행하지 않았다.

세 세션 각각 160개 조건, 전체 480개 조건의 수집과 종료가 통과했다. raw 32,196행, 측정 작업 27,360회/action 38,880개, 통계·비교 각 8,016개, 누적 경로 29,700점, 그림 480점을 독립 재계산했다. 네 PNG를 실제로 확인했고 PNG/SVG hash도 일치했다. 새 판정 감사 도구는 비교 누락·중복과 모든 사전 gate를 확인하며, 의도적으로 뒤집은 p95 판정도 거절했다. 먼저 기존 E3 작은 smoke에서 도구를 확인한 뒤 정식 결과에 적용했다. [통계 감사](bench/task-candidate-v1/statistics-audit.json), [판정 감사](bench/task-candidate-v1/policy-audit.json), [그림 확인](bench/task-candidate-v1/plot-validation.json).

반복 재사용의 median 목표는 충족했지만 엔진 비교 5개·앱 비교 6개 조건이 사전 범위를 한 번 이상 넘었다. 특히 S1 stress 검색/정렬, 이동 p95, CRUD 하위 toggle과 작은 입력 복원을 제외하지 않았다. [모든 초과 조건](bench/task-candidate-v1/policy-review-e3.md), [보충 계획](bench/task-candidate-v1/tail-supplement-plan-e3.json). 같은 네 비교군의 새 3세션 n=180 보충 대상은 100개 search/filter/dirty, 1,000개 CRUD, 10,000개 search/sort/move/CRUD다. 원래 표본과 합치지 않는다.

정식 수집 종료 뒤 `task-diagnostic-candidate-v1`에서 고정 A1의 E1/E2/E3 CPU·할당·GC·메모리·Paint 진단 36개 조건의 수집·분석·기능 소스 hash 감사를 완료했다. E3는 E2보다 동결·증명 self 비중과 보유 heap이 줄었지만 allocation 추정량은 줄지 않았고, dispose 뒤 heap은 E1보다 컸다. 정의한 Paint 경계의 move에서도 불리한 관측을 보존했다. [진단 결과](bench/task-diagnostic-candidate-v1/diagnostics.md), [후보 해석](task-app-engine-candidate.md). 보충 실행과 최종 캐시 정책 선택은 남아 있다. 프로파일링을 정식 timing과 병행하지 않았다.

## 남은 단계

원본 체크리스트는 진행 상태 **v1.11**로 갱신했다. E3의 반복 회귀와 일반 채택 기각, 완료/중단/미실행 보충 및 E4 후보 정확성을 구분했다. 최종 정책·새 정식 비교·전체 브라우저 인수는 아직 미완료다. [버전·전후 SHA-256·압축 사본](validation/task-checklist-bounded-candidate.json)을 이전 영수증과 함께 보존한다. 실제 Desktop 원본은 저장소 밖에 있다.

입력 방식의 범위: 벤치마크는 실제 TaskApp에 프로그램으로 DOM Event와 HTMLElement.click을 전달한다. native value/checked 준비와 dirty/equal probe는 하네스에 명시되어 있다. 물리 키보드 입력부터의 지연, trusted 사용자 이벤트의 전체 경로, 실제 IME 검증을 대신하지 않는다. [측정 경계 보완 기록](bench/task-matrix-v1/measurement-boundaries.json)을 정식 결과와 함께 해석한다.

- C: 6조합 × 3세션, 원자료·표·그래프 감사와 별도 진단은 완료. 단계별 결과 커밋에 보존한다.
- D: 후보의 정식 3세션·원자료/판정/그림 감사와 별도 진단 36개는 완료하고 93bc38c에 보존했다. [새 n=180 보충](task-app-tail-results.md)의 1,000개 CRUD 12개 조건·원자료/판정 감사를 완료했지만 toggle 회귀가 세 세션 모두 남아 현재 E3/A1의 일반 채택을 기각했다. 10,000개 보충은 첫 세션 완료 뒤 중단해 모든 raw와 종료/보존 기록을 남겼고, 100개 보충은 미실행이다. 이 불완전한 보충을 PASS로 사용하지 않는다. 고정 E3 A0/A1의 별도 진단 뒤 보수적 적용 범위 조정과 최종 인수를 진행한다.
- E: 최종 소스에서 전체 단위·통합·타입·build·기본 브라우저 3회, 문서/원본 체크리스트·hash/커밋/clean 감사.

E4 후보 `2a21ec7`는 호출당 새 증명 인증을 64개까지 보관하며 예산 소진 뒤에도 전체 깊은 검사를 계속한다. E3의 Proxy 수정과 앱 A1은 유지했다. 관련 14개·전체 205개·typecheck/build 및 작은 40개/stress 10개 smoke·원자료 감사를 통과했다. [후보 원리·새 비교 계획](task-app-bounded-candidate.md). 새 정식 실행은 `task-candidate-v2`이며 최종 채택 전 상태다.
