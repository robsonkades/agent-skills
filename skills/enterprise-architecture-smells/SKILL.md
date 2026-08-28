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
   layer counts, imports, method bodies that only forward.
2. **Find the evidence in the history**, not only in the code. `git log` on a suspected god
   class shows whether unrelated features really do all edit it — which is the difference
   between a large class and a class with no responsibility.
3. **Name the harm.** Which future change is riskier? Which bug does this shape allow? If no
   harm can be named, drop the finding rather than softening it into a nitpick.
4. **Cost the fix.** Splitting costs navigation and wiring; adding an abstraction costs
   indirection. If the fix plausibly costs more than the harm, record it as an observation
   and say so.
5. **Check the acceptable case.** Every smell in the catalogue has a situation in which it
   is the right design. Check that situation before writing the finding.
6. **Order by impact and give the concrete first edit**, not a target architecture.

## The two failure modes of a review

```text
False positive: "this violates the pattern"
        A structure is unfamiliar or non-canonical, and the review
        recommends a refactor with no named harm. Cost is real,
        benefit is aesthetic.

False negative: "each file looks fine"
        Every class is reasonable in isolation; the problem is in the
        relationships. Only visible from counting — files per change,
        layers per call, forwarding methods per class.
```

## Decision rules

```text
An abstraction exists with one implementation and no inversion
        → indirection, unless it narrows a wide framework surface or
          exists to make a dependency point inward
          (enterprise-base-patterns). Ask which.

Adding a field touches more than about four files
        → count the layers it crossed. Two of them are probably
          structurally identical (remote-facade-and-dto).

A class is edited by every feature team for unrelated reasons
        → god class, confirmed by history rather than by size.

Rules are enforced in services and entities have only accessors
        → anaemic model — a finding ONLY if a domain model was the right
          choice here (domain-logic-organization).

Two services must be deployed together
        → distributed monolith. This is the most expensive smell on the
          list (distribution-boundaries).

A persistence type appears in a controller signature or an API payload
        → persistence leakage. Schema is now the contract.

An abstraction's stated purpose is portability that will never be
exercised
        → the cost is paid every day; the benefit is contingent and
          usually illusory (architecture-decision-making).

The codebase is unfamiliar but consistent, and change is cheap
        → not a finding. Consistency has value; personal preference does
          not.
```

## Rules

- **Evidence first.** Line counts, method counts and import counts are prompts to look at
  the history, never findings by themselves. A 900-line class that changes for one reason is
  healthier than a 200-line class that changes for six.
- The strongest available evidence in this domain is **files touched per feature**. Compute
  it from the last twenty feature commits; it exposes excessive layering, scattered
  responsibilities and missing boundaries at once, and it is hard to argue with.
- **Complexity is conserved.** An abstraction that claims to remove complexity has moved it
  — into configuration, into the framework, into a naming convention, or into the next
  team's onboarding. Locate it before approving the change.
- Anaemia is only a smell where a rich model was the right choice. Over transaction scripts
  with a gateway, "entities with no behaviour" is the design, correctly applied
  (`domain-logic-organization`).
- **A wrapper must add behaviour.** Translation, narrowing, a policy, an aggregate boundary,
  error mapping. A wrapper that forwards is a file, a mock in every test and a hop in every
  stack trace.
- Pattern overuse and pattern absence are equally real defects, and reviews are
  systematically biased towards finding the second. Ask "what would this cost if we deleted
  it?" as often as "what is missing?".
- **A smell in a stable, rarely-changed module is not worth fixing.** The cost of a smell is
  paid in change; a module that does not change is not paying it. Prioritise by change
  frequency, which `git log` gives directly.
- Do not recommend a target architecture. Recommend the next edit, with the harm it removes.
  Wholesale rewrites are how a real finding becomes a six-month project that stalls
  (`architecture-refactoring-paths`).
- Distinguish accidental from essential complexity. A saga is complex because distributed
  consistency is complex; a generic repository is complex for no reason. The first is a cost
  of the requirement, and removing it removes the capability.

## Finding format

Observation → harm → evidence → first edit → what to avoid.

> **Observation:** `OrderService` (3 240 lines, 11 collaborators) contains the pricing rules,
> which also appear in `QuoteService` and the nightly re-rate job.
> **Harm:** the last two pricing incidents were a rule changed in one of the three places.
> The next rule change carries the same risk.
> **Evidence:** `git log` shows 47 commits in 6 months from 5 teams; 9 touch pricing, and 6
> of those touch exactly two of the three sites.
> **First edit:** extract `Pricing` as a domain type with the discount chain, and have all
> three call it. Do not move anything else.
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
