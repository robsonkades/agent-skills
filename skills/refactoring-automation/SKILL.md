---
name: refactoring-automation
description: >
  Applying a code change by machine rather than by hand: choosing between an IDE
  refactoring, an OpenRewrite recipe, structural search-and-replace, a compiler-driven
  change and hand-editing; what each tool can and cannot see; the places a rename never
  reaches; making a change spanning hundreds of files reviewable, reproducible and
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

The governing idea: **a mechanical change is reviewed by reviewing the mechanism.** If the
reviewer can re-run the recipe on the base commit and get a byte-identical diff, the
question shifts from "are these 400 edits correct?" to "is this one recipe correct?" —
which is answerable. A large diff that cannot be reproduced is a hand-edit wearing a
tool's name, and must be reviewed as one.

## Workflow

1. **Establish the safety net and pick the technique first.** Automation chooses _how_ to
   apply a step, never _which_ step. The refactoring, its preconditions and its risk class
   come from java-refactoring before any tool runs.
2. **Choose the tool by what the change depends on** — the decision rules below, then
   `references/tool-capabilities.md` for what each one actually sees.
3. **Dry-run and read the plan, not the result.** Every tool worth using has a mode that
   reports what it would change. Zero matches is the failure mode to expect, not the
   success to celebrate — see the type-attribution trap in
   `references/openrewrite-recipes.md`.
4. **Sweep for what the tool cannot see** before committing: names in strings,
   configuration, templates, SQL, and reflective wiring. The tool's confidence does not
   extend to them.
5. **Land it as a reproducible commit** — mechanical change alone, recipe or command in
   the message, no hand-touch-ups mixed in. Anything the tool got wrong is a separate
   follow-up commit. `references/large-scale-change.md` covers staging, review, blame and
   rollback.
6. **Make it stick.** A pattern removed but not prevented returns within two quarters. If
   the change is worth automating, the check that keeps it out belongs in the build
   (quality-gates).

## Decision rules

```text
IF the change is type-dependent — resolving an overload, a subtype, an import, a shadowed name
THEN the tool must have a type-resolved model: IDE refactoring or OpenRewrite. Never regex.

IF the change is confined to one project open in one IDE and a human is driving
THEN use the IDE refactoring; it is the highest-value-per-risk option and it updates callers.

IF the change must be repeated — across repositories, or on a schedule, or by CI
THEN write an OpenRewrite recipe; a recipe is reviewable, testable and re-runnable, an IDE session is none of those.

IF a published migration recipe exists for it (javax→jakarta, JUnit 4→5, a Spring Boot upgrade)
THEN run the published recipe before writing anything; hand-migrating what a maintained recipe covers is wasted risk.

IF the change is a pure text pattern in non-Java files — YAML keys, properties, a licence header
THEN a scripted text edit is legitimate. Say so explicitly, and keep it out of the Java sources.

IF someone proposes a regex over Java source for anything type-dependent
THEN refuse it: a regex cannot see scope, shadowing, imports, overloads or comments-versus-code.

IF the tool reports fewer matches than the codebase visibly contains
THEN the model is incomplete, not the codebase clean. Stop and fix the classpath before trusting any run.

IF the diff cannot be reproduced by re-running the tool on the base commit
THEN it is not a mechanical change; review it edit by edit or split it.
```

## Rules

- Automation never upgrades a refactoring's risk class downward. An IDE rename of a
  serialised field is still a serialisation change; the tool's correctness is about the
  AST, not about the contract.
- A dry-run that matched nothing is a finding to investigate, never a result to report.
- Mechanical and manual edits never share a commit. The moment a hand-edit is mixed in,
  reproducibility — the entire basis for reviewing the change — is gone.
- State which tool ran and with what arguments, in the commit message. "Reformatted" and
  "migrated" are unverifiable; `mvn rewrite:run -Drewrite.activeRecipes=…` is checkable.
- Never accept an automated change on the strength of the tool's reputation. The evidence
  is the same evidence any refactoring needs (java-refactoring's evidence ladder), and
  scale makes it more important, not less.
- Do not run a formatter and a refactoring in the same commit. Formatting churn hides
  semantic change from every reviewer and every diff tool.
- If the recipe is wrong for a handful of files, fix the recipe or exclude those files
  explicitly — do not patch the output. Patched output cannot be re-run.

## References

- [Tool capabilities and blind spots](references/tool-capabilities.md) — what an IDE,
  OpenRewrite, structural search, Error Prone/Refaster, an AST library and a regex each
  see and each miss, and the list of places a rename never reaches. Read when choosing a
  tool, and before any rename of something a framework might resolve by name.
- [OpenRewrite recipes](references/openrewrite-recipes.md) — running published recipes,
  composing declarative ones, writing and testing a visitor, and the failure modes that
  produce a silent no-op. Read before authoring or running a recipe.
- [Landing a large-scale change](references/large-scale-change.md) — proving
  reproducibility, verifying semantics at scale, staging by module, surviving in-flight
  branches, keeping `git blame` usable, and rollback. Read when the change spans more
  files than a reviewer can read.
