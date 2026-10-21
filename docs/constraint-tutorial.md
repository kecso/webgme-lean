# Writing Domain Constraints: A Complete Tutorial

This tutorial teaches you how to write formal constraints for your WebGME domain models using the webgme-lean constraint language. We'll use a **Statechart** domain as our running example.

## Table of Contents

1. [Getting Started](#getting-started)
2. [Constraint Structure](#constraint-structure)
3. [Quantifiers: forall and exists](#quantifiers-forall-and-exists)
4. [Logical Operators](#logical-operators)
5. [Comparison Operators](#comparison-operators)
6. [Navigation: Accessing Properties](#navigation-accessing-properties)
7. [Built-in Functions](#built-in-functions)
8. [Common Patterns](#common-patterns)
9. [Complete Reference](#complete-reference)

---

## Getting Started

### The Statechart Domain

Our example domain models state machines with:

| Type | Attributes | Pointers |
|------|------------|----------|
| **StateMachine** | `name` | `initialState` → State |
| **State** | `name`, `isInitial`, `isFinal` | — |
| **Transition** | `event`, `guard` | `source` → State, `target` → State |

### Your First Constraint

```
constraintset StatechartConstraints for StateMachine

constraint AllStatesHaveNames [error]
// Every state must have a non-empty name
forall s in State: s.name != ""
```

This constraint says: "For every State `s` in the model, the `name` attribute must not be empty."

---

## Constraint Structure

Every constraint file follows this structure:

```
constraintset <Name> for <ModelRootType>

constraint <ConstraintName> [severity]
// Optional description comment
<expression>
```

### Understanding Scope: The `for` Clause

The `for <ModelRootType>` clause is crucial—it defines what constitutes a **model instance**.

**The Problem:** A WebGME project might contain:
- The language definition (metamodel)
- Multiple model instances (e.g., `TrafficLightStatechart`, `ElevatorStatechart`)

When you write `forall s in State`, which States do you mean?

**The Solution:** The `for` clause scopes all type references:

```
constraintset StatechartConstraints for StateMachine
```

This means:
1. Find all `StateMachine` instances in the project
2. For each `StateMachine`, evaluate constraints where `State` means "States within THIS StateMachine"
3. Report violations per model instance

**Example:**
```
Project
├── TrafficLightStatechart (StateMachine)
│   ├── Red (State)
│   ├── Yellow (State)
│   └── Green (State)
└── ElevatorStatechart (StateMachine)
    ├── Idle (State)
    ├── MovingUp (State)
    └── MovingDown (State)
```

With constraints scoped `for StateMachine`:
- `forall s in State` in `TrafficLightStatechart` → checks Red, Yellow, Green
- `forall s in State` in `ElevatorStatechart` → checks Idle, MovingUp, MovingDown

Each model instance is verified independently!

### Severity Levels

| Severity | When to Use |
|----------|-------------|
| `[error]` | Critical violations that make the model invalid |
| `[warning]` | Best practice violations, model still valid |
| `[info]` | Informational checks, suggestions |

**Example:**
```
constraint MustHaveInitialState [error]
// Critical: every state machine needs a starting point
exists s in State: s.isInitial == true

constraint AvoidDeadStates [warning]
// Best practice: states should be reachable
forall s in State: !isEmpty(s.incomingTransitions) or s.isInitial == true
```

---

## Quantifiers: forall and exists

The language provides two quantifiers for making statements about collections of nodes.

### Universal Quantifier: `forall`

**Syntax:** `forall <variable> in <Type> [where <condition>]: <body>`

States that something must be true for **every** element.

```
// Every state has a name
forall s in State: s.name != ""

// Every non-final state has at least one outgoing transition
forall s in State where s.isFinal == false:
  !isEmpty(s.outgoingTransitions)
```

### Existential Quantifier: `exists`

**Syntax:** `exists <variable> in <Type> [where <condition>]: <body>`

States that something must be true for **at least one** element.

```
// There exists an initial state
exists s in State: s.isInitial == true

// There exists a final state (if we require one)
exists s in State: s.isFinal == true

// There exists a state that is reachable from initial
exists target in State:
  exists initial in State where initial.isInitial == true:
    reachable(initial, target)
```

### The `where` Clause (Filtering)

Both quantifiers support an optional `where` clause to filter which elements are considered:

```
// All initial states are not final
forall s in State where s.isInitial == true:
  s.isFinal == false

// There exists a non-initial state with no incoming transitions (orphan)
exists s in State where s.isInitial == false:
  isEmpty(s.incomingTransitions)
```

### Combining Quantifiers

You can nest quantifiers to express complex relationships:

```
// No two states share the same name (uniqueness)
forall s1 in State:
  forall s2 in State where s1.name == s2.name:
    s1 == s2

// Every state is reachable from some initial state
forall target in State:
  exists initial in State where initial.isInitial == true:
    reachable(initial, target) or initial == target

// For every transition, there exists a valid source state
forall t in Transition:
  exists s in State: t->source == s
```

### Expressing "Exactly One" with Quantifiers

```
// Exactly one initial state
exists initial in State where initial.isInitial == true:
  forall other in State where other.isInitial == true:
    initial == other
```

This reads: "There exists an initial state, and for all states marked initial, they must be the same one."

### Expressing "At Most One" with Quantifiers

```
// At most one initial state (zero or one)
forall s1 in State where s1.isInitial == true:
  forall s2 in State where s2.isInitial == true:
    s1 == s2
```

---

## Logical Operators

| Operator | Meaning | Example |
|----------|---------|---------|
| `and` | Both must be true | `a and b` |
| `or` | At least one must be true | `a or b` |
| `not` or `!` | Negation | `not a` or `!a` |
| `implies` | If-then (implication) | `a implies b` |

### Negation with `not` (or `!`)

The negation operator inverts a boolean expression. Both `not` and `!` work:

```
// These are equivalent:
not s.isInitial
!s.isInitial

// Negate complex expressions with parentheses:
not (a and b)
!(a or b)
```

### Examples

```
// A state cannot be both initial and final
forall s in State:
  not (s.isInitial == true and s.isFinal == true)

// Using ! syntax
forall s in State:
  !(s.isInitial and s.isFinal)

// Equivalent using implies:
forall s in State:
  s.isInitial == true implies s.isFinal == false

// A transition must have both source and target set
forall t in Transition:
  t->source != null and t->target != null

// Either the state is initial, or it has incoming transitions
forall s in State:
  s.isInitial == true or !isEmpty(s.incomingTransitions)
```

### Understanding `implies`

`A implies B` means "if A is true, then B must be true."

| A | B | A implies B |
|---|---|-------------|
| true | true | true |
| true | false | **false** |
| false | true | true |
| false | false | true |

**Key insight:** When A is false, the implication is always true (vacuously true).

```
// If a state is final, it should have no outgoing transitions
forall s in State:
  s.isFinal == true implies isEmpty(s.outgoingTransitions)

// If a transition has a guard, it must also have an event
forall t in Transition:
  t.guard != "" implies t.event != ""
```

---

## Comparison Operators

| Operator | Meaning |
|----------|---------|
| `==` | Equal to |
| `!=` | Not equal to |
| `<` | Less than |
| `<=` | Less than or equal |
| `>` | Greater than |
| `>=` | Greater than or equal |
| `in` | Membership in collection |

### Examples

```
// String comparison
s.name == "Start"
s.name != ""

// Boolean comparison
s.isInitial == true
s.isFinal == false

// Numeric comparison (if you have numeric attributes)
s.priority > 0
s.timeout <= 1000
s.retryCount >= 1 and s.retryCount <= 5

// Null checks
t->source != null
t.guard == null

// Membership
s in someCollection
```

---

## Navigation: Accessing Properties

WebGME nodes have three types of properties, each with distinct syntax:

| Type | Syntax | Returns |
|------|--------|---------|
| Attribute | `node.attrName` | Value (string, int, bool, etc.) |
| Pointer | `node->ptrName` | Referenced node (or null) |
| Set | `node[setName]` | Collection of nodes |

### Attributes (dot `.`)

Access attribute values:

```
node.attributeName

// Examples
s.name            // string attribute
s.isInitial       // boolean attribute
t.event           // string attribute
t.guard           // string attribute
```

### Pointers (arrow `->`)

Follow pointer references to other nodes:

```
node->pointerName

// Examples
t->source          // The source state of a transition
t->target          // The target state of a transition
sm->initialState   // The initial state of a state machine

// Null checks
t->source != null  // Pointer is set
t->target == null  // Pointer is not set
```

### Sets (brackets `[]`)

Access set members (collections):

```
node[setName]

// Examples - if State had a set called "tags"
count(s[tags])
isEmpty(s[tags])

// With inverse navigation
isEmpty(pointingTo(s, Transition, "source"))  // outgoing transitions
```

### Why Different Syntax?

Names can collide! A node might have:
- An attribute named `target`
- A pointer named `target`
- A set named `target`

Distinct syntax prevents ambiguity:
```
node.target     // the attribute
node->target    // the pointer
node[target]    // the set
```

### Structural Navigation

| Expression | Description |
|------------|-------------|
| `node.children` | All direct child nodes |
| `node.parent` | The parent node |
| `node.siblings` | Nodes with the same parent |

```
// Every state machine contains at least one state
forall sm in StateMachine:
  !isEmpty(sm.children)

// States must be inside a state machine
forall s in State:
  s.parent != null
```

---

## Built-in Functions

### Collection Functions

#### `count(collection)` — Count elements

```
// At least 2 states required
count(State) >= 2

// No more than 10 transitions from a single state
forall s in State:
  count(s.outgoingTransitions) <= 10

// isEmpty can be expressed with count
count(collection) == 0  // same as isEmpty(collection)
```

#### `isEmpty(collection)` — Check if empty

```
// Initial state has no incoming transitions
forall s in State where s.isInitial == true:
  isEmpty(s.incomingTransitions)

// For non-empty, use negation: !isEmpty(x) or not isEmpty(x)
forall s in State where s.isFinal == false:
  !isEmpty(s.outgoingTransitions)
```

### Quantifier Functions

#### `all(collection, predicate)` — All elements satisfy predicate

```
// All children are states
all(sm.children, isState)
```

#### `any(collection, predicate)` — Some element satisfies predicate

```
// At least one child is a final state
any(sm.children, isFinal)
```

### Uniqueness Function

#### `unique(collection, attribute)` — Attribute values are unique

```
// All states have unique names
unique(State, "name")

// All transitions have unique events (within same source)
forall s in State:
  unique(s.outgoingTransitions, "event")
```

### Graph Functions

Reachability depends on your domain's connectivity pattern. We provide domain-aware functions:

#### `reachableVia(source, target, ConnectionType, "srcPtr", "dstPtr")` — Via edge objects

Use when connectivity is through explicit connection objects (like Transitions).

```
// Reachability in a Statechart (via Transition objects)
// Transition has 'source' and 'target' pointers
forall target in State:
  exists initial in State where initial.isInitial == true:
    reachableVia(initial, target, Transition, "source", "target") or initial == target
```

#### `reachableBy(source, target, "pointerName")` — Via direct pointer chains

Use when nodes point directly to each other (like a linked list).

```
// Reachability in a linked list (via 'next' pointer)
forall node in ListNode:
  reachableBy(head, node, "next") or node == head

// Tree traversal via 'parent' pointer
forall child in TreeNode:
  reachableBy(child, root, "parent") or child == root
```

#### `connected(a, b, "pointerName")` — Direct connection check

Check if one node directly points to another.

```
// Check if transition goes from A to B
connected(t->source, t->target, "next")

// Check direct parent relationship
connected(child, parent, "parent")
```

#### `pointingTo(node, Type, "ptrName")` — Inverse navigation

Find all nodes of a type where a pointer points TO a given node. Returns a collection.

This is essential for "reverse" relationships. For example, a State doesn't have an `outgoingTransitions` attribute, but we can find transitions pointing FROM a state:

```
// Find all Transitions where 'source' pointer points to state s
pointingTo(s, Transition, "source")  // returns list of outgoing transitions

// Find all Transitions where 'target' pointer points to state s  
pointingTo(s, Transition, "target")  // returns list of incoming transitions

// Use with isEmpty/count
!isEmpty(pointingTo(s, Transition, "source"))  // has outgoing transitions?
count(pointingTo(s, Transition, "target")) >= 2  // at least 2 incoming?
```

**Why domain-specific?** Different domains have different connectivity patterns:

| Domain | Pattern | Function to Use |
|--------|---------|-----------------|
| Statechart | Transition objects with src/dst | `reachableVia(a, b, Transition, "source", "target")` |
| Linked List | Direct `next` pointer | `reachableBy(a, b, "next")` |
| Tree | Direct `parent` pointer | `reachableBy(a, b, "parent")` |
| Workflow | Flow objects with from/to | `reachableVia(a, b, Flow, "from", "to")` |

---

## User-Defined Functions

You can define reusable helper functions to simplify your constraints and create domain-specific abstractions.

### Syntax

```
define functionName(param1, param2) = expression
```

### Example: Domain-Specific Reachability

Instead of writing the verbose `reachableVia` call everywhere, define a simpler function:

```
constraintset StatechartConstraints for StateMachine

// Define a domain-specific reachability function
define reachable(src, dst) = 
  reachableVia(src, dst, Transition, "source", "target")

// Now use the simpler syntax in constraints
constraint AllStatesReachable [error]
forall target in State:
  exists initial in State where initial.isInitial == true:
    reachable(initial, target) or initial == target
```

### Example: Custom Predicates

```
constraintset StatechartConstraints for StateMachine

// Use pointingTo for inverse navigation (State doesn't have transition attributes!)
// Outgoing transitions = Transitions where 'source' points to this state
define outgoing(s) = pointingTo(s, Transition, "source")

// Incoming transitions = Transitions where 'target' points to this state
define incoming(s) = pointingTo(s, Transition, "target")

// Check if a state is a "dead end" (final with no outgoing)
define isDeadEnd(s) = s.isFinal and isEmpty(outgoing(s))

// Check if a state is "isolated" (no connections at all)
define isIsolated(s) = isEmpty(incoming(s)) and isEmpty(outgoing(s))

// Use in constraints
constraint NoIsolatedNonInitialStates [error]
forall s in State where !s.isInitial:
  !isIsolated(s)
```

### Example: Linked List Helpers

```
constraintset LinkedListConstraints for List

// Define pointer-based reachability for this domain
define reaches(a, b) = reachableBy(a, b, "next")

// Check if node is the tail (points to nothing)
define isTail(n) = n.next == null

constraint AllNodesReachableFromHead [error]
forall node in ListNode:
  reaches(head, node) or node == head
```

### Benefits of User-Defined Functions

1. **Readability**: `reachable(a, b)` is clearer than `reachableVia(a, b, Transition, "source", "target")`
2. **Reusability**: Define once, use in multiple constraints
3. **Domain vocabulary**: Use terms that match your domain
4. **Maintenance**: Change the definition in one place

## Common Patterns

### Pattern 1: Uniqueness

**Ensure attribute values are unique across nodes:**

```
// Using unique function
constraint UniqueStateNames [error]
unique(State, "name")

// Using nested forall (equivalent)
constraint UniqueStateNames [error]
forall s1 in State:
  forall s2 in State where s1.name == s2.name:
    s1 == s2
```

### Pattern 2: Exactly One

**Ensure exactly one node satisfies a condition:**

```
constraint ExactlyOneInitialState [error]
// There exists one, and all that match are the same
exists initial in State where initial.isInitial == true:
  forall other in State where other.isInitial == true:
    initial == other
```

### Pattern 3: At Least One

**Ensure at least one node exists or satisfies a condition:**

```
constraint AtLeastOneState [error]
exists s in State: true

constraint AtLeastOneFinalState [error]
exists s in State: s.isFinal == true
```

### Pattern 4: At Most One

**Ensure zero or one nodes satisfy a condition:**

```
constraint AtMostOneInitialState [error]
forall s1 in State where s1.isInitial == true:
  forall s2 in State where s2.isInitial == true:
    s1 == s2
```

### Pattern 5: Required References

**Ensure pointers are set:**

```
constraint TransitionsHaveEndpoints [error]
forall t in Transition:
  t->source != null and t->target != null
```

### Pattern 6: Type Constraints on Pointers

**Ensure pointers reference the correct types:**

```
// The initialState must actually be marked as initial
constraint InitialStateIsValid [error]
forall sm in StateMachine:
  sm->initialState != null implies sm->initialState.isInitial == true
```

### Pattern 7: No Cycles (for certain structures)

**Detect unwanted self-references:**

```
// No self-loops on initial states
constraint NoSelfLoopOnInitial [warning]
forall t in Transition:
  forall s in State where s.isInitial == true:
    not (t->source == s and t->target == s)
```

### Pattern 8: Conditional Requirements

**If-then rules:**

```
// If a state is final, it cannot be initial
constraint FinalNotInitial [error]
forall s in State:
  s.isFinal == true implies s.isInitial == false

// If a state has no outgoing transitions, it must be final
constraint DeadEndsMustBeFinal [warning]
forall s in State:
  isEmpty(s.outgoingTransitions) implies s.isFinal == true
```

### Pattern 9: Cardinality Constraints

**Min/max counts:**

```
// Between 2 and 20 states
constraint StateCount [error]
count(State) >= 2 and count(State) <= 20

// Each state has at most 5 outgoing transitions
constraint MaxTransitions [warning]
forall s in State:
  count(s.outgoingTransitions) <= 5
```

### Pattern 10: Bidirectional Consistency

**Ensure symmetric relationships are consistent:**

```
// If t goes from A to B, then B should be reachable from A
forall t in Transition:
  t->source != null and t->target != null implies
    reachable(t->source, t->target)
```

---

## Complete Reference

### Constraint Syntax

```
constraintset <Name> for <ModelRootType>

// Optional: define helper functions
define functionName(params) = expression

constraint <Name> [error|warning|info]
// Description
<expression>
```

### Scoping Rules

| Element | Scope |
|---------|-------|
| `constraintset X for Y` | `Y` is the model root type; constraints apply per `Y` instance |
| `forall x in Type` | `Type` refers to descendants of current model root |
| `exists x in Type` | `Type` refers to descendants of current model root |
| `count(Type)` | Counts instances within current model root |

**Key insight:** All type references are automatically scoped to the current model instance. You never need to manually filter "States in this StateMachine"—that's implicit.

### Expressions

| Expression | Description |
|------------|-------------|
| `forall x in Type: expr` | Universal quantification |
| `forall x in Type where cond: expr` | Filtered universal |
| `exists x in Type: expr` | Existential quantification |
| `exists x in Type where cond: expr` | Filtered existential |
| `a and b` | Logical AND |
| `a or b` | Logical OR |
| `not a` | Logical NOT |
| `a implies b` | Logical implication |
| `a == b` | Equality |
| `a != b` | Inequality |
| `a < b`, `a <= b`, `a > b`, `a >= b` | Comparisons |
| `x in collection` | Membership |
| `node.attr` | Attribute access (values) |
| `node->ptr` | Pointer access (references) |
| `node[set]` | Set access (collections) |
| `node.children` | Child nodes |
| `node.parent` | Parent node |
| `node.siblings` | Sibling nodes |

### Functions

| Function | Description |
|----------|-------------|
| `count(collection)` | Number of elements |
| `isEmpty(collection)` | True if no elements (use `!isEmpty` for non-empty) |
| `all(collection, pred)` | All satisfy predicate |
| `any(collection, pred)` | Some satisfy predicate |
| `unique(collection, attr)` | Attribute values unique |
| `reachableVia(src, tgt, Type, "srcPtr", "dstPtr")` | Path via edge objects |
| `reachableBy(src, tgt, "ptr")` | Path via pointer chain |
| `connected(a, b, "ptr")` | Direct connection check |
| `pointingTo(node, Type, "ptr")` | Inverse navigation (find nodes pointing to) |
| `userDefined(args)` | Call user-defined function |

### Literals

| Literal | Example |
|---------|---------|
| Boolean | `true`, `false` |
| String | `"hello"`, `'world'` |
| Integer | `42`, `-1`, `0` |
| Float | `3.14`, `-0.5` |
| Null | `null` |

---

## Tips and Best Practices

1. **Start simple** — Write basic constraints first, then add complexity
2. **Use meaningful names** — `UniqueStateNames` is better than `Constraint1`
3. **Add descriptions** — Comments help others understand intent
4. **Choose the right severity** — Reserve `[error]` for true violations
5. **Test incrementally** — Verify each constraint works before adding more
6. **Use `where` for filtering** — It's cleaner than `implies` for simple cases
7. **Combine quantifiers carefully** — Nested quantifiers can be expensive on large models

---

## Example: Complete Statechart Constraints

```
// Complete Statechart Domain Constraints
// Ensures well-formed state machine models

constraintset StatechartConstraints for StateMachine

//=============================================================================
// STRUCTURAL CONSTRAINTS
//=============================================================================

constraint UniqueStateNames [error]
// Each state must have a unique name within the state machine
forall s1 in State:
  forall s2 in State where s1.name == s2.name:
    s1 == s2

constraint StatesHaveNames [error]
// Every state must have a non-empty name
forall s in State: s.name != ""

constraint TransitionsHaveEndpoints [error]
// Every transition must have both source and target
forall t in Transition:
  t->source != null and t->target != null

//=============================================================================
// INITIAL STATE CONSTRAINTS
//=============================================================================

constraint InitialStateExists [error]
// There must be exactly one initial state
exists s in State where s.isInitial == true:
  forall other in State where other.isInitial == true:
    s == other

constraint InitialStateNotFinal [error]
// The initial state cannot also be a final state
forall s in State:
  s.isInitial == true implies s.isFinal == false

constraint InitialStateNoIncoming [warning]
// Initial states typically have no incoming transitions
forall s in State where s.isInitial == true:
  isEmpty(s.incomingTransitions)

//=============================================================================
// FINAL STATE CONSTRAINTS
//=============================================================================

constraint FinalStateNoOutgoing [warning]
// Final states should not have outgoing transitions
forall s in State where s.isFinal == true:
  isEmpty(s.outgoingTransitions)

constraint FinalStateExists [info]
// It's recommended to have at least one final state
exists s in State: s.isFinal == true

//=============================================================================
// REACHABILITY CONSTRAINTS
//=============================================================================

constraint AllStatesReachable [error]
// Every state must be reachable from the initial state
// Uses reachableVia because connectivity is through Transition objects
forall target in State:
  exists initial in State where initial.isInitial == true:
    reachableVia(initial, target, Transition, "source", "target") or initial == target

constraint FinalStatesReachable [error]
// All final states must be reachable
forall final in State where final.isFinal == true:
  exists initial in State where initial.isInitial == true:
    reachableVia(initial, final, Transition, "source", "target")

//=============================================================================
// TRANSITION CONSTRAINTS
//=============================================================================

constraint NoDuplicateTransitions [warning]
// Avoid duplicate transitions (same source, target, and event)
forall t1 in Transition:
  forall t2 in Transition:
    (t1.source == t2.source and t1.target == t2.target and t1.event == t2.event)
      implies t1 == t2

constraint GuardsRequireEvents [info]
// If a transition has a guard, it should also have an event
forall t in Transition:
  t.guard != "" implies t.event != ""

//=============================================================================
// CARDINALITY CONSTRAINTS
//=============================================================================

constraint MinimumStates [error]
// A state machine must have at least 2 states
count(State) >= 2

constraint MaxTransitionsPerState [warning]
// Avoid overly complex states
forall s in State:
  count(s.outgoingTransitions) <= 10
```

This comprehensive constraint set ensures statechart models are well-formed, reachable, and follow best practices!
