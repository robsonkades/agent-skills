---
name: architecture-characteristics
description: >
  Deriving and capping the architecture characteristics a system is built for: the three-part
  test, explicit versus implicit sourcing, the ≤7 driving / top-3 cap and Others Considered,
  and scoping each list to one quantum. Use when "must be scalable" is the entire list, when
  a dozen -ilities are all driving, when two stakeholders both claim the top priority and
  will not rank, when "reliability", "agility" or a home-grown -ility is claimed as one
  characteristic, when scalability and elasticity are used interchangeably, when strong
  consistency and high availability both hold a top-three slot, when an estate shares one
  list, or when a quality model is offered as the list. Does not cover the trade-off method
  (architecture-trade-off-analysis), turning a characteristic into a scenario and recording
  the decision (architecture-decision-making), clarifying a requirement
  (requirements-and-acceptance), operational targets and alerting (slo-and-alerting), or
  uncertainty in numbers (estimation-under-uncertainty).
---

# Architecture Characteristics

## Purpose

Produce the short, named, written-down list of characteristics this system is built for — and the list
of those it is not. The three-part test, all three at once: it **specifies a nondomain design
consideration**; it **influences some structural aspect of the design**; it is **critical or important
to application success**, because supporting it adds complexity (_Fundamentals_ 1st ed., ch. 4 — four
agreeing note sets, not the book text). Test 2 discriminates: _does this require special structural consideration to succeed?_ If not it is not one, whatever the requirements call it.

**The taxonomy you meet elsewhere is not Richards' current method** (Ford has published nothing that
abandons it). Operational / structural / cross-cutting is 1st ed. (2020) and still dominates secondary
writing; Richards' own worksheet (revised **March 2024**) replaces it with one flat list — adding
deployability, elasticity, workflow, data integrity/consistency — plus a separate box of four implicit characteristics. Whether the 2nd ed. follows the worksheet is **unverified**.

## When to use — and when not

- **Too small to earn it** — **one quantum**, and nothing nameable beyond the standing implicit four
  (feasibility (cost/time), security, maintainability, observability). The unit is quantum count, not
  headcount: twenty-five engineers on one deployable still do not need the ceremony, and six engineers
  across three quanta do. Write the one characteristic that shapes the design and stop. Otherwise: before the first structural decision on a quantum, and whenever one splits.
- **The middle** — one quantum, but someone outside the team wants a list: translate their concerns
  out loud, name three, stop. Skip the ≤7 pass and the worksheet — but not Others Considered, which
  is one line and is what stops an exclusion reading as an oversight in eighteen months.
- **The list exists and the task is making one observable** — `architecture-decision-making` owns the
  scenario and the record; `slo-and-alerting` owns the operational target and its alerts.
- **The argument is over which option serves an agreed characteristic** — that method is
  `architecture-trade-off-analysis`; this skill defers to it entirely. If the requirement itself is
  ambiguous, clarify it first (`requirements-and-acceptance`).

## The decision this skill makes

**Which named characteristics hold the driving slots for _this quantum_, and which named candidates
are excluded on the record.** Worksheet, verbatim: _"Identify no more than 7 driving characteristics"_
· _"Pick the top 3 characteristics (in any order)"_ · _"Implicit characteristics can become driving
characteristics if they are critical concerns"_ · add the rest _"to the Others Considered list"_. Two caps, not one. The cap is not amnesia: the discarded list keeps an exclusion re-openable.

Five candidate sets, three slots — while one of **G**/**C** is genuinely driving and no off-table
driver takes a slot, two of the five lose: G and C cannot both hold the first, which accounts for one,
and exactly one of the remaining three loses too. **G — growth and burst**: scalability, elasticity.
**C — agreement across stores**: data consistency only — single-store atomicity is a transaction, and data integrity is that pair's other axis (per-datum correctness a saga does not threaten), so neither is priced below.
**U — staying up**: availability, fault tolerance. **P — the user's clock**: performance, responsiveness.
**A — change speed**: deployability, testability, maintainability (agility, decomposed). **The sets, their dimensions and the slot arithmetic are this skill's construction, not the authors'** — only the magnitudes are theirs, from _The Hard Parts_ (2021) saga table read as a conflict statement.
It settles only the slots the **conflicting** characteristics take: a driver conflicting with nothing here — data integrity, interoperability, workflow, a regulatory obligation — takes a slot without appearing at all. Greenfield, every measurement below lives in the system being replaced; with no predecessor it is an assumption and the ADR says so.

| Set   | Cross-store agreement — _can a named person state a legitimate disagreement window?_ | The user's clock — _time to process a request, or time to answer the user?_     | Load shape — _is demand a trend, a scheduled spike, or an unscheduled one?_ | Coupling — _how many deployables change together for one feature, now or by design?_ |
| ----- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| **G** | eventual across stores by construction; you buy the reconciliation problem           | high to very high (choreographed/async rows)                                    | the slot's purpose — scalability for a trend, elasticity for either spike   | low–medium, plus an autoscaler to operate                                            |
| **C** | atomic **across stores** — the only set that buys it                                 | low responsiveness (Epic; orchestrated is the cheaper atomic option, at medium) | very low (Epic; low orchestrated)                                           | very high (Epic; lower orchestrated)                                                 |
| **U** | unchanged by this set                                                                | uptime only — availability is a number in 9s, fault tolerance is a blast radius | neutral; redundancy is not headroom                                         | replicas and failover paths to operate; direction not tabulated                      |
| **P** | unchanged by this set                                                                | the slot's purpose — say which clock; batching moves the two opposite ways      | neutral                                                                     | queues and caches to operate; direction not tabulated                                |
| **A** | neutral                                                                              | neutral                                                                         | neutral                                                                     | the slot's purpose — low coupling, worthless until decomposed                        |

- **G** — every read becomes a staleness decision, permanently, and rented headroom idles between spikes. Reverses when demand stops spiking: the shape, not the volume.
- **C** — the whole right side of that table at once. Reverses the moment a named person in the business can state a tolerable disagreement window; that sentence is the reversal.
- **U** — redundant paths exercised only in the failure you did not model, and a strict 9s number a degrading design can miss. Reverses on a priced outage minute below standby.
- **P** — an instrumentation bill on both clocks, and a latency budget spent here is not spent elsewhere. Reverses when the promised clock is already met at the p99 the business cites.
- **A** — nothing, until decomposed: a slot spent on "agility" is a slot spent on a word. Inverts when lead time is already short and the constraint is demonstrably elsewhere.

## Where the list comes from, and what it is a list _for_

Three sources: **requirements** (explicit), **implicit domain knowledge**, **domain concerns**. From
the Silicon Sandwiches kata (ch. 5), explicit: "thousands of users, potentially millions" →
scalability; peak-hour bursts → elasticity. Implicit: availability, reliability, security and
internationalization — the last from the expansion plan, which is in no requirement. Stakeholders say "we are acquiring three regionals", never "interoperability"; **translating that out loud, in front of them, is what separates a driver from a wish.**

**A characteristic has a scope, not a whole-system value** — "the system is scalable" is malformed.
The unit is the **architecture quantum**: 1st ed., _"an independently deployable artifact with high
functional cohesion and synchronous connascence"_; _The Hard Parts_ restates it as high static plus
synchronous dynamic coupling, so say which book you quote. The database is inside the quantum if the system will not run without it; four such services are four quanta, four lists, four worksheets.

## Drivers for putting a characteristic on the list, and for dropping it

| Push on — add the slot                                                                                                                                                                   | Push back — drop it                                                                                                                                            |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Test 2 bites: you can point at the structural consequence                                                                                                                                | The design is identical with and without it — a requirement, not a characteristic                                                                              |
| A domain concern translates to it with the stakeholder in the room                                                                                                                       | Another slot implies it: concurrency is _"implied when scalability and elasticity are supported"_ (worksheet)                                                  |
| It is implicit _and critical_ — the standing four are on by default, slots only on that test                                                                                             | A composite: reliability → availability, testability, data integrity, data consistency, fault tolerance; agility → maintainability, testability, deployability |
| The domain skews it — Eckhardt et al. (530 NFRs, 11 specs, 5 companies): corpus-wide 27.2% Functionality, 19.6% Security; embedded 54% Reliability                                       | A constraint, not a quality — feasibility (cost/time) has no equivalent in ISO 25010:2011 or :2023, and Glinz would class it as a constraint                   |
| ATAM's 15-year data: modifiability 26% of scenarios in one sub-study, 35% of embedded concerns; ~80% of performance and 64% of availability scenarios concerned partial or major failure | No affordable fitness function — ungoverned by construction, which makes it a wish                                                                             |

The last two left-hand rows are population base rates, not tests of the system in front of you: they say where to look first, and only the top three decide. Their instruction once you have a list: **try to drop one (or two)**. No slot is free — each charges design complexity before the business problem is touched, which is the whole argument for the cap.

**A name the worksheet does not carry** — auditability, disaster recovery, whatever your organisation
invented — is admitted by the same three-part test, then decomposed: ask what would be measured to
know it holds. If the answer is a list of things, it is a composite and its primitives take the slot.

## The pairs that are not synonyms

Worksheet: _"some systems only need one of these, other systems may need both."_ Needing both is legitimate; naming both by accident is the failure.

| Pair                              | The axis that separates them                                                         | What naming both costs                                               |
| --------------------------------- | ------------------------------------------------------------------------------------ | -------------------------------------------------------------------- |
| performance ↔ responsiveness      | time to process a business request vs time to get a response to the user             | instrument both clocks; batching improves one and degrades the other |
| scalability ↔ elasticity          | growth over time at constant error rate vs 20 → 250,000 instantly — the axis is time | headroom you hold vs headroom you rent, and two different bills      |
| availability ↔ fault tolerance    | uptime in 9s vs other parts continuing when fatal errors occur                       | a strict 9s target can penalise the degradation fault tolerance buys |
| data integrity ↔ data consistency | correct and not lost, per datum, vs in sync across stores                            | a saga threatens consistency, not integrity — say which you meant    |
| adaptability ↔ extensibility      | adapt to a changed environment vs add function to a fixed one                        | two distinct modularity investments, routinely bought as one         |

**Reliability is absent here because it is not primitive**; neither is agility.

## Fitness functions

A named characteristic with no fitness function is ungoverned by construction. Composites get none —
measure the primitives, or it was never a characteristic. One carried end to end:

```text
Characteristic  Elasticity, not scalability. Worksheet: elasticity is "able to expand and respond
                quickly to ... extreme loads (e.g., going from 20 to 250,000 users instantly)";
                scalability is growth over time at constant error rate.
Metric          Error rate and p99 during a synthetic arrival step from median to the 90-day peak
                multiple inside 60 seconds — 12x steeper than the observed ramp, deliberately.
Tool            k6 (v2.2.0, 2026-08-10), open-model (constant-arrival-rate), so the generator keeps
                arriving when the system slows rather than measuring its own client. Confirm any tool
                is still maintained before a fitness function is allowed to depend on it.
Threshold       Error rate under the figure already in the intake SLO; p99 under 2x steady-state p99 for
                no longer than the autoscaler's measured scale-out time. Two of the three are borrowed,
                not chosen: the SLO is a promise already made, and the scale-out interval is the window
                in which degradation is physics — past it, it belongs to the design. The 2x is the one chosen number, a convention not a derivation; replace it with the multiple your own incident record shows customers actually complain at.
Site            Nightly against staging, reviewed weekly — deliberately not the pull-request check: the metric needs a load generator and a warm autoscaler, which a per-PR gate cannot produce, and a fitness function whose site cannot produce its metric is decoration.
```

That is the order-intake quantum's; admin holds no elasticity slot and pays none of it. Availability and deployability take their own; deployability's metric is trailing too, so it belongs in that same weekly review and never on a PR gate. Keep the set small.

## Failure signature

| Pattern                                    | 18 months on                                                                                                                                                                                                                          | Earliest detectable symptom                                                                    |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| **One architect was the whole process**    | Ameller et al. (RE'12, Table IV): NFRs invented solely by the architect in **10 of 13** projects, undocumented in **9 of 13**, tool support in **0 of 13**; **11 of 13** declared every NFR met, one validated as many as three types | Ask two people for the top three, get two lists; ask where the list lives, get a person's name |
| **Named, but not refutable**               | Nothing can be said about whether it was met, so nothing was. ATAM on _"The architecture shall be modifiable and robust"_: _"untenable here, because they have no operational meaning: they are not refutable"_                       | Names with no response measure — no number, no threshold, no site where it is checked          |
| **Implicit, critical, and never governed** | HealthCare.gov: CMS _"did not plan for adequate capacity"_, and test documentation lacked _"criteria for determining whether a system passed a test"_ (GAO-15-238, 2015) — never doubted, never measured                              | A launch checklist with a test for the characteristic and no pass criterion                    |
| **Two conflicting slots, both kept**       | "Strongly consistent" and "highly available" both in the top three is a recorded wish, not a decision; every feature re-decides it locally and the estate gets neither                                                                | Two teams cite the same list to justify opposite designs, and both read it correctly           |

## How to record it

```text
ADR-021  Driving architecture characteristics — order-intake quantum
Context      Quantum: the order-intake service and its database (it does not run without it); admin
             and reporting are separate quanta with their own lists. Sources: requirements ("thousands
             of users, potentially millions"); the expansion plan, where internationalization comes
             from; the session translating "we are acquiring three regionals" into interoperability.
Decision     Three driving, unordered: elasticity, availability, deployability. Elasticity and not
             scalability: demand is a 41x spike over 12 minutes at on-sale, flat year on year, not a
             rising trend. Data consistency is excluded deliberately — Finance named 15 minutes as a
             tolerable window for intake and ledger to disagree, making it an exclusion, not an oversight.
Consequences Eventual consistency and the reconciliation job it needs, priced here. Deployability holds
             the slot, not agility, because agility cannot be measured. Others Considered: scalability,
             data consistency, interoperability, concurrency (implied), and the implicit four.
Compliance   FF-11 nightly plus weekly review (above). A characteristic reaching a review with no
             fitness function moves to Others Considered — it was never being governed.
```

Write it when the list is set, not at the end. Record discipline and turning each name above into an
observable scenario belong to `architecture-decision-making`; this skill stops at the capped list.

**Handing it back.** Someone who asked for a sign-off gets a sentence before a list: "Yes to three of
these, no to the rest, and here is the one exclusion that changes the design." Say _one deployable and
the store it cannot run without_ for quantum, _too vague to measure, so measure its parts_ for
composite, and _decided against, written down_ for Others Considered. If the list arrives already approved, do not reopen the format — name the single characteristic whose exclusion nobody has actually decided, and let that carry it.

## Honest standing

**No outcome evidence shows that capping the list at three improves anything.** Four searches found
none: it is a practitioner heuristic from two consultants with a large teaching practice, published
without data. **Miller's 7±2 is not support** — nothing connects it to characteristic counts.

What _is_ measured, and is the better argument for a short list: stakeholders _"cannot reliably and
repeatably make finer distinctions than High, Medium, and Low"_ (CMU/SEI-2000-TR-004 §5.3, 2000). A
long ranked list is fiction, and the distributions above are concentrated enough that a cap is cheap.

**The live disagreement, both sides.** _Richards and Ford_: cap at ≤7, then have domain stakeholders
pick three **in any order** — the unorderedness is itself a concession that fine ranking is not
obtainable. _The SEI tradition_ (Kazman, Klein, Clements): prioritise only over concretised scenarios,
never over attribute names, and on two dimensions, importance and risk. The sharpest evidence is from
inside the rigorous camp and cuts against the simple cap — in that same report _"security and modifiability were initially designated by the stakeholders as the key attributes"_, and refinement through the utility tree _"resulted in determining that performance and availability were also important."_ So **"ask for three and stop" is contradicted; "translate, cap, get three, then concretise and re-check" is not** — and the reference says what to do with the names that re-check turns up.

## References

- [Eliciting and capping](references/eliciting-and-capping.md) — the translation table, both caps in sequence, Others Considered, the SEI utility tree, and what to do when the re-check returns a fourth characteristic. Read before running the stakeholder session.
- [Definitions and composites](references/definitions-and-composites.md) — verbatim worksheet definitions, the five pairs in full, decomposing reliability and agility. Read when two people use one of these words differently, or reliability or agility is claimed as a single characteristic.
- [Taxonomy and ISO 25010](references/taxonomy-and-iso.md) — 2020 taxonomy vs the 2024 worksheet, ISO 2011 vs 2023 (they differ materially; always say which you mean), the mapping, the critiques. Read when someone cites "the book's three categories" or a quality model is offered as the driving list.
