# TaskApp 표현 재사용·캐시 정책 후속 작업

시작 phase1 / 4d5a66f, clean. [사전 비교·채택 계획](task-app-comparison-plan.md), [출처·초기 검증](validation/task-app-start.json). 이번 목표는 실제 앱의 행 표현 재사용과 E0/E1/E2 × A0/A1의 분리 비교, 측정에 따른 생성/p95 개선 또는 캐시 범위 조정이다. 진행 중이며 과거 통과 기록으로 완료 처리하지 않는다.

## A — 설계·기준선·실제 앱 하네스

TaskApp은 visible 배열과 Summary 표현만 Memo하고 row 표현과 세 callback은 매번 생성함을 확인했다. useState setter는 기존 슬롯에서 동일 함수이며 함수형 action은 FIFO 후보 상태에 적용된다. E0→E1은 planValidation host 비교, E1→E2는 동결/검증 캐시 관련 4개 기능 파일의 변경이다.

Git 객체의 엔진/앱/의존성과 공통 harness를 별도 경로에 복사해 production bundle을 만들었다. A0 앱 소스는 변형 없이 import하며 초기 데이터만 공개 root State setter로 주입한다. 실제 40ms Effect와 후속 render도 실행한다. 모든 조작에 State/DOM/입력/순서/identity/focus/selection oracle을 적용한다. row 실행 counts와 primary/후속/초기화 시간은 분리한다.

타입 검사, 하네스 11개 단위·통합 테스트, 세 엔진의 10개 작은 조건과 E0의 10000개 persistent/fresh equal smoke를 통과했다. [작은 조건](bench/task-baseline-smoke-v1/analysis.json), [stress](bench/task-baseline-stress-smoke-v1/analysis.json). 표본 2개의 smoke는 정식 성능 결론이 아니다.

## B — 실제 앱 표현·callback 재사용

루트 useMemo로 rowActions를 [setItems]에, 목록 표현을 [visible, rowActions]에 의존시켰다. 콜백은 items를 캡처하지 않고 함수형 updater의 최신 FIFO 후보를 사용한다. add는 draft/nextId를 사용하는 기존 render별 closure를 유지한다. 자식 Hook이나 함수 props 무시 비교는 추가하지 않았다.

관련 64개 테스트와 typecheck/production build, Chromium/Firefox TaskApp 8개 테스트를 통과했다. 10개 seeded row의 draft/counter/explicit render는 reuse on에서 행 실행 0, off에서 10회이며 State/DOM/입력/Effect sequence는 같다. 연속 rename/toggle/delete와 +1×3의 최신 상태·setter identity도 검증했다. [증거](validation/task-app-b/result.json). 실제 시간 감소는 아직 판정하지 않았다.

## 남은 단계

- C: 6조합 × 사전 조건 × 3세션, 원본 감사와 앱/엔진 효과 분리.
- D: 확인한 생성/등록/GC 비용에 대한 후보 또는 적용 범위 조정, 고정 A1 재비교와 필요한 p95 보충.
- E: 최종 소스에서 전체 단위·통합·타입·build·기본 브라우저 3회, 문서/원본 체크리스트·hash/커밋/clean 감사.
