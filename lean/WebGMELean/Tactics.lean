/-!
# Custom Tactics for Model Verification

This module provides tactics that simplify proving model constraints.
-/

import WebGMELean.Core

namespace WebGMELean.Tactics

open Lean Elab Tactic Meta

/-- Tactic to unfold common model definitions -/
macro "unfold_model" : tactic =>
  `(tactic| (
    simp only [
      Model.getNode, Model.getNodesByType,
      Node.getAttribute, Node.getPointer, Node.getSetMembers,
      Node.isInstanceOf
    ]
  ))

/-- Tactic to simplify boolean expressions in constraints -/
macro "simp_constraint" : tactic =>
  `(tactic| (
    simp only [
      Bool.and_eq_true, Bool.or_eq_true, Bool.not_eq_true',
      decide_eq_true_eq, beq_iff_eq, bne_iff_ne
    ]
  ))

/-- Tactic to case split on Option values -/
macro "split_option" e:term : tactic =>
  `(tactic| (cases $e with | none => · | some val => ·))

/-- Tactic to handle list membership proofs -/
macro "list_mem" : tactic =>
  `(tactic| (
    simp only [List.mem_filter, List.mem_map, List.mem_bind, List.mem_cons, List.mem_nil_iff]
    constructor <;> try rfl
  ))

end WebGMELean.Tactics
