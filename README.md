# webgme-lean

**Lean-based formal verification for WebGME domain models**

This project provides a framework for formally verifying WebGME models using the [Lean 4](https://lean-lang.org/) theorem prover. It enables domain creators to define complex constraints in a high-level, domain-specific language that automatically translates to Lean for rigorous verification.

## Overview

WebGME is a powerful tool for creating domain-specific modeling languages. While WebGME provides basic metamodel constraints (cardinalities, type restrictions), many domains require more sophisticated constraints involving:

- Cross-cutting relationships between nodes
- Attribute value reasoning
- Structural patterns and invariants
- Set-theoretic properties
- Reachability and connectivity

**webgme-lean** bridges this gap by:

1. **Generating a domain-specific constraint language** from your WebGME metamodel
2. **Translating constraints** to Lean 4 code for formal verification
3. **Providing a WebGME plugin** for integrated model verification

## Architecture

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   WebGME        │     │   Constraint    │     │    Lean 4       │
│   Metamodel     │────▶│   DSL           │────▶│    Code         │
└─────────────────┘     └─────────────────┘     └─────────────────┘
                               │                        │
                               ▼                        ▼
                        ┌─────────────────┐     ┌─────────────────┐
                        │   Domain        │     │   Verification  │
                        │   Keywords      │     │   Results       │
                        └─────────────────┘     └─────────────────┘
```

### Components

- **`lean/`** - Lean 4 core library with model structures, graph operations, set theory, and verification tactics
- **`src/generator/`** - Generates domain-specific DSL from WebGME metamodel
- **`src/dsl/`** - Parser for the constraint language
- **`src/translator/`** - Translates parsed constraints to Lean code
- **`src/plugin/`** - WebGME plugin for integrated verification

## Quick Start

### Installation

```bash
npm install webgme-lean
```

### Basic Usage

1. **Define your metamodel** (or export from WebGME):

```json
{
  "name": "StatechartDomain",
  "rootType": "StateMachine",
  "nodes": [
    {
      "name": "State",
      "attributes": [
        { "name": "name", "type": "string" },
        { "name": "isInitial", "type": "boolean" }
      ],
      "pointers": [],
      "containments": []
    }
  ]
}
```

2. **Write constraints** using the generated DSL:

```
// constraints.wgl
constraintset StatechartConstraints for StateMachine

constraint UniqueStateNames [error]
// Each state must have a unique name
forall s1 in State:
  forall s2 in State where s1.name == s2.name:
    s1 == s2

constraint SingleInitialState [error]
// Exactly one state can be initial
forall s1 in State where s1.isInitial == true:
  forall s2 in State where s2.isInitial == true:
    s1 == s2
```

3. **Run verification**:

```bash
npm run verify -- metamodel.json constraints.wgl model.json
```

## Constraint Language

The constraint language is designed to be intuitive for domain experts while being powerful enough for formal verification.

### Quantifiers

```
forall <variable> in <Type> [where <condition>]: <body>
exists <variable> in <Type> [where <condition>]: <body>
```

**Examples:**
```
// All states have names
forall s in State: s.name != ""

// There exists an initial state
exists s in State: s.isInitial == true

// All active elements satisfy a condition
forall e in Element where e.active == true: e.value > 0
```

### Operators

| Operator | Description |
|----------|-------------|
| `and`, `or` | Logical conjunction/disjunction |
| `not` | Logical negation |
| `implies` | Logical implication |
| `==`, `!=` | Equality/inequality |
| `<`, `<=`, `>`, `>=` | Comparisons |
| `in` | Membership |

### Functions

| Function | Description |
|----------|-------------|
| `count(collection)` | Number of elements |
| `isEmpty(collection)` | Check if empty |
| `all(collection, predicate)` | Universal quantification |
| `any(collection, predicate)` | Existential quantification |
| `unique(collection, attr)` | Attribute uniqueness |
| `reachable(source, target)` | Graph reachability |

### Navigation

```
node.attributeName    // Access attribute
node.pointerName      // Follow pointer
node.setName          // Access set members
node.children         // Get child nodes
node.parent           // Get parent node
node.siblings         // Get sibling nodes
```

## Lean Core Library

The `lean/` directory contains a Lean 4 library for model verification:

### WebGMELean.Core.Model
Core data structures for representing WebGME models:
- `NodeId` - Unique node identifier
- `AttrValue` - Attribute value type
- `Node` - Node with attributes, pointers, sets
- `Model` - Complete model structure

### WebGMELean.Core.Graph
Graph operations for model analysis:
- Edge extraction
- Reachability computation
- Ancestor/descendant relationships
- Cycle detection

### WebGMELean.Core.Set
Set-theoretic operations:
- Union, intersection, difference
- Subset checks
- Filtering and counting
- Uniqueness predicates

### WebGMELean.Core.Cardinality
Cardinality constraints:
- Min/max bounds
- Multiplicity checking
- Uniqueness validation

## CLI Tools

### Generate DSL

Generate domain-specific language from metamodel:

```bash
npm run generate-dsl -- metamodel.json [output-dir]
```

Produces:
- `Domain.lean` - Lean type definitions
- `DSL.md` - Language documentation
- `dsl.json` - DSL specification

### Translate Constraints

Translate constraints to Lean:

```bash
npm run translate -- constraints.wgl metamodel.json [output-dir]
```

### Verify Model

Full verification pipeline:

```bash
npm run verify -- metamodel.json constraints.wgl model.json [options]

Options:
  --output <dir>    Output directory (default: ./generated)
  --lean <path>     Path to lean executable
  --verbose         Verbose output
  --json            Output report as JSON
```

## Constraint Editor Visualizer

The project includes a full-featured WebGME visualizer with Monaco Editor (VS Code's editor component) for writing constraints.

### Features

- **Syntax Highlighting** - Domain-aware highlighting for keywords, types, and operators
- **Autocompletion** - Context-aware suggestions including:
  - Domain types from your metamodel
  - Attribute and pointer names
  - Built-in functions and keywords
- **Real-time Validation** - Instant error checking as you type
- **Hover Documentation** - Hover over types and keywords for documentation
- **Auto-save** - Constraints are automatically saved to the registry

### Installation

1. Copy `src/visualizer/ConstraintEditor` to your WebGME project's `src/visualizers/`
2. Install Monaco Editor:
   ```bash
   npm install monaco-editor
   ```
3. Register the visualizer in your WebGME config:
   ```javascript
   {
     "visualization": {
       "visualizerDescriptors": ["./src/visualizers/ConstraintEditor/ConstraintEditor.json"]
     }
   }
   ```

### Storage

Constraints are stored as a **registry item** named `constraints` at the project root (or FCO). This allows:
- Persistence across sessions
- Version control with the model
- Easy export/import

### Screenshot

The editor provides a VS Code-like experience:
```
┌─────────────────────────────────────────────────────────────┐
│ Constraint Editor          [Save] [Format] [Verify]         │
├─────────────────────────────────────────────────────────────┤
│  1 │ // Domain Constraints                                  │
│  2 │ constraintset StatechartConstraints for StateMachine   │
│  3 │                                                        │
│  4 │ constraint UniqueStateNames [error]                    │
│  5 │ // Each state must have a unique name                  │
│  6 │ forall s1 in State:                                    │
│  7 │   forall s2 in State where s1.name == s2.name:         │
│  8 │     s1 == s2                                           │
├─────────────────────────────────────────────────────────────┤
│ No issues                                                   │
└─────────────────────────────────────────────────────────────┘
```

## WebGME Plugin

### Installation

1. Copy `src/plugin/VerificationPlugin` to your WebGME project's `src/plugins/`
2. Add to your WebGME configuration:

```javascript
{
  "plugin": {
    "allowServerExecution": true,
    "basePaths": ["src/plugins"]
  }
}
```

### Usage

```javascript
const VerificationPlugin = require('webgme-lean').VerificationPlugin;

// In your plugin
const verifier = new VerificationPlugin({
  constraintsPath: './constraints',
  leanPath: '/usr/bin/lean',
  outputPath: './generated'
});

await verifier.initialize(core, rootNode);
const report = await verifier.verify('constraints.wgl');

if (report.summary.failed > 0) {
  // Handle verification failures
}
```

## Example: Statechart Domain

See `examples/statechart/` for a complete example:

- `metamodel.json` - Statechart metamodel definition
- `constraints.wgl` - Domain constraints
- `sample-model.json` - Example model (Traffic Light)

### Sample Constraints

```
constraintset StatechartConstraints for StateMachine

constraint UniqueStateNames [error]
// Each state must have a unique name within its parent
forall s1 in State:
  forall s2 in State where s1.name == s2.name:
    s1 == s2

constraint InitialStateExists [error]
// Every state machine must have exactly one initial state
exists s in State where s.isInitial == true:
  true

constraint FinalStateNoOutgoing [warning]
// Final states should not have outgoing transitions
forall t in Transition:
  forall s in State where s.isFinal == true:
    t.source != s
```

## Development

### Prerequisites

- Node.js >= 18
- Lean 4 (for verification)

### Setup

```bash
git clone https://github.com/your-org/webgme-lean.git
cd webgme-lean
npm install
```

### Build

```bash
npm run build
```

### Test

```bash
npm test
```

### Lean Setup

```bash
cd lean
lake build
```

## API Reference

### Generator

```typescript
import { generateDomainDSL, generateLeanTypes } from 'webgme-lean';

const dsl = generateDomainDSL(metamodel);
const leanCode = generateLeanTypes(dsl);
```

### Parser

```typescript
import { parseConstraint } from 'webgme-lean';

const ast = parseConstraint('forall s in State: s.name != ""');
```

### Translator

```typescript
import { translateConstraintSet } from 'webgme-lean';

const leanCode = translateConstraintSet(constraintSet, domainDSL);
```

## Documentation

- **[Constraint Tutorial](docs/constraint-tutorial.md)** — Complete guide to writing constraints with examples
- **[DSL Reference](#constraint-language)** — Quick reference for the constraint language

## Roadmap

- [ ] Interactive constraint editor with syntax highlighting
- [ ] Lean proof automation for common patterns
- [ ] Integration with WebGME constraint UI
- [ ] Support for temporal constraints
- [ ] Model repair suggestions

## Contributing

Contributions are welcome! Please read our contributing guidelines and submit pull requests.

## License

MIT License - see LICENSE file for details.

## Acknowledgments

- [WebGME](https://webgme.org/) - Web-based Generic Modeling Environment
- [Lean 4](https://lean-lang.org/) - Theorem prover and programming language
- [Chevrotain](https://chevrotain.io/) - Parser building toolkit
