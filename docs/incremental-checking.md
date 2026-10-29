# Incremental model checking

When the metamodel and constraint text stay fixed, only the model instance changes
from one check to the next. Re-elaborating domain types and constraint definitions
on every run is wasted work. This project splits the generated Lean program so Lake
can reuse a compiled domain module.

## What is reused

`leanCheck.buildProgram` returns three views of the same check:

| Field | Contents | Changes when |
| --- | --- | --- |
| `domainModule` | META types, meta rules, constraint `def`s | Metamodel or constraints change |
| `modelModule` | Node values, `resolve`, `_Contained`, `theorem … := rfl` | Model instance changes |
| `source` | Single-file concatenation | Either changes (for artifacts / tests) |

`CheckWithLean` writes:

- `lean/Generated/Domain.lean` — rebuilt and `lake build Generated.Domain` only when its text changes
- `lean/Generated/Check.lean` — always rewritten for the active instance, then checked with `lake env lean`

Lake keeps `Generated/Domain.olean`. The next check with the same domain loads that artifact and elaborates only `Check.lean`.

## What still scales with model size

Caching the domain does **not** remove the cost of:

1. Elaborating tens of thousands of node `def`s in `Check.lean`
2. Reducing each `theorem … := rfl` over that instance

Those steps grow with the instance. Domain reuse mainly helps when the META/constraint surface is large relative to a single edit, or when you re-check many models against one domain.

## Practical expectations

- Small models (examples, hundreds of nodes): domain reuse is a modest win; total time is dominated by Lean startup and instance elaboration.
- Large models (tens of thousands of objects): instance elaboration and `rfl` reduction dominate. Prefer scoping checks to a subtree, fewer theorems per run, or a non-proof checker for quick feedback; keep Lean for the cases that need a kernel check.
- Unchanged model + unchanged domain: the plugin still rewrites and rechecks `Check.lean` today. Skipping Lean when the model hash matches a prior successful run would be a further optimization.

## Manual check with Lake

From `lean/` after a plugin run (or after writing the two modules yourself):

```sh
lake build Generated.Domain   # no-op when Domain.lean is unchanged
lake env lean Generated/Check.lean
```

See also [checking-examples.md](./checking-examples.md) for the self-contained example files, which do not use this split.
