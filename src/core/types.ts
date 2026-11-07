export type Key = string;
export type NodeRef = string;
export type PureComponent<P = any> = (props: Readonly<P>) => RenderValue;

export interface Identity {
  readonly key: Key | null;
  readonly renderedRootKey: Key | null;
  readonly boundaries: readonly { readonly type: PureComponent; readonly key: Key | null }[];
}
export interface StyleValue { readonly value: string; readonly priority: '' | 'important' }
export type StyleMap = Readonly<Record<string, StyleValue>>;
export interface EventBinding {
  readonly handler: (event: Event) => void;
  readonly capture: boolean;
}
export interface FormPolicy {
  readonly mode: 'snapshot' | 'controlled' | 'uncontrolled';
  readonly value?: string;
  readonly checked?: boolean;
  readonly selectedIndices?: readonly number[];
  readonly defaultValue?: string;
  readonly defaultChecked?: boolean;
}
export interface VText { readonly kind: 'text'; readonly identity: Identity; readonly text: string }
export interface VComment {
  readonly kind: 'comment'; readonly identity: Identity;
  readonly text: string; readonly placeholder: boolean;
}
export interface VElement {
  readonly kind: 'element';
  readonly identity: Identity;
  readonly tag: string;
  readonly attrs: Readonly<Record<string, string>>;
  readonly style: StyleMap;
  readonly events: Readonly<Record<string, EventBinding>>;
  readonly form: FormPolicy | null;
  readonly children: readonly VNode[];
}
export type VNode = VElement | VText | VComment;
export interface VRoot { readonly kind: 'root'; readonly children: readonly VNode[] }

export interface ElementInputProps {
  readonly key?: string | number;
  readonly attrs?: Readonly<Record<string, string | number | boolean | null | undefined>>;
  readonly style?: Readonly<Record<string, string | StyleValue>>;
  readonly events?: Readonly<Record<string, ((event: Event) => void) | EventBinding>>;
  readonly form?: FormPolicy;
}
export interface ElementExpr {
  readonly kind: 'element-expr'; readonly tag: string;
  readonly props: ElementInputProps; readonly children: readonly RenderValue[];
}
export interface ComponentExpr<P = any> {
  readonly kind: 'component-expr'; readonly type: PureComponent<P>;
  readonly key: Key | null; readonly props: Readonly<P>;
}
export type RenderValue = ElementExpr | ComponentExpr | string | number | null | undefined | boolean | readonly RenderValue[];

export interface Diagnostic { readonly code: string; readonly message: string; readonly path?: string }
export type Result<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly diagnostics: readonly Diagnostic[] };
export interface ViewNode { readonly ref: NodeRef; readonly vnode: VNode; readonly children: readonly ViewNode[] }
export interface MountView {
  readonly mountId: string; readonly revision: number; readonly rootRef: NodeRef;
  readonly snapshot: VRoot; readonly children: readonly ViewNode[];
}
export interface MountHandle {
  readonly id: string; readonly container: HTMLElement;
  revision: number; view: MountView;
  readonly nodes: Map<NodeRef, Node>; readonly refs: WeakMap<Node, NodeRef>;
  nextCaptureRef: number; disposed: boolean; faulted: boolean;
  readonly dirtyForms: Map<NodeRef, number>;
  inputSequence: number;
  inputFlushScheduled: boolean;
  inputFallbackTimer?: ReturnType<typeof setTimeout>;
  disposeHostObservers?: () => void;
  onHostInput?: () => void;
  readonly trace?: TraceSink;
}
export interface CaptureResult {
  readonly snapshot: VRoot; readonly view: MountView;
  readonly bindings: ReadonlyMap<NodeRef, Node>;
  readonly visitedNodes: number; readonly createdVNodes: number;
}
export type PatchOp =
  | { readonly kind: 'CREATE_SUBTREE'; readonly tree: ViewNode }
  | { readonly kind: 'REMOVE_SUBTREE'; readonly node: NodeRef; readonly parent: NodeRef }
  | { readonly kind: 'SET_TEXT' | 'SET_COMMENT'; readonly node: NodeRef; readonly value: string }
  | { readonly kind: 'SET_ATTR'; readonly node: NodeRef; readonly name: string; readonly value: string }
  | { readonly kind: 'REMOVE_ATTR' | 'REMOVE_STYLE'; readonly node: NodeRef; readonly name: string }
  | { readonly kind: 'SET_STYLE'; readonly node: NodeRef; readonly name: string; readonly value: StyleValue }
  | { readonly kind: 'SET_EVENT'; readonly node: NodeRef; readonly name: string; readonly binding: EventBinding | null }
  | { readonly kind: 'PLACE_BEFORE'; readonly placement: 'insert' | 'move'; readonly node: NodeRef; readonly parent: NodeRef; readonly anchor: NodeRef | null }
  | { readonly kind: 'SYNC_FORM'; readonly node: NodeRef; readonly policy: FormPolicy };
export interface PatchPlan {
  readonly id: string; readonly mountId: string; readonly baseRevision: number;
  readonly target: VRoot; readonly nextView: MountView; readonly operations: readonly PatchOp[];
  readonly reconciliations: readonly ReconcileDecision[];
}
export type ReconcileStrategy = 'positional' | 'greedy' | 'lis';
export interface ReconcileDecision {
  readonly parent: NodeRef;
  readonly strategy: ReconcileStrategy;
  readonly reason: 'keyed' | 'positional-requested' | 'missing-key' | 'mixed-node-kinds';
  readonly usedLIS: boolean;
  readonly reused: number;
  readonly inserts: number;
  readonly removes: number;
  readonly moves: number;
}
export interface DiffOptions {
  readonly planId?: string;
  readonly strategy?: ReconcileStrategy;
  readonly dirtyFormRefs?: ReadonlySet<NodeRef>;
}
export interface CommitCounters {
  createdNodes: number; removedNodes: number; insertedRoots: number; movedRoots: number;
  textWrites: number; attributeWrites: number; styleWrites: number; propertyWrites: number;
  listenerAdds: number; listenerRemoves: number; skippedHostCalls: number;
}
export type CommitResult =
  | { readonly status: 'committed' | 'noop'; readonly revision: number; readonly counters: CommitCounters }
  | { readonly status: 'rejected'; readonly diagnostics: readonly Diagnostic[] }
  | { readonly status: 'faulted'; readonly error: unknown };
export interface TraceEvent {
  readonly causeIds: readonly string[]; readonly mountId: string; readonly commitId?: number;
  readonly phase: 'event' | 'enqueue' | 'render' | 'component' | 'memo' | 'diff' | 'patch' | 'effect-cleanup' | 'effect-setup' | 'error';
  readonly nodeRef?: NodeRef; readonly hookIndex?: number;
  readonly detail: Readonly<Record<string, unknown>>;
}
export interface TraceSink { emit(event: TraceEvent): void }
export type StateAction<T> = T | ((previous: T) => T);
export type StateSetter<T> = (action: StateAction<T>) => void;
export type Deps = readonly unknown[] | undefined;
export type EffectSetup = () => void | (() => void);
export type HookSlot =
  | { readonly kind: 'state'; readonly value: any; readonly setter: StateSetter<any> }
  | { readonly kind: 'memo'; readonly deps: Deps; readonly value: unknown }
  | { readonly kind: 'effect'; readonly deps: Deps; readonly setup: EffectSetup; cleanup: (() => void) | undefined };
export interface StateUpdate { readonly sequence: number; readonly slot: number; readonly action: StateAction<unknown>; readonly causeId: string }
