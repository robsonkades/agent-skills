---
name: java-refactoring
description: >
  Refactoring mechanics for Java: characterisation tests, small reversible steps, what
  behaviour preservation actually covers, risk classification, and the catalogue —
  Extract/Inline, Split Phase, guard clauses, Remove Flag Argument, Pull Up and Push Down,
  Replace Conditional with Polymorphism or sealed types. What to detect is java-code-smells;
  evolution rules for published APIs are java-api-design. Use when restructuring code
  without changing behaviour, when a change is needed in code that has no tests, when a
  method resists extraction because everything shares locals, when inverting a condition
  into a guard clause, when converting an instanceof chain to a switch, when moving members
  through a hierarchy, or when you need to know whether a step crosses a lock, transaction,
  serialisation or published boundary and must stop. Getting a class that constructs its own
  dependencies into a harness in the first place is java-legacy-code-testing.
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
   a worked example. No net, no refactoring. The one exception is the step that makes the
   net possible at all: when the class cannot be constructed or the method cannot be
   reached, breaking that dependency is done without tests, under the constraints in
   `java-legacy-code-testing`.
2. **Classify the boundary.** Private or package scope: free rein — unless a framework
   reaches the name at runtime (JPA field access, Jackson, JPQL, reflective config), in
   which case it is case 4 of `references/compatibility.md` whatever the modifier says.
   Public within the codebase: every caller moves in the same change. Exported from a
   module or published to external clients: read `references/compatibility.md` before
   touching any signature — some steps must stop or become deprecation cycles.
3. **Classify the risk and name the dimensions at stake.** Read
   `references/behaviour-preservation.md` and decide, before the first step, which
   observable dimensions this step can touch — exception type, side-effect order,
   transaction boundary, emitted SQL or events, iteration order, memory visibility —
   and which proof each of those dimensions demands. Selecting the dimensions is what
   makes step 5's "run tests" mean something.
4. **Choose the technique** from the catalogue, routed by what is being reshaped:
   `references/techniques.md` for the core moves and the design choices,
   `references/catalogue-statements-and-data.md` for statements, loops and locals,
   `references/catalogue-conditionals.md` for branching,
   `references/catalogue-api-shape.md` for signatures,
   `references/catalogue-inheritance.md` for hierarchies. Every entry in the four
   catalogue files carries a labelled precondition — check it before the step, not after.
5. **Take one mechanical step: transform, compile, test, commit.** Where an IDE
   refactoring is available, use it: it resolves references the compiler will not report.
   Editing by hand — which is the agent's case — the substitute is the compiler plus an
   explicit caller enumeration: make the old symbol inaccessible and compile, then search
   the old name as a string across resources, XML, JPQL and annotations. Grep alone is
   not the enumeration. Automating the step across many files is
   refactoring-automation's.
6. **Repeat until done, then re-run the detection pass** (java-code-smells) to confirm
   the finding that motivated the work is actually gone.

## Rules

- A refactoring commit contains no behaviour change. A bug discovered mid-refactoring
  is recorded and fixed in its own commit, before or after — never inside.
- Every step is revertible on its own: if a step cannot be undone by reverting one
  commit, it was two steps.
- Tests red at the start means the task is "fix or characterise", not "refactor". Tests
  red after a step means revert the step, not patch the test.
- Never weaken an assertion to make a refactoring pass. A test whose assertions had to
  change is evidence the behaviour changed — which needs a decision, not an edit.
  Mechanical edits to call a renamed member are expected and are not that.
- Renaming or reshaping anything exported from a module, published as a library, or
  serialised is API evolution, not refactoring — hand over to java-api-design.
- Do not justify a refactoring by performance without a measurement. Restructuring
  changes allocation and dispatch patterns in both directions; claim readability, or
  bring a benchmark.

## References

- [Technique catalogue](references/techniques.md) — the core moves (Extract/Inline,
  Move, Rename, Parameter Object, Replace Type Code, Encapsulate Collection) and the
  design choices between them. Read when choosing or executing a step.
- [Statements, loops and data](references/catalogue-statements-and-data.md) — Slide
  Statements, Split/Combine Loops, Split Phase, Split Variable, Replace Temp with Query,
  Replace Derived Variable with Query, reference↔value. Read when a method resists
  extraction, or before reordering anything.
- [Conditional logic](references/catalogue-conditionals.md) — Decompose Conditional,
  guard clauses, Consolidate, Introduce Special Case, Introduce Assertion, instanceof
  chain to pattern switch. Read before inverting any condition or otherwise changing
  branching.
- [Reshaping a signature](references/catalogue-api-shape.md) — Change Function
  Declaration, Encapsulate Variable, Separate Query from Modifier, Remove Flag Argument,
  Preserve Whole Object, Remove Setting Method, Replace Constructor with Factory. Read
  when the change is visible to callers.
- [Moving members through a hierarchy](references/catalogue-inheritance.md) — Pull Up
  and Push Down, Extract Superclass, Collapse Hierarchy, Replace Subclass or Superclass
  with Delegate. Read before touching any `extends`, or before creating one.
- [Behaviour preservation](references/behaviour-preservation.md) — the dimensions of
  observable behaviour, risk classification, the places the compiler and the tests both
  lie, and the evidence ladder. Read at step 3 — it is what produces the classification.
- [Safety workflow](references/safety-workflow.md) — characterisation tests end to
  end, with a worked example that pins a bug on purpose. Read whenever coverage is
  missing or untrusted.
- [Compatibility](references/compatibility.md) — which changes break binary, source or
  behavioural compatibility, and where a refactoring must stop. Read before any step
  that touches a public or exported signature.
