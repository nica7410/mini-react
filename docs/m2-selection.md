# M2 잠정 기준 구현 선정

- 확인일: 2026-11-07 (Asia/Seoul)
- 시작/계속 작업 브랜치: `phase1`. main/master 전환·신규 브랜치/worktree·원격 push 없이 진행한다.
- 기준 구현: `705fde0` — M0~M1 공통 엔진. 기존 소스 34개 해시는 M1 기록과 일치했다.
- 재검증: 단위·통합 52/52, Chromium 4/4, TypeScript 검사·production build PASS.
- 적용 근거: 사용자가 후속 목표에서 다른 후보가 없으면 현재 구현을 잠정 기준으로 사용할 수 있도록 명시했다.

다른 팀원 후보는 제공되지 않았다. 후보 간 비교·팀 합의·기능 이식은 수행하지 않았다. 현재 구현을 앞으로 보완하기 위한 **잠정 선정**이며 경쟁 후보보다 우수하다는 결론이 아니다.

## 평가

| 기준 | 확인한 증거 | 판단 |
|---|---|---|
| 필수 정확성 | M1 지정 7개 ID, 단위·통합·브라우저 재검증 | 최소 동작 통과, 전체 폼·계획 검증은 M3 보완 |
| 공통 엔진 | editor와 FunctionComponent가 같은 diff/applySnapshot/commit 호출 | 유지 |
| 상태 소유 | root hooks, 자식 Hook 오류, setter 슬롯 검증 | 과제 제약 충족 |
| 설명·수정 가능성 | capture/view/binding/planner/executor 분리, 약 30개 작은 모듈 | 독립 기능을 보완하기 적합 |
| 검증 확장 | production 모듈 fixture, Node 순수 planner, DOM 통합, Chromium 테스트 | 동일 경로에 회귀 테스트 추가 |
| 성능 | 현재는 positional/sync, 성능 측정 없음 | 미평가. M4~M6에서 정확성 확인 후 비교 |

## M3 우선순위

1. 계획 검증: ref 존재만 검사하므로 잘못된 parent/anchor가 일부 쓰기 이후 발견될 수 있다. 쓰기 전 구조 모의 실행과 nextView/target 일치를 검사한다.
2. 폼 소유: controlled/uncontrolled 기본 정책·전환 검사, 선택 index 검증, option 후 동기화, 영역별 form 소유 radio, 선택된 file 캡처 오류를 보완한다.
3. controlled no-op: 사용자 handler와 독립된 native 입력 추적을 추가하고 render를 생략해도 공통 Patch로 값 복원한다.
4. 오류·자원: DOM 예외 후 faulted 차단, 마지막 정상 History 기준 초기화, 등록 listener·binding·예약 작업 정리를 검증한다.
5. 누락 회귀: old/new 중복 key, 혼합 구조/주석 변경, 속성·CSS·폼 경계, History, Hook 실패/cleanup을 최종 명세와 대조한다.

M3 Gate 전까지 LIS/Batching을 기본 경로에 넣지 않는다. 기존 Hook/History/renderer를 따로 하나 더 만들지 않는다.

## M2 Gate

- [x] 현재 구현의 필수 제약·정확성·설명 가능성 평가.
- [x] 잠정 기준과 선택 근거 기록.
- [x] 설치·검증·빌드 명령은 package.json과 pnpm lockfile 유지.
- [x] 필수 누락을 M3 우선 작업으로 전환.
- [ ] 다른 후보 비교·장점 테스트 이식·팀 선정 합의 — 후보 미제공으로 해당 작업 없음/미확인.

하나의 공통 엔진과 기본 테스트 경로가 있으며, 사용자가 허용한 잠정 선정 조건으로 M3 개발을 진행할 수 있다.
