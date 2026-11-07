> 역사적 보고서: 기능 소스 3190268 / 실행 ebc8f46 / 인수 9f3f3d3. 아래의 “현재”와 “최종”은 당시 시점이다. 최신 no-op 결과는 [현행 보고서](benchmark-results.md)로 구분한다.

# B안 전체 benchmark 결과

**최종 전체 실행과 원자료 감사 PASS.** 정확성은 유지했지만 LIS의 시간 이득은 입력에 따라 달랐다. Batching과 명시적 expression 재사용은 이번 비교 패턴에서 반복 작업과 median 시간을 줄였다. 아래 결과와 한계를 함께 읽는다.

## 확인한 결과

전체 **3세션 / 312개 조건 쌍 / 624개 옵션별 조건**을 통과했다. counts **624**, warm-up **10,140**, 측정 **51,480**으로 총 **62,244행**이다. 4,368개 구간 통계를 raw에서 재계산해 모두 일치했고, 표본 누락·중복 index가 없었다. 페이지 flag는 hidden 0 / unfocused 0이었다. 현재 기능 소스 hash도 측정 시점과 일치한다.

[감사 JSON](bench/m8-full/analysis.json) · [전체 104개 비교의 세션별 표](bench/m8-full/all-results.md) · [전체 구간 CSV](bench/m8-full/summary.csv) · [작업 횟수](bench/m8-full/counts.json). 옵션별 counts는 세 세션 사이에도 모두 일치했다.

### Keyed: 이동 수 감소와 시간 결과

아래는 stateful payload의 대표 조건이다. 시간은 **diff+commit median(ms)**이며 각 칸은 **Greedy → LIS**다. 이동 열은 실제 movedRoots이며, 이 표의 plannedMoves도 각각 같은 수였다. 두 카운터를 같은 지표로 정의한 것은 아니다.

| 크기 | 입력 | 실제 이동 G→L | 세션 1 | 세션 2 | 세션 3 |
|---:|---|---:|---:|---:|---:|
| 10 | noop | 0 → 0 | 0.60 → 0.60 | 0.65 → 0.70 | 0.70 → 0.70 |
| 10 | last-to-front | 9 → 1 | 0.50 → 0.40 | 0.50 → 0.50 | 0.60 → 0.50 |
| 10 | reverse | 9 → 9 | 0.50 → 0.50 | 0.50 → 0.60 | 0.50 → 0.60 |
| 1,000 | noop | 0 → 0 | 64.70 → 63.95 | 64.60 → 64.60 | 65.35 → 66.30 |
| 1,000 | last-to-front | 999 → 1 | 56.20 → 52.90 | 57.55 → 54.10 | 57.20 → 54.75 |
| 1,000 | mixed | 896 → 841 | 59.40 → 62.15 | 61.15 → 61.35 | 62.90 → 65.00 |
| 10,000 | noop | 0 → 0 | 685.35 → 677.10 | 742.10 → 710.50 | 672.05 → 664.70 |
| 10,000 | last-to-front | 9,999 → 1 | 558.55 → 533.95 | 602.50 → 572.05 | 549.40 → 511.30 |
| 10,000 | reverse | 9,999 → 9,999 | 558.15 → 576.40 | 604.40 → 619.65 | 556.75 → 551.65 |
| 10,000 | shuffle | 9,990 → 9,803 | 648.35 → 669.90 | 670.95 → 660.80 | 618.30 → 603.85 |
| 10,000 | mixed | 8,994 → 8,829 | 715.40 → 689.40 | 738.40 → 689.40 | 619.80 → 620.10 |

- **유리한 예:** 10,000개 마지막→처음에서 실제 이동은 9,999→1이고, 세션별 median은 4.4% / 5.1% / 6.9% 낮았다. 이동 횟수 비율과 시간 비율은 크게 다르다. 이 경우에도 세션 2의 p95는 809.94→818.15ms로 높아졌으므로 모든 지연 지표가 개선됐다고 할 수 없다.
- **불리한 예:** 1,000개 mixed는 이동 896→841에도 median이 세 세션 모두 높았다. 역순은 두 전략 모두 n−1번 이동하며 시간의 방향도 세션에 따라 바뀌었다. 작은 목록에서는 동률과 분포 겹침이 많다.
- **남은 비용:** 10,000개 stateful no-op은 DOM 쓰기·이동이 0이지만 LIS의 diff+commit median이 664.70–710.50ms였다. Diff 방문은 80,001개이고, 구간별 median은 diff 301.55–318.00ms / commit 365.20–389.20ms다. 각 구간 median을 더하면 전체 median이 된다는 뜻은 아니다. 검증을 포함하는 현재 경로의 대규모 비용이 남아 있으며, 세부 hotspot은 이 계측만으로 확정하지 않는다.

따라서 이 결과는 제한 모델의 최소 이동 정확성과 일부 입력의 비용 감소를 보여 준다. 고성능 범용 UI 엔진, 모든 입력의 시간 우위, React 대비 우위를 입증하지 않는다. 0에 가까운 차이와 반올림 뒤의 동률을 과도하게 해석하지 않는다.

### Batching과 동일 expression 재사용

아래 시간은 **enqueue부터 다음 microtask까지 median(ms)**다. stateful payload이며 Batching은 sync→microtask, reuse는 off→on이다. keyed 표와 측정 경계가 다르다.

| 축 | 크기 | 세션 1 | 세션 2 | 세션 3 |
|---|---:|---:|---:|---:|
| batching | 10 | 1.00 → 0.40 | 1.10 → 0.50 | 1.40 → 0.50 |
| reuse | 10 | 0.80 → 0.50 | 0.80 → 0.40 | 0.90 → 0.50 |
| batching | 1,000 | 106.50 → 39.55 | 110.75 → 39.80 | 112.20 → 40.90 |
| reuse | 1,000 | 81.40 → 37.55 | 87.15 → 39.25 | 90.95 → 42.50 |
| batching | 10,000 | 1182.50 → 410.60 | 1206.35 → 424.25 | 1103.30 → 376.40 |
| reuse | 10,000 | 820.55 → 417.75 | 807.35 → 422.90 | 768.15 → 377.00 |

Batching은 최종 +3을 유지하며 root 실행·commit·Effect setup/cleanup을 각각 3→1회로 줄였다. 재사용은 같은 expression과 위치에서 자식 실행 1→0회, Diff 방문은 stateful 1,000개에서 8,004→4개로 줄였다. 두 옵션 모두 DOM 결과·live 입력의 정답을 유지했다. light/stateful과 네 크기를 합친 각 축의 8개 비교에서 후보 median이 세 세션 모두 낮았지만, 한 번의 순수 업데이트 패턴에 대한 결과이지 모든 앱 동작의 일반적 속도 배수는 아니다.

### 그래프

사각형/원형은 세션 median, 세로 막대는 Q1–Q3, 작은 가로선은 p95다. 패널마다 y축 범위가 다르다. 세션을 합쳐 하나의 큰 표본으로 취급하지 않는다. 그래프 밖의 조건도 전체 표와 CSV에 남겼다.

| 비교 | PNG | 편집·확대용 SVG |
|---|---|---|
| keyed / light | [PNG](bench/m8-full/keyed-light.png) | [SVG](bench/m8-full/keyed-light.svg) |
| keyed / stateful | [PNG](bench/m8-full/keyed-stateful.png) | [SVG](bench/m8-full/keyed-stateful.svg) |
| runtime / light | [PNG](bench/m8-full/runtime-light.png) | [SVG](bench/m8-full/runtime-light.svg) |
| runtime / stateful | [PNG](bench/m8-full/runtime-stateful.png) | [SVG](bench/m8-full/runtime-stateful.svg) |

## 측정 환경과 원본

- 실행: **2026-11-07 17:15:58–20:10:14 KST**, 준비·검증을 포함한 전체 경과 약 174.27분.
- Windows 10 Pro 10.0.19045 x64, Intel Core i7-10875H, 논리 CPU 16개, OS 보고 RAM 15.79 GiB.
- Node 24.22.1, Chromium 151.0.7922.34, headless, viewport 1280×900, Vite production preview.
- 측정 commit `ebc8f461d2b2ca1c971502be687552185beda1b5`, 시작 working tree clean, branch `phase1`. 기능 소스는 `3190268`과 동일하며 raw 환경에 source SHA-256을 보존했다.
- 전원 scheme은 환경 JSON에 GUID를 기록했다. 출력된 한국어 이름은 인코딩 손상으로 신뢰하지 않는다. 실행 중 전원 정책을 바꾸지 않았다.

[전체 환경](bench/m8-full/environment.json) · [세션 1 메타데이터](bench/m8-full/session-1.json) · [세션 2](bench/m8-full/session-2.json) · [세션 3](bench/m8-full/session-3.json). 각 세션은 104개 소유 Chromium 프로세스를 사용했고 모두 passed로 종료했다.

원본 gzip JSONL: [세션 1](bench/m8-full/session-1.jsonl.gz) · [세션 2](bench/m8-full/session-2.jsonl.gz) · [세션 3](bench/m8-full/session-3.jsonl.gz). 실패한 이전 실행은 별도로 보존했으며 이 통계에 합치지 않았다.

## 재현과 다시 읽기

```sh
pnpm install --frozen-lockfile
pnpm exec playwright install chromium
pnpm build
pnpm bench --tag=my-full-run
node scripts/analyze-benchmark.mjs docs/bench/my-full-run
python -m pip install -r scripts/plot-requirements.txt
python scripts/plot-benchmark.py docs/bench/my-full-run
```

Windows에서 pnpm이 PATH에 없다면 [README](../README.md)의 `scripts/pnpm.ps1`을 사용한다. 그래프 의존성은 Python 가상환경에 설치한다. 이번 그래프는 Python 3.12.14 / Matplotlib 3.11.2로 만들었고 앱 의존성과 분리했다. 보관된 결과의 분석·그래프만 다시 만들 때는 벤치마크를 다시 실행할 필요 없이 보관 폴더에 분석·그래프 명령만 적용한다. 기존 결과 폴더를 덮어쓰지 않도록 새 tag를 사용한다.

다른 시점·기기에서 같은 숫자까지 재현됨을 보장하지 않는다. 우선 원본의 조건/표본 수/정답을 확인하고, 같은 환경·입력의 세션별 분포를 비교한다.

## 무엇을 비교했는가

| 축 | 기준 → 비교 옵션 | 고정한 조건 | 수행한 작업 |
|---|---|---|---|
| keyed | Greedy → LIS | 공통 key/type 매칭과 Patch executor | 11개 목록 변경 시나리오 |
| Batching | sync → microtask | LIS, expression 재사용 on | 순수한 `+1` 요청 3개, 최종값 `3` |
| expression 재사용 | off → on | LIS, microtask | 같은 Memo expression을 유지한 채 무관한 루트 상태 1회 갱신 |

두 runtime 축의 입력에는 State를 다시 바꾸는 Effect를 섞지 않았다. Effect는 상태 변경에 따른 cleanup/setup만 실행한다. Batching의 중간 render·commit·Effect 횟수 차이는 의도한 동작이다. 자동 shallow memo, Adaptive 임계값, 가상 스크롤, React와의 속도 비교는 실험하지 않았다.

크기는 **10 / 100 / 1,000 / 10,000개**, payload는 다음 두 가지다. fixture 생성, DOM 준비와 정답 검사는 시간 구간 밖에서 수행한다.

- `light`: 항목마다 `li > span > text`.
- `stateful`: 위 구조에 `div`와 uncontrolled 텍스트 input·checkbox·`strong > text`를 추가한다. 갱신 전 input을 `typed:row-ID`, checkbox를 checked로 바꾸어 사용자 입력 상태를 만든다. 신규 항목의 기본값과 유지한 항목의 live 값을 구별해 검사한다.

keyed 입력은 no-op, 단일 내용 변경, 맨 앞 삽입, 중간 삭제, 마지막→처음, 처음→마지막, 역순, 인접 교환, 양 끝 교환, seeded shuffle, mixed다. mixed는 기존 항목의 10%를 삭제하고 같은 수의 새 항목을 넣은 뒤 섞는다. seed는 **539365639**다. [실제 fixture](../src/bench/fixtures.ts)와 [계측·정답 검사](../src/bench/harness.ts)를 재현의 기준으로 삼는다.

## 반복·격리·정답 검사

일반 크기는 조건/옵션/세션마다 **warm-up 20 + 측정 100**, 10,000개 stress는 **warm-up 5 + 측정 30**이다. 각 옵션에는 별도의 counts 실행 1회가 있다. 전체 조건을 순차 3세션 반복하고 세션별 통계를 보존한다.

각 `(크기, payload, 축, 시나리오)`마다 새 Chromium 프로세스를 사용한다. 두 옵션의 실행 순서는 고정 seed로 paired 무작위화한다. 매 옵션·표본마다 이전 mount를 해제하고 같은 old DOM을 새로 만든다. 프로세스 준비와 Playwright 왕복은 엔진 시간에 포함하지 않는다. Inspector는 측정 페이지에 없고, 상세 Trace는 counts 실행에만 켠다. 기본 host counter 증가는 두 옵션에 공통이다.

매 실행 뒤 전체 항목 수·순서·속성·텍스트, 기존 Node 객체 identity, 새 노드의 구별, 삭제된 노드의 부재, 입력 value·checked를 검사한다. runtime 축은 최종 숫자도 검사한다. raw의 checksum은 이 검사 결과를 요약하며 전체 정답 검사의 대체물이 아니다.

assertion 또는 호출 제한 초과는 전체 실행을 중단하고 실패 입력과 부분 원본을 남긴다. 느린 표본 자동 재시도·이상치 제거·결과에 따른 시나리오 제외는 하지 않는다. 각 표본의 visibility/focus flag도 보존한다. headless 페이지의 flag는 실제 사용자 화면의 foreground 상태나 OS 유휴 상태를 보증하지 않는다.

## 시간은 어디까지인가

| 지표 | 포함 범위 | 읽을 때 주의할 점 |
|---|---|---|
| captureMs | keyed 축의 seeded old DOM 캡처 | 별도 구간이며 flush에 더해진 값이 아님 |
| renderMs | runtime 루트와 자식 표현 평가 | keyed 축의 대상 표현 준비는 측정 밖 |
| diffMs | VDOM 비교·검증·Patch 계획 | DOM 쓰기 전까지 |
| commitMs | 계획 preflight와 host 쓰기 | 이후 layout/paint 완료 시간 아님 |
| flushMs | runtime FIFO 처리부터 commit 종료 | Effect 제외; sync 축은 여러 flush의 합 |
| effectMs | cleanup/setup loop | 앱의 임의 외부 비동기 작업 시간 아님 |
| scheduledCycleMs | keyed: diff+commit; runtime: enqueue부터 다음 microtask까지 | 두 축의 범위가 다르며 paint·전체 입력 지연이 아님 |

해당 축에서 수행하지 않는 구간은 0으로 저장한다. 서로 겹치는 구간을 모두 더해 총시간을 만들지 않는다. 긴 전체 실행 시간에는 수만 번의 fresh DOM 준비·정답 검사·프로세스 기동이 포함되므로, 이를 사용자 동작 한 번의 지연으로 해석하지 않는다.

실제 앱 작업의 layout/paint 등은 [별도 Performance trace](performance/chromium-workflow.json)에서 확인한다. 이 trace는 Greedy/LIS 속도 비교 자료가 아니며, 중첩된 trace category 시간도 단순 합산하지 않는다.

## 원본·통계·그래프 인수

완료된 gzip JSONL의 조건·옵션·seed·표본 수·index 중복·동일 초기 상태를 검사했고, counts와 median/Q1/Q3/IQR/p95/min/max를 원본에서 재계산해 일치를 확인했다. [분석 코드](../scripts/analyze-benchmark.mjs)와 [그래프 코드](../scripts/plot-benchmark.py)를 사용한다.

그래프는 세션별 median, Q1–Q3, p95를 보여 준다. 정해 둔 대표 조건을 그리되 전체 크기·시나리오의 결과는 별도 표와 CSV에 모두 남긴다. 작은 값의 동률·측정 해상도·세션 간 변동을 함께 읽고, median 방향만으로 통계적 유의성이나 모든 환경의 우위를 주장하지 않는다.

## 중단 기록과 범위

최초 `m7-full`은 Windows Chromium의 할당 실패로 중단했다. [실패 원본·제한된 자원 진단·실행기 보완](benchmark-runner-recovery.md)을 보존했다. 현재 `m8-full`은 변경한 프로세스 수명 정책으로 전체 조건을 다시 실행한 자료이며, 이전 부분 표본을 합쳐 완성하지 않는다. 정확한 메모리 압력 원인을 확정한 것은 아니다.

측정 중 엔진과 production build는 고정했다. 문서 작성과 가벼운 파일 확인은 공존했고 OS의 다른 작업·전원·열 상태를 완전히 통제하지 않았다. 이 결과의 해석 범위는 기록된 Windows/Chromium 환경, fixture와 옵션에 한정한다. 이동 횟수 감소를 같은 비율의 브라우저 전체 속도 향상으로 바꾸어 표현하지 않는다.
