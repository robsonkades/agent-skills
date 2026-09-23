---
name: feature-context-analysis
description: >
  Reading the repository for one specific feature: which technologies and patterns are actually
  present, which components the feature can reuse, which questions the code has already
  answered, and — stated as findings rather than silence — which it has not. Use when a scoped
  feature needs repository evidence before clarification or technology selection, when it is about to be built in a
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

The output is a **context report**: findings cite evidence and distinguish observation, inference
and unresolved questions. "Not found in this sweep" is bounded search evidence, not proof of
absence throughout the system.

## Workflow

1. **Scope the sweep to the feature.** Read what the feature will plausibly touch and one ring
   around it. A whole-repository survey costs more than it returns and produces a report nobody
   uses.
   If the feature is too ambiguous to select relevant paths, ask the smallest scope question;
   repository investigation does not require delaying a question only the user can answer.
2. **Work the checklist** in `references/investigation-checklist.md` — build, dependencies,
   layering, persistence, messaging, configuration, security, observability, testing, delivery.
   Relevant concerns get a finding, bounded "not found", "not examined" or "unavailable".
3. **Cite findings to their sources.** Use `path:line` or a command with captured output and
   its target module/profile/configuration. Dependency coordinates and versions identify an
   artifact; also cite what establishes its declared or resolved status. A material claim not
   established by evidence remains unknown; label it an assumption only when provisionally
   adopted, with its basis and falsifier.
4. **Close the unknowns it can close.** Walk the discovery ledger and mark each unknown this
   sweep answered, with the evidence. This is the phase's main product.
5. **List reusable components** by name and location, with what each would have to change.
6. **List the conflicts** — anything in the request that the codebase makes awkward, expensive
   or impossible, and what the code says about why.
7. **Separate observed technologies from required constraints.** A technology mandate needs
   an applicable policy, contract or accepted decision with source and authority; presence in
   the implementation does not supply that authority.
8. **Preserve traceability.** Assign or reuse `F-*` for evidenced facts with linked sources, and
   resolve `U-*` by appending the fact/source. Preserve each identifier's meaning; name the input
   feature revision so later baseline changes can invalidate findings.
   Reuse the existing ledger when present; otherwise concise inline IDs/unknowns are enough.
   Record repository revision and relevant working-tree changes as well as the feature input.

## Decision rules

```text
IF a pattern appears repeatedly
THEN report instances, independent contexts, counter-examples and declared/enforced policy.
     Repetition alone does not establish authority or decide this feature's design.

IF a pattern appears once
THEN it is evidence of that instance, possibly the closest relevant precedent;
     explain its scope without generalising it to the whole project.

IF a technology is declared but no direct source use was found
THEN distinguish declared, resolved for the target configuration and observed active use.
     Check configuration, auto-configuration, generated code and reflective loading when relevant;
     absence of imports does not prove it unused or available on the target runtime.

IF no implementation was found in the inspected scope
THEN state paths, search terms and limits; deployment/platform behavior may live elsewhere.
     Report "not found here", not "the project does not need it".

IF the feature needs a capability and something close already exists
THEN name it, say precisely what it lacks, and let the decision phase choose between
     extending it and adding a second one.

IF version-specific API behaviour matters
THEN inspect compiler release/toolchain and resolved dependency evidence for the relevant
     module/profile/configuration, including parents/BOMs/constraints and runtime image.
     If resolution is unavailable, label the declared version and leave behavior conditional.
     Preserve target versions rather than upgrading them to fit an API.
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
Existing patterns          <pattern, count within inspected scope, counter-examples>
Existing technologies      <name, version, where used, observed>
Reusable components        <name -> what it would need>
Potential conflicts        <request item vs what the code makes hard, with evidence>
Constraints from the code  <enforced/documented requirement vs change cost, with evidence>
Questions answered         <U-* -> F-*, evidence>
Still unknown              <U-nn, search limits/access gaps, smallest next evidence or question>
```

Scale the report to the feature: omit irrelevant rows and reuse existing artifacts. Before handing
off, verify cited paths match the current revision and each resolved unknown is actually supported.
Do not mark a product decision answered merely because one implementation was found.
End the sweep when material questions in scope have supported answers or bounded evidence/access
gaps with the next check or accountable role identified. Expand only when further inspection could
change the feature decision or resolve a material gap; unrelated unread modules do not prevent handoff.
