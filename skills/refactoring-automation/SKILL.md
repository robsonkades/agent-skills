---
name: refactoring-automation
description: >
  Applying a code change by machine rather than by hand: choosing between an IDE
  refactoring, an OpenRewrite recipe, structural search-and-replace, a compiler-driven
  change and hand-editing; what each tool can and cannot see; checking rename coverage
  beyond resolved symbols; making a change spanning hundreds of files reviewable, reproducible and
  revertible; and proving a mechanical change was mechanical. Use when one edit must land
  across many files, when a framework or library migration must be applied repo-wide (javax
  to jakarta, JUnit 4 to 5, a Spring major version), when a rename must reach names that
  live in strings and configuration, when someone is about to run sed or a regex over Java
  source, when a tool-generated diff is too large to review line by line, when an automated
  refactoring changed behaviour, or when a cleanup keeps regressing because nothing stops it
  coming back. Which refactoring to apply is java-refactoring, what to detect is
  java-code-smells, and the CI gates the result must pass are quality-gates.
---

# Refactoring Automation

## Purpose

Machine-applied change trades one risk for another. Hand-editing four hundred files gets
tired and misses some; a tool gets all four hundred consistently, including the ones where
the transformation was wrong. This skill exists to prevent the two failures that follow:
the tool that silently matched nothing and reported success, and the ten-thousand-line
diff that was approved because nobody could read it.

The governing idea: **review the mechanism and its actual coverage.** Reproducing a diff
from recorded inputs establishes provenance, not semantic correctness. Review recipe
preconditions, representative match categories, exceptions and compatibility evidence too.

## Workflow

1. **Establish the safety net and pick the technique first.** Automation chooses _how_ to
   apply a step, never _which_ step. The refactoring, its preconditions and its risk class
   come from java-refactoring before any tool runs. Inspect working-tree changes, owned paths,
   Java/build/framework versions and existing gates. Preserve user work; use an isolated copy
   of the actual input state when a broad transformation would overlap unrelated changes.
2. **Choose the tool by what the change depends on** — the decision rules below, then
   `references/tool-capabilities.md` for what each one actually sees.
3. **Preview and inspect the resulting patch.** Use a dry run, or an isolated copy when the
   tool has no preview. Compare expected candidates with actual matches; zero changes can
   mean already migrated, excluded scope or broken attribution — see the type-attribution trap in
   `references/openrewrite-recipes.md`.
4. **Sweep for what the tool cannot see** before committing: names in strings,
   configuration, templates, SQL, and reflective wiring. The tool's confidence does not
   extend to them.
5. **Prepare a reproducible, correct patch** — record input revision plus preserved local
   changes, tool/recipe versions, scope and command. Identify manual corrections separately
   for review, but fix known defects before delivery. Commit/publish only when authorized.
   `references/large-scale-change.md` covers staging, review, blame and rollback.
6. **Prevent recurrence when justified.** Add a scoped enforcement check only when it
   reliably detects a consequential regression and fits existing policy (quality-gates).
   Report matches, changed paths, residual exclusions, actual validation and remaining limits.

## Decision rules

```text
IF the change is type-dependent — resolving an overload, a subtype, an import, a shadowed name
THEN the tool must have a type-resolved model: IDE refactoring or OpenRewrite. Never regex.

IF the change is confined to one project open in one IDE and a human is driving
THEN use the IDE refactoring; it is the highest-value-per-risk option and it updates callers.

IF the change must be repeated — across repositories, or on a schedule, or by CI
THEN prefer a versioned, testable transformation such as OpenRewrite; inspect available replay/export support before excluding an IDE or another tool.

IF a published migration recipe exists for it (javax→jakarta, JUnit 4→5, a Spring Boot upgrade)
THEN inspect its version, prerequisites and complete recipe list, then preview only within the authorized migration scope.

IF the change is a pure text pattern in non-Java files — YAML keys, properties, a licence header
THEN a scripted text edit is legitimate. Say so explicitly, and keep it out of the Java sources.

IF someone proposes a regex over Java source for anything type-dependent
THEN refuse it: a regex cannot see scope, shadowing, imports, overloads or comments-versus-code.

IF the tool reports fewer matches than the codebase visibly contains
THEN investigate match semantics, exclusions, source sets, parse failures and classpath. Do not infer completeness until the discrepancy is explained.

IF the diff cannot be reproduced by re-running the tool on the base commit
THEN investigate differing inputs/tool versions and review unexplained edits directly; reproducibility is not a substitute for semantic validation.
```

## Rules

- Automation never upgrades a refactoring's risk class downward. An IDE rename of a
  serialised field is still a serialisation change; the tool's correctness is about the
  AST, not about the contract.
- Report zero matches honestly, with the scope/positive-control evidence that explains them.
- Keep automated and manual portions distinguishable; a deterministic recipe plus explicit
  reviewed correction patch can be reproduced. Never deliver known-broken output to preserve purity.
- State which tool ran and with what arguments in the handoff or authorized commit. "Reformatted" and
  "migrated" are unverifiable; `mvn rewrite:run -Drewrite.activeRecipes=…` is checkable.
- Never accept an automated change on the strength of the tool's reputation. The evidence
  is the same evidence any refactoring needs (java-refactoring's evidence ladder), and
  scale makes it more important, not less.
- Avoid unrelated formatting churn. Recipe-required formatting and repository format gates
  may be part of the result; make the semantic portion inspectable rather than bypassing gates.
- If the recipe is wrong for a handful of files, fix the recipe or exclude those files
  explicitly, or record a reproducible manual correction. Exclusions remain outstanding work
  when the requested migration requires those files too.

## References

- [Tool capabilities and blind spots](references/tool-capabilities.md) — what an IDE,
  OpenRewrite, structural search, Error Prone/Refaster, an AST library and a regex each
  see and each miss, and where rename coverage needs verification. Read when choosing a
  tool, and before any rename of something a framework might resolve by name.
- [OpenRewrite recipes](references/openrewrite-recipes.md) — running published recipes,
  composing declarative ones, writing and testing a visitor, and the failure modes that
  produce a silent no-op. Read before authoring or running a recipe.
- [Landing a large-scale change](references/large-scale-change.md) — proving
  reproducibility, verifying semantics at scale, staging by module, surviving in-flight
  branches, keeping `git blame` usable, and rollback. Read when the change spans more
  files than a reviewer can read.
