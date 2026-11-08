# TaskApp 목록 표현을 재사용하는 원리

이번 앱 변경은 `5ed7f34`에 있다. 성능 채택 여부는 별도의 [사전 계획](task-app-comparison-plan.md)에 따라 측정한다. 함수 실행을 줄였다는 사실과 실제 실행 시간이 줄었다는 결론을 구분한다.

기존 앱은 `visible` 배열을 useMemo로 보관했지만, 그 배열로 `h(TaskRow, ...)` 표현을 만드는 map과 세 행 callback은 매번 실행했다. 따라서 새 항목 입력창만 수정해도 기존 행의 표현과 함수 props가 새로 만들어졌다. 기존 엔진은 동일한 표현 객체를 다시 받았을 때 평가 결과를 재사용하므로, 배열만 보관해서는 그 경로를 충분히 활용하지 못했다.

변경 후 루트에서 두 종류를 보관한다.

| 보관 대상 | 의존성 | 다시 만드는 경우 |
|---|---|---|
| rename/toggle/remove callback 묶음 | `[setItems]` | setter가 바뀔 때. 현재 Hook 계약에서는 같은 슬롯의 setter identity가 유지됨 |
| ul과 TaskRow 목록 표현 | `[visible, rowActions]` | 목록 데이터·검색·필터·정렬에 따라 visible이 달라질 때 |

입력창 draft나 카운터가 바뀌면 루트 함수는 실행된다. `visible`과 `rowActions`가 그대로이므로 목록 useMemo는 이전 표현 객체를 반환한다. 엔진은 그 표현의 이전 VNode 평가 결과를 사용하고 TaskRow 함수를 다시 호출하지 않는다. 실제 DOM binding, PatchPlan, dirty 입력 복원과 Effect 처리는 각자의 기존 절차를 따른다. 따라서 행 함수 실행이 0회여도 전체 갱신이 O(1)이 된다는 뜻은 아니다.

항목을 수정하면 `setItems(previous => ...)`가 새로운 items 배열을 만든다. 그 결과 visible과 목록 표현이 새로 계산되고 필요한 자식 평가·Diff·Patch를 수행한다. 자동 props 비교나 자식 Hook은 추가하지 않았다. 이 구현은 목록 전체 표현의 재사용이며, 항목 하나를 수정했을 때 나머지 행을 자동으로 memo하는 구현은 아니다.

콜백을 오래 보관하려면 오래된 State를 읽지 않아야 한다. 예를 들어 rename은 특정 render의 items를 캡처하지 않고, 함수형 updater가 받는 `previous`를 변환한다. rename → toggle → rename을 같은 turn에 실행하면 두 번째 action은 첫 번째 action의 후보 상태를, 세 번째 action은 두 번째 후보 상태를 받는다. 기존 FIFO Batching과 안정된 setter 계약을 그대로 사용한다.

추가 버튼의 add callback은 draft와 nextId를 읽기 때문에 기존 render별 closure를 유지한다. 모든 함수를 빈 deps로 감싸는 방식은 현재 입력과 ID를 놓칠 수 있으므로 적용하지 않았다. Hook은 모두 루트에서 일정한 순서로 호출하며, TaskRow와 TaskSummary는 props를 받는 순수 자식 함수다.

추가·삭제 뒤의 비동기 동기화에도 같은 원리가 적용된다. items가 바뀌면 원래 40ms Effect가 실행되고, 총개수를 표시하는 State를 갱신한다. 이 후속 render에서는 목록 데이터가 같으므로 행 표현을 다시 사용할 수 있다. Effect나 후속 root 실행을 생략한 것이 아니다.

E2 엔진, 10개 seeded row의 독립 counts 실행에서 확인한 예다. 단위는 첫 갱신과 비동기 후속 갱신을 합친 TaskRow 실행 횟수다. [원본 counts](bench/task-matrix-smoke-v1/counts.json).

| 실제 작업 | A0 | A1 |
|---|---:|---:|
| 새 항목 입력 | 10 | 0 |
| 추가 + 총개수 동기화 | 22 | 11 |
| 이름 수정 | 11 | 11 |
| 완료 변경 | 11 | 11 |
| 삭제 + 총개수 동기화 | 20 | 10 |
| 합계 | 74 | 43 |

이 다섯 작업의 root 실행은 두 앱 모두 7회, Effect setup은 모두 4회다. 줄인 것은 불필요한 행 평가다. 이 counts 증거는 실제 시간 감소율을 뜻하지 않으며 정식 시간 비교와 별도로 해석한다.

벤치마크의 `equal`은 State를 바꾸지 않고 `root.update()`로 다시 render한 경우다. 화면과 State가 같아도 루트가 새로 만든 handler 함수는 다른 참조로 비교한다. 모든 함수 참조까지 동일한 VRoot 복제 실험을 뜻하지 않는다. 같은 10개 counts에서 A0/A1은 root 실행과 commit이 각각 1회이고, 행 실행은 10/0회, Diff 방문은 146/46회였다. 실제 DOM 생성·삭제·이동·쓰기·listener 추가/제거는 0이지만, 최신 handler 연결과 필요한 검증은 수행한다.

검증은 다음을 구분한다.

- `tests/integration/task-reuse.test.ts`: reuse on/off의 실행 횟수, 동일한 사용자 작업 결과와 Effect 횟수, 최신 State에 대한 연속 callback과 FIFO 결과.
- `tests/integration/task-benchmark.test.ts`: 실제 TaskApp에 독립 모델을 적용한 모든 작업, 입력 복원, 키별 DOM identity, 실제 비동기 Effect.
- `tests/browser/tasks.spec.ts`: Chromium·Firefox에서 연속 수정·완료·삭제·추가, live value와 identity, 활성 입력창의 focus·selection.
- 시간 비교: 같은 앱으로 엔진만 바꾸거나 같은 엔진으로 앱만 바꾼다. 초기화·새 생성·유지한 앱의 반복 작업과 fresh mount를 별도로 기록한다.

이 문서는 앱 변경의 동작 원리를 설명한다. 최종 전체 테스트와 성능·캐시 정책 판단은 [후속 작업 기록](task-app-followup.md)과 [현행 성능 보고서](benchmark-results.md)의 해당 실행 근거를 따른다.
