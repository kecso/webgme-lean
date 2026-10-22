# Turnstile

Generated Lean for the statechart metamodel, with a turnstile filled in. `extends` follows each concept's base, so the chain starts at `FCO`, and `FCO` declares `name`.

A name that starts with `_` is technical. It is not a concept or an attribute of the metamodel. `_id` is the node's identity. `_type` is the concept the node was created as. `name`, `event`, `guard`, `src`, and `dst` are ordinary fields. `_StateChartChild` and `_Contained` are how containment is read.

`src` and `dst` have type `State`. `Coe` lets an `Init` or an `End` be stored there. Lean inserts `toState`, and the fields of `State` come along. Those fields are `_id`, `_type`, and `name`, because `Init` and `End` declare none of their own. `locked` is stored as a `State` whose `_type` is still `.cInit`.

A pointer from a concept back to itself cannot be a structure field. That one stays an `_NodeId`. The turnstile has no such pointer.

```lean
namespace StatechartDomain

-- technical: identity of a node. Not a meta attribute.
structure _NodeId where
  path : String
  deriving DecidableEq, Repr

-- technical: the containment lookup. Not a meta concept.
class _Contained (parent child : Type) where
  children : parent → List child

-- technical: the concept a node was created as. Coercion keeps this field.
inductive _Type where
  | cFCO
  | cStateChart
  | cState
  | cInit
  | cEnd
  | cTransition
  deriving DecidableEq, Repr

-- _id and _type are technical.
structure FCO where
  _id : _NodeId
  _type : _Type
  name : String
  deriving Repr

structure State extends FCO deriving Repr

instance : Coe State FCO where
  coe := State.toFCO

structure Init extends State deriving Repr

instance : Coe Init State where
  coe := Init.toState

structure End extends State deriving Repr

instance : Coe End State where
  coe := End.toState

structure Transition extends FCO where
  event : String
  guard : String
  src : State
  dst : State
  deriving Repr

instance : Coe Transition FCO where
  coe := Transition.toFCO

-- technical: the children of StateChart. Not a meta concept.
inductive _StateChartChild where
  | cInit : Init → _StateChartChild
  | cState : State → _StateChartChild
  | cTransition : Transition → _StateChartChild
  deriving Repr

-- _containment is technical.
structure StateChart extends FCO where
  _containment : List _StateChartChild
  deriving Repr

instance : Coe StateChart FCO where
  coe := StateChart.toFCO

instance : _Contained StateChart Init where
  children parent := parent._containment.filterMap fun
    | .cInit node => some node
    | _ => none

instance : _Contained StateChart State where
  children parent := parent._containment.filterMap fun
    | .cState node => some node
    | _ => none

instance : _Contained StateChart Transition where
  children parent := parent._containment.filterMap fun
    | .cTransition node => some node
    | _ => none

def locked : Init := { _id := ⟨"/turnstile/locked"⟩, _type := .cInit, name := "Locked" }
def unlocked : State := { _id := ⟨"/turnstile/unlocked"⟩, _type := .cState, name := "Unlocked" }

def coin : Transition := {
  _id := ⟨"/turnstile/coin"⟩
  _type := .cTransition
  name := "Coin"
  event := "coin"
  guard := ""
  src := locked
  dst := unlocked
}

def push : Transition := {
  _id := ⟨"/turnstile/push"⟩
  _type := .cTransition
  name := "Push"
  event := "push"
  guard := ""
  src := unlocked
  dst := locked
}

def turnstile : StateChart := {
  _id := ⟨"/turnstile"⟩
  _type := .cStateChart
  name := "Turnstile"
  _containment := [.cInit locked, .cState unlocked, .cTransition coin, .cTransition push]
}

-- forall t in Transition: t.event != ""
def EveryTransitionHasEvent (m : StateChart) : Bool :=
  (_Contained.children (child := Transition) m).all fun t =>
    t.event != ""

theorem coin_from_locked : coin.src._id = locked._id := rfl
theorem coin_src_was_init : coin.src._type = .cInit := rfl

end StatechartDomain
```

`coin.src` typechecks, and its type is `State`. `t.missing` does not: `Transition` has `event`, `guard`, `src`, and `dst`.
