# Lean encoding of a WebGME metamodel

The ConstraintManager writes a Lean namespace from the open project's META. That text is the program. This page is where the encoding rules live.

The namespace is the project name. Constraints are definitions of the main type, the concept the metamodel treats as the model (for the statechart example, `StateChart`).

## Concepts

Each meta concept is one section, opened by a line such as `-- State definitions`. The section holds that concept's structure, the children it may contain, and the lookups and bounds for those children. `extends` follows that concept's base. The chain starts at `FCO`, which declares `name`. A concept's own attributes, pointers, and sets are fields on its structure.

`_id` is the node's identity. `_type` is the concept the node was created as, with one constructor per concept (`cState`, `cInit`, `cFCO`). `Coe` upcasts a concept to its base. The created-as concept stays on `_type` after that upcast, so an `Init` stored where a `State` is required is still `.cInit`.

A pointer's type is the meta target of that pointer. A required pointer is the target type. An optional pointer is `Option` of the target type. `Coe` lets a descendant be stored in the target type, and the target's fields come along. A pointer that would make a structure contain itself, including a pointer from a concept back to itself, is an `_NodeId`. A pointer with several target types is an inductive with one constructor per target.

A set is a `List` of its member type.

## Containment

Containment is a meta rule. Each concept declares which concepts may appear as its children, and how many. Without that declaration, a node of one type cannot be a child of a node of another type.

The declaration is an inductive `_OwnerChild`, with one constructor per allowed child concept. The owner's `_containment` field is a `List` of that inductive. A `_Contained` instance for each allowed child reads those nodes back out:

```lean
instance : _Contained StateChart State where
  children parent := parent._containment.filterMap fun
    | .cState node => some node
    | _ => none
```

`(_Contained.children (child := State) m)` is the list of `State` children of `m`.

A `List` already allows zero or more elements. A bound the list does not enforce — a minimum above zero, or a finite maximum — is a `def` of the main type. A bound on a direct child of the main type is checked on each such child:

```lean
def StateChart_atLeast_1_Element (m : StateChart) : Bool :=
  (_Contained.children (child := Element) m).length ≥ 1
```

## Where to write constraints

Definitions that come from the metamodel are fixed. Definitions you add go in the highlighted area, after those definitions and before `end Namespace`.
