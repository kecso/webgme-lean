# Model-delta incrementality (without dumbing Lean down)

Two goals collide if we are not careful:

1. **Interactive incrementality** on large, frequently edited models.
2. **Lean as a real prover** — typed structures, coercion, whole-model theorems —
   not a Bool evaluator over flat tuples.

Flattening the Lean encoding into “facts + pattern Bool functions” gets (1) only by
turning Lean into a poor FORMULA/Datalog. That is not desirable: you lose what Lean
is for, and you push into the *translator* the hard part (which tuples exist, which
patterns a new node can inhabit). That logic belongs in an engine with indexes, not
in `leanCheck.buildProgram`.

## What we are not doing

| Approach | Why not |
| --- | --- |
| Case-by-case JS caches (`count`, footprint heuristics) | New patterns have no cache; incomplete by construction |
| Fact-oriented Lean (EDB tuples, `Node → Bool`, generate all pairs) | Recreates FORMULA inside Lean; translator must enumerate/join footprints; slower and more complex generation |
| Asking Lean’s elaborator alone to “only check what changed” while still emitting one giant `checkedModel` | Kernel still sees a whole-model term; no free differential indexes |

## What Lean should stay

Keep the current style of encoding (and Domain.olean reuse):

- META → structures, `Coe`, containment, meta rules
- Constraints → functions on the *typed model* (or clear structured views)
- Instance check → closed obligations (`… = true := rfl`) when you want a kernel proof

That path is for **audits, CI, and formal guarantees**. Domain compilation reuse
([incremental-checking.md](./incremental-checking.md)) still helps when META is
stable. It does not claim edit-time delta performance on tens of thousands of
objects.

## Where general incrementality lives

The Differential-FORMULA line already solved “arbitrary stratified rules + model
deltas” without a per-pattern hand cache:

[Differential-FORMULA](https://doi.org/10.1145/3486603.3486779) /
[`qishen/differential-formula`](https://github.com/qishen/differential-formula)

1. Constraints compile **once** to DDlog (or FORMULA → `formula2ddlog`).
2. The model is a set of input relations; an edit is `insert`/`delete`.
3. Differential dataflow maintains derived relations and violations.
4. **The engine** decides what a new fact touches (joins, recursion, aggregates).
   The WebGME translator only emits rule text and fact deltas — it does not
   generate “all candidate tuples” or implement footprint analysis.

That is the important split: **translator stays simple; indexes live in the
runtime.**

```
                    ┌─────────────────────────────────────┐
  META+constraints  │  compile once                       │
  ─────────────────►│  DDlog/FORMULA program              │
                    └─────────────────────────────────────┘
                                      │
  model edit (Core diff)              │ insert/delete facts
  ────────────────────────────────────┤
                                      ▼
                    ┌─────────────────────────────────────┐
                    │  differential maintenance            │
                    │  → Violation / witnesses             │
                    └─────────────────────────────────────┘

  separate, optional:
  META+constraints+instance ──► Lean whole-model proof (Domain.olean + Check)
```

Lean is not required to become the incremental store. If trust in a DDlog result
is needed later, use certificates (e.g. CertifyingDatalog) or a periodic full
Lean audit — without changing Lean’s encoding style.

## Compilation sketch (DDlog side only)

EDB from META + instance (facts, not Lean structures):

```text
Node(id, type, name)
Attr(id, name, value)
Ptr(id, name, targetId)
SetMember(id, name, memberId)
Child(parentId, childId)
IsA(type, ancestor)
```

IDB from the dialect AST (same idea as FORMULA rules):

```text
Violation["TransitionHasSource"] :- Transition(id), not Ptr(id, "src", _).
Violation["ExactlyOneInit"] :- InitCount(n), n != 1.
Reach(a,b) :- Edge(a,b).
Reach(a,c) :- Reach(a,b), Edge(b,c).
```

Universal constraints → “exists a violating fact”; counts → aggregates;
reachability → recursive IDB. New constraint shapes are new rules, not new
translator special cases.

Same limits as Differential-FORMULA: stratified Datalog, not Z3/partial-model
synthesis.

## Suggested product split for webgme-lean

| Mode | Mechanism | User intent |
| --- | --- | --- |
| **Check with Lean** | Typed whole-model encoding + Domain.olean | Formal check / proof artifact |
| **Incremental check** (future) | Long-lived DDlog worker, Core deltas → facts | Edit-time feedback on large models |

Do not merge these by flattening Lean. Optional bridge: prove once that the
dialect’s Lean meaning agrees with the Datalog program on the supported
fragment; run DDlog day-to-day; Lean on demand.

## Prior art (short)

WebGME + FORMULA integration, then FORMULA → DDlog for scale and incrementality
(Zhang, Balasubramanian, Kecskés, Sztipanovits, DSM 2021). Reuse that engine
shape; keep Lean for what FORMULA/DDlog were never meant to replace.
