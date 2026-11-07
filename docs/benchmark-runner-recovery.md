# 대용량 측정 중단과 실행기 보완

최초 전체 실행 `m7-full`은 기능 commit `3190268`의 production build에서 시작했다. 한 Chromium 프로세스로 한 세션의 모든 조건을 연속 실행하던 중 첫 세션의 10,000개 stateful/mixed 마지막 표본에서 응답이 멈췄다. raw 마지막 기록은 2026-11-07 07:50:48 UTC였다. 여러 분 동안 runner/renderer CPU도 증가하지 않아 측정용 브라우저만 종료했다.

반환된 browser log에는 `Received fatal exception 0xe0000008`이 있다. Chromium은 이를 Windows 메모리 할당 실패 코드로 정의한다. 정확한 할당 지점이나 OS/브라우저 내부의 메모리 압력 원인은 확정하지 않았다. [Chromium 정의](https://chromium.googlesource.com/chromium/src/+/refs/heads/main/base/allocator/partition_allocator/src/partition_alloc/oom.h).

## 실패와 원본 보존

[중단 환경](bench/m7-full/environment.json), [실패 입력·browser log](bench/m7-full/failure-session-1.json), [완료된 raw gzip](bench/m7-full/session-1-partial.jsonl.gz), [부분 요약](bench/m7-full/interrupted-summary.json)을 보존했다. 반환된 **20,602행**은 counts 204, warm-up 3,360, timing 17,038개이며 각 행의 정답 oracle를 통과했다. 실험 전체는 **미완료**다.

실패 입력은 keyed/stateful/10,000/mixed, seed 539365639, session 1, sample 29/LIS다. 마지막 반환은 sample 28/LIS다. 이 사실은 LIS 정답 오류나 알고리즘 성능 문제를 증명하지 않는다. 이 부분 실행의 시간을 최종 성능 통계에 섞거나, 통과한 전체 실행으로 표시하지 않는다.

## 별도 자원 진단

같은 10,000개 mixed 입력을 Greedy/LIS 번갈아 20회 실행했다. 5회마다 dispose 뒤 강제 GC/CDP 확인에서 DOM **24→24**, native listener **13→13**, 관리 container 자식 **0**을 유지했다. 마지막 JS used heap은 약 1.82 MB였다. [결과](validation/benchmark-resources.json), [재현 코드](../scripts/check-benchmark-resources.mjs).

이 제한된 진단에서 DOM/listener 잔류가 관찰되지 않았다는 뜻이며 모든 브라우저 내부 할당·장시간 메모리 문제를 배제하지 않는다. 강제 GC와 CDP 메모리 조회는 timing 실험에 넣지 않는다.

## 실행기 변경

엔진·fixture·계측 구간·반복 수를 유지하고 실행기를 보완했다.

1. 각 `(크기, payload, 축, 시나리오)`마다 새 Chromium 프로세스를 시작한다. 조건 안의 두 variant는 같은 프로세스에서 seeded paired 순서로 비교한다. 매 표본의 old DOM은 새로 만들고 전체 조건을 3세션 반복한다.
2. loopback의 [launchServer/connect](https://playwright.dev/docs/api/class-browsertype#browser-type-launch-server)로 프로세스를 소유한다. 조건 종료·실패 시 [BrowserServer.kill](https://playwright.dev/docs/api/class-browserserver#browser-server-kill)로 해당 프로세스만 정리하며 PID·시작/종료·브라우저 버전을 기록한다.
3. 준비 30초, 각 counts/warm-up/timing 호출 기본 120초 제한을 둔다. 초과하면 **전체 실행을 실패 처리**한다. 느린 표본을 버리고 자동 재시도하거나 계속 집계하지 않는다. 부분 raw·실패 입력·환경을 보존한다.
4. `--axes`, `--payloads`, `--scenarios`, `--sizes`로 실패 조건을 좁혀 재실행할 수 있다. 선택 조건과 timeout을 환경에 명시한다.

조건 간 누적 브라우저 상태를 줄이는 정책이며 이전 실행과 세션 수명이 다르다. 따라서 전체 3세션을 `m8-full`로 다시 실행하고 이전 부분 실행과 합쳐 완성하지 않는다. process 준비·WebSocket 왕복·정답 oracle는 엔진 시간 구간 밖이다.

## 보완 검증

| 검증 | 결과 |
|---|---|
| 같은 10,000개 mixed 집중 smoke | 2 counts + 2 warm-up + 6 timing 행 정답 PASS; [환경](bench/m8-isolation-stress-smoke/environment.json) |
| 모든 축/시나리오/payload size 10 smoke | 52 counts + 52 warm-up + 156 timing 행 PASS; [환경](bench/m8-isolation-smoke/environment.json) |
| raw→통계 감사 | 표본 수·옵션·중복 index·초기 checksum·variant 결과·통계 재계산 일치 |
| 의도적 1ms 준비 제한 | 실패 상태·부분 raw·소유 process 정리 확인; [초기 guard](bench/m8-watchdog-check/environment.json) |
| 의도적 1ms sample 제한 | 예상한 exit 1. 실패 입력 저장·raw 보존·소유 PID 종료 확인; [최종 guard](bench/m8-watchdog-sample-check/failure-session-1.json) |
| 자원 진단 | 20회 stress 후 DOM/listener 기준 유지 |
| 그래프 | Matplotlib 3.11.2, smoke SVG/PNG를 생성해 라벨·범례·캡션 간격 확인 |

smoke는 실행기와 oracle 검증이다. 작은 표본이며 일부에 문서 도구 설치가 병행되었으므로 시간 성과로 사용하지 않는다. 의도적 timeout은 엔진 정답 테스트 실패로 계산하지 않는다.

```sh
pnpm bench:smoke --sizes=10000 --payloads=stateful --axes=keyed --scenarios=mixed --tag=my-repro
pnpm bench --tag=my-full
node scripts/analyze-benchmark.mjs docs/bench/my-full

# timing과 분리해서 실행
node scripts/check-benchmark-resources.mjs
```

그래프 도구는 앱 의존성과 분리했다. Python 3.12와 `scripts/plot-requirements.txt`를 사용하며 현재 환경은 `.validation/plot-deps`에만 설치했다. 일반 재현은 Python 가상환경에서 `pip install -r scripts/plot-requirements.txt` 후 `python scripts/plot-benchmark.py docs/bench/my-full`이다. 완료된 실험의 원본 감사를 통과한 뒤 그래프를 만든다.
