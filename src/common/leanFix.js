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
        max: set.max
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
  function joinAnd(items) {
    if (items.length <= 1) {
      return items.join("");
    }
    if (items.length === 2) {
      return `${items[0]} and ${items[1]}`;
    }
    return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;
  }
  function joinOr(items) {
    if (items.length <= 1) {
      return items.join("");
    }
    if (items.length === 2) {
      return `${items[0]} or ${items[1]}`;
    }
    return `${items.slice(0, -1).join(", ")}, or ${items[items.length - 1]}`;
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
        max: set.max
      })),
      containments: type.containments
    });
    const fcoNode = types.find((type) => type.name === "FCO");
    const fco = fcoNode ? toConcept(fcoNode, null) : {
      name: "FCO",
      base: null,
      attributes: [],
      pointers: [],
      sets: [],
      containments: []
    };
    const concepts = types.filter((type) => type.name !== "FCO").map((type) => toConcept(type, type.baseType || "FCO"));
    const lines = [];
    const namespace = leanIdent(dsl.name || "Domain");
    lines.push("/-!");
    lines.push(`# ${namespace}`);
    lines.push("");
    lines.push("Meta concepts are structures, and `extends` follows the base chain from FCO.");
    lines.push("A name that starts with `_` is technical. It is not a meta concept or a meta attribute.");
    lines.push("`_id` is identity. `_type` is the concept the node was created as.");
    lines.push("Attributes, pointers, and sets are fields of the concept.");
    lines.push("`_XChild` and `_Contained` are containment.");
    lines.push("A pointer's type is its meta target. `Coe` stores a descendant there and keeps the");
    lines.push("target's fields, including `_type`.");
    lines.push("-/");
    lines.push("");
    lines.push(`namespace ${namespace}`);
    lines.push("");
    lines.push("-- technical: identity of a node. Not a meta attribute.");
    lines.push(`structure ${techType("NodeId")} where`);
    lines.push("  path : String");
    lines.push("  deriving DecidableEq, Repr");
    lines.push("");
    lines.push("-- technical: the containment lookup. Not a meta concept.");
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
      const technicalFields = [
        ...parent ? [] : ["_id", "_type"],
        ...concept.containments.length > 0 ? ["_containment"] : []
      ];
      if (!parent) {
        fields.push(`  _id : ${techType("NodeId")}`);
        fields.push(`  _type : ${techType("Type")}`);
        fields.push("  name : String");
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
      if (concept.containments.length > 0) {
        fields.push(`  _containment : List ${techType(`${owner}Child`)}`);
      }
      if (technicalFields.length > 0) {
        const verb = technicalFields.length > 1 ? "are" : "is";
        lines.push(`-- ${joinAnd(technicalFields)} ${verb} technical.`);
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
    lines.push("-- technical: the concept a node was created as. Coercion keeps this field.");
    lines.push(`inductive ${techType("Type")} where`);
    for (const conceptName of ["FCO", ...ordered.map((concept) => concept.name)]) {
      lines.push(`  | ${ctorIdent(conceptName)}`);
    }
    lines.push("  deriving DecidableEq, Repr");
    lines.push("");
    emitted.clear();
    emitStructure(fco);
    emitted.add("FCO");
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
        if (concept.containments.length > 0 && !emitted.has(techType(`${typeName}Child`))) {
          const childrenReady = concept.containments.every((child) => structReady(leanIdent(child.childType)) || leanIdent(child.childType) === typeName);
          if (!childrenReady) {
            continue;
          }
          const childType = techType(`${typeName}Child`);
          lines.push(`-- technical: the children of ${typeName}. Not a meta concept.`);
          lines.push(`inductive ${childType} where`);
          for (const child of concept.containments) {
            lines.push(`  | ${ctorIdent(child.childType)} : ${leanIdent(child.childType)} \u2192 ${childType}`);
          }
          lines.push("  deriving Repr");
          lines.push("");
          emitted.add(childType);
        }
        emitStructure(concept);
        emitted.add(typeName);
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
          const memberNames = members.map((member) => leanIdent(member));
          lines.push(`-- technical: a pointer with more than one target type: ${joinOr(memberNames)}.`);
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
          lines.push(`instance : BEq ${refType} where`);
          lines.push("  beq a b := a._id == b._id");
          lines.push("");
          emitted.add(refType);
          progressed = true;
        }
      }
      if (!progressed) {
        for (const concept of waiting.values()) {
          emitStructure(concept);
        }
        break;
      }
    }
    for (const concept of concepts) {
      if (concept.containments.length === 0) {
        continue;
      }
      const owner = leanIdent(concept.name);
      for (const child of concept.containments) {
        const childName = leanIdent(child.childType);
        const ctor = ctorIdent(child.childType);
        lines.push(`instance : ${techType("Contained")} ${owner} ${childName} where`);
        lines.push("  children parent := parent._containment.filterMap fun");
        lines.push(`    | .${ctor} node => some node`);
        lines.push("    | _ => none");
        lines.push("");
      }
    }
    const mainName = leanIdent(dsl.mainType || namespace);
    const mainConcept = [fco, ...concepts].find((concept) => leanIdent(concept.name) === mainName);
    const directChildren = new Set(
      (mainConcept ? mainConcept.containments : []).map((child) => leanIdent(child.childType))
    );
    const structural = [];
    const emitDef = (name, body) => {
      structural.push(`def ${name} (m : ${mainName}) : Bool :=`);
      for (const line of body) {
        structural.push(`  ${line}`);
      }
      structural.push("");
    };
    for (const concept of [fco, ...concepts]) {
      const owner = leanIdent(concept.name);
      if (owner !== mainName && !directChildren.has(owner)) {
        continue;
      }
      const defOwner = owner === mainName ? mainName : `${mainName}_${owner}`;
      for (const child of concept.containments) {
        const childName = leanIdent(child.childType);
        const lengthOf = owner === mainName ? `(_Contained.children (child := ${childName}) m).length` : `(_Contained.children (child := ${childName}) node).length`;
        const body = (check) => owner === mainName ? [check] : [`(_Contained.children (child := ${owner}) m).all fun node =>`, `  ${check}`];
        if (child.min > 0) {
          emitDef(`${defOwner}_atLeast_${child.min}_${childName}`, body(`${lengthOf} \u2265 ${child.min}`));
        }
        if (child.max !== null) {
          emitDef(`${defOwner}_atMost_${child.max}_${childName}`, body(`${lengthOf} \u2264 ${child.max}`));
        }
      }
      for (const set of concept.sets) {
        const lengthOf = owner === mainName ? `(m.${set.name}).length` : `(node.${set.name}).length`;
        const setOwner = owner === mainName ? `${mainName}_${set.name}` : `${mainName}_${owner}_${set.name}`;
        const body = (check) => owner === mainName ? [check] : [`(_Contained.children (child := ${owner}) m).all fun node =>`, `  ${check}`];
        if ((set.min ?? 0) > 0) {
          emitDef(`${setOwner}_atLeast_${set.min}`, body(`${lengthOf} \u2265 ${set.min}`));
        }
        if (set.max != null) {
          emitDef(`${setOwner}_atMost_${set.max}`, body(`${lengthOf} \u2264 ${set.max}`));
        }
      }
    }
    lines.push(...structural);
    return lines.join("\n");
  }
  return __toCommonJS(leanFix_exports);
})();

return WebGMELeanFix;
});
