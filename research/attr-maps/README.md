# 속성 맵 표현 R1 (채택됨)

엔진이 만드는 속성 맵(`attrs`)을 null prototype은 유지하면서 V8의 fast 속성 방식으로 만든다. 사전 기준을 넘어 기본 소스에 적용했다(`src/core/attrMap.ts`, `resolve.ts`, `capture.ts`). 후보 사본은 적용과 함께 지웠고, 측정 당시의 파일은 커밋 `d48332e`에 있다.

- 보고서: [속성 맵 표현 R1 채택](../../docs/followup-attr-maps.md)
- 계획과 판정 규칙: [측정 전 계획](../../docs/validation/followup-attr-maps/plan.md)
- 테스트: `tests/unit/attr-maps.test.ts`, 변이: `node scripts/attr-map-mutations.mjs`
- 측정 하네스: `scripts/attr-map-paired/`, 페이지 코드 `src/bench/attr-map-arm.ts`. 다시 측정하려면 `d48332e`를 체크아웃해야 한다. 그 뒤의 소스에서는 기본 엔진이 이미 R1이다.
