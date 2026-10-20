/-!
# Cardinality Constraints for Model Verification

This module provides cardinality predicates commonly used in
metamodeling constraints (multiplicities, uniqueness, etc.).
-/

import WebGMELean.Core.Model
import WebGMELean.Core.Connectivity

namespace WebGMELean.Cardinality

open WebGMELean
open WebGMELean.Connectivity

/-- Cardinality bounds -/
structure Bounds where
  min : Nat
  max : Option Nat  -- None means unbounded
  deriving Repr

/-- Common cardinality patterns -/
def zeroOrOne : Bounds := { min := 0, max := some 1 }
def exactlyOne : Bounds := { min := 1, max := some 1 }
def oneOrMore : Bounds := { min := 1, max := none }
def zeroOrMore : Bounds := { min := 0, max := none }
def exactly (n : Nat) : Bounds := { min := n, max := some n }
def between (lo hi : Nat) : Bounds := { min := lo, max := some hi }
def atLeast (n : Nat) : Bounds := { min := n, max := none }
def atMost (n : Nat) : Bounds := { min := 0, max := some n }

/-- Check if a count satisfies bounds -/
def satisfiesBounds (count : Nat) (bounds : Bounds) : Bool :=
  count ≥ bounds.min &&
  match bounds.max with
  | none => true
  | some max => count ≤ max

/-- Check children cardinality of a specific type -/
def childrenCardinalitySatisfied (m : Model) (n : Node) (childType : String) (bounds : Bounds) : Bool :=
  satisfiesBounds (countChildrenOfType m n childType) bounds

/-- Check set member cardinality -/
def setCardinalitySatisfied (n : Node) (setName : String) (bounds : Bounds) : Bool :=
  satisfiesBounds (n.getSetMembers setName).length bounds

/-- Check that a pointer target type has correct cardinality in the model -/
def pointerTargetCount (m : Model) (nodes : List Node) (ptrName : String) (targetType : String) : Nat :=
  nodes.foldl (fun acc n =>
    match n.getPointer ptrName with
    | none => acc
    | some targetId =>
      match m.getNode targetId with
      | none => acc
      | some target =>
        if target.metaType == targetType then acc + 1 else acc
  ) 0

/-- Check uniqueness: no two nodes of a type have the same attribute value -/
def attributeUnique (nodes : List Node) (attrName : String) : Bool :=
  let values := nodes.filterMap fun n => n.getAttribute attrName
  let stringValues := values.filterMap fun v =>
    match v with
    | .string s => some s
    | .int i => some (toString i)
    | _ => none
  stringValues.length == stringValues.eraseDups.length

/-- Check uniqueness within children of each parent -/
def attributeUniqueAmongSiblings (m : Model) (nodeType : String) (attrName : String) : Bool :=
  m.nodes.all fun parent =>
    let childrenOfType := parent.children.filterMap m.getNode |>.filter fun c => c.metaType == nodeType
    attributeUnique childrenOfType attrName

/-- Check that pointer targets are unique across nodes -/
def pointerTargetsUnique (nodes : List Node) (ptrName : String) : Bool :=
  let targets := nodes.filterMap fun n => n.getPointer ptrName
  targets.length == targets.eraseDups.length

/-- Count incoming pointers to a node -/
def incomingPointerCount (m : Model) (targetId : NodeId) (ptrName : String) : Nat :=
  m.nodes.foldl (fun acc n =>
    if n.getPointer ptrName == some targetId then acc + 1 else acc
  ) 0

/-- Check incoming pointer cardinality -/
def incomingPointersSatisfied (m : Model) (targetId : NodeId) (ptrName : String) (bounds : Bounds) : Bool :=
  satisfiesBounds (incomingPointerCount m targetId ptrName) bounds

/-- Ensure all nodes of a type satisfy incoming pointer constraints -/
def allIncomingPointersSatisfied (m : Model) (targetType : String) (ptrName : String) (bounds : Bounds) : Bool :=
  (m.getNodesByType targetType).all fun target =>
    incomingPointersSatisfied m target.id ptrName bounds

/-- Check that total count of nodes of a type satisfies bounds -/
def typeCountSatisfied (m : Model) (metaType : String) (bounds : Bounds) : Bool :=
  satisfiesBounds (m.getNodesByType metaType).length bounds

end WebGMELean.Cardinality
