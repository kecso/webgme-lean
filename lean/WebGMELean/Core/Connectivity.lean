/-!
# Connectivity Constraints for Model Verification

This module provides predicates for reasoning about node connectivity,
including pointer relationships, containment, and structural patterns.
-/

import WebGMELean.Core.Model
import WebGMELean.Core.Graph

namespace WebGMELean.Connectivity

open WebGMELean
open WebGMELean.Graph

/-- Check if a pointer is set (not null) -/
def hasPointer (n : Node) (ptrName : String) : Bool :=
  n.pointers.any fun p => p.name == ptrName && p.target.isSome

/-- Check if a pointer is null or unset -/
def pointerIsNull (n : Node) (ptrName : String) : Bool :=
  match n.pointers.find? fun p => p.name == ptrName with
  | some p => p.target.isNone
  | none => true

/-- Check if pointer points to a specific node -/
def pointsTo (n : Node) (ptrName : String) (targetId : NodeId) : Bool :=
  n.getPointer ptrName == some targetId

/-- Check if pointer points to a node of a specific type -/
def pointsToType (m : Model) (n : Node) (ptrName : String) (metaType : String) : Bool :=
  match n.getPointer ptrName with
  | none => false
  | some targetId =>
    match m.getNode targetId with
    | none => false
    | some target => target.metaType == metaType

/-- Check if node has children -/
def hasChildren (n : Node) : Bool :=
  !n.children.isEmpty

/-- Check if node has parent -/
def hasParent (n : Node) : Bool :=
  n.parent.isSome

/-- Check if node is root (no parent) -/
def isRoot (n : Node) : Bool :=
  n.parent.isNone

/-- Check if node is leaf (no children) -/
def isLeaf (n : Node) : Bool :=
  n.children.isEmpty

/-- Get children of specific type -/
def childrenOfType (m : Model) (n : Node) (metaType : String) : List Node :=
  n.children.filterMap m.getNode |>.filter fun c => c.metaType == metaType

/-- Count children of specific type -/
def countChildrenOfType (m : Model) (n : Node) (metaType : String) : Nat :=
  (childrenOfType m n metaType).length

/-- Check if node is contained by a node of specific type -/
def containedByType (m : Model) (n : Node) (metaType : String) : Bool :=
  match n.parent with
  | none => false
  | some parentId =>
    match m.getNode parentId with
    | none => false
    | some parent => parent.metaType == metaType

/-- Check if set is empty -/
def setIsEmpty (n : Node) (setName : String) : Bool :=
  (n.getSetMembers setName).isEmpty

/-- Check if set is non-empty -/
def setIsNonEmpty (n : Node) (setName : String) : Bool :=
  !(n.getSetMembers setName).isEmpty

/-- Get set members of specific type -/
def setMembersOfType (m : Model) (n : Node) (setName : String) (metaType : String) : List Node :=
  n.getSetMembers setName
  |>.filterMap m.getNode
  |>.filter fun member => member.metaType == metaType

/-- Check if all set members are of a specific type -/
def allSetMembersOfType (m : Model) (n : Node) (setName : String) (metaType : String) : Bool :=
  n.getSetMembers setName |>.all fun memberId =>
    match m.getNode memberId with
    | none => false
    | some member => member.metaType == metaType

/-- Check bidirectional pointer (both nodes point to each other) -/
def bidirectionalPointer (m : Model) (n1 : Node) (ptr1 : String) (ptr2 : String) : Bool :=
  match n1.getPointer ptr1 with
  | none => false
  | some targetId =>
    match m.getNode targetId with
    | none => false
    | some n2 => n2.getPointer ptr2 == some n1.id

/-- Check if two nodes are siblings (same parent) -/
def areSiblings (n1 n2 : Node) : Bool :=
  match n1.parent, n2.parent with
  | some p1, some p2 => p1 == p2 && n1.id != n2.id
  | _, _ => false

/-- Get siblings of a node -/
def getSiblings (m : Model) (n : Node) : List Node :=
  match n.parent with
  | none => []
  | some parentId =>
    match m.getNode parentId with
    | none => []
    | some parent =>
      parent.children.filterMap m.getNode |>.filter fun sibling => sibling.id != n.id

/-- Check if a path exists via pointers -/
def pathExists (m : Model) (start : NodeId) (ptrNames : List String) (target : NodeId) : Bool :=
  let rec go (current : NodeId) (remaining : List String) : Bool :=
    match remaining with
    | [] => current == target
    | ptrName :: rest =>
      match m.getNode current with
      | none => false
      | some node =>
        match node.getPointer ptrName with
        | none => false
        | some next => go next rest
  go start ptrNames

end WebGMELean.Connectivity
