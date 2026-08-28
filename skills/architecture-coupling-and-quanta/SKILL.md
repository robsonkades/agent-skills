---
name: architecture-coupling-and-quanta
description: >
  Naming the unit that actually ships and the coupling crossing its edge: static and synchronous
  dynamic coupling, connascence, and the architecture quantum as the maximal region closed under
  both. Use when a team calls the system decoupled because the services communicate by events,
  when twelve services always release together and nobody can say which one forces it, when a
  synchronous call was removed and the two parts still cannot ship separately, when nobody can
  say what would break if one component were deployed alone, when a diagram box maps to nothing
  that ships, when a schema is shared by several services with no compatibility policy, or when
  two people argue about whether something is "coupled". Does not cover whether to distribute
  (distribution-boundaries), package coupling (java-cohesion-coupling), the coordinated release
  shared jars force (component-and-release-boundaries), the trade-off method
  (architecture-trade-off-analysis), or publishing a fact versus making a call
  (event-driven-architecture).
---

# Architecture Coupling and Quanta

## Purpose

Name the unit that can ship on its own, and the coupling crossing its edge, before anyone argues about splitting it. Neal Ford's working definition, from the InfoQ _Hard
Parts_ podcast transcript: _"our definition of coupling is I'm coupled to something, if that thing changes, if I might have to change because of that, we are coupled to
one another."_ That one test, applied at four levels at once — package, jar, service, database — is the level no neighbour covers.

**The output is a map and two counts**, not a plan: how many quanta, how many deployment units, which edges hold the numbers apart. The gap is handed on —
`distribution-boundaries` for the process-boundary decision, `enterprise-architecture-smells` for the verdict.

## When to use — and when not

Use it when the estate spans more than one deployable and more than one team, and a claim about coupling has been made that nobody in the room can check.

- **Too small for the vocabulary to pay** — one deployable, or one team owning every deployable. With one deployable the quantum count is 1 and static coupling is total;
  with one owner, "who must I coordinate with to ship?" has no interesting answer whatever the count is. Either way the apparatus reduces to keeping the packages tidy,
  which `java-cohesion-coupling` and `layering-and-boundaries` own. **That threshold is this skill's own reasoning, attributed to nobody**: no study establishes a size
  below which the vocabulary costs more than it returns. The house line in `java-cohesion-coupling` holds unchanged — a 15-kloc service owned by three people does not
  need instability analysis; it needs clear names. Fowler's _MicroservicePremium_ is the nearest published position, and is an argument without data.
- **The one sourced datum on size** concerns the measurement, not the vocabulary: Kirbas et al. (_JSEP_ 29(4), 2017) report evolutionary coupling _"is less likely to have
  a relationship to software defects for parts of the software with fewer files and where fewer developers contributed."_ A two-person module yields noise; no threshold
  follows, only the warning.
- **Asked to prove or disprove a label** — "are we a distributed monolith?" — draw the map, report the two counts, and stop. **Converting the counts into the label by
  arithmetic is the move this skill exists to refuse**, whoever it favours: no count here defines any label, and 14 units against 6 quanta and 14 against 1 are both
  findings, neither of which is the word. The label is `enterprise-architecture-smells`'; a count produced to win an argument is a count nobody will re-derive, and the
  map is worth more to you unlabelled than the word is worth to the person asking.
- **The unit is agreed and the question is what to do** — hand off at once: process boundaries and their price to `distribution-boundaries`, releasable components to
  `component-and-release-boundaries`, the verdict to `enterprise-architecture-smells`. If the argument is which option is better, that is
  `architecture-trade-off-analysis`; scoring options here means you have crossed over.

## The decision this skill makes

**Is this candidate edge a quantum boundary — and if not, what holds it shut?** One edge at a time; for a given edge at a given moment the four readings are mutually
exclusive.

- **S — static coupling holds it.** A shared schema, a shared domain library, infrastructure the part cannot boot without at a version it must track, a contract with no
  compatibility policy. Not a boundary.
- **D — synchronous dynamic coupling holds it.** The caller cannot complete its own work without the callee's answer. Not a boundary, on _The Hard Parts_' wording or this
  skill's.
- **B — neither holds it.** A genuine quantum boundary; the two sides are separate quanta.
- **U — cannot tell from the diagram.** The honest fourth reading: a verdict, not a failure, obliging you to name the measurement that would settle it.

| Reading | Boot and correctness — _what must already exist for this part to start and be right?_ | Change obligation — _if the other side changes, is a coordinated change forced, and on whom?_ | Runtime completion — _can this part answer its caller while the other side is down?_ | Wins when                                                                                    | Loses when                                                                                                                  |
| ------- | ------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| **S**   | the other side's schema, library or infrastructure, at a compatible version           | yes, and the obligation runs to every reader of the shared thing, not only this pair          | often yes — which is exactly why this edge gets missed                               | a change to the shared thing has forced a coordinated release inside the window you measured | the shared thing is read-only, low-change reference data — Newman grades that tolerable where the quantum reading is binary |
| **D**   | the callee reachable; nothing of it present at build time                             | only when the contract changes; a versioned wire contract localises the obligation            | no — that is the definition                                                          | a request cannot be answered while the callee is down and the caller has no fallback         | a timeout-and-fallback path exists and is exercised; the coupling then sits on the contract, an **S** question              |
| **B**   | nothing of the other side                                                             | no; each side changes on its own schedule                                                     | yes                                                                                  | you can say what breaks if one side deploys alone, and the answer is "nothing"               | "we use events" is the entire evidence — async severs the dynamic leg and says nothing about the static one                 |
| **U**   | unknown, and that is the finding                                                      | unknown                                                                                       | unknown                                                                              | the diagram is the only artefact and the estate is too large for guessing to beat measuring  | it becomes a resting place: a **U** still standing at the next review is an **S** nobody wanted to write down               |

What each reading charges when right, how it goes wrong, what reverses it:

- **S** — price: a worst-case claim, felt as pedantry by a team shipping happily. Fails when "static" is read as "compile-time, between classes" — database, runtime and
  shared infrastructure are inside it where their change obligation runs to the parts. Reverses when the shared thing gets an owner and a compatibility policy.
- **D** — price: makes availability arithmetic the boundary question, inviting a fix nobody asked for. Fails when replacing the call with a queue is read as having
  created a boundary. Reverses when the caller can complete its own work without the answer.
- **B** — price: nothing, which is why it is asserted without evidence more than any other. Fails as "the services communicate by events, therefore they are decoupled".
  Reverses on one shared table, one shared domain jar, or one schema change that forced two releases.
- **U** — price: nothing decided and a review slot spent. Fails as a permanent parking space. Reverses when the measurement you named runs, which is why naming it is the
  deliverable.

## The method — from diagram to quantum map

A quantum is a **maximal region closed under static coupling and synchronous dynamic coupling** — the collapse performed by steps 3 and 4 below; a deployment unit is
whatever the pipeline happens to ship. Three services, three pipelines and one schema are three deployment units and one quantum. A monolith on one pipeline is one
quantum trivially — the concept earns its keep only in the first case.

**The two legs bound the region for different reasons, and conflating them is how a map goes wrong.** The **static leg governs deployability**: what one part must already
have, at a compatible version, to boot and be correct — **bounded throughout by Ford's test, because a thing every part needs identically forces no coordinated change and
is common ground, not an edge.** Step 2 applies it; every other statement of the leg in this package is scoped by it. The **synchronous dynamic leg governs operational
profile**: a caller that cannot complete without its callee inherits the callee's availability and load, so the two cannot hold different uptime or scalability numbers.
This skill's headline output — the unit that can ship on its own — is the static leg's question; the dynamic leg is why that unit cannot be given its own operational
targets either. In the table above, _boot and correctness_ tests the static leg and _runtime completion_ tests the dynamic one. _The Hard Parts_ names **high functional
cohesion** alongside both; cohesion is a judgement this skill does not measure, so the collapse below is over coupling alone.

1. **List what actually ships**, from the pipeline, not the diagram. A box with no pipeline is not a candidate, and that mismatch is the first finding.
2. **Draw the static edges — with the test, not the categories.** Ford's question decides each candidate: if this thing changes, might that part have to change with it?
   Schemas, shared domain libraries, infrastructure and contracts are **where to look, not what counts**. A broker or cluster every part uses identically is common
   ground, not an edge; a schema, a library or a contract whose change obligation runs to its readers is one. Categories have no floor and the test does — and if
   including something collapses the whole estate into one region, that is the limit of the definition rather than a fact about the estate: take the reading deliberately,
   write down which one you took, and carry both through step 5.
3. **Collapse the static edges.** Take their transitive closure; each maximal region is a candidate quantum. The database sits inside each service's static coupling, so
   every service bound to one schema lands in one region however many pipelines exist.
4. **Then the dynamic edges** — who calls whom, and whether the caller completes without the answer. Merge any two candidate regions joined by a synchronous call the
   caller cannot complete without: closing over both legs is what turns the candidates into quanta.
5. **Count both numbers**, quanta and deployment units, and name the reading each depends on. Where an S reading is contested the honest output is a range, not a number:
   report both counts and say which edge moves it. The gap is the diagnosis; hand it on.
6. **Name the connascence form on each surviving cross-region edge.** The second of Page-Jones' two operative rules: as locality decreases, only weaker forms should be
   tolerated. Connascence of name across a wire is ordinary; of meaning or algorithm — two services agreeing on an undocumented convention, or reimplementing one
   computation — is the finding.

**Say which book you are quoting, because the definition moved**: the connascence-flavoured wording is _Fundamentals_' (1st ed., 2020, ch. 7), the coupling-flavoured one
_The Hard Parts_' (2021, ch. 2) and _BEA_ 2e's, and **attributing the second to _Fundamentals_ is wrong**. Per-book wordings, their sourcing strength and the unverified
2nd-edition status are in `references/coupling-vocabulary.md` §3. `architecture-characteristics` uses "quantum" as the scope unit for a characteristics list: the same
unit, counted the same way.

Read `references/coupling-vocabulary.md` before arguing about what "coupled" means; `references/measuring-the-unit.md` before promising a number.

## Drivers for mapping it, and for leaving it alone

| Push on — map it                                                                   | Push back — skip it                                                          |
| ---------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| A coupling claim is being made that nobody can check                               | One deployable, or one team owning every deployable                          |
| A release needed cross-team coordination more than once and nobody logged why      | The unit is agreed and the open question is cost (`distribution-boundaries`) |
| A diagram box has no pipeline, or a pipeline has no diagram box                    | Everything measurable sits inside one repo one team touches (Kirbas, above)  |
| A schema has more than one writer, or a domain jar more than one consuming service | The map would change nothing anyone can act on this quarter                  |
| An incident's root cause crossed far more services than anyone expected            | Someone wants the verdict, not the map — `enterprise-architecture-smells`    |

When both columns are heavy, map only the edges the incident named: a map drawn for its own sake is a diagram, and the failure signature below says what diagrams become.

## Fitness functions

Candidate metrics only. Whether any is worth governing, and what happens when one goes red, is `architecture-fitness-functions`' decision; writing the test is
`architecture-testing`'s.

```text
Characteristic  Deployability — the estate claims independent deployment; the claim is unmeasured.
Metric          Deployment coupling: per ordered pair (A, B), the fraction of A's production
                deployments followed by a deployment of B for the same change-ref in one window.
Tool            No product does this. Compute it from the deployment record you already keep —
                GitHub Actions events, Argo CD sync history, Spinnaker or Harness executions.
Threshold       Confidence >= 0.8 over >= 10 deployments of A. This number is THIS SKILL'S OWN
                CONSTRUCTION, not an empirical result: no study establishes it. Its justification
                is definitional — at 0.8, "these deploy independently" is false four times in five.
Site            A scheduled report over a 90-day window, read by humans. Never a build gate: the
                input is history, which no commit can fix.
Confounders     A release train pushes every pair towards 1.0 and measures the process, not the
                architecture — compute over change-refs, not wall-clock. Deploy-on-merge in a
                monorepo republishes unchanged artefacts — exclude no-op deploys.
```

Two more, with preconditions and failure modes in `references/measuring-the-unit.md`:

- **Change coupling between deployables**, from git history — the one metric here with an empirical literature behind it. Tool: code-maat v1.0.4, released 2023-02-20,
  last commit 2025-07-03, both read 2026-08-28: not archived, not actively developed, its README pointing at commercial CodeScene. Say that date whenever you name it.
  Report a pair only at ≥10 shared commits and ≥50% coupling degree, excluding changesets over 50 files — CodeScene's published defaults, stricter than code-maat's own (5
  revisions, 5 shared, 30%), so they under-report. Scheduled, 90 days, module or repo granularity; never a gate, because history is not fixable by a commit.
- **More than one service writing to a schema** is the finding; read-only consumers are graded and reported separately, which is exactly where the two taxonomies
  disagree. Measure from the database, not config: `application_name` per `datname` (PostgreSQL `pg_stat_activity`), `program_name` (SQL Server `sys.dm_exec_sessions`),
  or distinct `service.name` per (`db.system.name`, `db.namespace`) in traces — stable names as of OpenTelemetry semconv v1.33.0 (2025); older instrumentation emits
  `db.system` and `db.name`, so a query against those is wrong today. Scheduled, never a gate.

**"Never a gate" is not a gap to fill with an invented one.** A gate can test only what is in the repo and fixable by the commit under test — a declared schema owner, a
compatibility policy on a contract, a module dependency rule — never a count derived from history or production topology. Turning a map finding into such a test is
`architecture-testing`'s subject, and whether it should gate anything is `architecture-fitness-functions`'.

**What cannot be governed.** Connascence has no analyser — the curated analysis-tools.dev catalogues list 137 Java and 135 Python tools, none connascence-specific
(checked 2026-08-28); any claim that a pipeline enforces it is false. Quantum count has no analyser either. Abstractness and distance from the main sequence stop at the
deployable — ArchUnit 1.5.0 (2026-08-04) computes them inside a codebase, but across a process boundary "abstract" has nothing to count, and their component-level use is
`component-and-release-boundaries`' subject.

## Failure signature — the unit identified wrongly

| Pattern                                         | 18 months on                                                                                                                                                                                                                                                                                                             | Earliest detectable symptom                                                                                                               |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| **Pipelines counted, static coupling not**      | Uber (Gluck, 23 July 2020): _"Networked monoliths can form, where services that appear to be independent all have to be deployed together to safely perform any change."_ 2,200 critical microservices, ~70 domains, a 1.5-year half-life per service, one root-cause investigation touching 50 services across 12 teams | Building a simple feature routinely means editing services owned by different teams. Count owners touched per feature from month one.     |
| **A shared library read as an internal detail** | Segment (Noonan, 10 July 2018): 140+ destinations in 140+ repos, **120 distinct versions of the shared libraries live in production**, 3 engineers full-time keeping it alive. Consolidating back cost the fault isolation the split had bought — carry that side too                                                    | Someone skips a shared-library upgrade "for now". Plot distinct live versions per internal library the first time the number exceeds one. |
| **The map never left U**                        | The measurement named at the review was never run, so the estate is still argued about from the same diagram and each new service is placed by analogy with a box whose coupling nobody established                                                                                                                      | An edge marked "need to check" survives two consecutive reviews. That is an **S** in waiting; treat the second occurrence as the finding. |
| **The evidence itself decayed**                 | Prime Video, 2023: the primary post now redirects away and survives only in the Internet Archive, and Adrian Cockcroft's rebuttal (6 May 2023) disputes the popular framing outright. A boundary can end up defended on a citation that no longer resolves                                                               | A coupling argument rests on a link nobody has opened this year. Re-fetch every load-bearing source before it decides anything, as here.  |

## How to record it

```text
ADR-031  Quantum map — order estate
Context      Ten deployment units, ten pipelines. Static edges: orders, billing and refunds all
             write schema `sales`; fulfilment and labels both depend on domain jar `sales-model`,
             which has no compatibility policy. Dynamic: checkout calls pricing synchronously
             with no fallback. Events between orders and analytics carry no static edge.
Decision     Eight of the ten services resolve into four quanta: {orders, billing, refunds} on S,
             {fulfilment, labels} on S, {checkout, pricing} on D, {analytics} on B. Search and
             catalogue stay U — their datasource comes from a config server and nobody could say
             which database it names.
Consequences The gap — ten deployment units against four resolved quanta, two unplaced — is the
             finding, not a plan; nothing is split or merged here. Recording the U as a U is part
             of the decision: it is scheduled, not settled.
Compliance   Deployment and change coupling, monthly, both trailing, neither on a gate. The 0.8
             threshold is our own construction, restated so the next reader does not mistake it
             for a result. `application_name` set in every service by the next release.
```

Write it when the map is drawn, while the U edges are still embarrassing; record discipline itself is `architecture-decision-making`'s.

## Honest standing

**The architecture quantum has no empirical literature at all** — a bibliographic search for the construct returns quantum-computing papers; it lives in practitioner
books and the teaching around them. **Its static leg has no published floor either**: read literally it swallows every shared broker and every unversioned contract, so on
a strict reading almost any estate reduces to one quantum, which is the same as having no map. The leg definition and step 2 bound it with Ford's test because nothing in
the books does — **that bound is this skill's own**, and where the reading is contested the count is a range, not a number. **Connascence is essentially unstudied**:
OpenAlex returns 16 works for `connascence software`, false positives included, and the founding 1992 CACM article shows 23 citations there and 11 in Crossref, against
thousands for the CK metrics suite. **The strength ordering is an unvalidated heuristic** its own advocates hedge: Weirich's reference talk is reported as declining to
assign a precise order, and whether Page-Jones claimed a total or a partial ordering could not be resolved here. The static-before-dynamic split is the robust part; the
ranking inside each half is asserted. **Structural coupling metrics largely stop predicting defects once size is controlled** — El Emam et al. (_IEEE TSE_ 27(7), 2001)
report 4 of 24 metrics surviving, 2 useful for prediction — but a published rebuttal exists in the same journal and **was not read for this skill**, so treat that as
serious and unsettled. Both sides agree size must be controlled for: a coupling threshold quoted without it is on the wrong side of a twenty-five-year-old finding.
**Change coupling is where the evidence lives** (D'Ambros et al., WCRE 2009, cited for the question, never for an effect size; Kirbas et al. 2017, above). DORA's
loosely-coupled-teams capability is survey-grade evidence that the _question_ is worth asking — not evidence for the quantum, for connascence, or for any threshold here.

**Two live disagreements about the unit itself, both sides** — two more, on the size confound and on connascence's standing, are in
`references/evidence-and-disagreements.md`. _Is a shared database really one quantum?_ The _Hard Parts_ authors say yes by definition. Newman grades it instead — a shared
database is common coupling, which he calls tolerable for read-only low-change reference data, while reaching into another service's database is content coupling, the
worst kind — and teams do deploy independently against shared schemas using expand/contract and per-service grants. The steelman of each: "one quantum" is a claim about
worst-case blast radius, "we deploy independently" a claim about its observed frequency; both can hold, and the real question is whether a unit should be defined by its
worst case. _Is the quantum useful, or a relabelling of "deployment unit"?_ For: it names a closure over static coupling and synchronous calls that a pipeline count
cannot see, and the gap between the two counts is the diagnosis. Against: wherever no edge survives either leg — each service owning its data is the common case, not the
whole condition — the counts are equal and the word adds nothing. **That "against" case is this skill's own reasoning — no published proponent was found, and inventing
one would be a fabrication.**

## References

- [Coupling vocabulary](references/coupling-vocabulary.md) — connascence, static versus dynamic at architecture scale, the two common garblings, the per-book quantum
  definitions and their attribution.
- [Measuring the unit](references/measuring-the-unit.md) — the three measurements in full, with defaults, preconditions and confounders, and what has none.
- [Evidence and disagreements](references/evidence-and-disagreements.md) — the evidence study by study, the four live disagreements, the failure records in full.
