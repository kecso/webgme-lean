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
