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

## What a check establishes

`lean` elaborates the file and checks every `def` and `theorem`. A `theorem ... := rfl` holds when both sides reduce to the same value. `ExactlyOneInit counter` is not checked until a theorem states it, for example `theorem one_init : ExactlyOneInit counter = true := rfl`.

## Reading `.cEnd`

In `_type := .cEnd`, the leading dot is constructor notation. `_type` has type `_Type`, so `.cEnd` means the constructor `_Type.cEnd`. Writing `_Type.cEnd` is the same term. The dot is in the source; Lean uses the expected type to choose the inductive, and it does not insert the dot itself.

`⟨"/counter/done"⟩` is the same idea for a structure. `_id` expects a `_NodeId`, and that structure has one field, so the angle brackets supply `path` without naming the constructor.
