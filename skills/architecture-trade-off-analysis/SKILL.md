---
name: architecture-trade-off-analysis
description: >
  Analysing architectural trade-offs through coupling, comparable options, domain scenarios,
  qualitative evidence and controlled measurement. Use when a scorecard is being totalled, a
  generic comparison or case study is offered as a verdict, candidates sit at different abstraction
  levels, advocates disagree on the basis for choosing, or a benchmark is proposed. Produces a
  recommendation with applicability conditions, costs and reversal signals. Does not own ADR
  discipline (architecture-decision-making), pattern selection, deliberate technical debt,
  estimation uncertainty or architecture-smell detection.
---

# Architecture Trade-off Analysis

## Purpose

Two practitioner heuristics (_Fundamentals_, 1st ed., ch. 1; a third is reported in the 2nd ed., ch. 27, wording
unverified, so nothing rests on it). First: _"Everything in software architecture is a trade-off."_
Corollary 1: _"If an architect thinks they have discovered something that isn't a trade-off, more
likely they just haven't identified the trade-off yet."_ Second: _"Why is more important than
how."_ The authors infer that no context-free best practice settles a complex system. Treat that as
a challenge to unsupported defaults, not proof that transferable practices or dominant options
never exist. The deliverable is a recommendation with its applicability conditions.

**This skill holds no domain opinions**; it is the method other skills defer to. It never withholds
an answer, though: every run ends in a recommendation carrying its winning conditions, its costs
and its reversal signal, and analysis handed back with none has failed. The four sections below are
instantiated on the analysis itself — mode decision, mode table, drivers, failure signature — and
A–D are scaffolding here, not the authors' vocabulary.

## When to use — and when not

Use it when dimensions are entangled: moving one moves others, and no option wins on every axis.

- **Too small for the decision to matter** — all three, the third being the veto: one deployable;
  one team under about eight engineers (a rule of thumb, not sourced); the change reversible by one
  person in a day. A small team choosing a process boundary fails the third — mode A's _loses when_.
- **No option differs on any driver**, or **a constraint already settles it** (regulation, contract,
  data residency): record the constraint — a comparison with a fixed outcome is theatre.
- **A driver is missing, not an analysis** (`architecture-decision-making`); or the disagreement is
  about who decides, or about budget. None of those is analysis.

## The decision this skill makes

**Which analysis mode does this situation warrant?** One dominates; they compose only as below.

- **A — Decide now.** No dedicated analysis; state the choice and the trigger to revisit.
- **B — Qualitative comparison.** A decision-complete set rated on this system's own entangled dimensions.
- **C — Build and measure.** A spike or load test producing a number about _this_ system.
- **D — Refuse to decide yet.** Name what you await and the event that ends the wait. Modes compose
  in sequence — B then C; A plus D's revisit trigger — but never blend into one hedged answer.

| Mode  | Cost, and the confidence it produces                                                      | Wins when                                                                         | Loses when                                                                                         |
| ----- | ----------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| **A** | minutes; no confidence beyond the decider's experience                                    | reversible in a day, one module, one owner                                        | the target is a published contract, a datastore engine, a process boundary                         |
| **B** | hours to days of others' time; ordinal, contestable, never a score                        | two or more credible options, entangled dimensions, people who know the system    | the deciding factor is a real quantity — throughput, unit cost, tail latency — nobody has measured |
| **C** | days to weeks plus the build; estimates with stated uncertainty, valid for the experiment | deciding dimensions are measurable and being wrong costs more than the experiment | workloads, implementations or environments cannot be made representative enough for the decision   |
| **D** | ongoing carrying cost; buys optionality, not knowledge                                    | the option is genuinely open and delay costs less than a wrong turn               | delay itself forecloses options, or a team is blocked                                              |

What each charges even when right, how it goes wrong, what reverses it — and the deadline case:

- **A** — price: no record, so the next team re-decides. Fails as the unnamed dimension dominating
  by year three; dishonest when it dodged an argument. Exit: the question returns a third time.
- **B** — price: an ordinal answer an advocate can re-argue. Fails as dimensions picked by the
  winner's advocate and a summed matrix; dishonest presented as objective. Exit: it comes out level.
- **C** — price: a number valid only for the workload modelled. Fails by measuring the prototype;
  dishonest when it ends an argument it did not answer. Exit: the spike grows a second question.
- **D** — price: every later decision made blind. Fails as deferral rebranded as prudence;
  dishonest when dodging an unwelcome answer. Exit: the date passes unchanged — D has become A.
- **Under a deadline**, run B short rather than skip it: a comparable option set and one inverting scenario are
  load-bearing; isolated ratings and the full matrix drop first. Ship that, plus what stays open.

## The method

_Hard Parts_ ch. 2 and 15, verbatim: **1.** Find what parts are entangled together. **2.** Analyse
how they are coupled to one another. **3.** Assess trade-offs by determining the impact of change
on interdependent systems.

Coupling has one test and no moral loading: _"if someone changes X, will it possibly force Y to
change?"_ Static coupling is how parts are wired, dynamic coupling how they call one another at
runtime. Dimensions come from step 1: proposing candidates for the room to accept or reject is
eliciting and is the job; filling in a borrowed list is importing (_"each architecture is unique"_).
The coupling map may give the correlation directly; the matrix is one route to it. Then, in order:

- **Make the option set decision-complete.** Compare candidates at the same abstraction level and
  include credible status quo, hybrid and defer options. Literal exhaustiveness is usually
  impossible in an open technology market; document exclusions and recheck material arrivals.
- **Rate each option in isolation, then consolidate** into ordinal words, and **read the matrix for
  correlations, never for a total** — summing is the Out-of-Context Scorecard anti-pattern. Weighted
  scoring totals by design; side against it here because the weights are the advocate's ("Honest
  standing" below), not because scoring is settled.
- **Delete the dimensions your context makes irrelevant.** In the shared-service/shared-library
  example the real context removes five of eight and the apparent winner no longer holds. If
  nothing deletes, that is a finding — the decision is genuinely multi-dimensional — not a failure.
- **Model concrete domain scenarios until one inverts the apparent winner.** _"Thinking about
  architecture problems in the generic and abstract gets an architect only so far."_
- **Reduce to one "which is more important?" question in business language**, then **fix the most
  constraining dimension first**, iterate, and stop when _"what's left is design."_

Read `worked-analysis.md` to run this end to end; `qualitative-and-quantitative.md` for B vs C.

## Drivers for more analysis, and for deciding now

_Hard Parts_ ch. 7 uses **disintegrators**/**integrators** for granularity only; applying them to
analysis effort is this skill's extension, not the authors'. The columns list forces, not pairs.

| Disintegrators — analyse further                                                            | Integrators — decide now                            |
| ------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| Irreversibility (Fowler, _IEEE Software_ 2003 — not the books' term)                        | Reversible by one person in one commit              |
| Blast radius spans teams, clients or data; entangled dimensions; an advocate with an answer | Blast radius is one module; cost of delay compounds |

When both columns are heavy, use B to identify separating dimensions and C where an experiment can
materially reduce uncertainty. More measurement is not worthwhile when no plausible result changes
the choice.

## Resisting evangelism, including your own

Bias here is measured; the method is not. Borowa et al. (arXiv:2309.14175) recorded **155 bias
occurrences across 12 architects** — anchoring 24, irrational escalation 20, bandwagon 19 — and a
later experiment (arXiv:2502.04011) found **practitioners more susceptible than students**.

- Force every advocate, yourself included, to state the disadvantages — _"nothing in software
  architecture is all good"_ — refuse the two-sided-argument framing, and treat a shocking new
  capability as a claim to test with a scenario. Anecdote is compelling and still anecdote.

Read `references/bias-and-evidence.md` when an advocate is in the room or sunk cost is invoked.

## Fitness functions

Encode the failure mode you accepted risk on. A metric with no collection mechanism, threshold,
evaluation site or consequence is inert:

```text
Characteristic  Modularity — the monorepo decision accepted the risk of accidental coupling
                between projects through repository proximity.
Metric          Imports crossing a module boundary the target does not publish.
Tool            ArchUnit (v1.5.0, 2026-08-04): noClasses().that().resideInAPackage("..billing..")
                .should().dependOnClassesThat().resideInAPackage("..pricing.internal..").
                Confirm any tool is still maintained — Simian Army (Fundamentals ch. 6) is archived.
Threshold       Zero NEW violations — FreezingArchRule, today's count as a baseline. Zero because a
                crossing costs a minute to avoid while the code is written and a migration
                once others depend on it; the baseline stops the gate blocking on legacy.
Site            The pull-request check. Nightly is too late: the import is merged by
                then, and a fitness function that reports after the fact is a dashboard.
```

The other two are the same shape: services per engineer, on-call pages per destination, from the
service registry and paging tool, reviewed weekly, alerting on a rising gradient over three
months, not an absolute value. **Do not build a cabal** — the authors warn against _"an impossibly
complex, interlocking set of fitness functions that merely frustrate developers and teams."_
(`architecture-characteristics` and `architecture-fitness-functions` go deeper.)

## Failure signature — of the analysis, not of any one choice

| Pattern                               | 18 months on                                                                                                                                                                                                                                                           | Earliest detectable symptom                                                                                      |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| **A dimension never on the list**     | Segment (Noonan, 2018): right at t=0 — per-destination queues killed head-of-line blocking — wrong at t=3y: _"operational overhead increased linearly with each added destination"_; 140+ services and repos, library versions diverged                                | A cost growing with a count nobody plots. Plot services, repos and pages against units of growth from month one. |
| **The out-of-context comparison**     | Prime Video (team write-up, reached here via devclass, May 2023): a hard limit at ~5% of expected load, rebuilt as one process for >90% infrastructure cost reduction. The deciding dimension — per-state-transition cost per second of video — is in no generic table | The table would read identically at another company. If nothing in it names your domain, it has not been done.   |
| **Dimensions chosen by the advocate** | MongoDB/Jepsen 4.2.6: transactions defaulting to `local` and `w: 1` with ~80% of users on defaults; the vendor's summary of the audit _"discusses only passing results … buries the actual report in a footnote"_                                                      | The evaluation ran on the vendor's configuration, or every reported dimension was one the vendor chose.          |
| **A situated analysis generalised**   | Uber→MySQL (2016) reused as a verdict on PostgreSQL. Haas disputed not their experience but the missing inputs: untried replication tools, `hot_standby_feedback`, fixes in newer releases                                                                             | A case study cited without naming the citing team's constraints. Ask which of their conditions you share.        |

All four end the same way: **nobody can re-open the decision**, because the record says what was
chosen and not what it depended on. The Second Law failing.

## How to record it

_Hard Parts_ ch. 1, crediting Nygard:

```text
ADR-014  Payment processing granularity
Context      One payment service or several. Entangled: extensibility, data consistency,
             deployability. The MECE option set; what was ruled infeasible, and why.
Decision     A single payment service, and the mode that produced it (B, three scenarios).
Consequences The trade-offs considered, the ones we dislike included: every new payment
             type touches a shared deployable. The observation that would reverse it.
Compliance   FF-07, weekly platform review — a trailing metric cannot gate a PR. Payment-service
             deploys against the estate median, rolling quarter, alerting above 2x: a service
             changing at twice the median is absorbing changes that belong to its callers.
```

Write it when the decision is made — a retrospective record captures justification, not reasoning.
Record discipline and reversibility pricing belong to `architecture-decision-making`.

## Honest standing of this method

**No study shows that trade-off analysis — this technique, ATAM, matrices or ADRs — produces better
architectures.** No outcome evidence exists for any; the bias findings above concern decision-makers,
not the method. Three disagreements are live, all sides in `references/bias-and-evidence.md`.
_Rigour?_ The SEI school says yes (ATAM: utility trees, quality-attribute scenarios, auditable);
_Hard Parts_ dismisses them in one sentence for lacking _"focus on real problems architects face on
a daily basis"_; Dasanayake et al. found methodology supporting **2 of 10** architects, intuition 7.
_Prioritising characteristics?_ Utility trees assume yes; Richards and Ford call rank-ordering _"a
fool's errand"_. _"It depends"?_ Analysis only if the dependencies are named and each one answered.

## References

- [Worked analysis](references/worked-analysis.md) — the method run end to end on one decision.
- [Qualitative and quantitative analysis](references/qualitative-and-quantitative.md) — B vs C.
- [Bias and the evidence base](references/bias-and-evidence.md) — counter-moves, all three disagreements.
