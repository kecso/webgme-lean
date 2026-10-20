/-!
# Attribute Reasoning for Model Verification

This module provides operations for reasoning about attribute values,
including comparisons, type coercions, and common predicates.
-/

import WebGMELean.Core.Model

namespace WebGMELean.Attr

open WebGMELean

/-- Extract string value -/
def asString (v : AttrValue) : Option String :=
  match v with
  | .string s => some s
  | _ => none

/-- Extract integer value -/
def asInt (v : AttrValue) : Option Int :=
  match v with
  | .int i => some i
  | _ => none

/-- Extract float value -/
def asFloat (v : AttrValue) : Option Float :=
  match v with
  | .float f => some f
  | .int i => some (Float.ofInt i)
  | _ => none

/-- Extract boolean value -/
def asBool (v : AttrValue) : Option Bool :=
  match v with
  | .bool b => some b
  | _ => none

/-- Check if attribute is null -/
def isNull (v : AttrValue) : Bool :=
  match v with
  | .null => true
  | _ => false

/-- Check if attribute is not null -/
def isNotNull (v : AttrValue) : Bool :=
  !isNull v

/-- Get string attribute from node -/
def getStringAttr (n : Node) (name : String) : Option String :=
  n.getAttribute name |>.bind asString

/-- Get int attribute from node -/
def getIntAttr (n : Node) (name : String) : Option Int :=
  n.getAttribute name |>.bind asInt

/-- Get float attribute from node -/
def getFloatAttr (n : Node) (name : String) : Option Float :=
  n.getAttribute name |>.bind asFloat

/-- Get bool attribute from node -/
def getBoolAttr (n : Node) (name : String) : Option Bool :=
  n.getAttribute name |>.bind asBool

/-- Check string equality -/
def stringEquals (n : Node) (attrName : String) (expected : String) : Bool :=
  getStringAttr n attrName == some expected

/-- Check string contains -/
def stringContains (n : Node) (attrName : String) (substring : String) : Bool :=
  match getStringAttr n attrName with
  | some s => s.containsSubstr substring
  | none => false

/-- Check string matches pattern (simple prefix/suffix) -/
def stringStartsWith (n : Node) (attrName : String) (prefix_ : String) : Bool :=
  match getStringAttr n attrName with
  | some s => s.startsWith prefix_
  | none => false

def stringEndsWith (n : Node) (attrName : String) (suffix_ : String) : Bool :=
  match getStringAttr n attrName with
  | some s => s.endsWith suffix_
  | none => false

/-- Integer comparisons -/
def intEquals (n : Node) (attrName : String) (expected : Int) : Bool :=
  getIntAttr n attrName == some expected

def intLessThan (n : Node) (attrName : String) (bound : Int) : Bool :=
  match getIntAttr n attrName with
  | some i => i < bound
  | none => false

def intLessOrEqual (n : Node) (attrName : String) (bound : Int) : Bool :=
  match getIntAttr n attrName with
  | some i => i ≤ bound
  | none => false

def intGreaterThan (n : Node) (attrName : String) (bound : Int) : Bool :=
  match getIntAttr n attrName with
  | some i => i > bound
  | none => false

def intGreaterOrEqual (n : Node) (attrName : String) (bound : Int) : Bool :=
  match getIntAttr n attrName with
  | some i => i ≥ bound
  | none => false

def intInRange (n : Node) (attrName : String) (lo hi : Int) : Bool :=
  match getIntAttr n attrName with
  | some i => lo ≤ i && i ≤ hi
  | none => false

/-- Boolean checks -/
def isTrue (n : Node) (attrName : String) : Bool :=
  getBoolAttr n attrName == some true

def isFalse (n : Node) (attrName : String) : Bool :=
  getBoolAttr n attrName == some false

/-- Check if attribute exists and is not null -/
def hasAttribute (n : Node) (attrName : String) : Bool :=
  match n.getAttribute attrName with
  | some v => isNotNull v
  | none => false

/-- Compare attributes of two nodes -/
def attributesEqual (n1 n2 : Node) (attrName : String) : Bool :=
  match n1.getAttribute attrName, n2.getAttribute attrName with
  | some v1, some v2 =>
    match v1, v2 with
    | .string s1, .string s2 => s1 == s2
    | .int i1, .int i2 => i1 == i2
    | .bool b1, .bool b2 => b1 == b2
    | .null, .null => true
    | _, _ => false
  | _, _ => false

end WebGMELean.Attr
