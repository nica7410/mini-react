# TaskApp 고정 앱·고정 엔진 비교

단위 ms, 각 행은 동일 세션·앱 또는 엔진·하네스의 쌍이다. +는 악화, −는 개선이다. 표본 제거·세션 합산 없음. 사전 gate 초과는 원인 조사·보충 또는 적용 범위 제한이 필요한 조건이며 자동 채택 판단이 아니다.

`totalCpuMs`는 primary와 겹치지 않는 후속 flush/Effect의 경과 시간을 표본별로 합산한 값이다. primary는 dispatch closure 진입부터이며 counter/move/delete/add의 대상 검색과 dirty의 setter 조회도 포함한다. 순수 엔진 CPU, 실제 이벤트 전달 시각부터의 지연, Paint 완료 시간이 아니다. 명시적인 40ms Effect 대기는 제외하며 render/diff/commit 등 중첩 구간을 다시 더하지 않는다.

| 비교 | S | 조건 | n | 이전 median / IQR / p95 | 이후 median / IQR / p95 | median 변화 | p95 변화 |
|---|---:|---|---:|---:|---:|---:|---:|
