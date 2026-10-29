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

**webgme-lean** is a WebGME application. The metamodel is the META of the project you have open. A plugin reads that META through the core and builds a constraint language server from it. Constraints written against those concepts are translated to Lean 4 for verification.

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

- **`app.js`**, **`config/`** - WebGME server
- **`src/plugins/GenerateConstraintLanguage/`** - Plugin that walks the open project's META and generates the constraint language server
- **`src/common/metaLanguage.js`** - META traversal and the language server built from it
- **`lean/`** - Lean 4 core library with model structures, graph operations, set theory, and verification tactics
- **`src/dsl/`** - Parser for the constraint language
- **`src/translator/`** - Translates parsed constraints to Lean code

## Quick Start

Projects are stored in the server process:

```bash
npm install
npm start
```

Open `http://localhost:8888`, create or open a project, and run **GenerateConstraintLanguage** from the plugin menu. The project is gone when the server stops.

The plugin loads the META nodes of that commit (`core.getAllMetaNodes`), including base, mixins, attributes, pointers, sets, and containment, and writes `constraint-language.json`. Concepts are stored by node path and guid, so a later rename can follow the same node. The language server used for completion, hover, and diagnostics is created from that snapshot each time the plugin runs.

The vocabulary of the constraint language — type names, attributes, pointers, sets — is whatever that project's META defines. See [Constraint Language](#constraint-language).

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
node->pointerName     // Follow pointer (use arrow to avoid ambiguity with attributes)
node[setName]         // Access set members
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

1. The editor lives in `src/visualizers/ConstraintEditor`
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

Constraints are stored as a **registry item** named `constraints` at the project root. The value is a JSON string, `{ "text", "scope" }`. `text` is the constraint dialect and `scope` is the concept it applies to, such as `StateChart`. `ROOT` is the default and means the whole project. A plain string from an older project is still read as the text, and the scope is taken from its `constraintset ... for` line.

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

1. The verifier lives in `src/plugins/VerificationPlugin`
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

See `examples/statechart/` for the worked example. The importable project is the `StateChart` seed at `src/seeds/StateChart/StateChart.webgmex`. Its META defines `StateChart`, `State`, `Init`, `End`, and `Transition` (`src` and `dst` point at `State`; `event` and `guard` are attributes of `Transition`). `StateChart` contains `Init`, `State`, and `Transition`.

- `src/seeds/StateChart/StateChart.webgmex` - WebGME seed project
- `metamodel.json` - the same vocabulary for the file-based tools
- `constraints.wgl` - domain constraints
- `turnstile.wgl`, `counter.wgl` - the constraint text for those two examples; the `.lean` files are the encoded programs
- `sample-model.json` - example model (Traffic Light)

### Sample Constraints

```
constraintset StatechartConstraints for StateChart

constraint UniqueStateNames [error]
forall s1 in State:
  forall s2 in State where s1.name == s2.name:
    s1 == s2

constraint InitialStateExists [error]
exists i in Init:
  true

constraint TransitionHasSource [error]
forall t in Transition:
  t.src != null
```

## Development

### Prerequisites

- Node.js >= 18
- [elan](https://lean-lang.org/install/) and Lean 4.12.0, pinned by `lean/lean-toolchain`

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

### Lean setup

Install [elan](https://lean-lang.org/install/). Open a new terminal afterward so `~/.elan/bin` is on `PATH`. `lake: command not found` means that directory is not on `PATH` yet.

The first command downloads the toolchain named in `lean/lean-toolchain` (Lean 4.12.0):

```bash
cd lean
lake update
lake build
```

Check a self-contained example from that same directory. A successful check prints nothing:

```bash
lake env lean ../examples/statechart/Turnstile.lean
lake env lean ../examples/statechart/Counter.lean
```

Details, including what a `theorem ... := rfl` establishes, are in [Checking examples](docs/checking-examples.md).

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
- **[Lean encoding](docs/lean-encoding.md)** — How a WebGME metamodel becomes the generated Lean program, including containment
- **[Checking examples](docs/checking-examples.md)** — How to run the `.lean` examples with Lean 4.12.0
- **[Incremental checking](docs/incremental-checking.md)** — Reuse Domain.olean when META/constraint defs are fixed
- **[Datalog incrementality](docs/datalog-incrementality.md)** — Model-delta checking via Differential Datalog; Lean as certifier
- **[DSL Reference](#constraint-language)** — Quick reference for the constraint language

## AI-Powered Constraint Authoring

webgme-lean now includes AI-powered features for natural language constraint authoring and explanation.

### Natural Language to Constraint Translation

Write constraints in plain English and get valid DSL code:

```typescript
import { NLConstraintTranslator } from 'webgme-lean';

const translator = new NLConstraintTranslator({
  domainDSL: myDomainDSL,
  llmProvider: myLLMProvider  // Optional: for advanced translation
});

// Template-based translation (no LLM required)
const result = translator.generateTemplate('Every state must have a unique name');
// Returns: constraint UniqueStateName [error]
//          forall s1 in State:
//            forall s2 in State where s1.name == s2.name:
//              s1 == s2

// LLM-based translation (requires LLM provider)
const advancedResult = await translator.translate(
  'All transitions from final states should be forbidden'
);
```

### Constraint Explanation

Get natural language explanations of existing constraints:

```typescript
import { ConstraintExplainer } from 'webgme-lean';

const explainer = new ConstraintExplainer({
  domainDSL: myDomainDSL
});

const explanation = await explainer.explainConstraintBlock(`
constraint SingleInitialState [error]
forall s1 in State where s1.isInitial == true:
  forall s2 in State where s2.isInitial == true:
    s1 == s2
`);

// Returns:
// {
//   summary: "Every state must have a unique name",
//   explanation: "No two states can share the same name attribute",
//   severity: "error",
//   examples: { valid: [...], invalid: [...] }
// }
```

### MCP Server for gmebot Integration

The MCP (Model Context Protocol) server exposes constraint tools for AI agents like gmebot:

```typescript
import { ConstraintMCPServer } from 'webgme-lean';

const server = new ConstraintMCPServer({
  metamodel: myMetamodel,
  llmProvider: myLLMProvider  // Optional
});

// Available tools:
// - translate_constraint: NL → DSL translation
// - explain_constraint: DSL → NL explanation
// - validate_constraint: Syntax validation
// - get_domain_info: Domain type information
// - get_constraint_syntax: Language reference
// - generate_constraint_template: Pattern-based templates
```

#### Using with gmebot

The MCP server can be mounted in a WebGME application to enable gmebot to:

1. Help users write constraints in natural language
2. Explain existing constraints 
3. Validate constraint syntax
4. Provide domain-aware suggestions

```typescript
// In your WebGME server setup
import { createMCPHandler } from 'webgme-lean';

const mcpHandler = createMCPHandler({
  metamodel: projectMetamodel,
  llmProvider: openaiProvider
});

// Expose as endpoint for gmebot
app.post('/api/constraints/mcp', mcpHandler.expressMiddleware());
```

### WebGME REST Router

For HTTP-based integration, use the constraint router:

```typescript
import { createConstraintRouter } from 'webgme-lean';

const router = createConstraintRouter({
  metamodel: myMetamodel,
  basePath: '/api/constraints'
});

// Available endpoints:
// POST /api/constraints/translate  - NL → DSL
// POST /api/constraints/explain    - DSL → NL
// POST /api/constraints/validate   - Validation
// GET  /api/constraints/domain     - Type info
// GET  /api/constraints/syntax     - Reference
// POST /api/constraints/mcp        - MCP JSON-RPC

// Mount in Express
app.use(router.middleware());

// Or get WebGME router config
const webgmeConfig = router.webgmeRouterConfig();
```

### Constraint Manager popups

The Constraint Manager toolbar holds the scope, the editor actions, and validation.

**Scope** lists ROOT and the concepts in the META. ROOT is the default and means the constraints apply across the whole project. Choosing one stores it in the constraints registry immediately and rewrites the first line, `constraintset … for …`. That line is always present and cannot be edited in the text.

**Cheat sheet** opens a panel on the right side of the window. It stays open while you edit, and its examples use the concepts of the current project.

**Explain** reads the constraint at the cursor and shows a sentence. The button stays disabled until the cursor is inside a constraint. That call does not use a model.

**Describe** opens a dialog. The description is sent to `POST /leanllm/translate`, which calls an OpenAI-compatible chat endpoint and can insert the constraint it returns. The button stays disabled until `GET /leanllm/status` can reach the configured model.

**Validate** checks that the constraint text parses and that every concept, attribute, pointer, and set it names exists in the META.

**Check with Lean** runs the `CheckWithLean` plugin. For ROOT it checks the project root. For any other scope it asks for a direct instance of that concept, shown as `name (/folder/instance)`. The plugin writes `lean/Generated/Domain.lean` (types and constraint defs) and `lean/Generated/Check.lean` (the instance and theorems), builds the domain module only when it changed, then runs `lake env lean` on the check module so Lake can reuse `Domain.olean`. Lean accepts the model when the check elaborates and each constraint theorem holds. See [Incremental checking](docs/incremental-checking.md). Both plugins are loaded when the WebGME server starts.

Point the endpoint at vLLM, llama.cpp, or Ollama in `config/config.default.js`:

```javascript
config.rest.components.leanllm.options = {
  llm: {
    backend: 'openai',
    baseUrl: 'http://127.0.0.1:8000/v1', // llama.cpp :8080, Ollama :11434
    model: 'served-model-name',
    apiKey: ''
  }
};
```

`baseUrl` is the `/v1` root. The router posts to `{baseUrl}/chat/completions`. `LLM_BACKEND`, `LLM_BASE_URL`, `LLM_MODEL`, and `LLM_API_KEY` override those fields when they are set. Those are the same names gmebot's router reads.

## Roadmap

- [x] Interactive constraint editor with syntax highlighting
- [x] AI-powered natural language constraint authoring
- [x] MCP server for gmebot integration
- [x] REST API for constraint services
- [ ] Lean proof automation for common patterns
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
