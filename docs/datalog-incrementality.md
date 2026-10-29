# Datalog incrementality (and where Lean fits)

Model-delta checking should not be a catalog of special-case JS evaluators
(`count`, local `forall`, …). New constraint patterns keep appearing, and anything
without a hand-written cache falls back to a full recheck — which is exactly the
cost we need to avoid on large models.

The workable general approach is the one already explored for WebGME as
**Differential-FORMULA**: compile constraints to **Differential Datalog (DDlog)**,
feed model edits as relation deltas, and let differential dataflow maintain
derived relations (including violations) for *any* stratified Datalog-expressible
pattern.

Lean can still be the *language* of those checkers. What DDlog mainly supplies is
the **maintenance strategy** for joins, recursion, and aggregates — not a claim
that Bool functions are impossible in Lean.

## Prior art in this line of work

[Differential-FORMULA](https://doi.org/10.1145/3486603.3486779) (Zhang,
Balasubramanian, Kecskés, Sztipanovits, DSM 2021) and the
[`qishen/differential-formula`](https://github.com/qishen/differential-formula)
implementation:

1. WebGME META + instance → FORMULA domain/model
2. FORMULA rules (constraints, queries, transformations) → DDlog via
   `formula2ddlog`
3. DDlog → Differential Dataflow; inserts/deletes on input facts update outputs
   without recomputing from scratch
4. Scope: negation, recursion, aggregation/set comprehensions that stratify;
   not FORMULA’s Z3 / partial-model synthesis path

That is the right *engine* shape for “add a node, only pay for what the rules
touch,” including patterns that have never been cached before: the program is
fixed; the *data* changes; the dataflow indexes do the rest.

## Can Lean itself be incremental?

Yes — if the encoding matches the mental model of **small Bool checkers over
facts**, not one monolithic `Model → Bool` closed under `rfl`.

### What works in Lean

Constraints compile to functions on *patterns* (nodes, edges, pairs, …):

```lean
def transitionHasSrc (t : Transition) : Bool := t.src.isSome

def uniqueNames (a b : State) : Bool :=
  a._id == b._id || a.name != b.name
```

A model edit then means: take the **delta facts** (the new Transition, the new
State, …) and run only the checkers whose patterns they can inhabit.

- Add Transition `t` → evaluate `transitionHasSrc t` only.
- Add State `s` → evaluate `uniqueNames s s'` for each existing state `s'`
  (O(|States|), not O(|States|²)).
- `count(Init) == 1` → adjust a cached Nat, compare once.

That *is* incremental, and Lean is a fine place to *define* those functions
(and to `#eval` / prove the tiny delta obligations). Inductive predicates are
likewise fine as *specifications* of the patterns.

### What today’s encoding does instead

`buildProgram` builds one giant `checkedModel`, then

```lean
theorem TransitionHasSource_holds :
  TransitionHasSource checkedModel = true := rfl
```

Kernel reduction walks the whole instance. Adding one node still re-elaborates
(or at least re-reduces over) the full term. No fact index, no “only this
input.” So the *current* pipeline is not incremental — not because Lean cannot
be, but because the obligations are whole-model.

### Where DDlog still matters

“Run one new input through a subset of functions” is enough for **local**
patterns (unary guards, pairwise-with-existing, simple counts).

Many constraints are **relational**:

| Pattern | On insert of one edge/node | Naive “call the Bool function” |
| --- | --- | --- |
| Local attribute/pointer guard | One call on the new fact | Enough |
| Pairwise uniqueness | New × existing | Enough if you write it that way |
| Reachability / recursive Path | Many new Path facts may appear | Must *saturate*: propagate through joins until fixpoint |
| `count` of a join/comprehension | Aggregate changes by more than ±1 of the seed | Needs incremental aggregation |
| `not Path(u,u)` after a delete | Derived facts must be *retracted* | Needs delete propagation |

Differential Datalog automates the last three: for a join,
`Δ(R ⋈ S) = ΔR ⋈ S ∪ R ⋈ ΔS ∪ ΔR ⋈ ΔS`, with indexes so you do not rescan
`R` and `S`. Recursion repeats that to a fixpoint. That machinery is what
“functions defined correctly” has to grow into once patterns are no longer
local — whether the functions are written in Lean, FORMULA, or DDlog syntax.

So a Lean-native incremental design is coherent:

1. Compile the dialect to Lean defs that are **fact-oriented** Bool checkers /
   relational rules (not only `Model → Bool`).
2. Keep an explicit fact store (arrays/maps of nodes, edges, derived Path, …).
3. On edit, apply a **maintenance driver** that feeds delta tuples into those
   rules (for local rules: one shot; for recursive/join rules: stratified
   fixpoint / differential updates).
4. Optionally ask the kernel to check only the new micro-obligations.

Step 3 *is* a Datalog engine. Hosting it inside Lean, beside Lean, or as DDlog
with Lean certificates are engineering choices. DDlog is the off-the-shelf
driver already proven on WebGME-sized graphs in Differential-FORMULA;
CertifyingDatalog shows Lean can still own the trust layer.

```
constraint dialect  ──compile──►  fact-oriented rules (Lean defs and/or DDlog)
model edit          ──delta───►  insert/delete facts
maintenance driver  ──update──►  derived facts + violations
Lean kernel         ──optional►  certify delta obligations / derivations
```

## Compilation sketch for this dialect

Treat the open project’s META as EDB schema; the instance as EDB facts; each
constraint as IDB rules whose emptiness (or a boolean aggregate) means “holds.”

### EDB (from META + instance)

```text
Node(id, type, name)
Attr(id, name, value)
Ptr(id, name, targetId)          // optional pointers as present facts only
SetMember(id, name, memberId)
Child(parentId, childId)
TypeOf(id, type)                 // created-as
IsA(type, ancestor)              // inheritance / mixins, compiled once from META
```

Model edits become `insert`/`delete` on these relations (WebGME commit hooks or
plugin diffs). Inheritance facts change only when META changes — same cadence as
today’s Domain.olean rebuild.

### IDB (from constraints)

Examples in the statechart dialect:

```text
// count(Init) == 1
InitNode(id) :- Node(id, t, _), IsA(t, "Init").
InitCount(n) :- n = count(id: InitNode(id)).
Violation["ExactlyOneInit"] :- InitCount(n), n != 1.

// forall t in Transition: t->src != null
Transition(id) :- Node(id, t, _), IsA(t, "Transition").
HasSrc(id) :- Ptr(id, "src", _).
Violation["TransitionHasSource"] :- Transition(id), not HasSrc(id).

// exists i in Init: true
Violation["InitialStateExists"] :- not InitNode(_).

// reachable via Transition src/dst (recursive)
Edge(a,b) :- Ptr(t,"src",a), Ptr(t,"dst",b), Transition(t).
Reach(a,b) :- Edge(a,b).
Reach(a,c) :- Reach(a,b), Edge(b,c).
Violation["AllStatesReachable"] :-
    State(s), Init(i), not Reach(i,s), i != s.   // simplified
```

Universal constraints become “find a counterexample fact”; existentials become
“absence of a witness”; counts become aggregations; reachability becomes
recursive IDB. **No per-pattern JS branch** — only the Datalog compilation of
the AST (the same idea as FORMULA → DDlog).

Unsupported for pure Datalog (same restriction as Differential-FORMULA):
open-world synthesis / SMT-style partial models. Those stay on a Lean or Z3
side path if needed.

## Roles of Lean in this architecture

| Role | What Lean does | When |
| --- | --- | --- |
| Fact-oriented checkers | `Bool` (or relational) defs over nodes/edges/pairs — the “pattern functions” | Compiled once from the dialect; reused on every delta |
| Delta obligations | `#eval` / tiny `rfl` theorems on *new* inputs only | After each model edit, for local rules |
| Optional full check | Today’s whole-`Model` `rfl` encoding | Audit, CI, small models |
| Domain.olean reuse | META + checker defs compiled once | META/constraints stable ([incremental-checking.md](./incremental-checking.md)) |
| Translation trust | Prove dialect → rules preserves meaning | Once per language version |
| Result certificates | Check derivation certificates (CertifyingDatalog-style) | When a kernel guarantee is required for a DDlog (or in-Lean) run |

The missing piece for general patterns is not “Lean vs DDlog syntax,” it is an
explicit **maintenance driver** over a fact store. DDlog is one such driver;
a Lean-hosted driver is possible if we invest in the same join/fixpoint
maintenance.

## Suggested integration with webgme-lean

Two viable hosts for the driver:

**A. DDlog worker (reuse Differential-FORMULA)**  
1. Compile constraint text + META → `.dl` (or FORMULA → `formula2ddlog`).  
2. Long-lived worker per project; Core diffs → fact insert/delete.  
3. UI reads `Violation[...]`. Lean optional for certificates / full audits.

**B. Lean-native fact store**  
1. Compile dialect → fact-oriented Lean checker defs (and Domain.olean).  
2. Keep nodes/edges/derived relations in a store the plugin updates.  
3. On edit, run the maintenance driver; only new micro-goals hit the kernel.  
4. Start with local+count rules; add stratified fixpoint for reachability when needed.

Reusing `formula2ddlog` is attractive for (A). Emitting DDlog or Lean rules
directly from the Chevrotain AST avoids FORMULA/.NET but duplicates translation
work.

## What was deliberately not kept

A JS planner that special-cases `count` / footprint reuse was prototyped and
removed. It can look good on statechart counters, but it does not generalize to
new patterns and recreates a fragment of what stratified Datalog already
provides with indexes and deltas.

Domain-module `.olean` reuse remains useful and orthogonal: it speeds the Lean
audit path when META is fixed; it does not solve model-delta checking.
