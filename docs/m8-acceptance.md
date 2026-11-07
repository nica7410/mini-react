# M8 최종 인수 기록

**요청된 B안의 기술 구현·로컬 검증·문서화 인수 조건을 충족했다.** M0 팀 확인, 다른 후보 비교, 팀원 설명/연습/실제 발표와 원격 CI는 별도 미확인 상태다. 기능 존재·검증 통과·실행 가능한 로컬 데모·원리 설명과 전체 benchmark 근거를 대조했다.

## 최종 기술 증거

| 항목 | 실제 결과 | 근거 |
|---|---|---|
| 브랜치·기능 소스 | phase1, 기능 commit 3190268 | [단계·커밋](progress.md) |
| 단위·통합 | 157/157, 14개 파일 | [원본 JSON gzip](validation/final-unit.json.gz) |
| 브라우저 | Chromium 19/19 + Firefox 10/10, unexpected/flaky/skipped 0 | [원본 JSON gzip](validation/final-browser.json.gz), [M7](m7-app-browser.md) |
| 타입·production build | PASS | [실행 시점·소스 hash](validation/m7.json) |
| 실제 Windows 한글 IME | 사용자 직접 확인 PASS, 브라우저명·버전 미제공 | 요청된 task-8 지연 이동/조합 종료/문자·focus 보존 흐름에 “직접 확인 완료 — 문제 없음” 응답 |
| 검증 상태와 현재 코드 일치 | 소스·테스트 hash 59개 일치, 기능 commit 이후 docs/scripts/CI만 변경 | [최종 감사](validation/m8.json) |
| 요구사항 추적 | 기능 15개·테스트 ID 69개 연결 | [대응표](requirements-tests.md) |
| 전체 benchmark | 3세션, counts 624 / warm-up 10,140 / timing 51,480 | [최종 결과](benchmark-results.md) |
| 원자료·통계 | 624 옵션별 조건·4,368 구간 재계산 일치, hidden/unfocused 0, 세션 간 counts 일치 | [감사](bench/m8-full/analysis.json) |
| 그래프 | 4개 비교 그림, PNG/SVG 각각 생성·검토 | [그림 검증](bench/m8-full/plot-validation.json) |
| 로컬 데모 | HTTP 200, Mini React 페이지 | [README](../README.md), [시연 절차](demo-and-explanation.md) |
| CI 구성 | YAML·명령·4개 Action SHA 검사 PASS | [workflow](../.github/workflows/ci.yml); 원격 실행 미수행 |

기능 테스트를 문서 수정마다 반복한 것으로 기록하지 않는다. 보관한 최종 테스트 결과와 현재 소스의 일치를 확인했고, benchmark는 같은 기능 소스의 production build로 실제 전체 실행했다. [M8 사전 감사](validation/m8-preflight.json)는 당시 진행 중 상태를 보존한 역사적 기록이다.

## 실험 인수와 한계

최초 m7-full은 Chromium 할당 실패로 중단했다. [부분 원본·실행기 보완](benchmark-runner-recovery.md)을 보존하고 조건별 새 프로세스·120초 호출 제한으로 전체 3세션을 다시 실행했다. 최종 측정 commit은 ebc8f46, 결과 commit은 0d1cfea다. 두 실행의 표본을 합치지 않았다.

LIS의 최소 이동 정확성과 시간상 이득을 구분했다. 10,000개 stateful 마지막→처음에서 이동 9,999→1, median 시간은 세션별 4.4%/5.1%/6.9% 낮았다. 1,000개 mixed에서는 이동이 줄어도 median이 세 세션 모두 높았다. no-op·역순·작은 목록과 모든 raw를 보존했다. Batching/reuse는 이번 순수 갱신 패턴에서 반복 작업과 시간을 줄였다. 이 결과는 paint나 전체 사용자 지연·React 대비 우위가 아니다.

큰 stateful no-op에도 수백 ms의 검사·계획·commit 비용이 남아 있다. 기능 정확성과 재현 가능한 비교를 확인한 학습용 엔진이며, 범용 고성능 엔진·모든 브라우저/IME 호환성은 주장하지 않는다. [아키텍처와 지원 한계](architecture.md), [핵심 원리·실패 수정·성과 문구](demo-and-explanation.md)를 함께 본다.

## 외부 확인과 명시적 제외

| 항목 | 상태 |
|---|---|
| M0 팀 인원·일정·합의, 다른 팀원의 M1 후보 | 미제공·미확인 |
| M2 후보 간 비교·팀 합의·부분 이식 | 현재 후보를 잠정 선정하도록 허용됨. 실제 비교/합의/이식 수행을 주장하지 않음 |
| 팀원이 직접 설명하고 작은 변경 연습 수행 | 자료·절차 제공, 수행 여부 미확인 |
| 유리/불리 결과의 실제 팀 발표 | 양쪽 결과와 시연 자료 제공, 실제 발표 수행 여부 미확인 |
| 원격 CI green | 설정·로컬 동등 명령까지만 확인. 실행 범위 밖 |
| 원격 push·PR·배포 | 수행하지 않음. 실행 가능한 로컬 데모 제공 |
| 임의 브라우저·모든 IME·React 호환성 | 지원하지 않거나 미검증. 지원표 참조 |
| 실패 seed | 정답 무작위 실패 seed는 미발견. deterministic 회귀와 실제 할당 실패 입력·원본·집중 진단을 보존 |

원본 체크리스트의 외부 확인 항목을 완료로 꾸미지 않았다. 요청된 기술 인수와 팀 활동/원격 서비스 확인은 서로 다른 상태다.
