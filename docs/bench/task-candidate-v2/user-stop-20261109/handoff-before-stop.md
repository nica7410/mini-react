# Mini React 프로젝트 목표와 Claude Code 작업 인계

이 프로젝트는 **DOM 정체성과 입력 상태를 유지하면서 렌더링 비용을 줄이고, 최적화의 이득과 비용을 재현 가능한 실험으로 설명하는 Mini React**를 만드는 작업이다. 과제의 B안 기술 구현은 M8까지 완료됐고, 현재는 실제 앱의 표현 재사용과 VDOM 검증 캐시 정책을 마무리하는 단계다.

**Claude Code는 엔진을 처음부터 만들거나 전체 벤치마크를 다시 시작할 필요가 없다. E4 보충 결과 확인 → 최종 캐시 정책 결정 → 필요한 수정 → 최종 검증 → 문서와 체크리스트 갱신 → 현재 브랜치 커밋 순서로 이어간다.**

- 작성 기준: **2026-11-09 14:32 KST**. 실행 중 프로세스는 재개 직전에 다시 확인한다.
- 저장소: `C:\Github\mini-react`
- 브랜치 / HEAD: `phase1` / `ae155cc3ea2982af7ac0365f6f62fc3ae5a03eb4`
- 로컬 추적 정보상 `origin/phase1`보다 27커밋 앞섬. 원격 fetch로 확인한 서버 상태는 아니다.
- 기존 체크리스트: v1.11. 최종 후속 작업 인수 전이며 최신 E4 분석이 아직 반영되지 않았다.
- 이번 인계 작성에서는 코드 변경, 테스트·벤치마크 신규 실행, 커밋, 프로세스 중단을 하지 않았다.

## 1. 재개 전에 가장 먼저 확인할 실행 상태

원래 중단된 Codex 구현 대화의 마지막 메시지는 480개 조건 중 456개 완료였지만, 별도 실행 중이던 정식 측정은 이후 끝났다. 그 메시지부터 다시 측정하지 않는다.

| 실행 | 확인 상태 | 근거 |
|---|---|---|
| E4 정식 비교 `task-candidate-v2` | 11월 9일 06:17 시작, **11:13 종료**, 3세션 완료 | [환경](C:/Github/mini-react/docs/bench/task-candidate-v2/environment.json) |
| E4 원자료와 통계 분석 | **14:14 완료 기록**, raw 32,196행, 측정 작업 27,360회, 통계 8,016개 감사 통과 | [분석](C:/Github/mini-react/docs/bench/task-candidate-v2/analysis.json), [통계 감사](C:/Github/mini-react/docs/bench/task-candidate-v2/statistics-audit.json), [판정 감사](C:/Github/mini-react/docs/bench/task-candidate-v2/policy-audit.json) |
| E4 100개 보충 `task-candidate-v2-tail-persistent-100-v1` | **14:18 시작, 14:31 종료**, 3세션 수집 완료. 분석은 아직 없음 | [환경](C:/Github/mini-react/docs/bench/task-candidate-v2-tail-persistent-100-v1/environment.json) |
| E4 10,000개 보충 `task-candidate-v2-tail-persistent-10000-v1` | **14:31 자동 시작, 14:32 현재 실행 중** | [환경](C:/Github/mini-react/docs/bench/task-candidate-v2-tail-persistent-10000-v1/environment.json) |
| E4 10개 보충 | 14:32 현재 미시작. 위 실행 뒤 자동 실행 목록에 있음 | [보충 계획](C:/Github/mini-react/docs/bench/task-candidate-v2/tail-supplement-plan-e4.json) |
| 최종 정책 채택 / 최종 전체 브라우저 인수 | **미완료** | [완료 조건 대조](C:/Github/mini-react/docs/task-app-completion-audit.md) |

**주의: 대화가 중단돼 있어도 별도 보충 측정 드라이버는 동작하고 있다.** 14:32 확인 시 부모 PID는 `10584`, 현재 10,000개 측정 자식 PID는 `21240`이다. 이전 100개 측정 PID `19004`는 종료됐다. PID는 재사용될 수 있으므로 숫자만으로 제어하지 말고 명령행·시작 시각을 다시 대조한다.

- 드라이버: [e4-supplement-driver.mjs](C:/Github/mini-react/.validation/e4-supplement-driver.mjs)
- 로그: [실행 로그](C:/Github/mini-react/.validation/e4-supplement-run.log), [오류 로그](C:/Github/mini-react/.validation/e4-supplement-error.log)
- 실행 순서: **100개 search/sort/CRUD → 10,000개 move/CRUD → 10개 sort**. 각각 4비교군·3세션·n=180이며, 모든 측정을 끝낸 뒤 분석을 수행하는 구조다.
- 따라서 100개 측정이 끝나도 그 결과의 분석 파일이 바로 생기지 않을 수 있다. 이는 자동 분석 순서의 문제이지 곧바로 수집 실패를 뜻하지 않는다.
- 드라이버와 중간 raw는 Git 제외 경로인 `.validation`에 있다. 다른 컴퓨터로 이동할 때 Git clone만으로 복구되지 않는다.

사용자는 장시간 측정을 문제로 지적했고, 이전에는 “현재 측정만 끝까지 실행”을 선택했다. 이 인계 문서가 드라이버의 후속 대규모 실행 전체를 새로 승인하는 것은 아니다. **실행 중인 작업과 이어받을 범위를 먼저 정리하고, 같은 측정·테스트를 중복 실행하지 않는다.** 필요 이상으로 추가 측정을 이어가기 전에 기존 결과로 결정할 수 있는지 확인한다.

## 2. 프로젝트 목표와 바꾸면 안 되는 범위

목표는 세 가지다. 첫째, 상태 변화가 컴포넌트 실행과 DOM 수정으로 이어지는 원리를 직접 구현한다. 둘째, 화면 모양뿐 아니라 DOM 객체·입력값·포커스·History·Hook 의미론의 정확성을 지킨다. 셋째, 선택한 최적화가 어떤 입력에서 유리하거나 불리한지 코드와 측정으로 설명한다.

| 구분 | 반드시 유지할 기능과 제약 |
|---|---|
| Phase 1 | 실제 DOM → VDOM, Diff, Patch, 실제/테스트 영역, 직접 편집, Patch 버튼, VDOM History, Undo/Redo와 두 영역 동기화 |
| Phase 2 | 함수형 컴포넌트, `FunctionComponent` 클래스, `hooks` 배열, `mount()`·`update()`, `useState`·`useEffect`·`useMemo`, 입력·클릭에 따른 자동 갱신 |
| 상태 소유 | State와 Hooks는 최상위 루트에서만 사용. 자식은 Props를 받는 순수 함수 |
| 공통 엔진 | Phase 2도 Phase 1의 VDOM → Diff → Patch를 재사용 |
| 개발 환경 | TypeScript·Vite. 앱 구현에 React/Vue 등 외부 UI 프레임워크를 사용하지 않음 |
| 정확성 | DOM identity, mount/revision, 부모·anchor·PatchPlan 검증, 폼·focus·selection·IME, FIFO·Effect·Memo 의미론 보존 |

차별화 범위는 **Keyed Greedy/LIS 비교, FIFO Batching, 명시적 표현 재사용, 검증 가능한 PatchPlan, Inspector, 실제 브라우저와 원자료 기반 성능 검증**이다. Batching·Memo 같은 기존 React 기술을 자체 엔진에 구현한 것과 실제 React 알고리즘 개선 연구는 구분한다. 현재 결과는 자체 엔진의 선택지 비교이며 React 본체보다 일반적으로 빠르다는 증거가 아니다.

이번 마무리에서 Fiber/Concurrent Rendering, 외부 Store, 자식 Hooks, 자동 props memo, Adaptive LIS, 가상 스크롤, SSR/Hydration, keyed Fragment, Phase 2 Time Travel, React 본체 소스 수정으로 범위를 확장하지 않는다. 삽입 위치 탐색 등 실제 React 개선 연구는 별도 후속 연구다.

## 3. 현재 엔진의 구조

```text
Phase 1
실제 DOM / 편집 DOM → captureDOM → 불변 VRoot
                                      ↓
Phase 2                          공통 Diff → PatchPlan
이벤트 → FIFO 후보 State              ↓
→ 루트 함수 → h 표현식 → resolve → 검증 → commit → 실제 DOM
                                                   ↓
                            성공 후 State·Memo 확정 / Effect 처리

Phase 1 History = 불변 VRoot + cursor
실제 DOM 연결 = 각 mount가 별도로 소유
```

| 영역 | 역할 | 우선 읽을 코드 |
|---|---|---|
| 데이터 계약 | VRoot/VNode, NodeRef, MountView, PatchPlan | [types.ts](C:/Github/mini-react/src/core/types.ts) |
| DOM 캡처와 연결 | `readDOM`, `captureDOM`, `adoptCapture`, mount별 binding | [capture.ts](C:/Github/mini-react/src/core/capture.ts), [mount.ts](C:/Github/mini-react/src/core/mount.ts) |
| 비교와 재배치 | `diff(base, target, options)`, 같은 매칭 규칙 위의 Greedy/LIS | [reconcile.ts](C:/Github/mini-react/src/core/reconcile.ts), [keyed.ts](C:/Github/mini-react/src/core/keyed.ts) |
| 검증과 실제 쓰기 | plan 모의 적용·revision/binding 검사, `commit(mount, plan)` | [planValidation.ts](C:/Github/mini-react/src/core/planValidation.ts), [patch.ts](C:/Github/mini-react/src/core/patch.ts) |
| 현재 개선 대상 | 엔진 소유 데이터 동결·깊은 불변성 증명, 전체 root 검증 캐시 | [vdom.ts](C:/Github/mini-react/src/core/vdom.ts), [validate.ts](C:/Github/mini-react/src/core/validate.ts) |
| State와 Hooks | 루트 Hook 슬롯, 후보 State, FIFO 큐, Effect·Memo | [FunctionComponent.ts](C:/Github/mini-react/src/runtime/FunctionComponent.ts), [hooks.ts](C:/Github/mini-react/src/runtime/hooks.ts), [updateQueue.ts](C:/Github/mini-react/src/runtime/updateQueue.ts) |
| 표현 재사용 | 동일 expression과 논리 위치의 평가 기록 재사용 | [resolve.ts](C:/Github/mini-react/src/runtime/resolve.ts), [expression.ts](C:/Github/mini-react/src/runtime/expression.ts) |
| 편집기와 History | 직접 편집, Patch, Undo/Redo 전 재캡처 | [controller.ts](C:/Github/mini-react/src/editor/controller.ts), [history.ts](C:/Github/mini-react/src/editor/history.ts) |
| 폼과 입력 | controlled/uncontrolled, 이벤트, focus/selection, composition 보호 | [forms.ts](C:/Github/mini-react/src/core/host/forms.ts), [events.ts](C:/Github/mini-react/src/core/host/events.ts), [browserState.ts](C:/Github/mini-react/src/core/host/browserState.ts) |
| 실제 앱과 관찰 | TaskApp, 목록, Inspector | [tasks.ts](C:/Github/mini-react/src/app/tasks.ts), [inspector.ts](C:/Github/mini-react/src/observe/inspector.ts) |
| 실제 앱 측정 | 실제 TaskApp 어댑터와 독립 모델 | [task-app.ts](C:/Github/mini-react/src/bench/task-app.ts), [task-model.ts](C:/Github/mini-react/src/bench/task-model.ts) |

유지할 세부 원칙:

- Keyed 경로는 같은 부모의 직접 자식이 모두 고유 key의 element인 지원 범위에 적용한다. 혼합·누락 key는 위치 기반 처리, 중복 key는 오류다. 숫자 `1`과 문자열 `"1"`은 같은 key다.
- LIS의 최소 이동은 같은 부모·호환 identity·항목당 하나의 host root·균일 이동 비용 모델의 결과다. layout·paint·전체 시간을 최소화한다는 뜻은 아니다.
- Diff는 DOM을 쓰지 않는다. preflight 거절은 DOM 쓰기 0회다. 실행 도중 host API 예외는 faulted 처리하며 완전한 DOM rollback을 보장하지 않는다.
- DOM이 no-op이어도 현재 binding 검사, 필요한 controlled 입력 복원, 실제 render의 deps 규칙에 따른 Effect는 유지한다.
- IME 충돌은 plan을 보류한 뒤 조합 종료 후 최신 State로 새 plan을 만든다. 오래된 plan을 다시 실행하지 않는다.
- History는 DOM·Hook 상태·closure를 저장하지 않는다. Undo/Redo 전 현재 편집 DOM을 재캡처해 미확정 편집의 잔여 노드를 제거한다.

## 4. 완료한 개발과 검증

아래 숫자는 **각 소스 시점에 저장된 검증 기록**이다. 현재 최종 소스를 새로 검증했다는 뜻으로 재사용하지 않는다.

| 단계 | 실제 진행 내용 | 상태와 근거 |
|---|---|---|
| M0~M1 | 공통 계약, 최소 DOM 편집기·History·Diff/Patch·루트 Hooks·카운터 | 구현 완료. 당시 단위·통합 52개, 브라우저 4개 |
| M2 | 현재 기준 구현 잠정 선정 | 완료. 다른 팀 후보 비교·실제 팀 합의는 미확인 |
| M3 | Patch 사전 검증, 폼·이벤트·fault 처리 | 당시 단위·통합 95개, Chromium 9개 |
| M4 | 공통 매칭 위 Greedy/LIS, 전수·BFS·seed·실제 DOM 확인 | 당시 113개+브라우저 10개. LIS 기본 활성화 |
| M5 | FIFO microtask Batching, 표현 재사용 | 당시 138개+브라우저 12개 |
| M6~M8 | Inspector·벤치마크·실제 목록 앱·focus/IME·요구사항 추적·기술 인수 | 당시 157개, Chromium 19+Firefox 10. M8 원자료 51,480개 측정 |
| 브라우저 안정화와 no-op 후속 | 모듈 준비 확인, 긴 CRUD 테스트 분리, host 임시 객체 제거, 불변 전체 root 검증 재사용 | 184개, 브라우저 31개를 새 서버·브라우저에서 3회. 타입/build 통과. `4d5a66f`까지 마무리 |
| A 단계 | E0/E1/E2와 A0/A1, 실제 앱 하네스·모델·사전 gate 고정 | `6c3fa1f` 완료 |
| B 단계 | TaskApp의 안정된 행 콜백과 목록 표현 Memo | `5ed7f34` 완료. 관련 64개·앱 브라우저 8개·타입/build |
| C 단계 | 3엔진 × 2앱, 720조건·3세션, 별도 진단 24조건 | `dfd20dc` 완료. 원자료·통계 감사 보존 |
| D 단계 E3 | 동결 후 최종 구조 증명, 인증 보관 경계 변경, Proxy 반례 수정 | 203개·타입/build. 정식 480조건·별도 진단 36조건 후 **일반 채택 기각** |
| D 단계 E4 | 깊은 검사는 유지하고 호출당 새 인증 보관을 최대 64개로 제한 | `2a21ec7`, 관련 14개·전체 205개·타입/build, smoke 통과. 정식 480조건 수집·감사 완료, **정책 판단 진행 중** |
| E 단계 | 선택한 최종 소스의 전체 검증·문서·체크리스트·커밋 인수 | **남은 작업** |

실제 Windows 한글 IME는 2026-11-07 사용자가 “직접 확인 완료 — 문제 없음”으로 보고한 기록이다. 브라우저명·버전은 미제공이며 E4에서 새 수동 검증을 수행한 것은 아니다. 팀 활동·원격 CI·push·배포도 완료로 표시하지 않는다.

## 5. 테스트 이외에 실제로 변경된 코드

이번 실제 앱 GOAL의 시작점 `4d5a66f`부터 현재 HEAD까지 일반 앱·엔진 실행 코드의 차이는 **2파일, 추가 42줄·삭제 24줄**이다. 측정 하네스·테스트·문서 변경은 별도다.

| 커밋 | 파일 | 실제 변경 |
|---|---|---|
| `5ed7f34` | `src/app/tasks.ts` | `[setItems]`로 rename/toggle/remove 콜백 묶음을 Memo하고 `[visible, rowActions]`로 목록 표현을 Memo. 함수형 updater로 최신 State를 사용. draft/counter 변경 시 기존 TaskRow 평가 생략 |
| `ff9e24e` | `src/core/vdom.ts` | Object.freeze 이후 최종 prototype/descriptor를 증명해 Proxy 반례 수정. 임시 재귀 guard를 Set으로 관리하고 자식 증명을 전달. 장기 인증을 root/VNode 경계에 보관 |
| `2a21ec7` | `src/core/vdom.ts` | 한 freezeTree 호출에서 새로 보관하는 인증 수를 최대 64개로 제한. 한도 소진 후에도 모든 하위 데이터를 동결·검사 |

E3 성능 정책을 기각했다고 Proxy 정확성 수정까지 되돌리면 안 된다. E4에서도 이 수정은 유지된다. 인증 상한 64는 **호출당 새 등록 상한**이며 전역 메모리나 모든 History의 합계 상한은 아니다. 사용자 props/state나 함수를 임의로 동결하는 구조가 아니다.

캐시는 **깊은 불변성과 문맥 검증이 성공한 동일 VRoot 전체 객체**에만 적용한다. DOM·mount·revision·PatchPlan을 캐시하지 않고, 다른 부모·radio·select 문맥에 subtree의 검증 결과를 무조건 전파하지 않는다.

## 6. 성능 결과와 아직 결정하지 못한 부분

### 비교 버전

| 이름 | 기준 | 의미 |
|---|---|---|
| E0 | `7757e3c` | no-op 최적화 전 |
| E1 | `8b302de` | host 비교용 임시 객체 제거 |
| E2 | `c4a2fe1` | 깊은 불변성 증명과 전체 root 검증 캐시 |
| E3 | `ff9e24e` | 증명 순서와 보관 경계 수정. 일반 채택 기각 |
| E4 | `2a21ec7` | 새 인증 보관 수 제한. 현재 후보 |
| A0 | `4d5a66f`의 TaskApp | 표현 재사용 변경 전 실제 앱 |
| A1 | `5ed7f34`의 TaskApp | 콜백·목록 표현 재사용 앱 |

앱 효과는 동일 엔진의 A0/A1, 엔진 효과는 동일 앱의 E1/E2/E4 등 **같은 실행·세션 안의 쌍**으로 비교한다. 서로 다른 측정 실행에 있는 E3/E4의 절대 시간을 그대로 전후 비교하지 않는다.

### 확인된 이득과 비용

- M8: 1,000개 stateful Batching에서 함수형 +1 세 번의 최종 +3을 유지하며 실행·commit 3→1회, 세션별 median 62.9~64.1% 감소. 표현 재사용은 무관한 상태 변경에서 median 53.3~55.0% 감소. [M8 보고서](C:/Github/mini-react/docs/benchmark-results-m8.md)
- no-op 후속: 10,000개 같은 VDOM 참조 갱신 median 59.8~61.7% 감소. 반면 새 VDOM 생성+갱신은 약 5% 악화, 일부 재배치·p95도 악화. [보존된 no-op 보고서](C:/Github/mini-react/docs/benchmark-results-noop.md)
- 실제 앱 6조합: A1의 draft/counter/equal 재사용에서 개선 확인. E2 고정·10,000개 counter의 A0→A1 median은 세션별 약 78% 감소. 새 목록 생성·검색·정렬과 tail은 별도 회귀 존재. [초기 실제 앱 결과](C:/Github/mini-react/docs/task-app-baseline-results.md)
- E3: 1,000개 CRUD의 새 3세션 n=180에서도 A0→A1 toggle median이 +44.02/+14.94/+13.37%, p95가 +61.26/+29.73/+29.57%로 악화해 일반 채택 기각. [후속 결과](C:/Github/mini-react/docs/task-app-tail-results.md)
- **E4 초기 결과:** 1,000개 counter에서 E1→E4 A1 median은 50.88/50.18/51.14% 감소, 동일 E4 A0→A1은 77.14/76.41/76.10% 감소. 그러나 엔진 비교 68조건 중 6개, 앱 비교 68조건 중 5개가 median 또는 p95 gate를 한 번 이상 초과했다. 대부분 S3에 나타나며 100개 CRUD·검색·정렬, 10개 정렬, stress 조건이 포함된다. 이 수는 기능 실패나 통계적 유의성 판정이 아니다. [E4 정책 판단 자료](C:/Github/mini-react/docs/bench/task-candidate-v2/policy-review-e4.md)

E4 결과에 `status: passed`가 있다는 것은 해당 수집·통계·판정 계산이 통과했다는 뜻이다. **최적화 일반 채택 통과를 뜻하지 않는다.** 현재 초과 목록에 1,000개 조건은 없지만, 초기 표본만으로 모든 작업과 환경의 p95 회귀가 해소됐다고 단정하지 않는다. E4의 새 분리 진단·최종 정책·최종 브라우저 인수는 별도로 남아 있다. 현재 E4 통계 감사의 그래프 검산 수는 0이며 최종 그래프 완료로 표시하지 않는다.

### 100개와 1,000개 LIS에 관한 현재 대화의 결론

M8 저장 raw를 재계산한 결과다. 현재 E4 실제 앱 행렬은 모두 LIS를 사용하므로 이 행렬만으로 LIS 자체의 기여를 분리할 수 없다.

| 조건 | DOM 이동 Greedy→LIS | 세션별 median 감소율 |
|---|---:|---:|
| 100개 stateful 마지막→처음 | 99→1 | 7.2% / 7.0% / 5.7% |
| 100개 light 양 끝 교환 | 99→2 | 4.8% / 10.5% / 14.9% |
| 100개 light 마지막→처음 | 99→1 | 2.9% / −4.5% / 7.5% |
| 1,000개 stateful 마지막→처음 | 999→1 | 약 5.9% / 6.0% / 4.3% |

100개 stateful 마지막→처음은 4.85→4.50ms, 5.70→5.30ms, 5.30→5.00ms다. 0.30~0.40ms의 절약과 세션별 분포를 함께 해석한다. 역순·혼합 입력 등 불리한 결과도 존재하므로 “100개부터 항상 LIS가 빠르다”거나 통계적 유의성을 확정하지 않는다. [전체 세션 결과](C:/Github/mini-react/docs/bench/m8-full/all-results.md)

## 7. 장시간 측정을 반복하지 않기 위한 재개 원칙

사용자는 약 22시간 진행된 GOAL을 중단했고, 실제 코드 개선 여부와 과도한 측정 비용을 확인해 달라고 했다. 완료된 측정의 재실행보다 **남은 의사결정에 필요한 최소 증거**를 우선한다.

10,000개는 과거 freezeTree 비용·heap·p95 문제를 드러내 실제 후보 설계에 도움이 됐다. 따라서 무가치한 실험이라고 폐기하지 않는다. 다만 E3처럼 1,000개 보충만으로 기각할 수 있는 상태에서 stress 측정을 계속하는 것은 줄여야 한다.

E4 완료 세션 1·2의 실행 기록에서, 모든 크기 한 세션은 약 100분이고 10,000개만 약 86분이었다. 1,000개 약 9.5분은 4비교군×10조건의 세션 전체 비용이다. E1 A1/E4 A1 두 비교군의 기존 기록만 합하면 약 4.46~4.48분, 그중 counter/search/sort/CRUD는 약 2.9분이다. 이는 기존 기록의 부분 합산이며 축소 프로토콜을 새로 실행한 결과는 아니다.

재개 시 권장하는 운영 방식은 다음과 같다. 이는 기존 사전 계획을 소급 변경한 것이 아니라 **새 실험의 범위 제안**이다.

1. 현재 E4·보충 raw와 판단 자료를 먼저 읽는다. 실패가 결정됐다면 추가 전체 행렬을 돌리지 않고 적용 범위 축소나 안전한 무캐시 정책으로 결론을 낸다.
2. 개발 중 후보 선별은 10/100/1,000개와 직접 관련된 작업, 필요한 비교군을 중심으로 한다. 탐색용 1세션을 최종 성능 입증으로 표시하지 않는다.
3. 정식 채택에는 필요한 같은 세션 비교와 독립 3세션을 유지한다. A0/A1 효과를 다시 분리해야 하면 해당 비교군을 유지한다.
4. 10,000개는 구체적인 stress 질문이 있을 때 제한적으로 추가한다. 제외하면 기존 stress 회귀는 “미해소·보류”로 남기며 PASS로 바꾸지 않는다.
5. 보충 측정 전에 대상·반복 수·예상 시간·실패 시 중단 기준을 적는다. 모든 조건을 자동으로 n=180으로 확대하지 않는다. 이미 수행한 사전 계획과 다른 새 계획은 분리 기록한다.
6. CPU 경합을 일으키는 병렬 벤치마크, 실제 40ms Effect의 가짜 타이머 대체, oracle 약화, 느린 표본 제거로 시간을 줄이지 않는다.

현재 스크립트는 `--sizes`, `--builds`, `--workloads`, `--regimes`, `--sessions`를 지원한다. 일반 n=60/fresh n=30, 보충 n=180은 코드에 고정돼 있다. `--samples=20` 같은 미지원 옵션을 붙여 표본 수가 줄었다고 생각하면 안 된다. runner·사전 계획 hash를 검증하므로 기존 기록 분석 전 이 파일들을 수정하지 않는다.

## 8. Claude Code가 이어서 할 순서와 완료 조건

| 순서 | 작업 | 완료 조건 |
|---|---|---|
| 1 | 브랜치·HEAD·미커밋 변경·실행 중 프로세스 확인 | 현재 `phase1` 유지. 기존 변경/측정 보존, 병행 실행 방지 |
| 2 | E4 정식 결과와 현재 보충 결과 확인 | 완료/진행/중단 구분, 원자료·통계·gate의 출처 연결. 이미 끝난 480조건 재실행 금지 |
| 3 | 최종 적용 정책 판단 | E4 유지·적용 범위 축소·안전한 무캐시 중 근거 있는 선택. E3 Proxy 수정 유지. 미해결 stress를 전체 PASS로 표현하지 않음 |
| 4 | 필요한 최소 수정과 진단 | 실제 병목과 정확성 반례에 연결된 변경만. 필요하면 관련 단위·통합을 먼저 실행. 정식 timing과 profiler 분리 |
| 5 | 최종 기능 소스와 테스트 커밋 | 현재 브랜치에 논리 단위 커밋. 기능·테스트 hash 고정 |
| 6 | 최종 전체 인수 | typecheck, 전체 unit/integration, build, 기본 Chromium/Firefox 33개를 새 서버·브라우저에서 3회. worker 2·timeout 30초·retry 0 유지 |
| 7 | 보고서·원본 체크리스트 갱신 | 최종 정책, 개선/악화, 지원 범위, 실제 수행 검증, 원자료 링크와 체크리스트 버전/hash 일치 |
| 8 | 결과·문서 커밋과 종료 감사 | 이번 작업 미커밋 변경 없음. 원격 push/PR/merge/배포는 하지 않음 |

현재 체크리스트의 M0 팀 합의·일정, M2 다른 후보 비교·병합, 팀원 설명/연습/발표, 원격 CI 항목은 미확인 상태를 유지한다. 이것을 완료시키기 위한 가상의 활동이나 불필요한 구현을 만들지 않는다.

최종 보고서는 모든 수치가 좋아졌다는 결론을 요구하지 않는다. 지원 범위 안에서 정확성이 유지되고, 남은 회귀에 대해 보수적인 정책을 선택했으며, 선택한 실제 소스의 최종 검증이 완료돼야 한다.

### 기존 도구로 결과를 분석하는 방법

아래는 실행 예시이며 이번 인계 작성에서는 실행하지 않았다. **해당 측정이 종료되고 다른 timing이 돌지 않을 때**, 아직 생성되지 않은 분석을 필요한 순서로 수행한다. 이미 완료된 E4 정식 분석은 재실행부터 하지 말고 저장 결과를 먼저 읽는다.

```powershell
Set-Location -LiteralPath 'C:\Github\mini-react'
git status --short --branch
git log -8 --oneline
Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" |
  Where-Object { $_.CommandLine -match 'benchmark-task|diagnose-task|e4-supplement-driver' } |
  Select-Object ProcessId, ParentProcessId, CreationDate, CommandLine

# 완료된 100개 보충의 분석이 아직 없다면, 측정과 병행하지 않고 실행
node scripts/analyze-task.mjs docs/bench/task-candidate-v2-tail-persistent-100-v1
node scripts/compare-task.mjs docs/bench/task-candidate-v2-tail-persistent-100-v1
node scripts/audit-task-statistics.mjs docs/bench/task-candidate-v2-tail-persistent-100-v1
node scripts/audit-task-policy.mjs docs/bench/task-candidate-v2-tail-persistent-100-v1
node scripts/report-task-policy.mjs task-candidate-v2-tail-persistent-100-v1 E4
```

`preserve-stopped-task-run.mjs`는 기존 E3의 특정 중단 경계를 전제로 검사한다. 임의 중단에 그대로 실행하지 않는다. 중단이 필요하면 실제 소유 프로세스·완료 조건·부분 raw·종료 시각을 보존하고 중단 지점에 맞게 처리한다. 불완전한 실행을 완료된 3세션과 합치거나 자동 재시도로 덮지 않는다.

### 최종 검증 도구

```powershell
# 최종 기능과 테스트를 커밋하고, timing/진단 프로세스가 끝난 뒤 실행
# 아래 tag가 이미 존재하면 새로운 고유 tag를 선택한다.
node scripts/validate-task-final.mjs task-final-20261109-v1
```

이 스크립트는 phase1·기능 파일의 커밋 상태·포트 4178/4179 해제·타입·단위·빌드·브라우저 3회·소스 hash 일치를 검사하고 `docs/validation/<tag>`에 기록한다. 현재 205개 이상 단위 테스트와 33개 브라우저 테스트를 기대한다. 테스트 구성이 정당하게 바뀌면 검사기의 기대값도 근거와 함께 갱신하며, 실패를 감추기 위해 낮추지 않는다.

개별 명령은 `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm test:browser`다. Windows에서 PATH 문제가 있으면 `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/pnpm.ps1 <명령>`을 사용한다. Node 요구 버전은 `>=24.15.0`, pnpm은 `11.25.0`이다. 실제 실행 환경은 [package.json](C:/Github/mini-react/package.json)과 [pnpm 래퍼](C:/Github/mini-react/scripts/pnpm.ps1)를 확인한다.

## 9. 참고 파일 읽는 순서

### 먼저 읽을 자료

| 우선순위 | 파일 | 용도 |
|---|---|---|
| 1 | [공식 과제 요구사항](<C:/Users/nica7/Desktop/리액트 조사/w11_미니리액트_요구사항.txt>) | 변경하면 안 되는 필수 기능·루트 Hooks 제약 |
| 2 | [B안 구현 명세와 체크리스트](<C:/Users/nica7/Desktop/리액트 조사/Mini_React_B안_구현명세_체크리스트.md>) | 기능 ID·테스트 ID·M0~M8 계약·후속 이력. 현재 v1.11 |
| 3 | [아키텍처](C:/Github/mini-react/docs/architecture.md) | 실제 구현의 책임·불변식·지원 한계 |
| 4 | [중단된 실제 앱 GOAL 원문](C:/Users/nica7/.codex/attachments/edf2df25-63fd-4fa1-af6b-a036872b3a20/goal-objective.md) | A~E 단계와 Git·검증·종료 조건. 이후 사용자 발언과 함께 해석 |
| 5 | [목표별 완료 대조](C:/Github/mini-react/docs/task-app-completion-audit.md), [후속 진행](C:/Github/mini-react/docs/task-app-followup.md) | 완료한 구현과 남은 인수. E4 “수집 중” 문구는 현재 raw보다 오래됨 |
| 6 | [E4 판단 자료](C:/Github/mini-react/docs/bench/task-candidate-v2/policy-review-e4.md), [보충 계획](C:/Github/mini-react/docs/bench/task-candidate-v2/tail-supplement-plan-e4.json) | 재개 직후 판단할 초과 조건과 보충 범위 |
| 7 | [사전 비교 계획](C:/Github/mini-react/docs/task-app-comparison-plan.md) | 비교군·측정 경계·회귀 허용 기준. 소급 수정 금지 |
| 8 | [요구사항과 테스트 대응](C:/Github/mini-react/docs/requirements-tests.md), [현재 성능 보고서](C:/Github/mini-react/docs/benchmark-results.md), [인수 기록](C:/Github/mini-react/docs/m8-acceptance.md) | 최종 갱신해야 할 근거 문서 |

### 구현 설명과 회귀 테스트

| 주제 | 설명 | 확인할 테스트 |
|---|---|---|
| 앱 재사용 | [task-app-reuse.md](C:/Github/mini-react/docs/task-app-reuse.md) | [task-reuse.test.ts](C:/Github/mini-react/tests/integration/task-reuse.test.ts), [tasks.spec.ts](C:/Github/mini-react/tests/browser/tasks.spec.ts) |
| E3 정확성 수정 | [task-app-engine-candidate.md](C:/Github/mini-react/docs/task-app-engine-candidate.md) | [immutable-proof-regression.test.ts](C:/Github/mini-react/tests/unit/immutable-proof-regression.test.ts) |
| E4 인증 상한 | [task-app-bounded-candidate.md](C:/Github/mini-react/docs/task-app-bounded-candidate.md) | [immutable-retention-budget.test.ts](C:/Github/mini-react/tests/unit/immutable-retention-budget.test.ts) |
| root 검증·no-op | [browser-noop-followup.md](C:/Github/mini-react/docs/browser-noop-followup.md) | [immutable-validation.test.ts](C:/Github/mini-react/tests/unit/immutable-validation.test.ts), [noop-contracts.test.ts](C:/Github/mini-react/tests/integration/noop-contracts.test.ts) |
| 측정 oracle | [task-app-comparison-plan.md](C:/Github/mini-react/docs/task-app-comparison-plan.md) | [task-benchmark.test.ts](C:/Github/mini-react/tests/integration/task-benchmark.test.ts) |
| 입력 보호 | [m7-app-browser.md](C:/Github/mini-react/docs/m7-app-browser.md) | [browser-state.spec.ts](C:/Github/mini-react/tests/browser/browser-state.spec.ts) |

### 원자료와 검증 증거

| 경로 | 내용 |
|---|---|
| [M8 결과](C:/Github/mini-react/docs/bench/m8-full/all-results.md) | Greedy/LIS·Batching·표현 재사용. 같은 폴더의 raw gzip·summary·analysis |
| [no-op 결과](C:/Github/mini-react/docs/bench/noop-full/all-results.md) | 임시 객체 제거·불변 root 검증 재사용의 이득과 생성 비용 |
| [실제 앱 6조합](C:/Github/mini-react/docs/bench/task-matrix-v1/all-results.md) | E0/E1/E2 × A0/A1 완료 자료 |
| [E3 결과](C:/Github/mini-react/docs/bench/task-candidate-v1/policy-review-e3.md) | E3 초기 비교와 회귀 |
| [E3 기각 기록](C:/Github/mini-react/docs/bench/task-candidate-v1/e3-rejection-decision.json) | 1,000개 보충의 반복 회귀로 기각한 이유와 남은 실행 처리 |
| [E4 결과](C:/Github/mini-react/docs/bench/task-candidate-v2/all-results.md) | 현재 후보의 3세션 raw·분포·비교·정책 감사 |
| [E4 100개 보충 환경](C:/Github/mini-react/docs/bench/task-candidate-v2-tail-persistent-100-v1/environment.json) | 최신 수집 상태. 완료 후 같은 폴더의 분석 파일 확인 |
| [이전 no-op 최종 검증](C:/Github/mini-react/docs/validation/noop-followup.json) | 184개·브라우저 31개×3 당시 결과 |
| [앱 변경 검증](C:/Github/mini-react/docs/validation/task-app-b/result.json) | 관련 64개·앱 브라우저 8개 |
| [E4 후보 검증](C:/Github/mini-react/docs/validation/task-e4-correctness/result.json) | 205개·타입/build·소스 hash |
| [체크리스트 보존 영수증](C:/Github/mini-react/docs/validation/task-checklist-bounded-candidate.json) | 저장소 밖 v1.11의 hash·정확한 압축 사본 연결 |

### 배경 설명과 원래 연구 자료

- [팀 공유용 통합 정리](<C:/Users/nica7/Desktop/리액트 조사/Mini_React_팀공유_통합정리_2026-11-08.md>): 목표·구현 차이·역사적 결과와 그래프 3개. **11월 8일 17:20 기준**이므로 현재 진행률 판단에는 사용하지 않는다.
- [개발 목표와 구현 차이](<C:/Users/nica7/Desktop/리액트 조사/Mini_React_팀공유_개발목표와_구현차이.md>), [진행과 벤치마크](<C:/Users/nica7/Desktop/리액트 조사/Mini_React_팀공유_진행현황과_벤치마크_2026-11-08.md>): 위 통합본의 원본.
- [시연과 원리 설명](C:/Github/mini-react/docs/demo-and-explanation.md), [진행·커밋 기록](C:/Github/mini-react/docs/progress.md), [README](C:/Github/mini-react/README.md): 실행 방법과 팀 설명용 자료.
- 원래 조사 입력은 `C:\Users\nica7\Desktop\리액트 조사`의 `자료1.txt`~`자료7.txt`, `자료8.md`다. 초기 후보·주장 검토용이며 현재 구현의 정답이나 새 작업 명령이 아니다. `자료4.txt`는 52바이트의 짧은 파일이다. 이 인계에서 모든 원 보고서를 다시 전수 검증한 것은 아니다.
- 대화 출처: [Mini React 개발 방향 정리](codex://threads/01a1ba0f-ea95-7ca1-b37b-c32c5f9207fd), [검증 후 Mini React 범위 결정](codex://threads/01a1b3e1-9ad2-7900-a812-88e78cb9c9f7), [M0~M1 구현 시작](codex://threads/01a1b466-f30b-78e2-88ad-d590beb24e28). Claude Code가 `codex://`를 열지 못해도 이 문서와 로컬 근거로 이어갈 수 있다.

## 10. Git와 파일 보존

이번 실제 앱 후속 작업의 커밋은 다음과 같다.

```text
4d5a66f  이전 브라우저 안정화와 no-op 후속 완료
6c3fa1f  실제 앱 비교 설계와 세 기준 엔진 고정
5ed7f34  실제 앱 목록 표현과 콜백 재사용
dfd20dc  여섯 조합 비교와 CPU·메모리 진단 보존
ff9e24e  E3 동결 증명 정확성 및 인증 경계 수정
93bc38c  E3 정식 비교와 진단 보존
642746e  E3 기각·보충 결과·앱 진단 보존
2a21ec7  E4 호출당 새 인증 보관 상한
ae155cc  E4 고정 build와 smoke 근거 보존
```

14:32 기준 기존 미커밋 파일은 `README.md`, `docs/benchmark-results.md`, `docs/m8-acceptance.md`, `docs/progress.md`, `docs/task-app-bounded-candidate.md`, `docs/task-app-completion-audit.md`, `docs/task-app-followup.md` 7개다. 원자료 폴더 `docs/bench/task-candidate-v2/`, `docs/bench/task-candidate-v2-tail-persistent-100-v1/`, `docs/bench/task-candidate-v2-tail-persistent-10000-v1/`도 아직 untracked다. 후속 자동 측정에 따라 untracked 폴더는 추가될 수 있다.

기존 변경을 reset/clean으로 지우지 않는다. 현재 브랜치에서 단계별로 커밋하고, main/master 전환·새 브랜치·amend/rebase/reset·원격 push/PR/merge/배포는 하지 않는다. 큰 결과 폴더를 무조건 `git add .`로 올리지 말고 raw·분석·환경·압축 소스와 불필요한 임시 산출물을 구분해 명시적으로 stage한다.

기능 소스 확인용 SHA-256:

```text
src/app/tasks.ts
1751a643ae8f5f3f802b8cae3cb9286fc2c0ec79a23938cf331b4821f12556e5

src/core/vdom.ts
006f83c927aa7c713423e322333e14b5902fbf0bd1d4fb696eb2409198e55899

Desktop의 Mini_React_B안_구현명세_체크리스트.md v1.11
be6f67b546aacd96790f44b6a76ae5fd2d1ea334a19a07df3ca8f0061846ac8e
```

Desktop 체크리스트 자체는 저장소 밖에 있다. 갱신 버전·hash·보존 사본의 영수증을 저장소에 남기되 원본이 Git 커밋에 포함됐다고 표현하지 않는다.

## 11. Claude Code에 전달할 시작 문장

```text
C:\Github\mini-react에서 중단된 후속 작업을 이어서 진행해줘.
먼저 C:\Users\nica7\Desktop\리액트 조사\Mini_React_Claude_Code_인계서_2026-11-09.md를 읽고,
현재 브랜치·HEAD·미커밋 파일과 백그라운드 벤치마크/보충 드라이버 상태를 다시 확인해.

M0~M8 구현과 E0/E1/E2 × A0/A1 비교는 이미 끝났어.
앱 A1과 E4 코드도 구현돼 있고, E4 정식 3세션의 원자료·통계 감사까지 완료 기록이 있어.
기존 측정부터 다시 시작하지 말고 E4 보충 결과와 남은 회귀를 검토해 최종 캐시 정책을 정해줘.
필요한 최소 수정, 최종 정확성·브라우저 검증, 보고서·기존 체크리스트 갱신까지 마무리해.

10,000개 전체 행렬이나 보충을 무조건 반복하지 말고,
현재 실행의 후속 자동 큐와 내 측정 범위를 먼저 맞춰줘.
새 실험이 필요하면 비교 질문·대상 조건·예상 시간·중단 기준을 먼저 정하고,
이미 끝난 결과로 기각할 수 있으면 추가 대규모 측정을 이어가지 마.
기존 사전 기준을 소급 완화하거나 미측정을 PASS로 바꾸지는 마.

루트 Hooks·순수 자식·공통 Diff/Patch·DOM/폼/IME·FIFO·Proxy 정확성 수정을 유지해.
현재 phase1 브랜치에 논리적인 단계별 커밋을 남기고 기존 변경과 원자료를 보존해.
원격 push·PR·merge·배포는 하지 마.
먼저 현재 사실과 남은 작업을 짧게 보고한 뒤 필요한 구현과 검증을 진행해.
```
