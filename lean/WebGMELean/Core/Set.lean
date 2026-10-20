/-!
# Set Operations for Model Verification

This module provides set-theoretic operations for reasoning about
collections of nodes, particularly for set members and filtered collections.
-/

import WebGMELean.Core.Model

namespace WebGMELean.Set

open WebGMELean

/-- A typed set of nodes filtered by meta type -/
def nodesOfType (m : Model) (metaType : String) : List Node :=
  m.getNodesByType metaType

/-- Filter nodes by a predicate on attributes -/
def filterByAttribute (nodes : List Node) (attrName : String) 
    (pred : AttrValue → Bool) : List Node :=
  nodes.filter fun n =>
    match n.getAttribute attrName with
    | some v => pred v
    | none => false

/-- Get nodes where a boolean attribute is true -/
def whereTrue (nodes : List Node) (attrName : String) : List Node :=
  filterByAttribute nodes attrName fun v =>
    match v with
    | .bool b => b
    | _ => false

/-- Get nodes where a boolean attribute is false -/
def whereFalse (nodes : List Node) (attrName : String) : List Node :=
  filterByAttribute nodes attrName fun v =>
    match v with
    | .bool b => !b
    | _ => false

/-- Union of two node lists -/
def union (xs ys : List Node) : List Node :=
  xs ++ ys.filter fun y => !xs.any fun x => x.id == y.id

/-- Intersection of two node lists -/
def intersection (xs ys : List Node) : List Node :=
  xs.filter fun x => ys.any fun y => x.id == y.id

/-- Difference of two node lists -/
def difference (xs ys : List Node) : List Node :=
  xs.filter fun x => !ys.any fun y => x.id == y.id

/-- Check if one set is a subset of another -/
def isSubset (xs ys : List Node) : Bool :=
  xs.all fun x => ys.any fun y => x.id == y.id

/-- Check if sets are disjoint -/
def isDisjoint (xs ys : List Node) : Bool :=
  !xs.any fun x => ys.any fun y => x.id == y.id

/-- Get the symmetric difference -/
def symmetricDifference (xs ys : List Node) : List Node :=
  union (difference xs ys) (difference ys xs)

/-- Resolve node IDs to actual nodes -/
def resolveIds (m : Model) (ids : List NodeId) : List Node :=
  ids.filterMap m.getNode

/-- Get set members as resolved nodes -/
def getSetMembersResolved (m : Model) (n : Node) (setName : String) : List Node :=
  resolveIds m (n.getSetMembers setName)

/-- Check if a node is in a set member list -/
def isMemberOf (n : Node) (owner : Node) (setName : String) : Bool :=
  (owner.getSetMembers setName).contains n.id

/-- Count nodes matching a predicate -/
def count (nodes : List Node) (pred : Node → Bool) : Nat :=
  (nodes.filter pred).length

/-- Check if exactly one node matches -/
def exactlyOne (nodes : List Node) (pred : Node → Bool) : Bool :=
  count nodes pred == 1

/-- Check if at most one node matches -/
def atMostOne (nodes : List Node) (pred : Node → Bool) : Bool :=
  count nodes pred ≤ 1

/-- Check if at least one node matches -/
def atLeastOne (nodes : List Node) (pred : Node → Bool) : Bool :=
  count nodes pred ≥ 1

end WebGMELean.Set
