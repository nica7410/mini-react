# M3 필수 정확성 보완

2026-11-07: M3의 기본 정확성 Gate를 통과했다. 단위·통합 **95/95**, Chromium 기능 **9/9**, TypeScript 검사·production build PASS. Keyed 재정렬·Batching·expression 재사용·focus/selection/IME 종합 검증은 각각 M4/M5/M7에서 이어간다. M8 인수 완료를 뜻하지 않는다.

## 1. Patch 사전 검증

이전 validator는 ref 존재만 검사했다. 잘못된 anchor가 뒤쪽 명령에 있으면 앞의 텍스트 변경이 먼저 수행될 수 있었다.

- `planValidation.ts`가 현재 DOM binding/parent/type/자식 구조를 확인한다.
- create/remove/update/place/form 순서를 검사하고, 명령을 DOM 없는 형제 연결 모델에서 모의 실행한다.
- 결과의 ref/순서/host 값이 nextView 및 target과 맞는지 확인한 후 실제 host 쓰기를 허용한다.
- 기존 identity와 호환되지 않는 ref 재사용, 잘못된 parent/anchor, 중복 ref, 배치되지 않은 subtree를 거절한다.
- 연결 목록으로 형제 배치를 모의 실행하여 이동마다 배열을 탐색하지 않는다.
- old/new snapshot 모두 중복 key·지원 입력 검사를 받는다.
- 실제 DOM API 예외는 faulted로 전환하고 후속 commit을 막는다. 예상하지 못한 host 예외의 전체 rollback은 보장하지 않는다.

검증: `pnpm typecheck` PASS, `pnpm test` **62/62 PASS** (2026-11-07). `plan-validation.test.ts`의 추가 10개 회귀가 잘못된 계획에 대해 생성/쓰기 0회, 마지막 화면 유지, fault 차단을 검증한다.

## 2. 폼 소유와 dirty 복원

- snapshot은 기존 attribute/default와 live property를 구분한다. checkbox/radio/textarea/select/optgroup/multiple과 빈 선택을 검증했다.
- Phase 1 radio는 관리 영역 안의 별도 form 소유 그룹으로 제한한다. form 없는 radio와 명시적 외부 form 연결은 거절한다. 실제 브라우저에서 테스트 영역의 선택이 실제 영역에 영향을 주지 않음을 확인했다.
- 비어 있는 file input은 렌더/캡처할 수 있지만 선택 파일은 복원할 수 없으므로 캡처 오류다. 실제 setInputFiles 테스트로 검증했다.
- Phase 2 폼 필드의 기본 소유는 uncontrolled다. default는 최초 생성에만 적용하며 live 입력과 기본값을 무관한 render에서 덮어쓰지 않는다.
- controlled/uncontrolled 전환과 attrs/form/option의 이중 소유, 잘못된 selectedIndices를 commit 전에 거절한다.
- controlled 입력은 사용자 handler 유무와 별개로 native input/change를 추적한다. radio는 그룹의 다른 노드도 dirty로 표시한다.
- State no-op 또는 handler 없음에도 공통 Diff의 SYNC_FORM과 Patch를 통해 복원한다. 이 경로는 root render와 Effect를 실행하지 않는다.
- dirty의 sequence를 비교해 flush 중 새로 들어온 표시를 잘못 지우지 않는다. observer·fallback task·pending microtask는 unmount 후 작동하지 않는다.

## 3. 브라우저가 발견한 실제 회귀

처음에는 target의 capture listener에서 복원 microtask를 예약했다. Chromium의 native `fill()`에서 **microtask가 target/부모 bubble handler보다 먼저 실행**되어 정상 입력도 이전 값으로 복원되는 실패가 발생했다. jsdom의 직접 dispatch 테스트만으로는 드러나지 않았다.

수정: capture는 dirty만 기록하고, 관리 영역의 bubble 끝에서 복원을 예약한다. stopPropagation으로 영역 끝까지 도달하지 않는 이벤트는 다음 task에서 처리한다. 사용자 이벤트 handler는 여전히 각 노드의 native wrapper로 실행한다. 일반 이벤트 위임 시스템을 도입한 것은 아니다.

`tests/browser/m3.spec.ts`의 부모 bubble handler 회귀와 기존 카운터 이름 입력이 모두 통과했다. 같은 시기에 파일 선택 후 편집 상태가 버전 정보를 지우던 UI도 수정해, 미확정 편집과 현재 History 버전을 함께 보여준다.

## 4. 오류·자원·불변성

- EditorController.recover()는 faulted mount를 해제하고 **마지막 정상 History**의 snapshot으로 두 영역을 재생성한다. cursor/기존 이력은 유지한다. 일반 초기화는 최초 예제로 돌아간다.
- Hook 개수/종류/deps 길이 오류와 render/updater/Memo 실패는 기존 화면·Hook 값을 보존한다. 실패 큐의 자동 반복은 중단하고 explicit update가 재시도를 허용한다.
- Effect cleanup/setup 오류·잘못된 Promise 반환을 진단하며 이미 끝난 DOM commit을 되돌리지 않는다. 다른 정리를 계속한다.
- 반복 mount/unmount의 앱 listener 해제, setup/cleanup 중 unmount 회귀를 검증했다.
- 개발 모드는 plain object/array state를 동결해 직접 mutation을 진단한다. 사용자 정의 클래스/Map/DOM은 동결하지 않는다. production에서는 호출자가 불변 상태 계약을 지킨다.
- 안전한 CSS URL/srcset을 지원하도록 M1의 보수적인 제한을 확장했다. 위험 scheme/이스케이프 URL은 거절한다.

## M3 증거 대응

| 체크 항목 | 증거 |
|---|---|
| T-V01~V06 | vdom.test.ts, forms.test.ts: capture/정규화/불변성/두 mount/입력 경계/stale capture |
| T-D01~D04 | 순수 Node planner, patch.test.ts, plan-validation.test.ts. D03은 executor에 삭제+이동+수정 계획을 직접 적용; 실제 keyed planner와의 결합은 M4 |
| 속성/style/boolean/text/comment | patch.test.ts의 변경/삭제 및 형태 비교 |
| 이벤트 교체·제거·capture | patch.test.ts, observer 정리, 브라우저 native 입력 |
| 세 가지 폼 정책·no-op 복원 | forms.test.ts 25개 + Chromium M3 폼/그룹/파일 시나리오 |
| T-H01~H06·mount 분리 | history.test.ts, vdom.test.ts, 브라우저 두 영역 native 폼 Undo |
| Hook/후보 폐기/cleanup | hooks.test.ts 24개, 마지막 정상 화면·state·Memo·Effect 검증 |
| 초기화/오류/버튼 | history recover 단위 테스트, Chromium host fault→마지막 정상 History 복구 |

재현: `pnpm test`, `pnpm test:browser`, `pnpm typecheck`, `pnpm build`. 현재 Windows에서는 `scripts/pnpm.ps1`를 쓸 수 있다. [실행 요약](validation/m3.json).

표준 참고: [HTML input/radio 동작](https://html.spec.whatwg.org/multipage/input.html#radio-button-state-(type=radio)). 실제 사용 환경은 Chromium 151.0.7922.34이며 모든 브라우저·실제 IME를 이 단계 결과로 주장하지 않는다.
