/-!
# WebGME Model Core Definitions

This module defines the core structures for representing WebGME models in Lean.
These definitions form the foundation for formal verification of domain-specific models.
-/

namespace WebGMELean

/-- A unique identifier for nodes in a model -/
structure NodeId where
  path : String
  deriving DecidableEq, Hashable, Repr

instance : ToString NodeId where
  toString n := n.path

/-- Base type for attribute values -/
inductive AttrValue where
  | string : String → AttrValue
  | int : Int → AttrValue
  | float : Float → AttrValue
  | bool : Bool → AttrValue
  | null : AttrValue
  deriving Repr

/-- A pointer reference to another node -/
structure Pointer where
  name : String
  target : Option NodeId
  deriving Repr

/-- A set reference containing multiple targets -/
structure SetMember where
  name : String
  members : List NodeId
  deriving Repr

/-- Core node structure representing a WebGME node -/
structure Node where
  id : NodeId
  metaType : String
  name : String
  attributes : List (String × AttrValue)
  pointers : List Pointer
  sets : List SetMember
  children : List NodeId
  parent : Option NodeId
  deriving Repr

/-- A complete model is a collection of nodes with a root -/
structure Model where
  nodes : List Node
  root : NodeId
  deriving Repr

/-- Get a node by its ID -/
def Model.getNode (m : Model) (id : NodeId) : Option Node :=
  m.nodes.find? (fun n => n.id == id)

/-- Get all nodes of a specific meta type -/
def Model.getNodesByType (m : Model) (metaType : String) : List Node :=
  m.nodes.filter (fun n => n.metaType == metaType)

/-- Get an attribute value from a node -/
def Node.getAttribute (n : Node) (name : String) : Option AttrValue :=
  n.attributes.find? (fun (k, _) => k == name) |>.map Prod.snd

/-- Get a pointer target from a node -/
def Node.getPointer (n : Node) (name : String) : Option NodeId :=
  n.pointers.find? (fun p => p.name == name) |>.bind Pointer.target

/-- Get set members from a node -/
def Node.getSetMembers (n : Node) (name : String) : List NodeId :=
  match n.sets.find? (fun s => s.name == name) with
  | some s => s.members
  | none => []

/-- Check if a node is an instance of a given meta type -/
def Node.isInstanceOf (n : Node) (metaType : String) : Bool :=
  n.metaType == metaType

end WebGMELean
