# M7 목록 앱 · 브라우저 상태 보호

2026-11-07: 앱·자동 브라우저 검증과 사용자 직접 Windows 한글 IME 확인을 완료했다. M7의 필수 검증을 충족했다. 수동 검증의 브라우저명·버전은 제공되지 않았으므로 특정 브라우저의 IME 호환성 인증으로 확대하지 않는다.

## 목록 앱

`TaskApp`의 루트 Hook 슬롯에서만 항목·입력·검색·필터·정렬·오류·시연 상태를 관리한다. `TaskRow`와 `TaskSummary`는 props만 받는다. 데이터 ID를 key로 사용하고, 화면 index나 이름을 key로 쓰지 않는다. 이름은 inline controlled input으로 수정한다. 빈 이름도 편집 중 입력으로 보존하며 새 항목 추가에는 빈 이름을 거절한다.

파생 목록과 Summary expression에 useMemo를 사용한다. Effect는 Alt+N 키보드 listener, 취소 가능한 40ms 동기화 예제, 1.5초 지연 재배치 timer를 등록하고 cleanup으로 해제한다. 마지막 항목→처음과 +1 세 번 시연은 같은 루트 큐·공통 Diff/Patch를 통과한다. 앱 초기화는 unmount 후 새 인스턴스를 만든다.

## focus와 selection

commit 전에 관리 영역의 activeElement/ref와 지원 input/textarea의 range/direction을 저장한다. commit 뒤 같은 객체/ref가 살아 있고 type과 명시적 focus 이동이 없을 때만 보정한다. 재배치로 body에 focus가 떨어진 경우 preventScroll로 원래 노드에 복원한다. 삭제/교체한 필드에 새 focus를 강제하지 않는다. value가 짧아졌으면 범위를 길이에 맞게 제한한다. 다른 요소로의 명시적 focus가 우선한다.

이 동작은 임의 문자열 편집의 의미론적 caret mapping이나 contenteditable Range 복원은 아니다. `value`가 같으면 재대입하지 않는 M3 정책도 유지한다. 선택 API의 적용 범위는 [HTML input 선택 API](https://html.spec.whatwg.org/multipage/form-control-infrastructure.html#textFieldSelection)를 참고했다.

## composition 보호

`browserState.ts`가 mount별 compositionstart/end를 추적한다. [UI Events composition 규칙](https://www.w3.org/TR/uievents/#events-compositionevents)을 참고했으며 실제 브라우저/IME 순서까지 합성 이벤트로 증명하지 않는다.

- 조합 대상/조상의 이동·제거·교체, 입력 방식을 바꾸는 type/disabled/readonly/inputmode/contenteditable/hidden/inert/form/multiple 속성, 조상의 style 변경은 전체 plan을 DOM 쓰기 전에 보류한다. style은 보수적으로 처리한다.
- `CommitResult.deferred`이면 후보 hooks/Memo/평가 기록·Effect를 확정하지 않고 FIFO 요청을 보존한다. 자동 반복을 멈추고 새 요청이나 compositionend에 최신 상태로 다시 Diff한다. 옛 plan은 저장해 재사용하지 않는다.
- 안전한 영역 변경은 commit할 수 있다. 조합 중 필드의 SYNC_FORM은 heldForms에 기록하고 value 쓰기를 생략한다. 이 기록은 매 microtask의 무한 복원 루프를 만들지 않는다.
- compositionend 다음 task에서 최종 native input/handler를 포함한 최신 큐를 다시 처리한다. heldForms도 dirty ref로 돌려 공통 Patch를 통해 동기화한다.
- Phase 1은 조합 중 Patch/Undo/Redo와 HTML 반영 버튼을 비활성화한다. controller의 직접 Patch/이력 요청도 거절한다. 초기화/unmount는 추적과 timer를 정리한다.

## 실제 실행 결과

| 검증 | 결과 |
|---|---|
| 단위·통합 | 157/157 PASS |
| Chromium 151.0.7922.34 | 19/19 PASS |
| Firefox 153.0 (Playwright build 1538) | 10/10 smoke PASS |
| typecheck / production build | PASS / PASS |
| M7 신규 자동 검증 | CRUD·필터·정렬·집계·키보드·빈 상태·오류·reset, focus/selection/clamp, 합성 composition, timer/listener 정리 |
| 실제 Windows 한글 IME | **사용자 직접 확인 PASS** — 아래 요청 절차에서 “직접 확인 완료 — 문제 없음”; 브라우저명/버전 미제공 |

`browser-state.test.ts`는 이동/삭제/교체/type/disabled/hidden/style의 7개 충돌에서 전체 DOM 쓰기·state·Effect가 보류되는지 검사한다. 추가 FIFO 요청 보존, 취소된 후보, 최신 render 재계산, no-op 폼 복원, editor 직접 호출 거절, unmount timer 정리를 확인했다.

`browser-state.spec.ts`는 실제 focus/range를 가진 입력의 재배치와 명시적 외부 focus를 확인한다. composition은 **합성 이벤트**다. `tasks.spec.ts`는 4회 reset으로 지연 timer와 window listener 중복이 남지 않는지 확인한다. 390px 앱 screenshot을 열어 라벨·focus 표시·줄바꿈을 확인했다.

최초 Firefox 8-worker 실행에서 긴 CRUD 테스트 하나가 30초 timeout에 도달했다. 같은 assertion과 30초 제한을 유지한 2-worker 실행은 10/10 통과했다. 기본 병렬도를 2로 맞춘 후 전체 29/29도 통과했다. timeout 결과를 숨기거나 기능 assertion을 제거하지 않았다.

## 별도 Performance trace

production 앱에서 실제 키보드/클릭 흐름(추가→수정/완료→재배치→Batching→편집기 Patch/Undo)을 실행하고 CDP Performance trace를 수집했다. [기록](performance/chromium-workflow.json)과 [gzip 원본](performance/chromium-workflow.trace.json.gz). 재현은 build 후 `pnpm trace:workflow`다.

이 실행에는 11,845개 trace event, Layout 27개, Paint 29개가 기록되었다. Inspector가 켜진 한 사용자 흐름이며 Greedy/LIS 속도 비교가 아니다. category duration은 중첩할 수 있어 합산하여 총 시간을 만들지 않는다. performance.now 구간을 paint로 추정한 결과도 아니다. 당시 미커밋 M7 소스 상태를 metadata와 [M7 검증 hash](validation/m7.json)에 남겼다.

## 실제 IME 수동 절차 / 현재 상태

1. `pnpm dev` 후 Chrome/Edge에서 `http://127.0.0.1:5173`을 열고 목록 앱을 초기화한다.
2. `1.5초 뒤 마지막 항목 이동`을 누른 뒤 마지막 `task-8 이름`을 선택하고 Windows 한글 IME로 `한글조합확인`을 입력한다.
3. 마지막 글자를 조합 중인 채 이동 시각을 지난다. 조합 중에는 행이 이동하지 않아야 한다. 오른쪽 화살표로 조합을 끝내면 같은 입력 노드가 맨 앞으로 이동해야 한다.
4. 글자 누락/중복, 조합의 불필요한 중단, focus 손실을 확인한다. 브라우저 버전/OS/IME와 관찰 결과를 기록한다.

Windows Computer Use 도구는 현재 Chrome URL을 충분히 확인하지 못해 UI 조작을 중단했다. 이후 Windows 입력 조작을 진행하지 않았고 사용자에게 위 직접 검증을 요청했다. 사용자는 2026-11-07 이 채팅에서 **“직접 확인 완료 — 문제 없음”**으로 답했다. 요청은 조합 중 행 이동 보류, 조합 종료 뒤 앞으로 이동, 글자 누락/중복·focus 손실 유무를 포함했다. 이것이 T-B05의 수동 증거이며 합성 composition 결과와 구분한다.

환경은 사용자 Windows 환경과 요청한 한글 IME이며 브라우저명·버전/IME 세부 버전은 미제공이다. 이 수동 결과로 새 항목·검색의 모든 한글 입력 흐름, 다른 IME/OS/브라우저까지 검증했다고 주장하지 않는다.
