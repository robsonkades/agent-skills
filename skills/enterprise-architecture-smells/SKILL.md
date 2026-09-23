---
name: enterprise-architecture-smells
description: >
  Detecting structural problems in an enterprise application from evidence, and telling
  genuine harm apart from unfamiliar-but-fine: anaemic domain models, god services,
  transaction-script sprawl, generic repositories, excessive layering and DTO mapping, leaky
  abstractions, distributed monoliths, persistence leakage, and abstractions that only move
  complexity. Use when reviewing an architecture or a large pull request, when adding a
  field touches seven files, when a "clean architecture" refactor is being proposed, when an
  interface has one implementation, when a wrapper adds no behaviour, when a pattern is
  being applied because it is a pattern, when a codebase feels wrong but nobody can say why,
  or when deciding whether an abstraction is worth keeping. Does not cover the migration
  once a smell is confirmed (architecture-refactoring-paths,
  legacy-enterprise-modernization), performance diagnosis (architecture-and-performance), or
  the individual patterns' own guidance.
---

# Enterprise Architecture Smells

## Purpose

Turn architectural unease into findings with evidence, and stop the two opposite mistakes
that reviews make: declaring a smell because a structure is unfamiliar, and missing one
because every individual file looks reasonable.

A smell is not a defect. It is a **symptom that warrants investigation**, and it becomes a
finding only when a concrete harm can be named: a change that is riskier, a caller that can
break, a test that cannot be written, a cost that is being paid for nothing.

## Workflow

1. **Observe, do not diagnose.** Record what is actually there: file counts per change,
   layer counts, imports, method bodies that only forward. Reuse the requested scope,
   accepted decisions, caller contracts and existing evidence before asking for missing
   context; investigate only uncertainties that could change a finding or correction.
2. **Find the evidence in the history**, not only in the code. `git log` on a suspected god
   class suggests whether unrelated features edit it; inspect the diffs and use cases to
   distinguish cohesive work from competing responsibilities.
3. **Name the harm.** Which future change is riskier? Which bug does this shape allow? If no
   harm can be named, drop the finding rather than softening it into a nitpick.
4. **Cost the fix.** Splitting costs navigation and wiring; adding an abstraction costs
   indirection. If the fix plausibly costs more than the harm, record it as an observation
   and say so.
5. **Check the acceptable case.** Every smell in the catalogue has a situation in which it
   is the right design. Check that situation before writing the finding.
6. **Order by impact and give the concrete first edit**, not a target architecture.
   Stop when representative paths support the finding or an acceptable counterexample;
   an estate-wide inventory is not required for a local finding. Report checks performed
   separately from proposed validation, and retain a sound design when no finding survives.

Inspect the project's JDK, persistence namespace/version, Spring proxy/transaction configuration
and public contracts before recommending Java-specific edits. This skill has no executable
Java baseline; examples are partial shapes or policy snippets, not standalone programs. Do not
upgrade dependencies to apply them. If history or runtime evidence is unavailable, state the
missing evidence and a discriminating check; do not invent a confirmed finding.

## The two failure modes of a review

```text
False positive: "this violates the pattern"
        A structure is unfamiliar or non-canonical, and the review
        recommends a refactor with no named harm. Cost is real,
        benefit is aesthetic.

False negative: "each file looks fine"
        Every class is reasonable in isolation; the problem is in the
        relationships. Trace representative changes and runtime paths;
        file/layer/forwarding counts help select where to investigate.
```

## Decision rules

```text
An abstraction exists with one implementation and no inversion
        → inspect narrowing, policy, compatibility and extension contracts
          before treating the indirection as waste (enterprise-base-patterns).

Adding a field touches many files
        → inspect why each changes: migrations, tests and independent
          contracts can justify them. Investigate duplicate responsibility
          and manual mapping drift (remote-facade-and-dto).

A class is edited by every feature team for unrelated reasons
        → investigate competing responsibilities and concrete change conflicts.

Rules are enforced in services and entities have only accessors
        → anaemic model — a finding ONLY if a domain model was the right
          choice here (domain-logic-organization).

Two services must be deployed together
        → distinguish contract incompatibility from release policy or a
          temporary migration; assess lost deployment independence and
          actual operational cost (distribution-boundaries).

A persistence type appears in a controller signature or an API payload
        → inspect exposed fields, serialization and lazy access; mapping
          annotations alone do not make every column the wire contract.

An abstraction's only stated purpose is hypothetical portability
        → compare present cost with a concrete supported migration contract;
          do not assume future use or non-use (architecture-decision-making).

The codebase is unfamiliar but consistent, and change is cheap
        → unfamiliarity alone is not a finding. Still investigate independently
          evidenced correctness, security, availability or operating harm.
```

## Rules

- **Evidence first.** Line counts, method counts and import counts are prompts to look at
  the history, never findings by themselves. A cohesive 900-line class may be less costly
  to change than a 200-line class serving conflicting responsibilities; verify actual harm.
- **Files touched per feature is a screening metric.** Group commits by actual feature/PR,
  separate generated files, tests and migrations, and compare similar changes. Squashes,
  formatting, renames and unrelated bundled work distort counts; corroborate with diffs,
  incidents, lead time or repeated correction sites. Twenty matching commits is a sample,
  not a confidence guarantee.
- An abstraction can remove duplication and accidental complexity as well as move costs.
  Compare caller simplicity with configuration, maintenance and onboarding costs; do not
  assume complexity is a conserved quantity.
- Anaemia is only a smell where a rich model was the right choice. Deliberate transaction
  scripts and shared policies may use data-only ORM entities or a gateway; neither shape
  alone establishes bypassable or duplicated rules
  (`domain-logic-organization`).
- **A wrapper must justify its boundary.** Translation, narrowing, policy, independent
  ownership or compatibility may justify forwarding. Inspect annotations and interceptors
  before concluding that an empty-looking body contributes nothing.
- Investigate both unnecessary patterns and missing boundaries. Ask "what would this cost
  if we deleted it?" as well as "what is missing?"; neither category is a defect by itself.
- Change frequency affects maintenance priority, but stable modules can still impose
  security, correctness, availability or operating costs. Rank observed harm and exposure
  alongside change cost; stability alone neither requires nor rules out a fix.
- Do not recommend a target architecture. Recommend the next edit, with the harm it removes.
  Wholesale rewrites are how a real finding becomes a six-month project that stalls
  (`architecture-refactoring-paths`).
- Distinguish accidental from essential complexity. Evaluate whether distributed consistency
  is required before defending a saga, and whether shared repository behavior serves real
  callers before rejecting genericity. Name the capability that removal would lose.

## Finding format

Observation → harm → evidence/confidence → first edit → validation → what to avoid.

Illustrative finding; replace these names and counts with inspected evidence:

> **Observation:** `OrderService` (3 240 lines, 11 collaborators) contains the pricing rules,
> which also appear in `QuoteService` and the nightly re-rate job.
> **Harm:** the last two pricing incidents were a rule changed in one of the three places.
> The next rule change carries the same risk.
> **Evidence:** `git log` shows 47 commits in 6 months from 5 teams; 9 touch pricing, and 6
> of those touch exactly two of the three sites.
> **First edit:** extract one shared `Pricing` policy with the discount chain, and have all
> three call it. Do not move anything else.
> **Validation:** preserve pricing outcomes at all three entry points, including rounding
> and rejected inputs; verify that one representative rule change updates one policy site.
> **Avoid:** splitting `OrderService` by layer first — that reshuffles the duplication
> without removing it.

## References

- [Smell catalogue](references/smell-catalogue.md) — each smell with symptoms, cause,
  consequences, a detection command or query, the refactoring direction, and the situation
  in which it is actually acceptable. Read when investigating a specific suspicion.
- [Pattern overuse](references/pattern-overuse.md) — the abstractions that cost more than
  they return: interface-per-class, generic repositories, mapping chains, speculative
  plugin points, premature services and premature domain models; with the questions that
  decide whether an abstraction stays, and how to remove one safely. Read when deciding
  whether something should exist at all.
