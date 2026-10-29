import Lake
open Lake DSL

package «webgme-lean» where
  leanOptions := #[
    ⟨`pp.unicode.fun, true⟩,
    ⟨`autoImplicit, false⟩
  ]

@[default_target]
lean_lib WebGMELean where
  globs := #[.submodules `WebGMELean]

/-- Domain types and constraint defs written by CheckWithLean. Model checks import
`Generated.Domain` so Lake can reuse its `.olean` when only the instance changes. -/
lean_lib Generated where
  globs := #[.submodules `Generated]
