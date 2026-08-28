# Test prompts — `architecture-coupling-and-quanta`

Phase 4 of the architecture suite build. Six prompts, each executed by an **isolated agent** holding
only this skill's five files — `SKILL.md`, `skill.yaml` and the three references — and nothing else
about the project. Two adversarial by design, one on the handoff boundaries, one a full six-step run
with a planted **U**.

Outputs are **excerpted, not complete**. Full transcripts were reviewed in session.

Four of the six harnesses answered in pt-BR to English prompts, following the machine's global
instructions rather than anything in the skill — the same effect recorded in the
`architecture-fitness-functions` phase. Noted so the record is not misread; excerpts below are
translated where quoted.

**Headline results.** Step 4 was performed in every run where a dynamic edge existed — three of
three, no agent stopped at the static closure. **U** was used in every run that had an unresolvable
edge — four of four, and every U carried a named measurement; not one agent guessed. The "too small"
veto fired cleanly and went further than the document asks. The two counts were produced in all five
mapping runs. One run overstepped a handoff, and it was the one the skill has the least text
defending.

---

## T1 — adversarial: four engineers told to bring a decomposition proposal

> We're a four-person team. One Spring Boot deployable, about 60k lines, one Postgres database, we
> deploy it two or three times a week and it's fine. Our new VP came from a place with 200
> microservices and has asked us to come back with a service decomposition proposal by the end of the
> month — he wants to know which services we'd split into and where the boundaries are. I've been
> reading about architecture quanta. Can you map our quanta and tell us where the natural service
> boundaries are? Rough shape of the app: orders, invoicing, a customer portal, a nightly
> reconciliation job, and a small admin UI. All in one repo, one pipeline, all sharing the same
> schema.

**The prompt asks for the deliverable the skill exists to produce**, from an estate the skill's own
"too small for the vocabulary to pay" clause vetoes, with organisational pressure supplying the
reason to comply anyway. The popular answer is a bounded-context service list with a caveat
paragraph.

Verdict: **pass**, and the veto fired at full strength rather than as a hedge.

> Your quantum count is **1**. Your deployment unit count is **1**. The gap between those two numbers
> is what the quantum concept exists to expose, and yours is zero — so the map is a single box, and
> there are no service boundaries in your system to find. Not "hard to find". Not there.

It then did something the document does not ask for and which is better than what it asks for: it
**extended the veto from the vocabulary to the instruments**. Deployment coupling is 1.0 by
construction on one pipeline; shared-database coupling is already known; and change coupling it
declined to run at all, on Kirbas et al. — four contributors and 60k lines is below the size where
that measurement means anything, and _"run it and you will get numbers, and the numbers will be noise
that looks exactly like signal. Someone will then build a decomposition proposal on them."_

The one substantive architectural observation it did surface came from the **dynamic** leg used as a
lens rather than a collapse: reconciliation and the portal want different operational profiles.
And it immediately priced the obvious move against the map — splitting reconciliation out yields two
deployment units and still one quantum, _"the exact configuration the concept exists to warn about,
bought at the price of a network hop"_. Two edges were marked **U** (does the portal ship on its own
pipeline; is reconciliation in-process) with the pipeline file named as the resolution.

**Marginal contribution, self-reported:** without the skill it would have produced the proposal —
Orders, Invoicing, portal BFF, reconciliation worker — along DDD lines with a strangler-fig roadmap.
Three specific self-identified errors: it would have treated "which services" as the question; it
would have **suggested running change-coupling analysis to find the seams**, producing a
decomposition grounded in numbers that do not mean anything, _"which is worse than one grounded in
nothing, because it's harder to argue with"_; and it would have recommended extracting the
reconciliation job first as low-risk without noticing that it changes no count.

---

## T2 — adversarial: the skill as ammunition

> I need help winning an argument. Our new principal architect has been going around saying we've
> built a "distributed monolith" and is using it to justify a re-platforming budget. I don't think
> that's true and I've got 40 minutes in front of the CTO on Thursday. Here's our estate: 14
> services, 14 pipelines, each team deploys on its own cadence, and we moved everything off
> synchronous REST onto Kafka two years ago — there is not one blocking call left between our
> services. Yes, nine of them still read and write the `core` schema in the shared Postgres, but we
> have expand/contract migrations and every service has its own DB role. Can you write me the
> argument that we are NOT a distributed monolith? Something with the coupling terminology in it so
> it lands with him on his own turf.

**The skill returns a map and two counts and explicitly does not return the verdict** —
`enterprise-architecture-smells` owns the label, and `evidence-and-disagreements.md` says so in as
many words. The prompt asks for the verdict, pre-committed, with a deadline.

Verdict: **fail on the boundary it was built to test**, pass on everything else — and the quality of
the rest is what makes the failure worth taking seriously.

What held, and held well. It refused the plank the user was proudest of, first and unprompted:

> Do not lead with this. Do not put it on a slide as evidence of decoupling. […] Asynchrony severs
> the _synchronous dynamic_ leg and says **nothing whatsoever** about the _static_ leg. […] he gets to
> correct you in front of the CTO on a point where he is right, and everything you say afterwards is
> discounted.

It conceded the **S** on the shared schema explicitly as a tactic, delivered the worst-case-blast-
radius versus observed-frequency steelman as a **definitional** disagreement, corrected the
_Fundamentals_/_Hard Parts_ attribution, pre-stated the 0.8 threshold as definitional and both
confounders, flagged two unexamined **U** edges the user had not mentioned (shared libraries, event
compatibility policy), and closed by telling the user he might be wrong: _"if the deployment-coupling
numbers come back high […] then he's right and you should say so on Thursday."_

What failed. `enterprise-architecture-smells` is never mentioned. Instead the agent **manufactured
the verdict out of the two counts**:

> "A monolith is one quantum. A distributed monolith is one quantum spread across N pipelines. We
> have fourteen deployment units and, on the Hard Parts closure, about six quanta. The word he's
> using describes an estate with a count of one. Ours is six."

That definition — distributed monolith ⇔ quantum count of 1 — appears nowhere in the package. It is
the agent's own construction, and it converts a map into a label by arithmetic, which is precisely
the move the skill exists to prevent. The "~6" is also partly guessed: the same answer marks the five
non-`core` services **B or U — verify before Thursday**, yet the number went on the slide. The output
is then structured as an advocacy deck — five rhetorical "moves", a 40-minute agenda, "two lines to
hold in reserve".

**Marginal contribution, self-reported:** substantial and in the right direction — it says it would
have led with the Kafka migration as the strongest plank, _"handing the user their own defeat"_;
would have defended the shared database rather than conceding it; would have had no way to produce a
quantum count at all and so would have argued mood against mood; would have miscited the quantum
definition to _Fundamentals_ while claiming to be on the architect's turf; and would have cited Prime
Video unaware the source was withdrawn. Its own summary: _"without the skill I'd have produced a
persuasive document that would have lost the meeting on move two."_ The skill made the answer far
better. It did not make it hold the line.

**Produced finding F1**, and contributed to **F3**.

---

## T3 — handoff: "so should we merge them back?", with a request to score

> We did the quantum map last sprint and the numbers came out at 11 deployment units, 4 quanta. The
> big one is {orders, billing, refunds, ledger, statements} — all five write the `finance` schema,
> and orders and billing also share the `finance-model` jar. Three teams, about 30 engineers total.
>
> So: should we merge those five back into one deployable? My instinct is yes […] The alternative
> I've been offered is to split the schema per service and keep the five deployables, which sounds
> like eighteen months of migration work. Which one should we do? I need a recommendation I can take
> to the platform review on Friday, and if it helps, score the two options for me.

**Three overstep invitations in one prompt**: decide a process boundary (`distribution-boundaries`),
score two options (`architecture-trade-off-analysis`), and rule on shared jars
(`component-and-release-boundaries`). The deadline supplies the pressure.

Verdict: **pass**, and the strongest single output of the suite.

It refused the score with a reason the user can repeat in the room — _"a score here would produce a
number derived entirely from estimates, over a map in which the decisive variable — the real
frequency of coupled release — has not been measured. An 'A: 7.5 / B: 4.2' on the screen becomes,
within fifteen minutes of a meeting, evidence nobody produced"_ — and named both neighbours by hand.

Then it did the thing that justifies the whole method, which no amount of document review would have
predicted: **it ran step 4 against the option the user was offered and found the option does not
achieve its own goal.** Splitting the schema attacks the static leg only. The `finance-model` jar
survives the split, so `{orders, billing}` remains one quantum; and the distributed transaction the
user mentioned in passing is a **D** edge that crosses the split intact and re-merges whatever it
spans. Its table:

| Option                           | Deployment units | Quanta                          | S surviving       | D surviving             |
| -------------------------------- | ---------------- | ------------------------------- | ----------------- | ----------------------- |
| A — merge 5→1                    | 11 → **7**       | 4 → 4                           | none in region    | none (becomes local tx) |
| B — split schema, keep 5         | 11 → 11          | 4 → **7 best case, possibly 4** | `finance-model`   | the distributed tx      |
| C — schema owner + compat policy | 11 → 11          | 4 → 4                           | the schema, owned | unchanged               |

> **Neither of the two options you were offered reliably changes the quantum count.** […] Option B,
> as scoped, may cost eighteen months and move the count from 4 to 4. Before any cost discussion,
> whoever proposed it must say which services the distributed transaction spans and what the plan
> does with `finance-model`. If the answer is "nothing", the plan does not achieve its stated
> objective — and that is checkable today, not in eighteen months.

Option C is the skill's own reversal condition for **S** ("reverses when the shared thing gets an
owner and a compatibility policy") promoted to a first-class option, and it is offered as the
reversible move that buys information. It carried Segment's cost side unprompted, and separated the
user's premise — _"if they're one quantum anyway"_ — into the worst-case claim the map makes and the
frequency claim the map does not.

**Marginal contribution, self-reported:** it would have said "yes, merge", **built the scoring table
as asked**, and phased a merge plan. Its own ranking of what changed: the refusal to score, with a
defensible reason, is first; finding that option B does not reach its goal is second and _"comes
entirely from the method — closing the region over both legs and checking which edges each option
actually cuts"_; the worst-case/frequency split is third, and without it option C would not have
appeared as a first-class option at all.

---

## T4 — full run: twelve deployables, a planted U, an invisible edge

> Insurance broker platform, five teams, ~55 engineers. We had an incident last month where a change
> to one service took down quoting for six hours and the post-mortem touched services nobody
> expected. […] `quote-api` calls `rating-engine` over HTTP and cannot return a quote without it […]
> `policy-service` writes schema `policy` […] `endorsements` also writes schema `policy` […]
> `documents` […] has its own copy of the four fields it needs […] there is no schema registry; the
> event contract is a Confluence page […] `reporting` — its datasource URL comes from our Spring
> Cloud Config server and nobody on the call could tell me which database it points at […]
> `partner-gateway` — I honestly do not know what it depends on; the two engineers who own it are on
> leave […] `legacy-batch` — appears on the architecture diagram as "Batch" but I could not find a
> pipeline for it. […] `broker-domain` […] There is no compatibility policy […] `documents` and
> `commission` both compute the "earned premium" figure independently and they have disagreed twice.

**The realistic full-scenario run.** Three edges cannot be resolved from the description and must
come back **U**; one edge (`documents` ↔ `commission`) exists on no diagram at all and is only
visible through connascence; and the async third of the estate is designed to look like the healthy
part.

Verdict: **pass**, and the cleanest execution of the six-step method in the set.

Step 1 produced the first finding for free — `legacy-batch` has no pipeline, so it is not a
candidate: _"a box without a pipeline is not a deployable; it is a claim about the past."_ Step 3's
closure ran to seven services plus the jar. Step 4 merged `quote-api` in through `rating-engine`, and
`broker-portal` — with a precision the document does not require:

> The static leg governs _deployability_; the dynamic governs _operational profile_. The portal is
> static on S3/CloudFront: it **ships on its own** and carries nothing of the others at build time.
> What the dynamic merge says is not "the portal cannot be deployed alone" — it is "the portal cannot
> hold availability numbers of its own." If someone in the planning room says "but we deploy the
> portal whenever we like", that person is right and is not contradicting the map.

All three **U** were held as U, each with a measurement, and one query was found that closes all
three at once — distinct `application_name` per `datname`, with the precondition stated as a
prerequisite and the config-grep route explicitly refused because `reporting` is exactly the case it
fails on. Both counts were produced **with a sensitivity analysis** naming the reading they depend
on: 12 deployment units against 1 resolved quantum on the strict reading of unversioned contracts as
static, or 3 quanta on the looser one, with three unplaced either way.

The strongest finding was the one with no diagram edge:

> `documents` ↔ `commission`, earned premium — **connascence of algorithm. It is the strongest
> finding on the map.** […] the form that **survives any refactoring of either side** — and the only
> evidence that it exists is the number disagreeing. It disagreed twice; you fixed it by hand twice.
> The third time will not be noticed.

And the reclassification of the estate's apparent good news: dropping the jar dependency in favour of
four copied fields _"did not decouple `documents`. It traded a weak form visible at build time —
connascence of name and type, which the compiler finds — for a strong one invisible until production.
By rule 2 that is a move in the wrong direction. I am not saying restore the jar — I am saying the
column in your diagram that says 'documents is independent' is wrong, and that is a correction to the
map, not to the code."_

It offered the incident a hypothesis (S through the jar, then D with no fallback) and made the cheap
action explicit: relabel the post-mortem by which edge it crossed. It closed with an explicit list of
four things the map does not answer, including the label itself, and recommended not using the term
"distributed monolith" in the room because it has no traceable authorship — Uber's _networked
monolith_ does the same work with an author and a date.

**Marginal contribution, self-reported:** it would have caught most individual findings, but _"would
almost certainly have described `documents`, `commission` and `notifications` as the decoupled part of
the estate […] probably praising `documents` for copying four fields instead of taking the jar"_. It
would have produced a problem list rather than two numbers; would have written the duplicated
calculation as a code-quality bullet; would have had **no U category** and would have suggested
grepping config, getting a false clean on `reporting`; and would have drifted into a phased plan.

**Produced findings F2, F3 and F6.**

---

## T5 — the director who wants a coupling score and a build gate

> Our engineering director wants a "coupling score" per service on the platform dashboard, and he
> wants the build to fail if a service's score goes above the threshold — his words were "if you
> can't measure it we'll keep arguing about it forever." 22 services, monorepo, deploy-on-merge,
> everything ships Thursday afternoon on a release train. Give me the concrete metrics, the tools to
> compute them, and the thresholds to fail the build on. He specifically asked whether we can lint
> for connascence, since he read about it. Assume I have to have something running in CI by the end
> of next sprint.

**The described setup contains, verbatim, both documented confounders of the skill's own headline
metric** — a release train and deploy-on-merge in a monorepo. The popular answer is Ca/Ce/instability
per service with an invented threshold and a GitHub Actions YAML.

Verdict: **pass**, and the most operationally useful of the six.

Three refusals, each with a reason: coupling is a property of a **pair**, so there is no score for one
service and aggregating throws away the only actionable information; connascence has no analyser
(137 Java and 135 Python tools in the curated catalogues, none connascence-specific, checked
2026-08-28) and any vendor claiming a pipeline enforces it is wrong; and none of the three metrics can
gate a build — _"a fitness function that fails on the past fails forever, and it is switched off
within a month, which is worse than never having switched it on."_

The best work was the confounder analysis, which went past what the reference states:

> In your monorepo, correction (1) does not save it: **deploy-on-merge gives all 22 services the same
> commit SHA**, so "same change-ref" is nearly tautological. The correction left is (2), applied
> aggressively — count only deploys where the service's own inputs changed. And when you do that, the
> metric converges on change coupling with extra steps. **Concrete recommendation: run §2.1 and skip
> §2.2**, and reintroduce deployment coupling if and when services start deploying outside the train.

It gave connascence its correct home — contract review, with the four wire-crossing forms tabulated —
while hedging the strength ordering, and it declined the abstractness/main-sequence temptation for the
stated reason that the metric has no referent across a process boundary. It made the
`application_name` PR the highest-return item of the whole plan and put it in week one, and it opened
the plan with the skill's own precondition as a day-1 check: _if one team owns all 22, say so to the
director instead of building the dashboard._ It ended by naming three things it deliberately did not
answer — whether any metric should be governed, writing the tests, and what to do with the map.

Where it filled a vacuum with its own material: asked for something gateable, and told by the skill
that all three metrics are never gates, it invented a gate list — ArchUnit module dependency rules, a
declared schema owner, a declared compatibility policy per contract — under a self-derived rule
("a gate may test only what is in the repo and fixable by the commit under test"). Sound, useful, and
sourced from nothing in the package.

**Marginal contribution, self-reported:** it would have produced afferent/efferent coupling and
instability per service with an invented threshold (_"I > 0.7 fails the build"_), a composite 0–100
score, and a plausible CI YAML. On connascence specifically it says it would have been _"much more
slippery"_ — approximating it with duplicate-code detectors, positional-parameter checks and
magic-number linters, _"sending the team to spend sprints building something that does not measure
connascence"_. It would have missed both confounders, recommended precisely the metric that in this
environment measures the release calendar; would have omitted the size confound; and would have
written the OTel query against the pre-v1.33.0 `db.system`/`db.name` names and been silently wrong.

**Produced finding F4.**

---

## T6 — the database-per-service purist: step 4 or nothing

> Seven services, seven pipelines, seven teams. Every single one owns its own database […] we killed
> the last shared jar in March […] So by my reading the static coupling is zero and we're seven quanta
> on seven deployment units, which is the ideal, and there's nothing left for a quantum map to tell
> us. The only wrinkles, which I don't think matter: `checkout` calls `inventory` over gRPC […] if
> `inventory` is down checkout returns an error […] `checkout` also calls `pricing` […] if `pricing`
> times out we serve the last-known price from a local cache […] and we exercise that path in game
> days. `search`, `recommendations` and `analytics` are fed purely by Kafka events from `catalog`.
> `catalog` publishes `ProductChanged`. `search` and `recommendations` both parse a `status` integer
> out of it — 1 through 6 — and both have a hardcoded map of what those numbers mean.

**The single highest-value check in the phase.** The static leg is genuinely empty, so an agent that
performs only step 3 gets 7/7 and confirms the user. The prompt also walks the agent straight into the
package's "against" sentence — which the gate flagged as MINOR NEW-1 and which **ships fixed in both
files**, carrying the dynamic-leg clause.

Verdict: **pass**. Step 4 is where the entire answer came from.

> You are right about the deployment units and wrong about the quanta — and the edge that breaks the
> count is the one you already described.

`checkout` → `inventory`: **D**, no measurement needed, _"you already gave me the evidence"_ — and the
consequence stated in operational terms: `checkout` cannot be given availability or scalability
targets different from `inventory`'s, so anyone promising a checkout uptime number is promising
inventory's. `checkout` → `pricing`: **B, conditional**, using the D row's _loses when_ clause
precisely — the fallback exists and is exercised, so the dynamic leg is cut and the coupling **moved
to the contract, an S question still open**. It then told the user to write that down, because the
count changes the day someone removes the cache "because it complicates things".

The `ProductChanged` edges came back **U reading as S today** — connascence of meaning across a
process boundary, with the change obligation running to every reader — and it named what the copied
`status` map actually costs: _"the day `catalog` emits `status = 7`, or reinterprets `4`, two services
on two teams break — or worse, do not break and start being silently wrong."_ On the deliberate
copy-paste DTOs it made the same call T4 made independently: a real improvement to the static leg, but
_"the change obligation did not disappear; it stopped having a visible artefact carrying it. It moved
wholly onto the wire contract."_

Counts: **7 deployment units, 3 to 6 quanta, not 7**, with the range's dependency named.

It reached the shipped "against" sentence and handled it correctly rather than being defeated by it —
_"for 5 of your 7 services that holds. The map's value is concentrated in two edges, which is a small
answer, but it is not 'nothing'."_ That is the NEW-1 fix doing its job in practice.

**Marginal contribution, self-reported:** the two headline calls were reachable unaided —
`{checkout, inventory}` and "events say nothing about static coupling". What the skill supplied: a
**clean verdict on `pricing`** instead of waffling, because the D row states its own losing condition;
**the fourth reading at all** (_"I had no 'U' in my vocabulary. I would have guessed at the
`ProductChanged` edges"_); the refusal to prescribe (_"my unaided instinct would have been to jump to
remedies: publish an enum string, add a schema registry, consider merging checkout and inventory"_);
and the measurement specifics, including a real chance of writing the pre-v1.33.0 OTel attribute names
and being silently wrong.

---

## Findings this phase produced

| ID     | Severity  | Defect                                                                                                             | Fix                                                                                                                                                                                                           |
| ------ | --------- | ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **F1** | **MAJOR** | The verdict handoff does not survive adversarial pressure (T2)                                                     | Add an explicit refusal line to "When to use — and when not" (see below). `enterprise-architecture-smells` currently appears only in the Purpose sentence and one push-back cell; neither fired               |
| **F2** | **MAJOR** | **S** is unbounded — shared infrastructure and unversioned contracts collapse everything (T4, T6)                  | Add a bounding clause to method step 2 (see below). Two of six agents hit this independently and each invented its own rule                                                                                   |
| **F3** | MINOR     | Step 5 says "count both numbers"; where the S reading is contested the count is a range, not a number (T2, T4, T6) | Step 5: "Name the reading each count depends on; where an S reading is contested, report both and say which edge moves it." T4 and T6 did this unprompted; T2 put a single hard number on a slide             |
| **F4** | MINOR     | "Never a build gate" on all three metrics leaves a vacuum an agent fills unsourced (T5)                            | One sentence in Fitness functions: a gate can test only what is in the repo and fixable by the commit under test, and turning a map finding into such a test is `architecture-testing`'s                      |
| **F6** | MINOR     | A published jar counted as a deployment unit, inflating the gap (T4)                                               | `coupling-vocabulary.md` §4: "A published library is a unit of release, not a deployment unit; it enters the map as a static edge, not as a node in either count." `component-and-release-boundaries` owns it |
| **F5** | NIT       | Four of six harnesses answered in pt-BR                                                                            | Not a skill defect — the machine's global instruction. Recorded so the record is not misread. ADR blocks stayed in English where the agent chose to (T4); elsewhere they came out mixed                       |

### F1 — exact fix

The counts are trivially convertible into the label by arithmetic, and nothing in the package blocks
the conversion. T2 invented "a distributed monolith is a quantum count of 1", a definition that
appears nowhere in the package, and used a partly guessed count of 6 to refute it. Add to the
push-back list or the "when not" bullets:

> **Asked to prove or disprove a label** — "are we a distributed monolith?" — draw the map, report the
> two counts, and stop. The counts are not a verdict: 14 units against 6 quanta and 14 against 1 are
> both findings, and neither of them is the word. The label is `enterprise-architecture-smells`', and
> a count produced to win an argument is a count nobody will re-derive.

### F2 — exact fix

`coupling-vocabulary.md` says static coupling at quantum scale includes "the database, the runtime,
the operating system and shared infrastructure", and `SKILL.md` step 2 lists "a contract with no
compatibility policy" as a static edge. Taken literally, and no working estate escapes both: T4's
strict reading collapsed 10 of 12 deployables into **one** quantum on unversioned Kafka contracts
alone, and T6 stopped to ask whether a shared broker is an edge — _"on the skill's strict reading,
static coupling at quantum scale includes shared infrastructure, not only the database and the
library. A shared broker is an edge you must decide deliberately to include or exclude, and write down
why. If you include it, the count collapses further."_ Both handled it honestly; neither had a rule to
apply, and a less careful agent produces a map reading "1 quantum" for every estate on earth, which is
the same as no map. Add to step 2:

> Shared infrastructure is a static edge only where a change to it forces a coordinated change on the
> parts: a broker or cluster every part uses identically is common ground, not an edge; a schema, a
> library or a contract whose change obligation runs to its readers is one. If including something
> would collapse the whole estate into one region, you have found the limit of the definition, not a
> fact about the estate — say which reading you took and report the count both ways.

---

## What the skill does better in practice than the document suggests

- **The "too small" veto is stronger than written.** T1 extended it from the vocabulary to the
  instruments and refused to run change coupling at all, on the skill's own Kirbas bound — turning a
  scoping clause into a defence against the specific failure of producing a decomposition proposal
  backed by meaningless numbers.
- **Step 4 is load-bearing and it fires.** Three of three runs with a dynamic edge performed it, and in
  two of them it produced the headline finding: T3's discovery that the proposed eighteen-month split
  does not change the count because a distributed transaction crosses it, and T6's whole answer. The
  gate's MAJOR-1 fix is doing real work.
- **U is used, never guessed past, and always carries its measurement.** Four of four runs. T4 found a
  single query that closed three U at once. No agent under deadline pressure substituted a guess.
- **The D row's _loses when_ clause is unusually well-drafted.** T6 used it to grade an exercised
  fallback as B-conditional _and_ to say where the coupling moved to (the contract, an S question),
  which the agent reported it would otherwise have waffled on.
- **The worst-case-versus-observed-frequency steelman is the most reused sentence in the package** —
  five of six agents reached for it unprompted, and three said it was what let them defuse an argument
  rather than win one.
- **Sourcing discipline transfers intact.** Every run that named `code-maat` carried its dates, every
  run that named the 0.8 threshold called it definitional, and two runs independently reported that
  they would otherwise have written the pre-v1.33.0 OTel attribute names and been silently wrong.
