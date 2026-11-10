# 속성 맵 표현 후보 R1

엔진이 만드는 속성 맵(`attrs`)을 null prototype은 유지하면서 V8의 fast 속성 방식으로 만들게 하는 후보다. 완성된 맵의 관찰 가능한 모습은 현재와 같다.

- `attrMap.ts`: `createAttrMap()` / `finishAttrMap()`
- `resolve.candidate.ts`, `capture.candidate.ts`: `src/runtime/resolve.ts`, `src/core/capture.ts`에서 맵을 만드는 한 줄만 바꾼 사본
- 계획과 판정 규칙: [측정 전 계획](../../docs/validation/followup-attr-maps/plan.md)
- 테스트: `tests/unit/attr-maps.test.ts`, 변이: `node scripts/attr-map-mutations.mjs --stage=candidate`
- 측정 하네스: `scripts/attr-map-paired/`, 페이지 코드 `src/bench/attr-map-arm.ts`
