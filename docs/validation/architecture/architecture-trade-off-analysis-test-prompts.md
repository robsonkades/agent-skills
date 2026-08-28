# Test prompts — `architecture-trade-off-analysis`

Phase 4 of the architecture suite build. Five prompts, each executed by an **isolated agent**
holding only this skill and no other repository context — run sequentially in one agent, the
later prompts would inherit the earlier reasoning and the test would measure the model rather
than the skill.

Two prompts are adversarial by design: a scenario where the popular answer is wrong.

Outputs below are **excerpted, not complete**. Full transcripts were reviewed in session; the
excerpts preserve wording where the wording is the finding.

---

## T1 — adversarial: the four-person team

> We're a 4-person team building an internal expense-approval tool. About 800 users, all
> employees. Right now it's one Spring Boot app with a Postgres database, deployed twice a
> week. Leadership saw a conference talk and wants us to move to microservices before we grow.
> I've drafted a comparison: monolith vs microservices, scored across 8 criteria (scalability,
> maintainability, deployability, testability, fault tolerance, team autonomy, cost,
> time-to-market). Microservices won 6 of 8. Can you sanity-check the analysis and tell me if
> we should go ahead?

**Popular answer:** run the comparison, or refuse on "you're too small".
**Correct answer:** the analysis cannot support the conclusion it reached.

Verdict: **pass**. The skill attacked the method, not the conclusion — "won 6 of 8" is a total,
and a matrix is read for correlations, never summed. Four of eight criteria deleted as
context-irrelevant (scalability at 800 internal users; team autonomy at four people; fault
tolerance, where partial availability is worse than a clean outage for an approval workflow;
deployability, already adequate and unchallenged). The option set was shown not to be MECE —
modular monolith and single-service extraction were missing. Closed with a trigger to revisit
rather than a refusal.

Sharpest line produced:

> Would that table read identically at a 40-person fintech, or a 4,000-person retailer? If
> nothing in it names _expense approval, 800 internal users, twice-weekly deploys, four
> engineers_, the analysis hasn't been done yet — a generic table was filled in.

**Skill's marginal contribution, self-reported:** the "you're too small" verdict would have been
produced without the skill. What would not: the ban on summing the matrix, context-deletion as a
concrete move, the MECE recheck that surfaced the missing options, and Segment as a dated
precedent instead of a vague warning.

---

## T2 — adversarial: the good benchmark

> Found a benchmark showing our message broker is the bottleneck — the post measures 3.2x
> higher throughput on the alternative at 1KB messages, and their methodology looks solid (same
> hardware, 10-minute runs, p99 reported). We do about 4,000 messages/second peak, mostly order
> events around 2-6KB, and we're at maybe 40% of what our current broker can do. Migration would
> be roughly a quarter of work for two engineers. The throughput number seems decisive to me. Am
> I missing anything before I take this to the team?

**Popular answer:** attack the benchmark's methodology.
**Correct answer:** the benchmark is sound and answers a question nobody is asking.

Verdict: **pass**. Opened by conceding the measurement's quality, then dismantled its
applicability: 3.2x at 1KB is one point on a curve the reader does not have, and throughput is
not the pinching dimension at 40% utilisation. Reframed to the question that decides — _when
does 40% become 100%?_ — which is a growth curve, not a benchmark. Added the missing options
(tune the current broker, shrink the 2–6KB payload, scale horizontally, do nothing with a
trigger) and the decision test: **which result would make you not migrate?** If none, the number
is confirming, not deciding.

**Skill's marginal contribution, self-reported:** the 1KB/2–6KB mismatch and the 40% headroom
are obvious objections and would have been raised anyway. From the skill: naming the incomplete
option set as a _structural_ failure rather than loose advice, the precise split between
"cross-architecture numbers do not exist" and "your system is measurable", and ending by
admitting the method has no outcome evidence.

---

## T3 — adversarial: the vendor's evaluation grid

> Vendor evaluation, due Friday. We're picking a managed event-streaming platform for a payments
> ledger — roughly 200M events/day, 9 downstream consumers, financial audit requirements. Three
> candidates. The vendor of option A ran a proof-of-concept for us and gave us this evaluation
> grid: throughput, latency, connector ecosystem, schema registry, managed operations,
> multi-region replication, support SLA. Option A scores highest on all seven. Options B and C
> are self-managed and open source. My director wants a recommendation memo. Draft the analysis.

**Two defects planted:** dimensions authored by one option's advocate, and an option set that is
not mutually exclusive (managed service vs self-managed engines).

Verdict: **pass on detection.** Both were caught, the second without prompting — the failure
table's "Dimensions chosen by the advocate" row named the first directly, and the MECE
exclusivity test split the decision into _buy operations or run them_ and _which engine_. It
also found a third defect nobody planted: throughput and latency occupy half the grid and have
**zero discriminating power** at ~2.3k events/s mean, ~12k/s peak — all three candidates clear
it trivially.

**This prompt produced finding F6.** The correct mode costs "hours to days of others' time"
against a Friday deadline; the skill had nothing to say about that and the agent improvised.

---

## T4 — the genuine decision

> Insurance claims platform, 40 engineers across 5 teams, 11 services already. We need to decide
> how claim documents are stored and served. Option 1: each service that needs a document calls
> a document service synchronously. Option 2: documents live in object storage and services get
> signed URLs. Option 3: the claims service owns documents and replicates metadata to the two
> services that filter on it. Constraints that matter: regulators require we prove who accessed
> a document and when; the fraud team runs batch scans over documents nightly; the mobile app
> needs sub-second document open; and the claims service is our most change-prone service,
> deployed daily. Genuinely stuck — every option seems to lose something important.

**Tests whether the skill does positive work**, not only scepticism. A method skill that can only
say "your analysis is ill-posed" fails here.

Verdict: **pass, and the strongest output of the five.** Decomposed three bundled decisions into
orthogonal axes — owner of bytes and access record, read path, filter metadata — and showed the
user's three options were three diagonals out of ~27 combinations, which is _why_ each seemed to
lose something. Correlation read off the coupling map: audit provability and read-path
independence move against each other. Second-order finding: the nightly fraud scan and the
sub-second mobile open are not the same read, and forcing them onto one path is what made every
option lose. A deploy-cadence scenario inverted the apparent winner.

**Skill's marginal contribution, self-reported, verbatim:**

> the MECE exclusivity test is what produced the answer. Without it I would have graded three
> options on a table and picked Option 2 with caveats.

**This prompt produced findings F3, F4 and F5.**

---

## T5 — routing, near-miss negatives

Four requests judged against five competing skills, reading **frontmatter only** — the
information actually available at selection time.

| #   | Request                                                              | Expected                          | Result                     |
| --- | -------------------------------------------------------------------- | --------------------------------- | -------------------------- |
| 1   | Postgres-over-DynamoDB decided in a meeting, nobody wrote it down    | `architecture-decision-making`    | correct, cleanly separated |
| 2   | Skip the integration suite for the launch date, in an undoable way   | `technical-debt-decisions`        | correct, but see below     |
| 3   | Two staff engineers deadlocked, both documents internally consistent | `architecture-trade-off-analysis` | **contested — coin flip**  |
| 4   | How long to split out the billing module                             | `estimation-under-uncertainty`    | correct, no competitor     |

**Request 3 is the finding.** `architecture-trade-off-analysis` and `architecture-decision-making`
both claimed it, and nothing in either description decided: ADM advertises _"comparing
alternatives only on the forces that differ"_, which is analysis method, not record discipline.
This promoted residual finding 9a from a conformance gap to a live misroute.

Fixed at gate iteration 5 by adding the trigger _"when two advocates each hold an internally
consistent case and there is no agreed basis for choosing"_. The half that closes it fully —
removing the comparison-method claim from ADM's description — is deferred to a separate upgrade
and **remains open**.

An unplanned consequence worth recording: the new trigger requires each advocate to hold an
_internally consistent case_, which produced a principled split against ADM's neighbouring
trigger "two options argued on taste". Consistent cases are analytically separable and belong
here; taste means no driver has been named, which is ADM's own step 2.

**Pre-existing defect found in a skill outside this suite, reported and not fixed:**
`technical-debt-decisions` claims "containing a shortcut so it can be undone" while deferring
"which gates may be skipped (quality-gates)". Skipping an integration suite is both. Its
description sends the reader away for a case it also claims.

---

## Findings this phase produced

Eight defects, none of which four document-review gate iterations had found.

| ID  | Defect                                                                                                                                 | Severity   | Resolution                                                                |
| --- | -------------------------------------------------------------------------------------------------------------------------------------- | ---------- | ------------------------------------------------------------------------- |
| F1  | "Too small" bullet read as independent triggers, behaved as a conjunction, and contradicted mode A's _loses when … a process boundary_ | must fix   | fixed — "all three, the third being the veto"; collision worked as a case |
| F5  | "This skill decides nothing concrete" read as a prohibition on recommending; produced a refusal in T3 and a flagged override in T4     | must fix   | fixed — "holds no domain opinions … never withholds an answer"            |
| F6  | No guidance when the honest mode does not fit the deadline                                                                             | should fix | fixed — which steps of B are load-bearing under time pressure             |
| F7  | Forbade importing a dimension list "from any book, this one included", but a useful answer must offer candidates                       | should fix | fixed — eliciting vs importing distinguished                              |
| F4  | "Delete irrelevant dimensions" is a no-op when none is irrelevant                                                                      | should fix | fixed — "if nothing deletes, that is a finding"                           |
| F2  | "Exactly one mode at a time" violated by the skill's own best answers                                                                  | should fix | fixed — composition permitted explicitly, blending still barred           |
| F3  | Ordinal matrix implied to be _the_ route to the correlation                                                                            | noted      | fixed — "the matrix is one route to it"                                   |
| F8  | Body dense with provenance that calibrates the agent and never becomes user-facing output                                              | noted      | accepted as correct; author instructed not to add more                    |
