# Krafton Jungle W11 · Mini React

Vanilla TypeScript로 구현한 M1 최소 엔진입니다. DOM 편집기와 루트 함수형 컴포넌트가 **동일한 VDOM → Diff → Patch**를 사용합니다.

- Phase 1: 최초 DOM 캡처, 실제/테스트 영역, 텍스트·HTML 편집, Patch, VDOM History, Undo/Redo, 초기화.
- Phase 2: `FunctionComponent`, 루트 `hooks` 배열, `useState` / `useEffect` / `useMemo`, props만 받는 순수 자식, 카운터 데모.
- M1 기준은 위치 기반 Diff와 동기 State 갱신입니다. Keyed Greedy/LIS, microtask Batching, expression 재사용, Inspector, 목록 앱, IME 보호는 후속 단계입니다.

## 실행

Node **24.15.0 이상**, pnpm **11.25.0**. 직접 의존성 버전과 `pnpm-lock.yaml`을 고정했습니다. React/Vue 등 UI 프레임워크 의존성은 없습니다.

```sh
pnpm install --frozen-lockfile
pnpm dev
```

기본 주소는 `http://127.0.0.1:5173`입니다. 현재 Windows 셸처럼 pnpm이 PATH에 없다면, 프로젝트 루트에서 이미 설치된 Codex runtime을 이용할 수 있습니다.

```powershell
.\scripts\pnpm.ps1 install --frozen-lockfile
.\scripts\pnpm.ps1 dev
```

아래 모든 `pnpm` 명령도 같은 방식으로 `.\scripts\pnpm.ps1`로 바꿔 실행할 수 있습니다. 다른 컴퓨터의 일반 pnpm 환경에서는 이 보조 스크립트가 필요 없습니다.

## 검증

```sh
pnpm typecheck
pnpm test
pnpm exec playwright install chromium
pnpm test:browser
pnpm build
pnpm preview
```

브라우저 테스트는 전용 포트 4173에서 Vite를 시작하고 종료합니다. 기존 서버와 섞지 않으므로 포트 4173은 비워 두세요. 단위·통합 테스트는 실제 엔진 모듈을 사용하며, 순수 Diff 테스트는 DOM 없는 Node 환경에서 실행합니다.

[M0~M1 구현·검증 기록](docs/m0-m1.md)에 테스트 ID, 구현 원리, 확인된 한계와 팀 확인 항목이 있습니다. [검증 결과 요약](docs/validation/m0-m1.json)은 해당 실행의 증거이며, 이후 코드 변경에 대한 자동 보증은 아닙니다.

## 구조

```text
src/core/       불변 VDOM, DOM 캡처, mount binding, 순수 Diff, Patch/host
src/runtime/    h(), 순수 자식 평가, FunctionComponent, 루트 Hooks
src/editor/     입력 검사, 두 영역 controller, VDOM History
src/observe/    선택적 TraceSink 진입점
src/app/        편집기 조작 UI와 카운터 예제
tests/         공통 fixtures, unit, integration, Chromium 기능 테스트
```

`h()`는 표현식만 만들고 DOM 생성과 컴포넌트 실행을 하지 않습니다. `resolveExpression()`이 루트 결과와 순수 자식을 Host VDOM으로 바꿉니다. `diff()`는 DOM 없는 `MountView`를 비교하고, `commit()`이 mount별 `ref → Node` 연결을 통해 필요한 변경만 적용합니다.

설정 참고: [Vite 시작 안내](https://vite.dev/guide/), [Vitest 시작 안내](https://vitest.dev/guide/), [Playwright 테스트 서버 설정](https://playwright.dev/docs/test-webserver).
