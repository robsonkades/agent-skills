---
name: java-refactoring
description: >
  Refactoring mechanics and the safety workflow for Java: characterisation tests,
  small reversible steps, behaviour preservation, and the technique catalogue —
  Extract/Inline, Move, Rename, Parameter Object with records, Replace Conditional
  with Polymorphism or with sealed types and exhaustive switch, Encapsulate
  Collection, Replace Inheritance with Composition. Use when restructuring code
  without changing behaviour, when a change is needed in code that has no tests, or
  when a refactoring approaches a public API or module boundary and compatibility is
  in question. What to detect is java-code-smells; evolution rules for published APIs
  are java-api-design.
---

# Java Refactoring

## Purpose

Behaviour preservation is a claim, and claims need evidence. This skill exists to
prevent the two ways "refactoring" goes wrong: the rewrite wearing refactoring's name —
no tests, big steps, behaviour quietly changed — and the refactoring that compiles
everywhere but breaks clients, because a step crossed a binary- or source-compatibility
line nobody checked.

## Workflow

1. **Establish the safety net.** Run the existing tests; they must be green before the
   first step. If the code to change has no meaningful coverage, write
   characterisation tests first — read `references/safety-workflow.md`, which includes
   a worked example. No net, no refactoring.
2. **Classify the boundary.** Private or package scope: free rein. Public within the
   codebase: every caller moves in the same change. Exported from a module or
   published to external clients: read `references/compatibility.md` before touching
   any signature — some steps must stop or become deprecation cycles.
3. **Choose the technique** from `references/techniques.md`, which maps the catalogue
   to Java 25 forms — including the Replace-Conditional decision between polymorphism
   and sealed + exhaustive switch.
4. **Take one mechanical step: transform, compile, test, commit.** Prefer the IDE's
   automated rename/move/extract over hand-editing — it finds callers you will not.
5. **Repeat until done, then re-run the detection pass** (java-code-smells) to confirm
   the finding that motivated the work is actually gone.

## Rules

- A refactoring commit contains no behaviour change. A bug discovered mid-refactoring
  is recorded and fixed in its own commit, before or after — never inside.
- Every step is revertible on its own: if a step cannot be undone by reverting one
  commit, it was two steps.
- Tests red at the start means the task is "fix or characterise", not "refactor". Tests
  red after a step means revert the step, not patch the test.
- Never weaken an assertion to make a refactoring pass. A test that had to change
  is evidence the behaviour changed — which needs a decision, not an edit.
- Renaming or reshaping anything exported from a module, published as a library, or
  serialised is API evolution, not refactoring — hand over to java-api-design.
- Do not justify a refactoring by performance without a measurement. Restructuring
  changes allocation and dispatch patterns in both directions; claim readability, or
  bring a benchmark.

## References

- [Technique catalogue](references/techniques.md) — each technique's mechanics in Java
  25 terms, when it applies, and its cost. Read when choosing or executing a step.
- [Safety workflow](references/safety-workflow.md) — characterisation tests end to
  end, with a worked example that pins a bug on purpose. Read whenever coverage is
  missing or untrusted.
- [Compatibility](references/compatibility.md) — which changes break binary, source or
  behavioural compatibility, and where a refactoring must stop. Read before any step
  that touches a public or exported signature.
