# Regenerates the diagnostic instrumentation on top of exact E9 (a1b070f) engine files.
# Run inside a scratch copy of src/ (see docs/followup-dirty-restore.md); output is diag-instrumentation.patch.
import sys

def edit(path, pairs, tail=''):
    s = open(path, encoding='utf-8', newline='').read()
    for a, b in pairs:
        assert s.count(a) == 1, (path, a[:60])
        s = s.replace(a, b)
    open(path, 'w', encoding='utf-8', newline='').write(s + tail)

edit('src/core/planValidation.ts', [
    ("import { validateTree } from './validate';\n",
     "import { validateTree } from './validate';\nimport { diagCount, diagNow, diagRegister, diagTime } from './diagProbe';\n"),
    ("export function validatePlan(mount: MountHandle, plan: PatchPlan): Result<PatchPlan> {\n  if (mount.disposed",
     "export function validatePlan(mount: MountHandle, plan: PatchPlan): Result<PatchPlan> {\n  let at = diagNow(); diagCount('vp.calls');\n  if (mount.disposed"),
    ("  const valid = validateTree(plan.target);\n  if (!valid.ok) return valid;\n  try {\n",
     "  const valid = validateTree(plan.target);\n  if (!valid.ok) return valid;\n  at = diagTime('vp.preambleValidateTree', at);\n  try {\n"),
    ("!equalData(plan.nextView.snapshot, plan.target)) throw new Error('nextView의 mount/revision/target이 일치하지 않습니다.');\n",
     "!equalData(plan.nextView.snapshot, plan.target)) throw new Error('nextView의 mount/revision/target이 일치하지 않습니다.');\n    at = diagTime('vp.nextView', at);\n"),
    ("    loadChildren(rootRef, mount.view.children, false);\n",
     "    loadChildren(rootRef, mount.view.children, false);\n    diagCount('vp.graphEntries', graph.size); diagCount('vp.originalEntries', original.size);\n    at = diagTime('vp.graphBuild', at);\n    let domChildVisits = 0;\n"),
    ("      for (const domChild of node.childNodes) {\n        if (child === null",
     "      for (const domChild of node.childNodes) {\n        domChildVisits++;\n        if (child === null"),
    ("    if (graph.size !== mount.nodes.size) throw new Error(",
     "    diagCount('vp.domChildVisits', domChildVisits);\n    if (graph.size !== mount.nodes.size) throw new Error("),
    ("    function unlink(ref: string): void {\n",
     "    at = diagTime('vp.domCheck', at);\n    function unlink(ref: string): void {\n"),
    ("    const visited = new Set<string>([rootRef]);\n",
     "    at = diagTime('vp.simulateOps', at);\n    const visited = new Set<string>([rootRef]);\n"),
    ("    if (visited.size !== graph.size) throw new Error(",
     "    diagCount('vp.visitedEntries', visited.size);\n    if (visited.size !== graph.size) throw new Error("),
    ("    return ok(plan);\n  } catch",
     "    diagTime('vp.compareNextView', at);\n    return ok(plan);\n  } catch"),
], "diagRegister('validatePlan', validatePlan);\n")

edit('src/core/reconcile.ts', [
    ("import { keyedEligibility, planKeyedChildren } from './keyed';\n",
     "import { keyedEligibility, planKeyedChildren } from './keyed';\nimport { diagCount, diagNow, diagRegister, diagTime } from './diagProbe';\n"),
    ("  const validBase = validateTree(base.snapshot);\n  if (!validBase.ok) return validBase;\n  const valid = validateTree(target);\n  if (!valid.ok) return valid;\n",
     "  let at = diagNow(); diagCount('diff.calls');\n  const validBase = validateTree(base.snapshot);\n  if (!validBase.ok) return validBase;\n  at = diagTime('diff.validateBase', at);\n  const valid = validateTree(target);\n  if (!valid.ok) return valid;\n  at = diagTime('diff.validateTarget', at);\n"),
    ("  let visitedNodes = 0, reusedSubtrees = 0;\n", "  let visitedNodes = 0, reusedSubtrees = 0, syncDirtyNodes = 0;\n"),
    ("          const syncDirty = (node: ViewNode) => {\n", "          const syncDirty = (node: ViewNode) => {\n            syncDirtyNodes++;\n"),
    ("    const children = reconcileChildren(base.children, target.children, base.rootRef);\n",
     "    const children = reconcileChildren(base.children, target.children, base.rootRef);\n    at = diagTime('diff.reconcileAndDirtyWalk', at);\n    diagCount('diff.visitedNodes', visitedNodes); diagCount('diff.syncDirtyNodes', syncDirtyNodes);\n"),
    ("    return ok({\n      id, mountId",
     "    const result = ok({\n      id, mountId"),
    ("      operations, reconciliations, visitedNodes, reusedSubtrees,\n    });\n",
     "      operations, reconciliations, visitedNodes, reusedSubtrees,\n    });\n    diagCount('diff.operations', operations.length); diagTime('diff.finish', at);\n    return result;\n"),
], "diagRegister('diff', diff);\ndiagRegister('validateTree', validateTree);\n")

edit('src/core/patch.ts', [
    ("import { compositionConflict, isComposing, restoreSelection, saveSelection } from './host/browserState';\n",
     "import { compositionConflict, isComposing, restoreSelection, saveSelection } from './host/browserState';\nimport { diagCount, diagNow, diagRegister, diagTime } from './diagProbe';\n"),
    ("export function commit(mount: MountHandle, plan: PatchPlan): CommitResult {\n  const valid = validatePlan(mount, plan);\n  if (!valid.ok) return { status: 'rejected', diagnostics: valid.diagnostics };\n  const conflicts = compositionConflict(mount, plan);\n",
     "export function commit(mount: MountHandle, plan: PatchPlan): CommitResult {\n  diagRegister('lastMount', mount);\n  let at = diagNow(); diagCount('commit.calls');\n  const valid = validatePlan(mount, plan);\n  if (!valid.ok) return { status: 'rejected', diagnostics: valid.diagnostics };\n  at = diagTime('commit.validatePlan', at);\n  const conflicts = compositionConflict(mount, plan);\n  at = diagTime('commit.composition', at);\n"),
    ("  const selection = saveSelection(mount);\n", "  const selection = saveSelection(mount);\n  at = diagTime('commit.saveSelection', at);\n"),
    ("    for (const { element, tree } of initialForms)", "    at = diagTime('commit.hostOps', at);\n    for (const { element, tree } of initialForms)"),
    ("    restoreSelection(mount, selection);\n",
     "    at = diagTime('commit.syncForm', at);\n    restoreSelection(mount, selection);\n    at = diagTime('commit.restoreSelection', at);\n"),
    ("    return { status, revision: mount.revision, counters };\n  } catch",
     "    diagCount('commit.propertyWrites', counters.propertyWrites); diagTime('commit.finish', at);\n    return { status, revision: mount.revision, counters };\n  } catch"),
])
print('ok')
