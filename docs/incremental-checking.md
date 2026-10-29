# Incremental model checking

Two layers of incrementality are available:

1. **Domain compilation** — reuse Lean `.olean` artifacts when META and constraint
   defs are unchanged.
2. **Model deltas** — after one model has been checked, reuse or cheaply update
   constraint outcomes when the instance changes, instead of rechecking everything.

The second layer is the larger win for models that grow into the tens of thousands
of objects.

## Model-delta checking

`incrementalCheck.planCheck` compares the new instance to a prior snapshot and
classifies each constraint:

| Action | Meaning |
| --- | --- |
| `reuse` | The edit cannot change this constraint; keep the cached pass/fail. |
| `count` | The constraint is a type-count comparison; update counters from the delta and re-evaluate. |
| `recheck` | The edit may change the outcome; send this constraint to Lean (or another full checker). |

### Counter constraints

These shapes are settled from a type-count cache without replaying quantifiers:

```
count(Init) == 1
count(State) >= 1
exists i in Init: true          // treated as count(Init) >= 1
count(Init) == 1 and count(End) == 1
```

Adding or removing a node adjusts every count along its type chain (`Init` also
bumps `State` and `FCO`). The comparison is then evaluated against the new counts.

### Footprint reuse

A constraint such as:

```
forall t in Transition:
  t->src != null
```

depends on `Transition` and the `src` pointer. Adding a `State` does not touch that
footprint, so a prior pass is reused. Adding or editing a `Transition` marks it for
recheck.

Global constraints (reachability, `define` helpers, cross-cutting graphs) are
rechecked whenever the edit is structural.

### Snapshot

`CheckWithLean` stores a per-model snapshot under
`lean/Generated/cache-<project>-<root>.json`:

- node records from the last check
- type counts
- per-constraint results
- hash of the constraint text (cache drops if constraints change)

If every constraint is `reuse` or `count`, Lean is not started.

## Domain compilation (Lean modules)

When Lean does run, the program is still split:

| Field | Contents | Changes when |
| --- | --- | --- |
| `domainModule` | META types, meta rules, constraint `def`s | Metamodel or constraints change |
| `modelModule` | Node values, `resolve`, `_Contained`, selected `theorem`s | Model instance / affected set changes |
| `source` | Single-file concatenation | Either changes (artifacts / tests) |

`CheckWithLean` writes `Generated/Domain.lean` and `Generated/Check.lean`, rebuilds
the domain only when its text changes, and proves **only** the constraints in
`needsLean` (plus meta rules focused on added/changed nodes when a delta exists).

## Practical expectations

- **Add one node, counter-only constraints:** O(changes) count updates; no Lean.
- **Add a State while Transition constraints were already proved:** reuse; no Lean.
- **Add a Transition with local Transition constraints:** Lean (or a future JS local
  evaluator) runs for those constraints only; others reuse/count.
- **Tens of thousands of objects with mostly local/count constraints:** deltas avoid
  full-model Lean elaboration on routine edits. The first full check and any global
  constraint still pay the large-model cost.

## Manual Lean modules

From `lean/` after a plugin run that needed Lean:

```sh
lake build Generated.Domain   # no-op when Domain.lean is unchanged
lake env lean Generated/Check.lean
```

See also [checking-examples.md](./checking-examples.md) for self-contained example files.
