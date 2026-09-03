---
name: architecture-fitness-functions
description: >
  The governance decision for an architecture characteristic — what to govern, at what threshold, where,
  and what happens when it goes red — not how the test is written: the objectivity test, triaging an
  inherited suite, and marking a characteristic explicitly ungoverned. Use when incidents pass a gate that
  stayed green, when rules are skipped or red on main and nobody remembers why, when a driving
  characteristic has no check, when "maintainable" is proposed as the thing to measure, when a scanner
  ships a threshold that cannot fail, when a frozen baseline has not shrunk in a year, when an SLO
  dashboard is called a fitness function but nothing stops, or when a green pipeline reads as
  architectural health. Does not cover writing the test (architecture-testing), pipeline composition and
  ratcheting onto legacy code (quality-gates), deriving the list (architecture-characteristics), the
  analysis method (architecture-trade-off-analysis), CI thresholds (performance-regression-ci), or error
  budgets (slo-and-alerting).
---

# Architecture Fitness Functions

## Purpose

One line decides everything. Rebecca Parsons: _"The single most important thing about a fitness function
is that you and I will never disagree on whether it passes or not."_ (Thoughtworks Podcast, 6 Mar 2025.)
**A fitness function needs an operational decision rule whose result is reproducible within stated
measurement uncertainty.** Competent people may still disagree about whether the proxy, threshold,
or consequence represents the intended characteristic; that is a governance defect to expose, not
proof that no fitness function exists. The books add
_"an objective integrity assessment of some architecture characteristic"_ (_Fundamentals_ ch. 6; _BEA_
ch. 2 — via reader notes, so no page is claimed), leaving two clauses implicit: **a fitness function
is a metric, a threshold, a site and a consequence.** No consequence, a dashboard; no site, a wish.

## When to use — and when not

The unit is **independent change sources**: how many teams, contractors or agents can merge a change to
the thing the rule protects without a shared reviewer. `architecture-characteristics` moved off headcount
onto quantum count because quanta measure the problem; here the organisation _is_ the problem.

- **One source, characteristic met with margin** — review already catches it. Write the rule in the ADR,
  record it ungoverned, and name the trigger: a second team, a merge bot, an agent with commit rights.
- **Use it** when a driving characteristic can be violated by someone not in the review, or once it has
  been violated; Juhls & Morales (AWS, 22 Jul 2021) advise starting with about three.
- **Not here:** how the test is written (`architecture-testing`); which checks a change must pass, or
  introducing one onto a codebase that fails it (`quality-gates`).

## Before deciding, when something already exists

**Incidents to learn from? Diagnose first.** The prior question is not what to govern but **which number,
read before the merge, would have been red?** Walk each post-mortem back to the earliest artefact carrying
the signal. One would ⇒ that is the metric, and its site is where it could first have been read — including
the narrow case where you already measure it and the threshold sat past the incident (p99 380 ms against a
400 ms gate): recalibrating _is_ the fix. None would ⇒ moving a threshold governs nothing; you are missing a metric, not a number.

**Rules already there, provenance lost, build red? Triage before adding, in this order.**

1. **Inventory** — a row per rule, marked skipped, red or green — and `git blame` the suppression file and
   the rule definitions: the provenance everyone assumes is lost is usually there.
2. **Three eliminating questions** per rule: which characteristic does it defend; can more than one change
   source violate it; would two reviewers agree on its result? Failing any one it leaves — retiring a rule is a legitimate outcome, not a defeat.
3. **Route the survivors** into T, C or M; declare every characteristic left with no rule **U**.
4. **Under a deadline**, green by a date cannot be the goal, since retiring everything achieves it; the goal is that every remaining red is one somebody chose. Retire and declare first.

If the caller cannot state the characteristic list at all — the normal inherited case — derive a provisional one from the surviving rules, each of which defends something, and send it to `architecture-characteristics`.

## The decision this skill makes

**For this one characteristic, which governance mode?** Exactly one — though a composite decomposed into
constituents puts each in its own mode. Nothing here is unconditional, this suite included: one check
costs maintenance and a suite costs more. **T** automated triggered (commit, PR, release stage, nightly).
**C** automated continual, against the running system. **M** manual at a cadence: owner, criterion, date,
recorded verdict — not "we'll look at it sometime". **U** explicitly ungoverned: the name stays on the
list, governance reads _none_ with an owner and a review date. **This four-mode set, the change-source unit, the triage order above, the price/reversal column below and the delivery paragraph are this skill's construction, not the authors'**; the axes and the quotations are theirs.

| Mode  | Objectivity — _would two reviewers agree?_              | Cost — _who pays a red with no defect?_                   | Latency            | Consequence — _what stops, and who may override?_                               | Price even when it is right, and what reverses it                                                                                                      |
| ----- | ------------------------------------------------------- | --------------------------------------------------------- | ------------------ | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **T** | highest — binary by construction                        | every change waits, including ones that could not fail it | minutes to a day   | merge or release blocked; the override is logged                                | every legitimate change edits the rule too, and the expressible rule stands in for the one that matters. Reverse if its site cannot produce its metric |
| **C** | high on the number, contested on attribution            | an on-call rota; a false alarm wakes someone              | seconds to minutes | the documented policy may page, halt rollout, or consume error-budget authority | monitoring cost, noisy attribution, and operational coupling. Reverse or recalibrate when false action outweighs detection value                       |
| **M** | depends on criterion, evidence and reviewer calibration | a calendar slot, and a person senior enough to be scarce  | one cadence period | a named owner records the verdict and required action                           | scarce attention and inter-reviewer variance. Reverse when the decision can be made reproducibly from captured evidence                                |
| **U** | none claimed — that is the point                        | nothing now; the full cost of the drift later             | unbounded          | none. The consequence is that the record says so out loud                       | the residual is real and nobody watches it; it fails when measurable things get filed under "can't be automated". Reverse on a clean metric            |

## Classifying it tells you where it runs

Axes from _BEA_ ch. 2 (1st ed., 2017, carried forward; whether the 2022 edition changed them is unverified). Independent, not a partition: every check sits somewhere on each. Two more are reminders, not poles: checks are mostly **intentional**, some **emerge** (_absence of a check for X is not evidence X is fine_), and **domain-specific** ones exist only for your business and its regulator.

| Axis                      | Poles                                                                 | What the position buys you                                               |
| ------------------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| **atomic ↔ holistic**     | one aspect, one context ↔ several aspects interacting, shared context | holistic catches the cache that fixes scalability and breaks freshness   |
| **triggered ↔ continual** | fires on an event ↔ constant verification in production               | the book says _continual_; the Radar and everyone else say _continuous_  |
| **static ↔ dynamic**      | fixed pass/fail ↔ the acceptable value moves with context             | a delta threshold survives traffic growth; an absolute one is a promise  |
| **automated ↔ manual**    | runs itself ↔ a named human verdict against a written criterion       | **objective ≠ automated** — a legal sign-off with a criterion is both    |
| **temporal**              | fires because time passed, not because code changed                   | certificate expiry, EOL runtimes, the "break upon upgrade" backport test |

Placement rule: **the earlier it runs, the more binary it must be** — a dynamic threshold on a PR produces
arguments, a binary one on a monitor produces 3 a.m. pages, a trailing metric cannot gate a PR at all.
Placement table and the four legitimate reasons a check stays manual: `references/catalogue.md`.

## Drivers for encoding a rule, and for leaving it to judgement

| Push toward encoding                                                                | Push back toward judgement                                                                       |
| ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Cheap to avoid while the code is written, costly to unwind once others depend on it | The rule you can express is not the one you mean; enforce it and you govern the expressible      |
| It has happened once already and review did not catch it                            | The result needs interpretation: a red starts an argument rather than ending one                 |
| More than one independent change source, no shared reviewer                         | Its site cannot reliably produce its metric, and it is the largest test you own                  |
| A regulator or a contract will ask for dated evidence                               | Ford: rules nobody understands produce _"an antagonistic, a police state"_ and get routed around |

## The words this displaces — one test separates them, and **governed ≠ measured**

| Term                  | What it actually is                                                        | Relation                                                                                                                                                            |
| --------------------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Unit test**         | a code unit's behaviour against a domain expectation                       | Same harness, different subject: fitness functions measure the -ilities, not behaviour (Ford, 2025)                                                                 |
| **Architecture test** | executable assertion over structural or runtime architectural properties   | A common subset, often atomic/static/triggered but not necessarily: contract, resilience and topology checks can be dynamic or holistic. `architecture-testing`     |
| **Quality gate**      | a bundle of pass/fail conditions at one pipeline stage                     | A delivery mechanism for the atomic/static/triggered ones. Every quality gate is a set of these; most cannot sit in one. `quality-gates`                            |
| **SLO**               | a target value or range for an SLI (the SLI is the metric, so not yet one) | A continual + holistic + dynamic fitness function **iff wired to a consequence** — a budget freezing deploys. On a dashboard, a metric. `slo-and-alerting`          |
| **SLA**               | a contract with users, carrying consequences                               | Usually motivates internal fitness functions with safety margin. The contractual measure itself can be governed, but waiting for breach leaves no response headroom |
| **Metric**            | a number with no threshold and no consequence                              | The gap is exactly those three missing clauses — threshold, site, consequence                                                                                       |

## Fitness functions

The subject, not a mirror of it. Every entry takes this shape, its threshold carrying its justification:

```text
Characteristic  Security — implicit-and-critical on ADR-021; several hundred transitive dependencies.
Metric          Highest CVSS among resolved dependencies, plus the count matching the CISA Known Exploited Vulnerabilities catalogue (KEV).
Tool            OWASP dependency-check, Trivy or Grype — replaceable; currency checked by the research brief on 2026-08-27, not by this skill. Confirm before depending on one.
Threshold       The score your own remediation policy already commits to fixing inside a stated window —
                borrowed, not chosen: "high and above inside 14 days" means no build may pass a high on
                day zero. Plus zero KEV entries at any score: that list is exploitation evidence, not severity. The trap is the shipped default: failBuildOnCVSS is 11 on a 0-10 scale, so an unconfigured install can never fail.
Site            The PR on the resolved graph, and nightly on the released artefact — the CVE feed moves without your code, so that one is temporal.
Consequence     Merge blocked; nightly opens a ticket due inside that window, failBuildOnUnusedSuppressionRule on so a dead suppression also fails.
```

**When one goes red** there are three legitimate outcomes: fix the code; change the check deliberately, with
a recorded reason; retire it. Not "skip it for now", and not a baseline mistaken for a ratchet —
`FreezingArchRule` fails only on _new_ violations and **does not enforce that the count falls**. The
valuable red is two checks contradicting each other — Parsons: _"when two fitness functions objectively
contradict each other, then we have to stop with that illusion"_ that all are achievable at once. Ownership sits _"as close as possible to where the problem is"_; a rule its own team cannot change is a straitjacket.

## What cannot be governed, and how to say so

Subjectivity disqualifies more than teams admit. _"Be maintainable"_ and _"good performance"_ are not
fitness functions (Ford 2022; Parsons 2025); cyclomatic complexity under a limit is. **But operationalising
is not governing** — complexity is a proxy, the residual ungoverned whether you say so or not.
Composites decompose and the composite does not: agility = modularity + testability + deployability, all
three measurable, agility still not. Maintainability is the one people arrive with, and
`references/catalogue.md` works it through: five constituents, the row governing each, the residual none see. The deliverable is that decomposition, a check per constituent, **and a written statement of
what they do not cover**. Four things deterministic checks cannot see (Mahato, Sieczkowski & Kuppusamy,
InfoQ, 17 Aug 2026): **boundary fidelity**, semantic coupling violating no stated rule; **semantic contract
drift**, an API staying compatible while ceasing to express the right domain concept; **workflow coupling**, paths no dependency graph shows; **stale ADR assumptions**. So: every change passes every rule while the set of changes drifts from the intent.

**Declaring it ungoverned.** The characteristic stays on the list; its register entry reads `governance:
none`, with an owner, a review date and one sentence naming what is at risk. No source states this as a
practice; it is the only construction surviving the objectivity test without pretending. Run
`scripts/check-governance-register.mjs` over that register nightly — it fails an entry claiming governance with no consequence, or ungoverned with no owner or a lapsed review date.

## Failure signature

| Pattern                                 | 18 months on                                                                                                                                                                                                  | Earliest detectable symptom                                                                                                                                         |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **It shipped unable to fail**           | A vulnerability report generated on every build for a year, never once red, everyone believing security is governed, `failBuildOnCVSS` still at its default of 11 on a 0-10 scale                             | Prove the negative path with a safe fixture. A check may legitimately stay green because it prevents defects; lack of a controlled failing test leaves that unknown |
| **The pawl nobody pulled**              | A frozen violation store committed 18 months ago, the same size, refrozen twice. The rule is documentation with a build step attached                                                                         | Nobody can state the baseline number without opening the file, and nobody plots it                                                                                  |
| **Every change green, the design gone** | Boundary fidelity and workflow coupling eroded one legal change at a time; the green pipeline was read as architectural health, a stronger claim than it can support                                          | A new joiner's model of the boundaries comes from the code and differs from the ADR                                                                                 |
| **Trained to re-run**                   | The holistic checks are re-run until they pass. Google (17 Apr 2017, ~4.2M tests) found flakiness rises with test size; a commenter datum there: a stable test turning flaky was a real bug about 1 time in 6 | A re-run in the merge log with no accompanying code change                                                                                                          |

## How to record it

```text
ADR-023  Governing the order-intake quantum's driving characteristics
Context      Driving list (ADR-021): elasticity, availability, deployability; security implicit-and-
             critical. Four independent change sources merge here, two outside the team.
Decision     Security -> T (above). Availability -> C: the 99.9% SLO already promised to customers, wired
             to a deploy freeze when the budget is spent; without that freeze it was a dashboard for two
             years. Elasticity -> T nightly, not the PR: it needs a load generator and a warm autoscaler.
             Deployability -> M, monthly, never a gate because it trails.
Consequences One nightly environment, one rota, the wait every change pays. Maintainability is NOT governed: its five constituents are, the residual is accepted. Owner: the tech lead.
Compliance   FF-04, FF-06, FF-11, FF-14 and one ungoverned entry, in the register the nightly script checks.
             Review 2027-02-01, then annually — BEA ch. 2: "at least once a year".
```

**Handing it back.** Whoever funds this asks two questions, neither about taxonomy. _What does it cost?_ —
one nightly environment, one rota, and the wait every change pays; give the wait in minutes. _What are we still exposed to?_ — read the ungoverned entries aloud: that list is the answer, green checks are not. Say _a check that stops something_ for fitness function, _we measure it and nothing happens_ for a dashboard, _nobody watches this, and here is who reconsiders_ for ungoverned.

## Honest standing

**No study shows that fitness functions improve outcomes** — no controlled study, no cohort comparison, no
survey isolating the practice. Adjacent evidence supports the problem and the characteristic, never the
mechanism: Li, Liang & Avgeriou (2023) mined 606 violation-related comments from 21,583 code-review comments
across four OpenStack and Qt projects, showing erosion is real and acted on; DORA puts loose coupling among the strongest predictors of delivery performance — the property, not its preservation. Claiming measured benefit is lying.

**The live disagreement, both sides.** _Rebranding_: the proponents' own Radar text says a fitness function
_"may encompass existing verification criteria, such as unit testing, metrics, monitors, and so on"_, and
Kubowicz (nexocode, 14 Mar 2022) reads ArchUnit as a flexible linter with a ceiling where Java's type erasure
makes some legitimate rules inexpressible. _Genuinely new_: Ford says the subject is new — architectural capabilities, not business behaviour; Parsons that it is the objectivity criterion plus an owner and a cadence. Both predict the same practice; take neither.

## References

- [Catalogue](references/catalogue.md) — metric, threshold shape, site and classification per characteristic, the placement table, dated tool status. Read when choosing a metric and a site.
- [What cannot be governed](references/ungoverned.md) — decomposition procedure, judgement-bound
  categories, the register schema the script reads. Read before declaring anything ungoverned.
- [Disagreements and evidence](references/disagreements-and-evidence.md) — both disagreements in full,
  the maintenance-cost question, the evidence table. Read when someone calls the practice proven.
