# Turnstile

Generated Lean for the statechart metamodel, with a turnstile filled in. The encoding rules are in [Lean encoding](../../docs/lean-encoding.md). `extends` follows each concept's base, so the chain starts at `FCO`, and `FCO` declares `name`.

`_id` is the node's identity. `_type` is the concept the node was created as. `name`, `event`, `guard`, `src`, and `dst` are ordinary fields. Containment is a meta rule: `StateChart` declares that its children are `Init`, `State`, and `Transition`. `_StateChartChild` is that declaration, and each `_Contained` instance reads one of those child types back out.

`src` and `dst` have type `State`. `Coe` lets an `Init` or an `End` be stored there. Lean inserts `toState`, and the fields of `State` come along. Those fields are `_id`, `_type`, and `name`, because `Init` and `End` declare none of their own. `locked` is stored as a `State` whose `_type` is still `.cInit`. A counter that places both an `Init` and an `End` into `State` positions is in [counter.md](counter.md).

A pointer from a concept back to itself cannot be a structure field. That one stays an `_NodeId`. The turnstile has no such pointer.

The constraints for this example are [`turnstile.wgl`](turnstile.wgl). That is the text the Constraint Manager stores. `EveryTransitionHasEvent` requires a non-empty `event` on every `Transition`. `ExactlyOneInit` is `count(Init) == 1`.

[`Turnstile.lean`](Turnstile.lean) is the same example encoded for Lean. Checking it is described in [Checking examples](../../docs/checking-examples.md). The event constraint becomes `_Contained` over `Transition`. The init count is written three ways: `countP` on `_containment`, `_Contained` for `Init`, and a filter that keeps children whose `_type` is `.cInit`.

`coin.src` typechecks, and its type is `State`. `t.missing` does not: `Transition` has `event`, `guard`, `src`, and `dst`. The turnstile has one `Init`, `locked`.
