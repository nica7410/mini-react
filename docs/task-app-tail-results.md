# E3 후보의 추가 표본 확인

E3/A1의 일반 채택은 기각했다. 첫 후보 결과 `task-candidate-v1`의 원자료·분포와 별도로 보존한다. [고정한 보충 계획](bench/task-candidate-v1/tail-supplement-plan-e3.json)은 E1→E3 A1의 5개, E3 A0→A1의 6개 초과 조건을 모두 포함한다. 먼저 끝난 1,000개 CRUD의 새 3세션에서도 같은 회귀가 반복돼, [기각 판단과 실행 변경](bench/task-candidate-v1/e3-rejection-decision.json)을 2026-11-09 05:43 KST에 기록했다. 사전 gate와 원 계획은 변경하지 않았다.

각 실행은 E1 A1 / E2 A1 / E3 A0 / E3 A1의 네 고정 build와 기존 하네스·seed·oracle·순서 균형화를 유지한다. 새 3세션에 각 조건 n=180, warm-up 10(stress 5)이다. 첫 n=60 결과와 합치지 않으며 느린 표본·불리한 세션·실패를 제외하지 않는다. 정식 수집과 테스트·빌드·프로파일링을 병행하지 않는다.

| 순서 | tag | 크기·작업 | 현재 상태 |
|---|---|---|---|
| 1 | task-candidate-v1-tail-persistent-1000-v1 | 1,000개 CRUD | 2026-11-09 02:39~03:10 KST, 12/12 수집·통계/판정 감사 완료 |
| 2 | task-candidate-v1-tail-persistent-10000-v1 | 10,000개 search/sort/move/CRUD | 2026-11-09 03:12~05:59 KST. 첫 세션 16개 조건 완료 뒤 후보 기각으로 중단; 3세션 통과 근거로 사용하지 않음 |
| 3 | task-candidate-v1-tail-persistent-100-v1 | 100개 search/filter/dirty | 후보 기각으로 미실행; 해당 tail은 미확인 |

첫 실행의 [환경 기록](bench/task-candidate-v1-tail-persistent-1000-v1/environment.json)은 runner commit `93bc38c61bf85c00076927d7381e3074ab193094`를 가리킨다. 이 커밋은 후보의 첫 비교·별도 진단·진행 문서를 보존한 커밋이며 기능 엔진은 `ff9e24e`, 앱 A1은 `5ed7f34`의 고정 build다. runner SHA-256 `db8d7aa124c383e27beac039f87ae26b25fd5f4dc4e7bf11f68c8fdff9e097af`와 사전 계획 hash는 첫 정식 실행과 같다.

완료한 보충 실행은 각 세션의 median/IQR/p95와 초과 여부를 따로 해석한다. 불완전한 stress 실행과 미실행 조건은 통과나 회귀 해소 근거로 사용하지 않는다. 추가 조건의 결과가 이미 실패한 일반 채택 판단을 뒤집을 수 없으므로, 고정 E3 A0/A1의 별도 진단과 보수적인 캐시 적용 범위 조정으로 넘어간다. 이는 유리한 결과를 얻기 위한 재시도가 아니다. 최종 정책·새 후보 검증·전체 브라우저 인수는 아직 남아 있다.

## 1,000개 CRUD의 새 n=180 결과

3세션 각각 4개 비교군, 전체 12개 조건의 수집·정리가 통과했다. raw 2,304행 = counts 12 + 초기화 12 + warm-up 120 + 측정 작업 2,160이며 action은 10,800개다. 통계 672개·비교 672개·누적 경로 2,280점을 독립 검산했고, 판정 18개 조건/54개 세션 행과 의도적 오판 검출도 통과했다. [원자료 감사](bench/task-candidate-v1-tail-persistent-1000-v1/analysis.json), [통계 감사](bench/task-candidate-v1-tail-persistent-1000-v1/statistics-audit.json), [판정 감사](bench/task-candidate-v1-tail-persistent-1000-v1/policy-audit.json).

| 비교 / 하위 동작 | median 변화 S1 / S2 / S3 | p95 변화 S1 / S2 / S3 |
|---|---|---|
| A1 고정 E1→E3 / rename | +5.72% / −3.54% / −3.21% | +11.91% / −6.63% / −5.99% |
| A1 고정 E1→E3 / toggle | +32.17% / +4.08% / +5.88% | +19.13% / −0.39% / −2.27% |
| E3 고정 A0→A1 / toggle | +44.02% / +14.94% / +13.37% | +61.26% / +29.73% / +29.57% |

이는 모두 각 세션 n=180의 별도 보충이다. 엔진 비교 6개 조건 중 rename/toggle 2개, 앱 비교 6개 중 toggle 1개가 한 번 이상 사전 범위를 넘었다. 특히 앱의 toggle은 세 세션 모두 median/p95 범위를 넘었다. 초기 비교에서 발견한 회귀가 해소됐다고 판정할 수 없으므로 현재 E3/A1의 일반 채택은 기각한다. 최종 구현에는 원인 수정 또는 적용 범위 조정이 필요하다. [절대 ms·IQR·n 및 전체 조건](bench/task-candidate-v1-tail-persistent-1000-v1/policy-review-e3.md).

보고서 생성 첫 명령은 run tag 대신 디렉터리를 전달해 CLI 인자 검사에서 실패했다. [명령 오류 기록](bench/task-candidate-v1-tail-persistent-1000-v1/report-command-failure.json)을 남기고 tag 인자로 보고서 생성만 다시 실행해 통과했다. 수집·원자료·통계·판정 감사는 최초 실행에서 통과했으며 benchmark 재시도는 없었다.

## 중단한 10,000개 보충의 보존 범위

첫 세션의 16개 비교군/작업은 runner에서 모두 PASS와 dispose를 기록했다. raw 2,992행 = counts 16 + 초기화 16 + warm-up 80 + 측정 작업 2,880이며 측정 action은 5,760개다. 두 번째 세션의 빈 raw 파일이 생성된 경계에서 정확한 runner PID를 확인해 종료했다. 프로세스 exit 1은 이 의도적 종료이며 oracle 실패로 해석하지 않는다. [종료 기록](bench/task-candidate-v1-tail-persistent-10000-v1/termination-receipt.json).

runner가 작성한 첫 세션 gzip과 원 raw의 바이트 일치, 행의 누락·중복 여부, 기존 process PASS/dispose 기록을 확인했다. 빈 두 번째 세션도 `session-2.partial.jsonl.gz`로 보존했다. 원 `environment.json`은 강제 종료 당시의 `running` 값을 그대로 두었으며 실제 상태는 `stopped-rejected-candidate`다. [보존 영수증](bench/task-candidate-v1-tail-persistent-10000-v1/stopped-run-inventory.json). 정식 통계/판정 감사나 3세션 보충 PASS는 생성하지 않았고, 이 자료로 성능 채택이나 실행 간 비교를 하지 않는다. 기각 후 마지막 구간에는 1초 간격의 가벼운 종료 경계 감시가 있었음도 영수증에 명시했다.

새 보존 도구의 첫 실행은 초기화 행의 null 인덱스를 빈 문자열로 직렬화해 키 검사에서 실패했다. 원 오류와 도구 hash를 [보존](bench/task-candidate-v1-tail-persistent-10000-v1/preservation-command-failure.json)했고, 명시적 문자열 변환으로 고친 뒤 같은 누락·중복 검사를 다시 통과했다. 원자료와 benchmark는 재실행하거나 수정하지 않았다.

## E3 고정 A0/A1의 별도 원인 진단

정식 수집을 종료한 뒤 `task-diagnostic-e3-app-v1`의 1,000개 조건 8개(CPU 6, 메모리 2)를 실행했다. 원래 완료한 `task-candidate-v1`의 고정 E3 A0/A1 source/build를 사용했고, 기능 hash와 모든 표시 구간·표의 감사를 통과했다. CPU는 warm-up 5회 뒤 12회이며 정식 n=180 분포와 합치지 않는다. [전체 진단](bench/task-diagnostic-e3-app-v1/diagnostics.md), [분석 감사](bench/task-diagnostic-e3-app-v1/diagnostic-audit.json).

완료 상태 변경 12회의 primary 창 합계는 A0 1,321.025ms, A1 1,763.122ms였다. 증명 함수 self는 343.474→416.041ms, 같은 창의 GC category 교집합은 94.138→131.800ms였다. evaluation/diff/commit에도 차이가 있어 이를 모두 GC 탓으로 돌리지 않는다. nested 함수 구간은 합산하지 않는다. [구간 추출·검산](bench/task-diagnostic-e3-app-v1/toggle-review.json).

전체 CRUD의 증명 self 비중도 A0 25.462%, A1 23.800%로 컸다. 별도 mixed 궤적의 dispose 후 heap은 A0 3.893MiB, A1 2.862MiB이고 DOM/listener 수는 모두 복원됐다. 이는 A1만의 객체 누수를 증명하지 않는다. 정확한 회귀 원인을 확정한 것으로 표현하지 않고, 관찰한 새 트리 증명·등록 비용에 한해 보관 범위를 제한하는 다음 후보를 검증한다. 앱 소스나 correctness 검사를 임의로 바꾸지 않는다.
