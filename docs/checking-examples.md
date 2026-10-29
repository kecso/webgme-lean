# Checking examples in Lean

Example programs are `.lean` files. A `.md` file beside one is the narrative. Lean checks the `.lean` file.

The library in `lean/` is pinned to Lean 4.12.0 by `lean/lean-toolchain`. The examples are self-contained: they do not import that library, and they use the same Lean version.

## Setup

Install [elan](https://lean-lang.org/install/), then from the repository root:

```sh
cd lean
lake update
```

`lake update` downloads the toolchain named in `lean/lean-toolchain`. The first run takes a while. Later checks reuse it.

## Check one example

From `lean/`:

```sh
lake env lean ../examples/statechart/Turnstile.lean
lake env lean ../examples/statechart/Counter.lean
```

A successful check prints nothing and exits with status 0. A failure prints the file, the line, and the error.

Any other self-contained `.lean` file is checked the same way. Pass its path to `lake env lean`.

From outside `lean/`, the same toolchain can be selected explicitly:

```sh
elan run leanprover/lean4:v4.12.0 lean examples/statechart/Counter.lean
```

## Check the library

The shared Lean library is the Lake package in `lean/`:

```sh
cd lean
lake build
```

Model checks from the Constraint Manager use a separate `Generated` Lake library.
Domain types and constraint defs go in `Generated/Domain.lean`; the instance goes in
`Generated/Check.lean`. See [incremental-checking.md](./incremental-checking.md).
For model-delta incrementality (not Lean), see [datalog-incrementality.md](./datalog-incrementality.md).

## What a check establishes

`lean` elaborates the file and checks every `def` and `theorem`. A `theorem ... := rfl` holds when both sides reduce to the same value. `ExactlyOneInit counter` is not checked until a theorem states it, for example `theorem one_init : ExactlyOneInit counter = true := rfl`.

## Checking vs running (what “execution” means here)

Lean 4 is both a **theorem prover** and a **programming language**. Those are different modes:

| Mode | How you invoke it | What happens |
| --- | --- | --- |
| Check / elaborate | `lake env lean File.lean` (what CheckWithLean does) | Parse, typecheck, reduce proofs. No separate “run.” Success = silence + exit 0. |
| Interactive commands | `#eval`, `#check` in a file / editor | Elaborator evaluates an expression and prints the result in the message log. |
| Real program | `def main : IO Unit := …` then `lean --run` or a Lake executable | Runtime executes `IO` (stdin, files, network). Can take user input. |

In this project, constraint “checking” is almost entirely the first mode. The model is
*generated into the source* as `def`s; `theorem C_holds : C checkedModel = true := rfl`
asks the kernel to **reduce** that `Bool` during checking. That reduction *is* the
computation — there is no second phase that loads a model and calls `main`.

So today there is little “execution” in the ordinary sense: the executable story
would be a Lean program that reads a model (JSON, etc.) at runtime and `#eval`s or
calls the constraint functions in `IO`. That is possible in Lean 4, but it is not
what CheckWithLean does yet.

## Reading `.cEnd`

In `_type := .cEnd`, the leading dot is constructor notation. `_type` has type `_Type`, so `.cEnd` means the constructor `_Type.cEnd`. Writing `_Type.cEnd` is the same term. The dot is in the source; Lean uses the expected type to choose the inductive, and it does not insert the dot itself.

`⟨"/counter/done"⟩` is the same idea for a structure. `_id` expects a `_NodeId`, and that structure has one field, so the angle brackets supply `path` without naming the constructor.
