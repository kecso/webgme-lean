-- Turnstile model. Source constraints: turnstile.wgl. Narrative: turnstile.md. How to check: ../../docs/checking-examples.md

namespace StatechartDomain

structure _NodeId where
  path : String
  deriving DecidableEq, Repr

class _Contained (parent child : Type) where
  children : parent → List child

inductive _Type where
  | cFCO
  | cStateChart
  | cState
  | cInit
  | cEnd
  | cTransition
  deriving DecidableEq, BEq, Repr

-- FCO definitions
structure FCO where
  _id : _NodeId
  _type : _Type
  name : String
  deriving Repr

-- State definitions
structure State extends FCO deriving Repr

instance : Coe State FCO where
  coe := State.toFCO

-- Init definitions
structure Init extends State deriving Repr

instance : Coe Init State where
  coe := Init.toState

-- End definitions
structure End extends State deriving Repr

instance : Coe End State where
  coe := End.toState

-- Transition definitions
structure Transition extends FCO where
  event : String
  guard : String
  src : State
  dst : State
  deriving Repr

instance : Coe Transition FCO where
  coe := Transition.toFCO

-- StateChart definitions
inductive _StateChartChild where
  | cInit : Init → _StateChartChild
  | cState : State → _StateChartChild
  | cTransition : Transition → _StateChartChild
  deriving Repr

def _StateChartChild._type : _StateChartChild → _Type
  | .cInit node => node._type
  | .cState node => node._type
  | .cTransition node => node._type

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

-- count Init == 1, from the containment list
def ExactlyOneInitByCount (m : StateChart) : Bool :=
  (m._containment.countP fun
    | .cInit _ => true
    | _ => false) == 1

-- count Init == 1, through the containment lookup
def ExactlyOneInit (m : StateChart) : Bool :=
  (_Contained.children (child := Init) m).length == 1

-- count Init == 1, by the created-as concept on every child
def ExactlyOneInitByType (m : StateChart) : Bool :=
  (m._containment.filter fun child => child._type == .cInit).length == 1

theorem coin_from_locked : coin.src._id = locked._id := rfl
theorem coin_src_was_init : coin.src._type = .cInit := rfl

end StatechartDomain
