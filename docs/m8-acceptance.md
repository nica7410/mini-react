# M8 최종 인수 기록

최초 benchmark는 Chromium 할당 실패로 중단했고, 보완된 실행기의 smoke·자원·timeout 검증을 마쳤다. 최종 전체 benchmark를 다시 진행한다. 아래의 완료된 구현·검증과 아직 끝나지 않은 실험 인수를 구분한다. 최종 상태는 실험 원본 감사 뒤 갱신한다.

## 이미 확인한 기술 결과

- 기능 소스: `319026877cb6f391db096a4c179f6d1a0a71eb46`, 현재 브랜치 `phase1`.
- M0 기술 계약, M1 현재 후보, M2 잠정 선정, M3 정확성, M4 keyed/LIS, M5 FIFO/reuse, M6 Inspector/harness, M7 앱/브라우저 상태를 구현했다.
- 단위·통합 **157/157**, Chromium **19/19**, Firefox smoke **10/10**, typecheck와 production build PASS.
- 실제 Windows 한글 IME는 사용자 직접 확인 PASS. 조합 중 task-8 이동 보류·종료 후 이동·문자/focus 보존 요청 절차에 대해 “직접 확인 완료 — 문제 없음” 응답. 브라우저명·버전은 제공되지 않았다.
- M7 검증 당시의 소스·테스트 hash 59개가 문서/CI 작성 후에도 모두 일치했다.
- 명세의 기능 15개와 테스트 ID 69개를 [대응표](requirements-tests.md)에 연결했다.
- [아키텍처·지원 한계](architecture.md), [데모·원리·회귀·연습·성과 문구](demo-and-explanation.md), 로컬 실행 [README](../README.md)를 작성했다.
- CI YAML을 파싱하고 trigger/권한/명령/4개 SHA 고정을 검사했다. 원격 CI 실행은 하지 않았다.

자동 검증의 원본: [unit JSON gzip](validation/final-unit.json.gz), [browser JSON gzip](validation/final-browser.json.gz). 소스/시점 요약: [M7](validation/m7.json), [M8 사전 감사](validation/m8-preflight.json). 이 기록은 나중의 임의 소스 변경에 대한 자동 보증이 아니다.

## 최종 benchmark — 진행 중

`m7-full`의 중단/원본과 [실행기 보완](benchmark-runner-recovery.md)을 보존했다. 기능 소스 `3190268`과 같은 production build를 조건별 새 프로세스·120초 호출 제한의 실행기로 `m8-full`에서 재측정한다. 측정 중 엔진/빌드를 변경하거나 기능 테스트를 병행하지 않는다. 문서 작성과 가벼운 파일 검사는 공존하므로 OS가 완전히 유휴였다고 주장하지 않는다.

10/100/1,000/10,000개, light/stateful, 11개 keyed 시나리오, 별도 Batching/reuse 축을 각 조건마다 새 Chromium 프로세스를 사용하는 순차 3세션에서 측정한다. counts/timing 분리, 매번 fresh old DOM, 일반 warm-up 20+표본 100, stress warm-up 5+표본 30. 각 실행의 순서·identity·live 입력을 검사한다.

아직 전체 결과를 인수하지 않았으므로 성능 향상 수치와 M8 기술 완료를 선언하지 않는다. 완료 후 원본의 표본 수·옵션·통계 재계산을 감사하고, 불리한 입력까지 포함한 표와 그래프를 연결한다.

## 외부 확인 및 명시적 제외

| 항목 | 상태 |
|---|---|
| M0 팀 인원·일정·합의, 다른 팀원의 M1 후보 | 미제공·미확인 |
| M2 후보 간 비교·팀 합의·부분 이식 | 현재 후보를 잠정 선정하도록 허용됨. 후보 비교/합의/이식 수행을 주장하지 않음 |
| 팀원이 직접 설명하고 작은 변경 연습 수행 | 자료와 절차 제공, 수행 여부 미확인 |
| 원격 CI green | 설정/로컬 동등 명령까지만 확인. 실행 범위 밖 |
| 원격 push·PR·배포 | 수행하지 않음. 실행 가능한 로컬 데모 제공 |
| 임의 브라우저·모든 IME·React 호환성 | 지원하지 않거나 미검증. [지원표](architecture.md) 참조 |
| 실패 seed 고정 | 무작위 실패 seed는 발견되지 않음. 고정 seed 검증과 실패 입력 저장 경로, 실제 deterministic 회귀를 보존 |

외부 확인을 체크박스 개수로 숨기지 않는다. M8 기술 인수와 팀 활동/원격 서비스 확인은 서로 다른 상태다.
