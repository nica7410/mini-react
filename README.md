# Krafton Jungle W11 · Mini React

Vanilla TypeScript로 만든 학습용 Mini React입니다. DOM 편집기와 루트 함수형 컴포넌트가 **같은 VDOM → Diff → Patch**를 사용합니다. 안정적인 DOM identity, FIFO Batching, Greedy/LIS 비교와 실제 실행 Inspector를 구현했습니다. React 호환 라이브러리는 아닙니다.

- **Phase 1:** DOM 캡처, 실제/테스트 영역, 직접·HTML 편집, 부분 Patch, 불변 VDOM History, Undo/Redo, 오류 복구.
- **Phase 2:** `FunctionComponent`, 루트 `hooks`, `useState` / `useEffect` / `useMemo`, props만 받는 순수 자식, 목록 관리 앱.
- **B안:** 지원되는 keyed 형제의 LIS 기본 경로와 Greedy 비교, FIFO microtask Batching, 같은 expression의 위치별 재사용, Inspector·seed 재실행·독립 benchmark.
- **입력:** snapshot/controlled/uncontrolled, no-op 복원, focus/selection 보정, composition 충돌 plan 보류.

실제 TaskApp 후속 작업은 2026-11-09에 끝났습니다. E0/E1/E2 × A0/A1 비교 720조건, E3·E4 후보의 정식 3세션 480조건씩과 n=180 보충을 감사한 결과, 캐시 후보(E2~E4)와 목록 표현 재사용 앱(A1)은 반복 재사용 이득에도 사전 회귀 허용 범위를 넘는 조건이 남아 기본값으로 채택하지 않았습니다. **최종 기본 경로는 E1 방식의 매회 VDOM 검증 + 동결 안전 조건, 기본 앱 A0**이며 A1은 비교용 `TaskAppWithRowReuse`로 남겼습니다. 최종 소스는 typecheck·단위/통합 213개·build·Chromium+Firefox 33개 × 3회를 통과했습니다. 10,000개 E4 보충은 중단했으며 그 stress 회귀는 미확인입니다. [최종 정책과 검증](docs/task-app-final-policy.md), [성능 보고서](docs/benchmark-results.md), [후속 진행](docs/task-app-followup.md)을 참고하세요.

최종 정책 이후 후속 개선으로 측정 기본 범위를 10/100/1,000개로 제한하고(10,000개는 `--allow-10000` 필요), 기록 OFF의 추적 작업과 접힌 Inspector 생성을 없앴으며, VDOM 생성·검증의 임시 할당을 줄였습니다. 독립 3세션 비교에서 75개 조건 중 73개의 median이 세 세션 모두 줄었고(대표 작업 −13~−25%), 소스 `3e9a48c`는 단위·통합 219개와 Chromium+Firefox 33개 × 3회를 통과했습니다. [후속 개선](docs/followup-trace-alloc.md). 이어서 명시적 `memo()` 행 단위 재사용(A2, 엔진 E9)과 같은 State 입력 복원의 `SYNC_FORM` 전용 사전 검증을 2026-11-09에 기본 소스로 채택했습니다. 근거는 원래 p95 허용치 전부의 통과가 아닙니다. 정적 분석(작업량: 1,000개 counter에서 행 실행 1,000→0), 일관된 median 감소, 같은 빌드에서도 p95가 크게 흔들린 측정 한계를 근거로 삼았습니다. 남은 초과와 미검증 범위는 함께 공개합니다. 기본 소스는 typecheck·단위/통합 268개·build·Chromium+Firefox 33개(1회)를 통과했습니다. [채택 기록](docs/row-memo-adoption.md) · [④ 보고서](docs/followup-row-memo.md) · [입력 복원 연구](docs/followup-dirty-restore.md)

2026-11-10에는 ④ 채택 뒤의 기본 경로에서 정확성 결함 두 가지를 재현해 수정했습니다(`ab5a9b8`): `null` 자리가 `memo()` 컴포넌트로 바뀔 때의 예외, 그리고 최종 상태는 유효하지만 뒤 명령이 가린 금지 Patch 명령(예: `SET_ATTR onclick` → `REMOVE_ATTR onclick`, 위조 `SYNC_FORM` 뒤의 정상 `SYNC_FORM`)을 사전 검증이 수락하던 문제입니다. 이어서 Keyed 형제의 앞뒤 일치 구간을 분리하는 planner 후보를 설계해 기존 planner와 같은 계획(이동 대상·DOM identity·명령 순서·IME 보류 포함)을 낸다는 것을 차등 검증·독립 모델·변이 4개로 확인했습니다. 목표 입력에서 planner의 Map 연산이 없어지고 planner 단독 시간 median이 줄었지만, 실제 TaskApp 전체 작업 시간에서는 이득을 보이지 못했고 `crud/100` 3세션 중 2세션이 경고 폭을 넘었습니다. 그래서 후보는 **기본값으로 채택하지 않고 연구용으로 보존**했습니다(`research/keyed-boundaries/`). 현재 기본 소스는 typecheck·단위/통합 407개·build·Chromium+Firefox 35개(1회)를 통과했습니다. [보고서](docs/followup-keyed-boundaries.md)

같은 날 후속으로, 위 Keyed 후보가 보류된 원인을 `diff()` 시간 분해로 확인했습니다. planner는 전체 Diff의 약 4%뿐이고 약 85%가 두 번의 `validateTree`였습니다. 그래서 검증의 속성·이벤트 이름 정규식을 같은 판정을 내는 code unit 순회로 바꾼 후보(V1)를 만들어, 측정 전에 고정한 기준으로 같은 페이지 쌍 비교를 했습니다. 전체 `diff()`가 세 조건 모두 약 19~20% 줄어 **V1을 기본 소스에 채택**했습니다(`89dbc56`). 매 호출 전체 검증·결과 미보관 정책과 오류 메시지·경로는 그대로입니다. Keyed 후보는 V1 적용 뒤 다시 쟀을 때도 1~3% 감소에 그쳐 보류로 남았습니다. V1 적용 소스는 typecheck·단위/통합 417개·build·Chromium+Firefox 35개(1회)를 통과했습니다. [보고서](docs/followup-validate-names.md)

이전 no-op 기능 소스의 자동 검증은 **184개 단위·통합 + Chromium 20개 + Firefox 11개**, 브라우저 전체 3회 연속 통과입니다. 최초 M8의 측정 51,480개와 후속 no-op의 3세션·측정 23,760개는 각각 당시 코드의 결과로 보존합니다. 실제 Windows 한글 IME는 이전 사용자 직접 확인에서 문제 없음으로 보고되었습니다(브라우저명 미제공). [역사적 후속 검증](docs/browser-noop-followup.md), [성능 결과](docs/benchmark-results.md), [인수 상태](docs/m8-acceptance.md)를 참고하세요. 팀 활동과 원격 CI 실행은 미확인입니다.

## 실행

Node **24.15.0 이상**(검증 환경 24.22.1), pnpm **11.25.0**. 의존성과 lockfile을 고정했으며 외부 UI 프레임워크를 사용하지 않습니다.

```sh
pnpm install --frozen-lockfile
pnpm dev
```

브라우저에서 [로컬 데모](http://127.0.0.1:5173)를 엽니다. pnpm이 PATH에 없는 현재 Windows 환경은 설치된 Codex runtime을 찾는 보조 실행기를 사용할 수 있습니다.

```powershell
.\scripts\pnpm.ps1 install --frozen-lockfile
.\scripts\pnpm.ps1 dev
```

아래 `pnpm` 명령에도 같은 대체가 가능합니다. 다른 컴퓨터에 일반 pnpm이 설치되어 있으면 보조 실행기가 필요 없습니다.

## 데모에서 확인할 것

1. 편집기의 테스트 영역을 수정하고 Patch합니다. 추가 편집을 확정하지 않은 채 Undo한 뒤 두 영역이 같은 과거 snapshot으로 돌아오는지 봅니다.
2. 목록 앱에서 추가·이름 수정·완료·검색·정렬을 사용합니다. `+1 세 번`은 최종 +3이며 기본 모드에서 한 번 commit합니다.
3. 실험실에서 8개 항목의 마지막→처음 이동을 LIS/Greedy로 각각 실행합니다. Inspector에서 계획과 실제 DOM 이동 **1회/7회**, 유지된 객체 identity, ref/anchor를 확인합니다.

[상세 데모·실패 재현·원리 설명](docs/demo-and-explanation.md)에 발표 순서와 작은 변경 연습이 있습니다.

## 검증과 측정

```sh
pnpm typecheck
pnpm test
pnpm exec playwright install chromium firefox
pnpm test:browser
pnpm build
pnpm preview

# production build 뒤 실행; 전체 측정은 다른 테스트와 동시에 실행하지 않음
pnpm bench:smoke
pnpm bench --tag=my-full-run
pnpm trace:workflow
```

브라우저 테스트는 포트 **4173**, 기존 benchmark/Performance trace는 **4175**, no-op 비교/진단은 **4177**, 실제 TaskApp 정식 비교는 **4178**, TaskApp 분리 진단은 **4179**를 사용합니다. 기존 서버와 공유하지 않으며 자동으로 종료합니다. benchmark와 테스트·build·trace는 동시에 실행하지 마세요. 전체 benchmark는 매 표본의 DOM 준비·검증까지 포함해 시간이 오래 걸립니다. `--sizes=10,100 --sessions=1 --tag=quick-check`로 좁혀 확인할 수 있지만 이를 전체 검증으로 기록하지 않습니다. 실제 TaskApp 비교의 고정 소스·재현 절차는 [사전 계획](docs/task-app-comparison-plan.md)에 있습니다.

[CI 설정](.github/workflows/ci.yml)은 같은 검사 명령을 실행하도록 구성했습니다. 원격 push·CI 실행·배포는 이 작업에서 수행하지 않았습니다. 로컬 성공이 Linux 원격 CI 성공을 뜻하지 않습니다.

## 문서와 코드

| 목적 | 문서/경로 |
|---|---|
| 단계·커밋·완료 여부 | [진행 기록](docs/progress.md) |
| 요구사항과 테스트 근거 | [기능·테스트 대응표](docs/requirements-tests.md) |
| 엔진 구조·알고리즘·지원 한계 | [아키텍처](docs/architecture.md) |
| 설치·시연·핵심 질문·성과 표현 | [데모와 설명](docs/demo-and-explanation.md) |
| 폼·focus·IME·브라우저 | [M7 검증](docs/m7-app-browser.md) |
| 실험 방법·원본 | [M6 관찰·benchmark](docs/m6-observability.md) |
| 전체 성능 결과·그래프·한계 | [실험 결과](docs/benchmark-results.md) |
| 최종 기술 인수·외부 확인 구분 | [M8 인수](docs/m8-acceptance.md) |
| 초기 구현의 역사적 기록 | [M0~M1](docs/m0-m1.md) |
| 공통 엔진 / 루트 런타임 | `src/core/` / `src/runtime/` |
| 편집기 / 앱 / 관찰 / 측정 | `src/editor/` / `src/app/` / `src/observe/` / `src/bench/` |

State와 Hooks는 각 루트에만 있습니다. 루트 간 상태 공유, 자식 Hooks, Fiber/동시성, SSR, keyed Fragment, 전체 HTML/SVG 지원은 범위 밖입니다. 예상하지 못한 DOM API 예외의 완전한 rollback도 제공하지 않습니다.
