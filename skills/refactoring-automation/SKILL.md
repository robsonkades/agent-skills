---
name: refactoring-automation
description: >
  Applying repeatable Java changes with IDE refactoring, OpenRewrite, structural search,
  compiler tooling or hand edits; checking tool coverage and making large diffs reviewable,
  reproducible and reversible. Use when one edit spans many files, a framework or library
  migration must run repo-wide, a rename reaches strings and configuration, regex is proposed
  for Java source, a generated diff is too large to review line by line, automated refactoring
  changed behaviour, or a cleanup needs recurrence prevention. Which refactoring to apply
  belongs to java-refactoring, what to detect to java-code-smells, and which CI gates to require
  to quality-gates.
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
THEN use a tool with the required resolved semantic model, such as an IDE, OpenRewrite or Refaster. Never use regex as symbol resolution.

IF the change is confined to one project open in one IDE and a human is driving
THEN consider the existing IDE refactoring after checking its index, scope and preview; do not assume unavailable integrations or external caller coverage.

IF the change must be repeated — across repositories, or on a schedule, or by CI
THEN prefer a versioned, testable transformation such as OpenRewrite; inspect available replay/export support before excluding an IDE or another tool.

IF a published migration recipe exists for it (javax→jakarta, JUnit 4→5, a Spring Boot upgrade)
THEN inspect its version, prerequisites and complete recipe list, then preview only within the authorized migration scope.

IF the edit is genuinely textual and bounded — a known licence header or literal documentation typo
THEN a manual or scripted literal edit can suffice, including in Java comments. Inspect exact matches; this does not authorize a textual symbol rename.

IF someone proposes a regex over Java source for anything type-dependent
THEN refuse it: a regex cannot see scope, shadowing, imports, overloads or comments-versus-code.

IF the tool reports fewer matches than the codebase visibly contains
THEN investigate match semantics, exclusions, source sets, parse failures and classpath. Do not infer completeness until the discrepancy is explained.

IF the diff cannot be reproduced by re-running the tool on the recorded input state, including relevant local changes
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
