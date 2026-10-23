# Counter

A statechart with an explicit `Init` and an explicit `End`. `End` extends `State`, and `State` extends `FCO`, so `done` has `name`, `_id`, and `_type` without declaring them. `src` and `dst` expect a `State`. `start` is an `Init` and `done` is an `End`; `Coe` stores each of them as a `State`, and `_type` stays `.cInit` or `.cEnd`.

`StateChart` does not list `End` as a child, so `done` is placed in the containment list as `.cState (done : State)`. The `State` lookup therefore returns it, and its `_type` is still `.cEnd`.

The constraints for this example are [`counter.wgl`](counter.wgl). That is the text the Constraint Manager stores. `ExactlyOneInit` is `count(Init) == 1`. `ExactlyOneEnd` is `count(End) == 1`.

[`Counter.lean`](Counter.lean) is the same example encoded for Lean. Checking it is described in [Checking examples](../../docs/checking-examples.md). The init count reads the `Init` children. The end count reads the `State` children and keeps the one whose `_type` is `.cEnd`, because `done` is stored as a `State`.

`inc.src` and `stop.dst` both have type `State`. `start` flows in through `Init.toState`, `done` through `End.toState`. `stop.dst.name` is the `name` field from `FCO`.
