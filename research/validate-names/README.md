# 검증 이름 검사 V1 (채택됨)

`8ae389e`의 `src/core/validate.ts`에서 이름 검사 세 곳만 바꾼 후보였고, 사전 기준을 넘어 기본 소스에 적용했다. 후보 파일(`validate.candidate.ts`)은 적용과 함께 지웠다. 측정 당시의 파일은 커밋 `32cb659`에 있다. E1 정책(매 호출 전체 root 검증, 결과 미보관)은 그대로다.

- 보고서: [검증 이름 검사와 C1 재판정](../../docs/followup-validate-names.md)
- 계획과 판정 규칙: [측정 전 계획](../../docs/validation/followup-validate-names/plan.md)
- 동등성 테스트: `tests/unit/validate-names.test.ts` (기준 사본 `tests/fixtures/validate-baseline.ts`)
- 변이 검사: `node scripts/validate-name-mutations.mjs`
- 측정 하네스: `scripts/paired-diff-variants/`. 실험 V(B0 대 V1)를 다시 실행하려면 `32cb659`를 체크아웃해야 한다. 그 뒤의 소스에서는 기본 검증이 이미 V1이다.
