/-!
# Graph Theory Primitives for Model Verification

This module provides graph-theoretic operations useful for reasoning about
model connectivity, containment hierarchies, and pointer relationships.
-/

import WebGMELean.Core.Model

namespace WebGMELean.Graph

open WebGMELean

/-- Directed edge in a model graph -/
structure Edge where
  source : NodeId
  target : NodeId
  label : String
  deriving Repr, DecidableEq

/-- Extract pointer edges from a model -/
def extractPointerEdges (m : Model) : List Edge :=
  m.nodes.bind fun n =>
    n.pointers.filterMap fun p =>
      p.target.map fun t => { source := n.id, target := t, label := p.name }

/-- Extract containment edges (parent-child relationships) -/
def extractContainmentEdges (m : Model) : List Edge :=
  m.nodes.filterMap fun n =>
    n.parent.map fun p => { source := p, target := n.id, label := "contains" }

/-- Check if there's a direct edge between two nodes -/
def hasDirectEdge (edges : List Edge) (src : NodeId) (tgt : NodeId) : Bool :=
  edges.any fun e => e.source == src && e.target == tgt

/-- Get all outgoing edges from a node -/
def outgoingEdges (edges : List Edge) (src : NodeId) : List Edge :=
  edges.filter fun e => e.source == src

/-- Get all incoming edges to a node -/
def incomingEdges (edges : List Edge) (tgt : NodeId) : List Edge :=
  edges.filter fun e => e.target == tgt

/-- Compute reachable nodes from a starting node (BFS) -/
partial def reachable (edges : List Edge) (start : NodeId) : List NodeId :=
  let rec go (visited : List NodeId) (queue : List NodeId) : List NodeId :=
    match queue with
    | [] => visited
    | n :: rest =>
      if visited.contains n then
        go visited rest
      else
        let neighbors := (outgoingEdges edges n).map Edge.target
        go (n :: visited) (rest ++ neighbors)
  go [] [start]

/-- Check if target is reachable from source -/
def isReachable (edges : List Edge) (src : NodeId) (tgt : NodeId) : Bool :=
  (reachable edges src).contains tgt

/-- Check for cycles starting from a node -/
def hasCycle (edges : List Edge) (start : NodeId) : Bool :=
  let reachableFromStart := reachable edges start
  reachableFromStart.any fun n =>
    (outgoingEdges edges n).any fun e => e.target == start

/-- Get ancestors in containment hierarchy -/
def ancestors (m : Model) (id : NodeId) : List NodeId :=
  let rec go (current : Option NodeId) (acc : List NodeId) (fuel : Nat) : List NodeId :=
    match fuel, current with
    | 0, _ => acc
    | _, none => acc
    | fuel + 1, some nodeId =>
      match m.getNode nodeId with
      | none => acc
      | some node => go node.parent (nodeId :: acc) fuel
  go (m.getNode id |>.bind Node.parent) [] m.nodes.length

/-- Get descendants in containment hierarchy -/
def descendants (m : Model) (id : NodeId) : List NodeId :=
  let rec go (queue : List NodeId) (acc : List NodeId) : List NodeId :=
    match queue with
    | [] => acc
    | nodeId :: rest =>
      match m.getNode nodeId with
      | none => go rest acc
      | some node =>
        go (rest ++ node.children) (nodeId :: acc)
  match m.getNode id with
  | none => []
  | some node => go node.children []

/-- Check if node is an ancestor of another -/
def isAncestor (m : Model) (ancestor : NodeId) (descendant : NodeId) : Bool :=
  (ancestors m descendant).contains ancestor

/-- Check if node is a descendant of another -/
def isDescendant (m : Model) (descendant : NodeId) (ancestor : NodeId) : Bool :=
  (descendants m ancestor).contains descendant

end WebGMELean.Graph
