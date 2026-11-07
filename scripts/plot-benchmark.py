"""Plot session medians/IQR from a completed, audited benchmark; never pool sessions."""
import json
import sys
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

directory = Path(sys.argv[1] if len(sys.argv) > 1 else "docs/bench/m8-full")
environment = json.loads((directory / "environment.json").read_text(encoding="utf-8"))
audit = json.loads((directory / "analysis.json").read_text(encoding="utf-8"))
assert environment["status"] == "passed" and audit["rawAndSummaryAgree"]
rows = {row["key"]: row for row in json.loads((directory / "summary.json").read_text(encoding="utf-8"))}
panels = [(10, "noop"), (10, "last-to-front"), (1000, "noop"), (1000, "reverse"),
          (1000, "last-to-front"), (1000, "shuffle"), (10000, "last-to-front"), (10000, "reverse")]
plt.rcParams.update({"font.size": 10, "axes.spines.top": False, "axes.spines.right": False,
                     "svg.fonttype": "none", "figure.facecolor": "#ffffff"})
outputs = []

def save_plot(fig, name):
    svg = directory / f"{name}.svg"
    fig.savefig(svg, metadata={"Date": None})
    # Matplotlib emits trailing blanks in multiline path attributes.
    svg.write_text("\n".join(line.rstrip() for line in svg.read_text(encoding="utf-8").splitlines()) + "\n", encoding="utf-8")
    fig.savefig(directory / f"{name}.png", dpi=120)

for payload in environment.get("payloads", ("light", "stateful")):
    available = [(size, scenario) for size, scenario in panels if f"1,keyed,{size},{payload},{scenario},lis,scheduledCycleMs" in rows]
    if not available:
        continue
    figure_height = 3.1 * ((len(available) + 1) // 2) + 0.95
    fig, axes = plt.subplots((len(available) + 1) // 2, 2, figsize=(12, figure_height), squeeze=False)
    for ax, (size, scenario) in zip(axes.flat, available):
        for variant, color, shift, marker in (("greedy", "#b54b35", -0.08, "s"), ("lis", "#147c80", 0.08, "o")):
            samples = [rows[f"{s},keyed,{size},{payload},{scenario},{variant},scheduledCycleMs"]
                       for s in range(1, environment["sessions"] + 1)]
            x = [s + shift for s in range(1, environment["sessions"] + 1)]
            medians = [row["median"] for row in samples]
            errors = [[row["median"] - row["q1"] for row in samples], [row["q3"] - row["median"] for row in samples]]
            ax.errorbar(x, medians, yerr=errors, fmt=marker, color=color, capsize=4, label=variant, alpha=0.9)
            ax.scatter(x, [row["p95"] for row in samples], marker="_", color=color, alpha=0.65)
        ax.set_title(f"n={size:,} | {scenario}", loc="left", fontweight="bold")
        ax.set_xticks(range(1, environment["sessions"] + 1), [f"Session {s}" for s in range(1, environment["sessions"] + 1)])
        ax.set_ylabel("diff + commit (ms)")
        ax.set_ylim(bottom=0)
        ax.grid(axis="y", alpha=0.18)
        ax.legend(loc="lower left", frameon=False, ncol=2, fontsize=9)
    for ax in list(axes.flat)[len(available):]:
        ax.set_visible(False)
    label = "SMOKE (not performance evidence)" if environment["smoke"] else "Mini React keyed comparison"
    fig.suptitle(f"{label} | {payload} payload", fontsize=17, fontweight="bold", y=1 - 0.12 / figure_height)
    fig.text(0.5, 0.1 / figure_height, "Markers: session medians | bars: Q1-Q3 | small horizontal marks: p95. Independent y-scales.\n"
             f"Normal sizes: {environment['repetitions']['normal']['samples']} measured samples per variant/session; stress: {environment['repetitions']['stress']['samples']}. Not paint time.\n"
             "Selected views; all 11 scenarios and every condition remain in all-results.md and summary.csv.",
             ha="center", fontsize=9)
    fig.tight_layout(rect=(0, 0.7 / figure_height, 1, 1 - 0.55 / figure_height), h_pad=2)
    save_plot(fig, f"keyed-{payload}")
    outputs.append(f"keyed-{payload}")
    plt.close(fig)

for payload in environment.get("payloads", ("light", "stateful")):
    available = [(size, axis, variants) for size in (10, 1000, 10000)
                 for axis, variants in (("batching", ("sync", "microtask")), ("reuse", ("off", "on")))
                 if f"1,{axis},{size},{payload},noop,{variants[0]},scheduledCycleMs" in rows]
    if not available:
        continue
    figure_height = 3.1 * ((len(available) + 1) // 2) + 0.95
    fig, axes = plt.subplots((len(available) + 1) // 2, 2, figsize=(12, figure_height), squeeze=False)
    for ax, (size, axis, variants) in zip(axes.flat, available):
        for variant, color, shift, marker in zip(variants, ("#b54b35", "#147c80"), (-0.08, 0.08), ("s", "o")):
            samples = [rows[f"{s},{axis},{size},{payload},noop,{variant},scheduledCycleMs"]
                       for s in range(1, environment["sessions"] + 1)]
            x = [s + shift for s in range(1, environment["sessions"] + 1)]
            medians = [row["median"] for row in samples]
            errors = [[row["median"] - row["q1"] for row in samples], [row["q3"] - row["median"] for row in samples]]
            ax.errorbar(x, medians, yerr=errors, fmt=marker, color=color, capsize=4, label=variant, alpha=0.9)
            ax.scatter(x, [row["p95"] for row in samples], marker="_", color=color, alpha=0.65)
        action = "+1 three times" if axis == "batching" else "unrelated root update"
        ax.set_title(f"n={size:,} | {axis}: {action}", loc="left", fontweight="bold")
        ax.set_xticks(range(1, environment["sessions"] + 1), [f"Session {s}" for s in range(1, environment["sessions"] + 1)])
        ax.set_ylabel("enqueue to next microtask (ms)")
        ax.set_ylim(bottom=0)
        ax.grid(axis="y", alpha=0.18)
        ax.legend(loc="lower left", frameon=False, ncol=2, fontsize=9)
    for ax in list(axes.flat)[len(available):]:
        ax.set_visible(False)
    label = "SMOKE (not performance evidence)" if environment["smoke"] else "Mini React runtime comparison"
    fig.suptitle(f"{label} | {payload} payload", fontsize=17, fontweight="bold", y=1 - 0.12 / figure_height)
    fig.text(0.5, 0.1 / figure_height, "Markers: session medians | bars: Q1-Q3 | small horizontal marks: p95. Independent y-scales.\n"
             f"Normal sizes: {environment['repetitions']['normal']['samples']} measured samples per variant/session; stress: {environment['repetitions']['stress']['samples']}. Not paint time.\n"
             "One option changes per comparison. All sizes and every condition remain in all-results.md and summary.csv.",
             ha="center", fontsize=9)
    fig.tight_layout(rect=(0, 0.7 / figure_height, 1, 1 - 0.55 / figure_height), h_pad=2)
    save_plot(fig, f"runtime-{payload}")
    outputs.append(f"runtime-{payload}")
    plt.close(fig)
print(json.dumps({"matplotlib": matplotlib.__version__, "output": str(directory), "plots": outputs}))
