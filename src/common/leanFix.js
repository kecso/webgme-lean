define([], function () {
"use strict";
var WebGMELeanFix = (() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

  // src/generator/leanFix.ts
  var leanFix_exports = {};
  __export(leanFix_exports, {
    generateDomainDSL: () => generateDomainDSL,
    generateLeanTypes: () => generateLeanTypes
  });

  // src/generator/dsl-generator.ts
  function generateDomainDSL(metamodel) {
    const keywords = [];
    const typeDefinitions = [];
    const validationRules = [];
    const leanImports = [
      "WebGMELean.Core",
      "WebGMELean.Tactics"
    ];
    for (const node of metamodel.nodes) {
      keywords.push(node.name);
      const typeDef = generateTypeDefinition(node);
      typeDefinitions.push(typeDef);
      const rules = generateValidationRules(node);
      validationRules.push(...rules);
    }
    return {
      name: metamodel.name,
      mainType: metamodel.rootType,
      keywords,
      typeDefinitions,
      validationRules,
      leanImports
    };
  }
  function mapAttributeType(attrType) {
    switch (attrType) {
      case "string":
      case "asset":
        return { type: "string", leanType: "String" };
      case "integer":
        return { type: "int", leanType: "Int" };
      case "float":
        return { type: "float", leanType: "Float" };
      case "boolean":
        return { type: "bool", leanType: "Bool" };
      default:
        return { type: "string", leanType: "String" };
    }
  }
  function generateTypeDefinition(node) {
    return {
      name: node.name,
      baseType: node.baseType,
      mixins: node.mixins || [],
      childMin: node.childMin ?? null,
      childMax: node.childMax ?? null,
      attributes: node.attributes.map((attr) => {
        const { type, leanType } = mapAttributeType(attr.type);
        return {
          name: attr.name,
          type,
          leanType
        };
      }),
      pointers: node.pointers.map((ptr) => ({
        name: ptr.name,
        targetTypes: ptr.targetTypes,
        optional: ptr.min === 0
      })),
      sets: node.sets.map((set) => ({
        name: set.name,
        memberTypes: set.memberTypes,
        min: set.min,
        max: set.max,
        members: set.members || []
      })),
      containments: node.containments.map((cont) => ({
        childType: cont.childType,
        min: cont.min,
        max: cont.max
      }))
    };
  }
  function generateValidationRules(node) {
    const rules = [];
    for (const ptr of node.pointers) {
      if (ptr.min > 0) {
        rules.push({
          description: `${node.name}.${ptr.name} must be set`,
          leanPredicate: `fun (n : Node) => n.metaType == "${node.name}" \u2192 Connectivity.hasPointer n "${ptr.name}"`
        });
      }
      if (ptr.targetTypes.length > 0) {
        const typeCheck = ptr.targetTypes.map((t) => `target.metaType == "${t}"`).join(" \u2228 ");
        rules.push({
          description: `${node.name}.${ptr.name} must point to ${ptr.targetTypes.join(" or ")}`,
          leanPredicate: `fun (m : Model) (n : Node) => n.metaType == "${node.name}" \u2192 
          match n.getPointer "${ptr.name}" with
          | none => true
          | some targetId => match m.getNode targetId with
            | none => false
            | some target => ${typeCheck}`
        });
      }
    }
    for (const cont of node.containments) {
      if (cont.min > 0) {
        rules.push({
          description: `${node.name} must contain at least ${cont.min} ${cont.childType}`,
          leanPredicate: `fun (m : Model) (n : Node) => n.metaType == "${node.name}" \u2192 
          Connectivity.countChildrenOfType m n "${cont.childType}" \u2265 ${cont.min}`
        });
      }
      if (cont.max !== null) {
        rules.push({
          description: `${node.name} must contain at most ${cont.max} ${cont.childType}`,
          leanPredicate: `fun (m : Model) (n : Node) => n.metaType == "${node.name}" \u2192 
          Connectivity.countChildrenOfType m n "${cont.childType}" \u2264 ${cont.max}`
        });
      }
    }
    return rules;
  }
  var LEAN_KEYWORDS = /* @__PURE__ */ new Set([
    "end",
    "by",
    "from",
    "if",
    "then",
    "else",
    "true",
    "false",
    "structure",
    "def",
    "where",
    "class",
    "instance",
    "import",
    "namespace",
    "inductive",
    "theorem",
    "abbrev",
    "axiom",
    "fun",
    "forall",
    "exists",
    "let",
    "in",
    "match",
    "with",
    "do"
  ]);
  function leanIdent(name) {
    const cleaned = name.replace(/[^A-Za-z0-9_]/g, "_");
    if (!cleaned || /^[0-9]/.test(cleaned) || LEAN_KEYWORDS.has(cleaned)) {
      return `\xAB${cleaned || "x"}\xBB`;
    }
    return cleaned;
  }
  function ctorIdent(name) {
    return leanIdent(`c${name}`);
  }
  function techType(name) {
    return `_${name}`;
  }
  function reaches(start, goal, adjacent) {
    if (start === goal) {
      return true;
    }
    const seen = /* @__PURE__ */ new Set([start]);
    const stack = [...adjacent.get(start) || []];
    while (stack.length > 0) {
      const next = stack.pop();
      if (next === goal) {
        return true;
      }
      if (seen.has(next)) {
        continue;
      }
      seen.add(next);
      for (const further of adjacent.get(next) || []) {
        stack.push(further);
      }
    }
    return false;
  }
  function generateLeanTypes(dsl) {
    const types = dsl.typeDefinitions;
    const adjacent = /* @__PURE__ */ new Map();
    for (const type of types) {
      const targets = [
        ...type.pointers.flatMap((pointer) => pointer.targetTypes),
        ...type.sets.flatMap((set) => set.memberTypes)
      ];
      adjacent.set(type.name, targets);
    }
    const refSums = /* @__PURE__ */ new Map();
    const targetTypeOf = (owner, targets) => {
      if (targets.length === 0 || targets.some((target) => reaches(target, owner, adjacent))) {
        return techType("NodeId");
      }
      if (targets.length === 1) {
        return leanIdent(targets[0]);
      }
      const refName = techType(`${targets.map(leanIdent).join("")}Ref`);
      refSums.set(refName, targets);
      return refName;
    };
    const toConcept = (type, base) => ({
      name: type.name,
      base,
      mixins: type.mixins || [],
      childMin: type.childMin ?? null,
      childMax: type.childMax ?? null,
      attributes: type.attributes.filter((attribute) => attribute.name !== "name").map((attribute) => ({
        name: leanIdent(attribute.name),
        type: attribute.leanType
      })),
      pointers: type.pointers.map((pointer) => ({
        name: leanIdent(pointer.name),
        type: pointer.optional ? `Option ${targetTypeOf(type.name, pointer.targetTypes)}` : targetTypeOf(type.name, pointer.targetTypes)
      })),
      sets: type.sets.map((set) => ({
        name: leanIdent(set.name),
        type: `List ${targetTypeOf(type.name, set.memberTypes)}`,
        min: set.min,
        max: set.max,
        members: set.members || []
      })),
      containments: type.containments
    });
    const fcoNode = types.find((type) => type.name === "FCO");
    const fco = fcoNode ? toConcept(fcoNode, null) : {
      name: "FCO",
      base: null,
      mixins: [],
      childMin: null,
      childMax: null,
      attributes: [],
      pointers: [],
      sets: [],
      containments: []
    };
    const concepts = types.filter((type) => type.name !== "FCO").map((type) => toConcept(type, type.baseType || "FCO"));
    const lines = [];
    const namespace = leanIdent(dsl.name || "Domain");
    lines.push(`namespace ${namespace}`);
    lines.push("");
    lines.push(`structure ${techType("NodeId")} where`);
    lines.push("  path : String");
    lines.push("  deriving DecidableEq, Repr");
    lines.push("");
    lines.push(`class ${techType("Contained")} (parent child : Type) where`);
    lines.push("  children : parent \u2192 List child");
    lines.push("");
    const emitted = /* @__PURE__ */ new Set(["FCO"]);
    const pending = new Set(concepts.map((concept) => concept.name));
    const ordered = [];
    while (pending.size > 0) {
      let progressed = false;
      for (const concept of concepts) {
        if (!pending.has(concept.name)) {
          continue;
        }
        const needed = [...concept.pointers, ...concept.sets].map((field) => field.type.replace(/^(Option |List )/, "")).filter((typeName) => concepts.some((other) => leanIdent(other.name) === typeName));
        if (concept.base) {
          needed.push(leanIdent(concept.base));
        }
        if (needed.every((typeName) => emitted.has(typeName))) {
          ordered.push(concept);
          pending.delete(concept.name);
          emitted.add(leanIdent(concept.name));
          progressed = true;
        }
      }
      if (!progressed) {
        ordered.push(...concepts.filter((concept) => pending.has(concept.name)));
        break;
      }
    }
    const emitStructure = (concept) => {
      const owner = leanIdent(concept.name);
      const parent = concept.base ? leanIdent(concept.base) : null;
      const fields = [];
      if (!parent) {
        fields.push(`  _id : ${techType("NodeId")}`);
        fields.push(`  _type : ${techType("Type")}`);
        fields.push("  name : String");
        fields.push(`  _containment : List ${techType("NodeId")}`);
        fields.push(`  _parent : Option ${techType("NodeId")}`);
      }
      for (const attribute of concept.attributes) {
        fields.push(`  ${attribute.name} : ${attribute.type}`);
      }
      for (const pointer of concept.pointers) {
        fields.push(`  ${pointer.name} : ${pointer.type}`);
      }
      for (const set of concept.sets) {
        fields.push(`  ${set.name} : ${set.type}`);
      }
      if (parent && fields.length === 0) {
        lines.push(`structure ${owner} extends ${parent} deriving Repr`);
      } else if (parent) {
        lines.push(`structure ${owner} extends ${parent} where`);
        lines.push(...fields);
        lines.push("  deriving Repr");
      } else {
        lines.push(`structure ${owner} where`);
        lines.push(...fields);
        lines.push("  deriving Repr");
      }
      lines.push("");
      lines.push(`instance : BEq ${owner} where`);
      lines.push("  beq a b := a._id == b._id");
      lines.push("");
      if (parent) {
        lines.push(`instance : Coe ${owner} ${parent} where`);
        lines.push(`  coe := ${owner}.to${parent}`);
        lines.push("");
      }
    };
    const byName = /* @__PURE__ */ new Map();
    for (const concept of [fco, ...concepts]) {
      byName.set(concept.name, concept);
    }
    const related = (concept, mixins) => {
      const found = [];
      const queue = [concept];
      const guard = /* @__PURE__ */ new Set();
      while (queue.length > 0) {
        const current = queue.shift();
        if (guard.has(current.name)) {
          continue;
        }
        guard.add(current.name);
        found.push(current);
        if (current.base) {
          const base = byName.get(current.base);
          if (base) {
            queue.push(base);
          }
        }
        if (mixins) {
          for (const mixinName of current.mixins) {
            const mixin = byName.get(mixinName);
            if (mixin) {
              queue.push(mixin);
            }
          }
        }
      }
      return found;
    };
    const effectiveContainments = (concept) => {
      const seen = /* @__PURE__ */ new Set();
      const rules = [];
      for (const current of related(concept, true)) {
        for (const rule of current.containments) {
          if (!rule.childType || seen.has(rule.childType)) {
            continue;
          }
          seen.add(rule.childType);
          rules.push(rule);
        }
      }
      return rules;
    };
    const typeClosure = (name) => {
      const start = byName.get(name);
      return start ? related(start, true).map((concept) => concept.name) : [name];
    };
    const effectiveSets = (concept) => {
      const seen = /* @__PURE__ */ new Set();
      const sets = [];
      for (const current of related(concept, false)) {
        for (const set of current.sets) {
          if (seen.has(set.name)) {
            continue;
          }
          seen.add(set.name);
          sets.push(set);
        }
      }
      return sets;
    };
    const childBounds = (concept) => {
      let min = null;
      let max = null;
      for (const current of related(concept, true)) {
        if (min === null && current.childMin != null) {
          min = current.childMin;
        }
        if (max === null && current.childMax != null) {
          max = current.childMax;
        }
      }
      return { min, max };
    };
    const span = (min, max) => {
      const low = min != null && min > 0 ? String(min) : "*";
      const high = max != null ? String(max) : "*";
      return `${low}..${high}`;
    };
    const comparison = (countExpr, min, max) => {
      const low = min != null && min > 0;
      const high = max != null;
      if (low && high) {
        return `(let n := ${countExpr}; n \u2265 ${min} && n \u2264 ${max})`;
      }
      if (low) {
        return `${countExpr} \u2265 ${min}`;
      }
      if (high) {
        return `${countExpr} \u2264 ${max}`;
      }
      return null;
    };
    const emitRule = (name, owner, needsResolve, comment, body) => {
      const resolveArg = needsResolve ? ` (resolve : ${techType("NodeId")} \u2192 Option ${techType("Type")})` : "";
      lines.push(`-- ${comment}`);
      lines.push(`def ${name} (m : ${owner})${resolveArg} : Bool :=`);
      lines.push(`  ${body}`);
      lines.push("");
    };
    const memberCount = (set, memberType) => {
      const element = set.type.replace(/^List /, "");
      const want = `.${ctorIdent(memberType)}`;
      if (element === techType("NodeId")) {
        return {
          expr: `countOfType m.${set.name} ${want} resolve`,
          needsResolve: true
        };
      }
      if (element.startsWith("_") && element.endsWith("Ref")) {
        return {
          expr: `countWhere m.${set.name} ${element}.typeOf ${want}`,
          needsResolve: false
        };
      }
      return {
        expr: `countWhere m.${set.name} (fun item => item._type) ${want}`,
        needsResolve: false
      };
    };
    const emitBounds = (concept) => {
      const owner = leanIdent(concept.name);
      const fcoView = owner === "FCO" ? "m" : "m.toFCO";
      emitRule(
        `_${owner}_child_type`,
        owner,
        true,
        `Every child of ${owner} has a type ${owner} may contain.`,
        `childrenAllowed ${fcoView} resolve`
      );
      for (const child of effectiveContainments(concept)) {
        const childName = leanIdent(child.childType);
        const body = comparison(
          `countOfType m._containment .${ctorIdent(child.childType)} resolve`,
          child.min,
          child.max
        );
        if (!body) {
          continue;
        }
        emitRule(
          `_${owner}_${childName}_child_cardinality`,
          owner,
          true,
          `${owner} contains ${span(child.min, child.max)} ${childName}.`,
          body
        );
      }
      const totals = childBounds(concept);
      const totalBody = comparison("m._containment.length", totals.min, totals.max);
      if (totalBody) {
        emitRule(
          `_${owner}_child_cardinality`,
          owner,
          false,
          `${owner} contains ${span(totals.min, totals.max)} children.`,
          totalBody
        );
      }
      for (const set of effectiveSets(concept)) {
        const total = comparison(`(m.${set.name}).length`, set.min ?? null, set.max ?? null);
        if (total) {
          emitRule(
            `_${owner}_${set.name}_member_cardinality`,
            owner,
            false,
            `${set.name} of ${owner} has ${span(set.min ?? null, set.max ?? null)} members.`,
            total
          );
        }
        for (const member of set.members || []) {
          const counted = memberCount(set, member.memberType);
          const body = comparison(counted.expr, member.min, member.max);
          if (!body) {
            continue;
          }
          const memberName = leanIdent(member.memberType);
          emitRule(
            `_${owner}_${set.name}_${memberName}_member_cardinality`,
            owner,
            counted.needsResolve,
            `${set.name} of ${owner} has ${span(member.min, member.max)} ${memberName} members.`,
            body
          );
        }
      }
    };
    const emitConcept = (concept) => {
      const typeName = leanIdent(concept.name);
      lines.push(`-- ${typeName} definitions`);
      emitStructure(concept);
      emitted.add(typeName);
    };
    const emitMetaRules = () => {
      const allConcepts = [fco, ...concepts];
      lines.push("def isA (child parent : _Type) : Bool :=");
      lines.push("  match child, parent with");
      for (const concept of allConcepts) {
        for (const ancestor of typeClosure(concept.name)) {
          lines.push(`  | .${ctorIdent(concept.name)}, .${ctorIdent(ancestor)} => true`);
        }
      }
      lines.push("  | _, _ => false");
      lines.push("");
      lines.push("def allowed (parent child : _Type) : Bool :=");
      lines.push("  match parent with");
      for (const concept of allConcepts) {
        const rules = effectiveContainments(concept);
        if (rules.length === 0) {
          continue;
        }
        const checks = rules.map((rule) => `isA child .${ctorIdent(rule.childType)}`);
        lines.push(`  | .${ctorIdent(concept.name)} => ${checks.join(" || ")}`);
      }
      lines.push("  | _ => false");
      lines.push("");
      lines.push("def countOfType (ids : List _NodeId) (want : _Type) (resolve : _NodeId \u2192 Option _Type) : Nat :=");
      lines.push("  ids.foldl (fun acc id =>");
      lines.push("    match resolve id with");
      lines.push("    | some t => if isA t want then acc + 1 else acc");
      lines.push("    | none => acc) 0");
      lines.push("");
      lines.push("def countWhere {\u03B1 : Type} (items : List \u03B1) (typeOf : \u03B1 \u2192 _Type) (want : _Type) : Nat :=");
      lines.push("  items.foldl (fun acc item => if isA (typeOf item) want then acc + 1 else acc) 0");
      lines.push("");
      lines.push("def childrenAllowed (n : FCO) (resolve : _NodeId \u2192 Option _Type) : Bool :=");
      lines.push("  n._containment.all fun id =>");
      lines.push("    match resolve id with");
      lines.push("    | some t => allowed n._type t");
      lines.push("    | none => false");
      lines.push("");
      lines.push("def parentOf (n : FCO) : Option _NodeId :=");
      lines.push("  n._parent");
      lines.push("");
      for (const concept of allConcepts) {
        emitBounds(concept);
      }
    };
    lines.push(`inductive ${techType("Type")} where`);
    for (const conceptName of ["FCO", ...ordered.map((concept) => concept.name)]) {
      lines.push(`  | ${ctorIdent(conceptName)}`);
    }
    lines.push("  deriving DecidableEq, Repr");
    lines.push("");
    emitted.clear();
    emitConcept(fco);
    const waiting = new Map(ordered.map((concept) => [leanIdent(concept.name), concept]));
    const structReady = (typeName) => !waiting.has(typeName);
    while (waiting.size > 0) {
      let progressed = false;
      for (const [typeName, concept] of waiting) {
        if (concept.base && !structReady(leanIdent(concept.base))) {
          continue;
        }
        const fieldTypes = [...concept.pointers, ...concept.sets].map((field) => field.type.replace(/^(?:Option |List )/, "")).filter((name) => waiting.has(name) || refSums.has(name));
        const blocked = fieldTypes.some((name) => {
          if (refSums.has(name)) {
            return !emitted.has(name);
          }
          return !structReady(name) && waiting.has(name);
        });
        const needsRef = fieldTypes.some((name) => refSums.has(name) && !emitted.has(name));
        if (blocked || needsRef) {
          continue;
        }
        emitConcept(concept);
        waiting.delete(typeName);
        progressed = true;
      }
      if (!progressed) {
        for (const [refType, members] of refSums) {
          if (emitted.has(refType)) {
            continue;
          }
          if (members.some((member) => waiting.has(leanIdent(member)))) {
            continue;
          }
          lines.push(`inductive ${refType} where`);
          for (const member of members) {
            lines.push(`  | ${ctorIdent(member)} : ${leanIdent(member)} \u2192 ${refType}`);
          }
          lines.push("  deriving Repr");
          lines.push("");
          lines.push(`def ${refType}._id : ${refType} \u2192 ${techType("NodeId")}`);
          for (const member of members) {
            lines.push(`  | .${ctorIdent(member)} node => node._id`);
          }
          lines.push("");
          lines.push(`def ${refType}.typeOf : ${refType} \u2192 ${techType("Type")}`);
          for (const member of members) {
            lines.push(`  | .${ctorIdent(member)} node => node._type`);
          }
          lines.push("");
          lines.push(`instance : BEq ${refType} where`);
          lines.push("  beq a b := a._id == b._id");
          lines.push("");
          emitted.add(refType);
          progressed = true;
        }
      }
      if (!progressed) {
        for (const concept of waiting.values()) {
          emitConcept(concept);
        }
        break;
      }
    }
    emitMetaRules();
    return lines.join("\n");
  }
  return __toCommonJS(leanFix_exports);
})();

return WebGMELeanFix;
});
