---
name: feature-context-analysis
description: >
  Reading the repository for one specific feature: which technologies and patterns are actually
  present, which components the feature can reuse, which questions the code has already
  answered, and — stated as findings rather than silence — which it has not. Use before asking
  the user anything, before proposing a technology, when a feature is about to be built in a
  style the codebase does not use, when "the project uses X" is being asserted without a path,
  when an abstraction is about to be created that already exists, or when picking up a codebase
  you have not read. Does not decide whether a found technology may be used for this feature
  (feature-decision-analysis), does not enumerate what the change will touch
  (feature-architecture-analysis), and is not a general method for reading an unfamiliar
  enterprise codebase (enterprise-application-architecture) or auditing it for defects
  (java-code-smells).
---

# Feature Context Analysis

## Purpose

Two things go wrong when this phase is skipped.

The agent asks the user questions the code answers, spending the user's attention on facts and
then having none left for the decisions only the user can make. Or the agent builds in a style
the codebase does not use — a second HTTP client, a third validation approach, an abstraction
that already exists two packages away — and the review is about the shape of the code rather
than about whether the feature is right.

The output is a **context report**: every line either cites evidence or says the evidence is
absent. Absence is a finding, not a gap in the report.

## Workflow

1. **Scope the sweep to the feature.** Read what the feature will plausibly touch and one ring
   around it. A whole-repository survey costs more than it returns and produces a report nobody
   uses.
2. **Work the checklist** in `references/investigation-checklist.md` — build, dependencies,
   layering, persistence, messaging, configuration, security, observability, testing, delivery.
   Each concern gets a finding or an explicit "not found".
3. **Cite everything.** `path:line`, a dependency coordinate with its version, or the command
   and what it printed. A finding with no citation goes in as an assumption or not at all.
4. **Close the unknowns it can close.** Walk the discovery ledger and mark each unknown this
   sweep answered, with the evidence. This is the phase's main product.
5. **List reusable components** by name and location, with what each would have to change.
6. **List the conflicts** — anything in the request that the codebase makes awkward, expensive
   or impossible, and what the code says about why.
7. **Label every technology finding as observed**, never as required. That distinction is the
   whole reason the report is trustworthy.
8. **Preserve traceability.** Assign or reuse `F-*` for evidence and resolve `U-*` by appending the
   fact/source; name the input feature revision so later baseline changes can invalidate findings.

## Decision rules

```text
IF a pattern appears in three or more places with no counter-example
THEN it is an established project pattern. Follow it, and say that you are.

IF a pattern appears twice with a counter-example
THEN it is a practice, not a pattern. Name both forms and let the decision phase pick.

IF a pattern appears once
THEN it is an instance. It is evidence of nothing; do not generalise from it.

IF a technology is present in the build but unused in code
THEN report it as available-but-unused. It is not a precedent for using it.

IF the concern is absent entirely — no caching, no retries, no audit trail
THEN that is a finding. Report "not found", not "the project does not need it".

IF the feature needs a capability and something close already exists
THEN name it, say precisely what it lacks, and let the decision phase choose between
     extending it and adding a second one.

IF version-specific API behaviour matters
THEN read the version the project actually depends on, from the build file, before
     asserting anything about that API.
```

## Constraints

- **Observation is not authorisation.** "The project uses Kafka" is a fact about the project.
  "This feature will use Kafka" is a decision, and it is not this phase's to make.
- **Do not infer a standard from a majority.** Consistency across a codebase can mean a
  standard, a template, or one person who wrote most of it. The report says how many places and
  whether there is a counter-example; it does not conclude.
- **Do not report what you did not read.** "The codebase appears to use X" without a path is
  the failure mode this phase exists to prevent.
- **Do not fix anything.** Defects found during the sweep are reported, not repaired — they are
  either in scope, in which case the scope phase adds them, or they are someone else's change.

## Output

```text
Existing architecture      <shape, with the paths that show it>
Input revisions            <Product/Engineering or Tech Feature revision IDs>
Relevant modules           <path -> what it owns>
Relevant components        <name, path, what it does>
Existing patterns          <pattern, count, counter-examples>
Existing technologies      <name, version, where used, observed>
Reusable components        <name -> what it would need>
Potential conflicts        <request item vs what the code makes hard, with evidence>
Constraints from the code  <what cannot change, and why>
Questions answered         <U-* -> F-*, evidence>
Still unknown              <U-nn, and why the repository cannot answer it>
```

The last two rows are what the next phase consumes. A report that produces neither has surveyed
the codebase without advancing the feature.
