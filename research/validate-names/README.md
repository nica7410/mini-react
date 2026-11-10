# 검증 이름 검사 후보 V1

`validate.candidate.ts`는 `8ae389e`의 `src/core/validate.ts`에서 이름 검사 세 곳만 바꾼 파일이다(파일 머리말 참고). E1 정책(매 호출 전체 root 검증, 결과 미보관)은 그대로다.

- 계획과 판정 규칙: [측정 전 계획](../../docs/validation/followup-validate-names/plan.md)
- 동등성 테스트: `tests/unit/validate-names.test.ts` (기준 사본 `tests/fixtures/validate-baseline.ts`)
- 변이 검사: `node scripts/validate-name-mutations.mjs --source=research/validate-names/validate.candidate.ts`
- 측정 하네스: `scripts/paired-diff-variants/`
