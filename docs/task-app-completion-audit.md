# 실제 TaskApp 후속 작업 완료 조건 대조

현재 상태는 **진행 중**이다. 목표 원문 `edf2df25-63fd-4fa1-af6b-a036872b3a20/goal-objective.md`의 항목별 근거를 연결한다. 후보의 정확성 통과와 최종 성능 정책·인수 완료를 구분한다.

| 목표 항목 | 확인 내용과 근거 | 현재 상태 |
|---|---|---|
| 1. 작업 위치·Git | [시작 기록](validation/task-app-start.json)의 phase1 / 4d5a66f에서 같은 브랜치로 진행. 단계별 로컬 커밋, 브랜치 전환·amend·rebase·push 없음. 종료 HEAD와 clean 상태는 결과 커밋 뒤 확인. | 완료 |
| 2. 요구사항·기존 증거 확인 | [작업 기록](task-app-followup.md), [요구사항 대응](requirements-tests.md). 이전 184개/31개 브라우저 결과, E3 후보 203개, E4 후보 205개, 앱 전용 8개, 최종 213개/33개를 각각 구분. [이전 보고서 보존 영수증](validation/task-app-previous-report.json). | 확인 |
| 3. 보존 계약 | [아키텍처](architecture.md), [앱 재사용 원리](task-app-reuse.md), [E3 반례](task-app-engine-candidate.md). 루트 Hooks·순수 자식·공통 Diff/Patch·FIFO·폼/IME·문맥/DOM 검증·Proxy 정확성 수정 유지. 최종 소스의 전체 검증 통과. | 완료 |
| 4. 비교 설계·기준선 | [사전 계획](task-app-comparison-plan.md), [첫 정식 실행 출처](bench/task-matrix-v1/environment.json). E0/E1/E2 × A0/A1를 같은 실제 앱·하네스·seed로 고정. | 완료 |
| 5. 앱 표현 재사용 | 5ed7f34의 목록 표현·행 콜백 Memo, 함수형 최신 State updater. [관련 64개/TaskApp 브라우저 8개 검증](validation/task-app-b/result.json), [설명](task-app-reuse.md). 실행 횟수와 시간은 분리. | 구현·단계 검증 완료 |
| 6. 세 버전 비교 | 720개 조건·3세션과 [통계 감사](bench/task-matrix-v1/statistics-audit.json). [첫 결과](task-app-baseline-results.md), [분리 진단](bench/task-diagnostic-baseline-v1/diagnostics.md). adverse/fresh/CRUD 하위 action 포함. | 완료 |
| 7. 생성 비용·p95와 최종 정책 | E3는 [1,000개 보충](task-app-tail-results.md)의 반복 회귀로 기각. E4 `2a21ec7`의 정식 480조건과 [100개](bench/task-candidate-v2-tail-persistent-100-v1/policy-review-e4.md)·[10개](bench/task-candidate-v2-tail-persistent-10-v1/policy-review-e4.md) n=180 보충에서 median·p95 초과가 재현돼 기각. **최종 정책: E1 방식의 매회 검증 + 동결 안전 조건, 기본 앱 A0, 비교용 A1.** 10,000개 보충은 사용자 요청으로 중단, stress 회귀는 미해소·보류. [최종 정책](task-app-final-policy.md) | 완료(10,000개 미확인 명시) |
| 8. 최종 재검증 | `9b52323`에서 typecheck·단위/통합 213/213·production build·기본 Chromium/Firefox 33/33 × 3회(새 서버·브라우저, worker 2, timeout 30초, retry 0)와 검증 전후 source hash 일치. [결과](validation/task-final-20261109-v1/result.json) | 완료 |
| 9. 단계별 커밋 | 6c3fa1f → 5ed7f34 → dfd20dc → ff9e24e → 93bc38c → 642746e → 2a21ec7 → ae155cc → 51b7def(E4 증거) → 9b52323(최종 정책 코드) → 결과·문서 커밋. | 완료 |
| 10. 문서·원본 체크리스트 | [현행 보고서](benchmark-results.md), [진행](progress.md), [최종 정책](task-app-final-policy.md), 아키텍처/요구사항/인수/README 갱신. [외부 체크리스트 v1.12 영수증](validation/task-checklist-final.json)이 저장소 밖 원본과 정확한 gzip 사본의 hash를 연결. | 완료 |
| 11. 종료 조건 | 최종 정책·새 전체 검증·원자료 감사·체크리스트·단계별 커밋 확인. 10,000개 stress 보충, 팀 활동, 원격 CI는 완료로 표시하지 않음. | 완료(외부·10,000개 미확인 구분) |

실제 한글 IME는 2026-11-07 사용자 답변 “직접 확인 완료 — 문제 없음”(브라우저명 미제공)의 이전 근거다. 이번 소스의 새 수동 PASS로 재분류하지 않는다. 팀 활동·원격 CI·push/PR/배포는 수행 결과로 표시하지 않는다.
