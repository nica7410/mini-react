# 실제 TaskApp 후속 작업 완료 조건 대조

현재 상태는 **진행 중**이다. 목표 원문 `edf2df25-63fd-4fa1-af6b-a036872b3a20/goal-objective.md`의 항목별 근거를 연결한다. 후보의 정확성 통과와 최종 성능 정책·인수 완료를 구분한다.

| 목표 항목 | 확인 내용과 근거 | 현재 상태 |
|---|---|---|
| 1. 작업 위치·Git | [시작 기록](validation/task-app-start.json)의 phase1 / 4d5a66f에서 같은 브랜치로 진행. 과거 소스는 archive로 추출하고 단계별 로컬 커밋을 남김. 종료 HEAD/clean 확인은 최종 단계에서 기록. | 진행 중 |
| 2. 요구사항·기존 증거 확인 | [작업 기록](task-app-followup.md), [요구사항 대응](requirements-tests.md). 이전 184개/31개 브라우저 결과와 현재 후보 203개·앱 전용 8개를 구분. [이전 보고서 보존 영수증](validation/task-app-previous-report.json). | 확인 |
| 3. 보존 계약 | [아키텍처](architecture.md), [앱 재사용 원리](task-app-reuse.md), [E3 반례](task-app-engine-candidate.md). 루트 Hooks·순수 자식·공통 Diff/Patch·FIFO·폼/IME·문맥/DOM 검증 유지. 최종 전체 검증은 별도 필요. | 후보 검증 완료, 최종 인수 대기 |
| 4. 비교 설계·기준선 | [사전 계획](task-app-comparison-plan.md), [첫 정식 실행 출처](bench/task-matrix-v1/environment.json). E0/E1/E2 × A0/A1를 같은 실제 앱·하네스·seed로 고정. | 완료 |
| 5. 앱 표현 재사용 | 5ed7f34의 목록 표현·행 콜백 Memo, 함수형 최신 State updater. [관련 64개/TaskApp 브라우저 8개 검증](validation/task-app-b/result.json), [설명](task-app-reuse.md). 실행 횟수와 시간은 분리. | 구현·단계 검증 완료 |
| 6. 세 버전 비교 | 720개 조건·3세션과 [통계 감사](bench/task-matrix-v1/statistics-audit.json). [첫 결과](task-app-baseline-results.md), [분리 진단](bench/task-diagnostic-baseline-v1/diagnostics.md). adverse/fresh/CRUD 하위 action 포함. | 완료 |
| 7. 생성 비용·p95와 최종 정책 | E3 ff9e24e의 증명 순서/보관 범위 수정, [변경 전 실패와 후보 검증](validation/task-e3-correctness/result.json). 새 480개 조건의 [통계](bench/task-candidate-v1/statistics-audit.json)·[판정 감사](bench/task-candidate-v1/policy-audit.json)와 [분리 진단 36개](bench/task-diagnostic-candidate-v1/diagnostic-audit.json) 완료. [11개 조건 보충 계획](bench/task-candidate-v1/tail-supplement-plan-e3.json), 보충 뒤 정책 결정 필요. | 진행 중 |
| 8. 최종 재검증 | 선택한 최종 기능 소스의 typecheck·전체 unit/integration·production build·기본 Chromium/Firefox 전체 3회와 source/hash 연결. worker 2, timeout 30초, retry 0. | 미실행 |
| 9. 단계별 커밋 | 6c3fa1f → 5ed7f34 → dfd20dc → ff9e24e. 후보 증거·최종 정책·인수 결과 커밋은 남음. | 진행 중 |
| 10. 문서·원본 체크리스트 | [현행 보고서](benchmark-results.md), [진행](progress.md), 아키텍처/요구사항/인수/README를 진행 상태로 갱신. [외부 체크리스트 v1.10 영수증](validation/task-checklist-candidate.json)은 저장소 밖 원본과 정확한 gzip 사본의 hash를 연결. 최종 버전은 남음. | 진행 중 |
| 11. 종료 조건 | 최종 정책·새 전체 검증·원자료 감사·체크리스트·단계별 커밋·clean을 모두 확인한 뒤에만 완료. | 미완료 |

실제 한글 IME는 2026-11-07 사용자 답변 “직접 확인 완료 — 문제 없음”(브라우저명 미제공)의 이전 근거다. 이번 소스의 새 수동 PASS로 재분류하지 않는다. 팀 활동·원격 CI·push/PR/배포는 수행 결과로 표시하지 않는다.
