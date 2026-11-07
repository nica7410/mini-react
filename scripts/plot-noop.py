"""Standalone figures for the audited, unprofiled three-session no-op comparison."""
import json
import pathlib
import sys
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.lines import Line2D

directory = pathlib.Path(sys.argv[1])
environment = json.loads((directory / 'environment.json').read_text(encoding='utf-8'))
audit = json.loads((directory / 'analysis.json').read_text(encoding='utf-8'))
assert environment['status'] == audit['status'] == 'passed'
assert environment['sessions'] == 3 and not environment['profiled'] and not environment['smoke']
summary = {row['key']: row for row in json.loads((directory / 'summary.json').read_text(encoding='utf-8'))}
combined = {row['key']: row for row in json.loads((directory / 'creation-and-cycle.json').read_text(encoding='utf-8'))['distributions']}
tags = [item['tag'] for item in environment['builds']]
sizes = [10, 100, 1000, 10000]
colors = ['#1769aa', '#d65f13']
markers = ['o', 's', '^']
titles = {'same-ref': 'Same VDOM reference', 'equal-fresh': 'Fresh equal VDOM', 'memo-unrelated': 'Memo + unrelated root State',
          'dirty-controlled': 'Same State + dirty controlled', 'reorder': 'Last row to front', 'form-update': 'Controlled form update'}
plt.rcParams.update({'font.family': 'DejaVu Sans', 'font.size': 10, 'axes.titlesize': 12, 'axes.spines.top': False, 'axes.spines.right': False})

def panel(ax, path, payload, with_creation=False):
    for index, size in enumerate(sizes):
        for session in [1, 2, 3]:
            for variant, tag in enumerate(tags):
                key = f'{session},{path},{size},{payload},{tag}'
                row = combined[key] if with_creation else summary[key + ',scheduledCycleMs']
                x = index + (variant - .5) * .25 + (session - 2) * .065
                ax.vlines(x, row['q1'], row['q3'], color=colors[variant], lw=3, alpha=.7)
                ax.plot(x, row['median'], marker=markers[session - 1], color=colors[variant], ms=4, linestyle='none')
                ax.plot(x, row['p95'], marker='_', color=colors[variant], ms=6, linestyle='none')
    ax.set_title(titles[path] + (f' / {payload}' if with_creation else ''))
    ax.set_xticks(range(4), ['10', '100', '1,000', '10,000'])
    ax.set_xlabel('Rows')
    ax.set_yscale('symlog', linthresh=1)
    ax.set_ylim(bottom=0)
    ax.grid(axis='y', alpha=.2)
    ax.set_ylabel('ms (linear below 1; log above)')

def save(fig, name, title, subtitle):
    fig.suptitle(title, fontsize=17, y=.99)
    fig.text(.5, .945, subtitle, ha='center', fontsize=10)
    handles = [Line2D([], [], color=colors[i], lw=3, label=label) for i, label in enumerate(['Before / 7757e3c', 'After / c4a2fe1'])]
    handles += [Line2D([], [], marker=marker, color='#444', linestyle='none', label=f'Session {i + 1} median') for i, marker in enumerate(markers)]
    handles += [Line2D([], [], marker='_', color='#444', linestyle='none', label='p95; vertical bar = IQR')]
    fig.legend(handles=handles, loc='lower center', ncol=3, frameon=False, bbox_to_anchor=(.5, .002))
    fig.tight_layout(rect=(0, .075, 1, .925), h_pad=2)
    fig.savefig(directory / (name + '.png'), dpi=160)
    svg = directory / (name + '.svg')
    fig.savefig(svg)
    svg.write_text('\n'.join(line.rstrip() for line in svg.read_text(encoding='utf-8').splitlines()) + '\n', encoding='utf-8')
    plt.close(fig)

for payload in ['light', 'stateful']:
    fig, axes = plt.subplots(2, 3, figsize=(14, 8))
    for ax, path in zip(axes.flat, environment['paths']):
        panel(ax, path, payload)
    save(fig, 'cycles-' + payload, 'No-op follow-up: ' + payload,
         'Core: diff + commit. Runtime: enqueue to next microtask. No paint. Each session: n=100; 10,000 rows: n=30.')

fig, axes = plt.subplots(2, 2, figsize=(12, 8))
for ax, (payload, path) in zip(axes.flat, [(payload, path) for payload in ['light', 'stateful'] for path in ['equal-fresh', 'reorder']]):
    panel(ax, path, payload, True)
save(fig, 'creation-and-cycle', 'Fresh-tree tradeoff: creation + diff + commit',
     'Disjoint intervals summed per raw sample, then quantiles. Excludes initial mount, reset, oracle and paint.')
print('Wrote three PNG/SVG figure pairs.')
