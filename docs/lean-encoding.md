# Lean encoding of a WebGME metamodel

The ConstraintManager writes a Lean namespace from the open project's META. That text is the program. This page is where the encoding rules live.

The namespace is the project name. Constraints are definitions of the main type, the concept the metamodel treats as the model (for the statechart example, `StateChart`).

## Concepts

Each meta concept is one section, opened by a line such as `-- State definitions`. The section holds that concept's structure. `extends` follows that concept's base. The chain starts at `FCO`, which declares `name`, `_containment`, and `_parent`. A concept's own attributes, pointers, and sets are fields on its structure.

`_id` is the node's identity. `_type` is the concept the node was created as, with one constructor per concept (`cState`, `cInit`, `cFCO`). `Coe` upcasts a concept to its base. The created-as concept stays on `_type` after that upcast, so an `Init` stored where a `State` is required is still `.cInit`.

A pointer's type is the meta target of that pointer. A required pointer is the target type. An optional pointer is `Option` of the target type. `Coe` lets a descendant be stored in the target type, and the target's fields come along. A pointer that would make a structure contain itself, including a pointer from a concept back to itself, is an `_NodeId`. A pointer with several target types is an inductive with one constructor per target.

A set is a `List` of its member type.

## Containment

Containment is one list of child ids on `FCO`. Every concept inherits that field through `extends`, so a long chain still has a single list. `_parent : Option _NodeId` is the id of this node's parent. An instance lists the child ids WebGME created for it. Those are new ids, not the ids stored on the concept definition.

`allowed` says which child types a concept may hold. The nearest declaration of a child type wins, walking the concept, then its bases, then its mixins. `isA` answers whether a node's created-as concept is that concept, a base, or a mixin. A mixin does not add an `extends` parent. `Coe` still follows the base only.

Each meta rule is one definition. The name says which concept and which rule. A short comment states the bound.

```lean
-- Every child of StateChart has a type StateChart may contain.
def _StateChart_child_type (m : StateChart) (resolve : _NodeId → Option _Type) : Bool :=
  childrenAllowed m.toFCO resolve

-- StateChart contains 1..2 Element.
def _StateChart_Element_child_cardinality (m : StateChart) (resolve : _NodeId → Option _Type) : Bool :=
  (let n := countOfType m._containment .cElement resolve; n ≥ 1 && n ≤ 2)

-- StateChart contains 1..10 children.
def _StateChart_child_cardinality (m : StateChart) : Bool :=
  (let n := m._containment.length; n ≥ 1 && n ≤ 10)
```

The last of those is the global containment bound: how many children the node may have, of any allowed type. A set has the same pair. `_Element_refs_member_cardinality` checks the length of `refs`. `_Element_refs_Element_member_cardinality` checks how many of those members are `Element`. An unset side (`-1` in WebGME) is left out of the definition, and a rule with neither side is not generated.

The model section defines `resolve` and proves every rule whose argument is that node's concept. `_Contained` is also built there, so a user constraint can still read the children as values. `e.parent` is `parentOf e.toFCO`.

## Where to write constraints

Definitions that come from the metamodel are fixed. Definitions you add go in the highlighted area, after those definitions and before `end Namespace`.
