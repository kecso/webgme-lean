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

Lean stays in the picture as a **semantic anchor / certificate checker**, not as
the incremental runtime.

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

## Why not “make Lean incremental”?

The current Lean encoding elaborates a concrete instance and discharges
`theorem … := rfl`. That is a good **kernel check** of a closed fact. It is a
poor incremental store:

- There is no differential index over model facts.
- A new constraint shape still requires a new proof obligation over the whole
  instance (or a new ad-hoc JS shortcut).
- Elaborating tens of thousands of node `def`s dominates even when only one
  theorem is “affected.”

So the clever transformation is **not** “incrementalize Lean’s elaborator.” It is:

```
constraint dialect  ──compile──►  Datalog/DDlog program
model edit          ──delta───►  insert/delete facts
DDlog               ──maintain►  Violation / derived relations
Lean (optional)     ──certify─►  rule soundness or derivation certificates
```

This matches the certificate pattern in
[CertifyingDatalog](https://github.com/knowsys/CertifyingDatalog) (Lean checks
Datalog proof trees/DAGs against a formal semantics, rather than re-deriving
all consequences itself).

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
| Optional full check | Today’s `rfl` encoding of an instance | Audit, CI, small models |
| Domain.olean reuse | Compile META + constraint defs once | META/constraints stable ([incremental-checking.md](./incremental-checking.md)) |
| Translation trust | Prove that dialect → Datalog preserves meaning for the supported fragment | Once per language version |
| Result certificates | Check DDlog derivation certificates (CertifyingDatalog-style) for reported violations or “no violation” proofs where feasible | After incremental runs, if a kernel guarantee is required |

The **hot path** for interactive editing of large models is DDlog (or another
differential Datalog engine). Lean should not be asked to rediscover
incrementality case by case.

## Suggested integration with webgme-lean

1. **Compile** constraint text + META → `.dl` (or FORMULA, then reuse
   `formula2ddlog`) when constraints/META change — analogous to Domain.olean.
2. **Session** hold a long-lived DDlog worker keyed by project; on each model
   commit/plugin check, push fact deltas from Core.
3. **UI** read `Violation[...]` (and optional witness tuples) the way
   CheckWithLean messages work today.
4. **Lean** remain available as “Check with Lean” for closed proofs; optionally
   later accept certificates from the DDlog run.

Reusing Differential-FORMULA’s `formula2ddlog` is attractive if we emit FORMULA
(or a close subset) from the dialect. Emitting DDlog directly from the existing
Chevrotain AST is smaller operationally (no FORMULA/.NET) but duplicates
translation work already done there.

## What was deliberately not kept

A JS planner that special-cases `count` / footprint reuse was prototyped and
removed. It can look good on statechart counters, but it does not generalize to
new patterns and recreates a fragment of what stratified Datalog already
provides with indexes and deltas.

Domain-module `.olean` reuse remains useful and orthogonal: it speeds the Lean
audit path when META is fixed; it does not solve model-delta checking.
