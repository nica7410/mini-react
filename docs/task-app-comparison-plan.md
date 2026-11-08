# TaskApp 표현 재사용·엔진 비용 비교 — 사전 계획

2026-11-08, 시작 `phase1 / 4d5a66f`, clean. 후보 A1/E3의 시간 결과를 보기 **전에** 고정한 계획이다. 과거 M8/no-op 자료는 보존한다. 이번 목표 원문은 Codex attachment `edf2df25-63fd-4fa1-af6b-a036872b3a20/goal-objective.md`다.

## 비교 대상과 인과 구분

- E0 = `7757e3c`: 기존 검증/host 비교.
- E1 = `8b302de`: host 비교용 임시 객체 제거만 적용.
- E2 = `c4a2fe1`: 깊은 불변성 증명과 전체 root 검증 캐시 추가.
- A0 = `4d5a66f:src/app/tasks.ts`, 시작 시 실제 TaskApp.
- A1 = 동일 TaskApp의 루트 useMemo로 안정된 행 콜백과 목록 표현을 재사용하는 후보. 기능·데이터·CSS·이벤트 계약은 유지한다.
- 우선 E0/E1/E2 × A0/A1의 여섯 조합. 앱 효과는 같은 엔진의 A0↔A1, 엔진 효과는 같은 앱의 E0↔E1↔E2만 비교한다. 후보 E3는 비교 후 관찰된 병목에 한해 만든다. 채택 비교는 고정 A1에서 기존 엔진과 같은 새 세션/하네스로 다시 수행한다.

과거 소스는 Git 객체에서 별도 `.validation/task-builds` 경로로 추출한다. checkout/branch 변경은 없다. 엔진·앱·CSS·의존성·하네스·빌드 도구·생성 asset SHA와 원 commit을 manifest에 저장한다. 타이밍 빌드는 production이며 heavy trace/profiler를 켜지 않는다.

## 실제 앱과 최소 어댑터

가짜 목록 앱을 만들지 않고 실제 TaskApp을 그대로 import한다. 초기 8개 앱을 mount한 뒤 공개 `root.hooks`의 기존 State setter 두 개(items, nextId)로 고정 seed 데이터를 주입한다. 앱 소스의 초기화/render/Effect를 교체하지 않는다. 이 주입은 benchmark 준비이며 일반 사용자 동작과 구별한다. 초기 mount·주입·실제 40ms 동기화 Effect의 CPU/지연도 따로 보관하고 생명주기당 비용에 포함한다.

주요 조작은 실제 DOM input/change/submit/click을 사용한다. 추가 probe 두 개만 명시적으로 어댑터를 쓴다: (1) 같은 State에서 dirty controlled 복원은 live 값을 준비한 뒤 기존 draft setter에 같은 값을 넣음, (2) 동등한 새 render는 공개 root.update(). 임의 trusted flag나 검증 우회는 없다.

## 행렬과 반복 정책

크기 **10 / 100 / 1,000 / 10,000**, 마지막은 stress로 구별한다. 모든 앱이 동일한 seeded task data, props, 옵션(LIS/microtask/reuse on), viewport, CSS를 사용한다.

| 생명주기 | 작업 | 표본 정책(엔진·앱·크기·세션별) |
|---|---|---|
| 유지: 같은 root/DOM | draft 입력, counter +3, 검색, 완료 필터, 이름/수동 정렬, 마지막→처음, 추가→수정→완료→삭제, dirty 복원, explicit equal render | warm-up 10(10,000은 5), 측정 60회. CRUD 각 하위 작업도 별도 기록 |
| 새 mount마다 1회 | explicit equal render | warm-up 3, 측정 30회. 초기화+갱신 및 갱신만 모두 기록 |

독립 세션 최소 3개. 각 조건/variant는 새 Chromium으로 격리하고 한 번에 한 비교군만 유지한다. variant 순서는 조건별 회전 및 세션별 반전으로 균형화한다. 같은 앱을 유지하는 동안 동작 순서·초기 상태는 모든 variant에서 동일하다. warm-up 상태에서 이어진 측정이며 index/operation model을 저장한다. counts는 별도 실행/realm에서 수집한다. 느린 표본 제거/자동 retry는 없다. 실패 시 전체 실행 중단·부분 raw/trace/입력 보존. 테스트/빌드/프로파일링과 정식 측정을 병행하지 않는다.

60개 p95는 위쪽 약 3표본, fresh 30개는 약 1–2표본에 좌우된다. 이를 정밀한 tail 추정으로 포장하지 않는다. 아래 채택 한계에 걸리거나 세션별 tail 판단이 갈리는 **최종 정책 결정 조건**은 3개 새 세션에서 측정 180회로 보충한다(같은 비교군·앱·하네스·입력, warm-up 유지). 보충 전후 raw를 합치거나 유리한 실행만 선택하지 않는다. 보충 후에도 불확실하면 회귀 없음으로 판정하지 않고 보수적인 정책을 선택/명시한다.

## 측정 경계와 oracle

- root expression 생성은 실제 TaskApp 호출을 감싼 짧은 clock으로 측정한다. render는 그 표현 생성+자식 평가+VDOM 정규화/검증을 포함한다. render−root expression은 파생 VDOM 평가 구간이며 순수 allocation 시간으로 부르지 않는다.
- 기존 onMeasure의 render/diff/commit/flush/Effect를 기록한다. primary action은 dispatch/enqueue→첫 flush/Effect 후 microtask까지다. 중첩 시간을 모두 더하지 않는다.
- items 변경의 기존 40ms Effect와 setSyncedTotal 후속 flush를 실제로 기다린다. primary 지연, 후속 flush CPU, 전체 settle 지연을 분리한다. 총 갱신 CPU는 primary+겹치지 않는 후속 flush/Effect, 생명주기 CPU는 초기화+모든 갱신이다. deliberate 40ms wait를 CPU 개선으로 계산하지 않는다. 초기화 비용을 밖으로 옮긴 개선을 채택하지 않는다.
- 매 표본 독립 모델의 State·visible 순서·text/checked/value·DOM 객체 identity(살아남은 같은 key)·draft/query/filter/sort/counter·Effect 동기화 결과·오류 없음·focus/selection을 확인한다. 삭제 후 다시 만든 row의 identity를 보존됐다고 요구하지 않는다. unmount 자원 정리도 검사한다.
- root/child/TaskRow 실행, Diff 방문, host 생성/삭제/이동/쓰기, Effect setup/cleanup counts를 시간과 분리한다. 표현 실행 감소만으로 시간 개선을 선언하지 않는다.
- 각 세션의 median/IQR/p95/n을 보존한다. 합산 구간은 표본별로 합친 뒤 quantile을 계산한다. 메모리/할당/GC/long task 및 화면 표시 경계는 별도 Chrome 진단 trace로 확인하며 timing에 섞지 않는다. rAF callback이나 enqueue→commit을 paint 완료로 부르지 않는다.

## 사전 채택 기준

기준을 불리한 결과에 맞춰 완화하지 않는다. 미세한 clock/잡음 차이를 위해 절대 오차 하한을 함께 둔다. 각 세션 쌍을 독립적으로 비교하며 효과 크기와 변동을 함께 공개한다.

1. 정확성·불변식·기존 반례·최종 필수 테스트는 무조건 통과해야 한다.
2. 앱 A1: draft/counter/equal에서 행 실행 0(재사용 on)을 확인하고, 1,000/10,000의 총 갱신 CPU median이 적어도 2/3세션에서 10% 이상 감소해야 한다. 다른 작업 median 회귀 허용은 `max(5%, 0.5ms)`, p95는 `max(10%, 1ms)`다. 이를 넘는 회귀는 보충/진단하며 원인 해결 또는 적용 범위 제한 없이 일반 개선으로 채택하지 않는다.
3. 엔진 최종 정책: A1의 반복 재사용 이득을 E1 대비 1,000/10,000에서 10% 이상 유지하는 것이 목표다. 새 생성/CRUD/재배치/폼 및 생명주기 포함 median은 E1 대비 `max(5%, 1ms)`, p95는 `max(10%, 2ms)` 이내를 목표 gate로 한다. 반복 이득이 없거나 gate 회귀가 남으면 안전한 무캐시/좁은 적용 정책을 선택한다. 일부 조건만 통과했다면 그 범위를 구체적으로 표시한다.
4. 초기화/생성 비용, GC·retained heap, 회수에 필요한 재사용 횟수를 함께 판단한다. 더 빠른 median만으로 큰 tail/메모리 회귀를 숨기지 않는다. forced GC는 별도 메모리 진단에서만 사용한다.
5. p95 보충을 포함해 남은 불확실성은 미검증으로 표시한다. 실제 React 우위·모든 환경의 이득·화면 표시 완료는 별도 증거 없이 주장하지 않는다.

## 단계와 완료 증거

- A: 소스·비교 설계·실제 앱 하네스/모델 oracle·baseline smoke를 검증하고 커밋.
- B: 앱 표현/콜백 재사용, 최신 closure/FIFO/identity/입력/Effect on-off 회귀를 검증하고 커밋.
- C: 여섯 조합의 3세션 raw/분포/counts와 분리 분석을 보존하고 커밋.
- D: 측정으로 정당화된 생성/캐시 정책 후보만 구현·반례 검증. 고정 A1에서 재측정/필요한 tail 보충 후 선택.
- E: 최종 소스에서 typecheck/test/build와 기본 Chromium+Firefox 새 서버·브라우저 전체 3회. skip/retry/timeout/worker 정책 유지.
- 문서: 이전 보고서를 역사적 파일로 보존, 현행 보고서·진행·아키텍처·요구사항·인수 상태 갱신. 저장소 밖 체크리스트의 버전/hash/근거를 저장소에 남긴다. 외부 팀/CI/배포와 이전 실제 IME 확인은 시점을 구별한다.
- 종료: 모든 요구사항별 증거 감사, phase1 단계별 커밋, 이번 변경 미커밋 없음.
