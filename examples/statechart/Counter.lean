-- Counter model. Source constraints: counter.wgl. Narrative: counter.md. How to check: ../../docs/checking-examples.md

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

def start : Init := { _id := ⟨"/counter/start"⟩, _type := .cInit, name := "Start" }
def counting : State := { _id := ⟨"/counter/counting"⟩, _type := .cState, name := "Counting" }
def done : End := { _id := ⟨"/counter/done"⟩, _type := .cEnd, name := "Done" }

def inc : Transition := {
  _id := ⟨"/counter/inc"⟩
  _type := .cTransition
  name := "Inc"
  event := "inc"
  guard := ""
  src := start
  dst := counting
}

def stop : Transition := {
  _id := ⟨"/counter/stop"⟩
  _type := .cTransition
  name := "Stop"
  event := "stop"
  guard := ""
  src := counting
  dst := done
}

def counter : StateChart := {
  _id := ⟨"/counter"⟩
  _type := .cStateChart
  name := "Counter"
  _containment := [.cInit start, .cState counting, .cState (done : State), .cTransition inc, .cTransition stop]
}

-- name is declared on FCO and inherited by End
theorem done_has_name : done.name = "Done" := rfl

-- Init stored where a State is required keeps the created-as concept
theorem inc_src_was_init : inc.src._type = .cInit := rfl

-- End stored where a State is required keeps the created-as concept and the inherited name
theorem stop_dst_was_end : stop.dst._type = .cEnd := rfl
theorem stop_dst_name : stop.dst.name = "Done" := rfl
theorem done_as_state_was_end : (done : State)._type = .cEnd := rfl

-- the State children include the coerced End; _type tells it from Counting
def ExactlyOneEndAmongStates (m : StateChart) : Bool :=
  ((_Contained.children (child := State) m).filter fun s => s._type == .cEnd).length == 1

def ExactlyOneInit (m : StateChart) : Bool :=
  (_Contained.children (child := Init) m).length == 1

end StatechartDomain
