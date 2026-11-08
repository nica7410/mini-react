"""Export session-specific TaskApp comparisons; input values remain auditable."""
import gzip
import hashlib
import json
import sys
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

directory = Path(sys.argv[1])
with gzip.open(directory / "contrasts.json.gz", "rt", encoding="utf-8") as stream:
    contrasts = json.load(stream)
metadata = json.loads((directory / "comparison-audit.json").read_text(encoding="utf-8"))
assert metadata["status"] == "passed"
comparisons = [pair["label"] for pair in metadata["pairs"]
               if pair["label"] == "E2: A0 -> A1" or pair["label"].startswith("A1: E1 ->") or pair["label"].startswith("A1: E2 ->")]
workloads = ["draft", "counter", "search", "filter", "sort", "move", "crud", "dirty", "equal", "fresh+init"]
colors = {1: "#2463a5", 2: "#c56c11", 3: "#21855b"}
artifacts = []
for comparison in comparisons:
    rows = [row for row in contrasts if row["comparison"] == comparison and row["metric"] == "totalCpuMs"
            and ((row["regime"] == "persistent" and row["scope"] == "workload") or (row["regime"] == "fresh" and row["scope"] == "lifecycle"))]
    fig, axes = plt.subplots(2, 2, figsize=(14, 9), constrained_layout=True)
    plotted = []
    for row_index, size in enumerate([1000, 10000]):
        for column, statistic in enumerate(["median", "p95"]):
            axis = axes[row_index, column]
            axis.axhline(0, color="#555555", linewidth=1)
            for session in sorted({row["session"] for row in rows}):
                values = []
                for workload in workloads:
                    matched = [row for row in rows if row["session"] == session and row["size"] == size
                               and (row["regime"] == "fresh" if workload == "fresh+init" else row["regime"] == "persistent" and row["workload"] == workload)]
                    if not matched:
                        values.append(float("nan"))
                        continue
                    assert len(matched) == 1
                    row = matched[0]
                    value = row["delta"][statistic]["percent"]
                    values.append(value if value is not None else float("nan"))
                    plotted.append({"comparison": comparison, "session": session, "size": size, "workload": workload,
                                    "statistic": statistic, "beforeKey": row["baseline"]["key"], "afterKey": row["candidate"]["key"],
                                    "before": row["baseline"][statistic], "after": row["candidate"][statistic],
                                    "deltaPercent": value, "n": row["baseline"]["n"]})
                axis.plot(range(len(workloads)), values, marker="o", markersize=4, linewidth=1.3,
                          label=f"Session {session}", color=colors.get(session))
            axis.set_title(f"{size:,} rows{' (stress)' if size == 10000 else ''} / {statistic}")
            axis.set_xticks(range(len(workloads)), workloads, rotation=40, ha="right")
            axis.set_ylabel("Change (%)  |  negative = faster")
            axis.grid(axis="y", alpha=.2)
            axis.legend(fontsize=8)
    fig.suptitle(comparison + "\nSame-session pairs; summed update windows, fresh includes initialization. No pooled sessions.", fontsize=13)
    stem = "comparison-" + comparison.lower().replace(": ", "-").replace(" -> ", "-").replace(" ", "")
    files = []
    for extension in ["png", "svg"]:
        filename = f"{stem}.{extension}"
        fig.savefig(directory / filename, dpi=160)
        if extension == "svg":
            svg = directory / filename
            svg.write_text("\n".join(line.rstrip() for line in svg.read_text(encoding="utf-8").splitlines()) + "\n", encoding="utf-8")
        files.append({"file": filename, "sha256": hashlib.sha256((directory / filename).read_bytes()).hexdigest()})
    plt.close(fig)
    artifacts.append({"comparison": comparison, "files": files, "points": plotted})
result = {"sourceSha256": hashlib.sha256((directory / "contrasts.json.gz").read_bytes()).hexdigest(),
          "scriptSha256": hashlib.sha256(Path(__file__).read_bytes()).hexdigest(), "figures": artifacts,
          "note": "All session series shown, unclipped linear axes. Missing conditions stay missing. Quantiles are recomputed from raw by audit-task-statistics.mjs; graph values are recorded individually."}
(directory / "plot-values.json").write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
print(json.dumps({"figures": len(artifacts), "points": sum(len(item["points"]) for item in artifacts)}))
