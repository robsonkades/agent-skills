# Validation — `architecture-characteristics`

**VERDICT (iteration 5, final): PASS — 0 BLOCKER, 0 MAJOR, 0 MINOR outstanding, 3 NIT shipping.**

_Iteration 4: FAIL — 1 MAJOR. Iteration 3: FAIL — 1 MAJOR. Iteration 2: PASS. Iteration 1: FAIL — 3 MAJOR._
All five iterations are preserved below, unedited. **The iteration 5 section is the permanent record:**
it carries the dispositions, the Phase 4 F-series, the residual list and the counting-check case.

Validator did not write the skill. All five files read in full at each iteration; research brief read
in full before any claim was judged; `architecture-decision-making`, `architecture-trade-off-analysis`,
`requirements-and-acceptance` and `slo-and-alerting` read for boundary work; k6's status verified live.

---

# ITERATION 1 — FAIL

**0 BLOCKER, 3 MAJOR, 8 MINOR, 4 NIT.**

The three MAJORs are all fixable without restructuring: one description trigger, one provenance
marking sentence, two numbers. Nothing in the skill's method or its central finding is wrong.

---

## The central finding (2024 worksheet vs 2020 taxonomy) — PASS, and handled better than asked

The instruction was: teach the March 2024 worksheet as current, present the 2020 taxonomy as the
earlier position a reader meets in secondary literature, mark the 2nd-ed status unverified, and never
present either as the authors' settled current view.

The skill does exactly this, in the body (lines 28–31) and again in `taxonomy-and-iso.md` (lines 8–59):

- Body: "**The taxonomy you meet elsewhere is not the authors' current method.** Operational /
  structural / cross-cutting is 1st ed. (2020) and still dominates secondary writing; Richards' own
  worksheet (revised **March 2024**) drops it for one flat list… Whether the 2nd ed. follows it is
  **unverified**."
- Reference: "**The 2nd edition's position is unknown.** `[2nd-ed status unverified]`" followed by an
  enumeration of _which_ things are unverified (three-part test wording, ch. 4 table membership, the
  ≤7/top-3 numbers, the quantum definition) and the explicit instruction "Do not claim either way."
- The reference also refuses to let Ford's star-ratings note settle it — correct, and the brief says so.

The 2020 taxonomy is presented as a thing to _recognise_ when a colleague cites it, not as method:
"work from the 2024 worksheet, and recognise the three-way split when a colleague cites it, because it
is what most secondary writing still teaches." That is the right posture. **Pass, and this is the
strongest single section in the skill.** See NIT-1 for one imprecision in the body's summary of it.

## Both caps — PASS, load-bearing

- ≤7 driving and top-3 both present, both quoted, both in sequence: body line 50–52 ("Two caps, not
  one"), `eliciting-and-capping.md` lines 64–74 with the full four-line Instructions block verbatim.
- "**(in any order)**" survives in the body quote, and — more importantly — it is _used_: the ADR
  template reads "Three driving, **unordered**: elasticity, availability, deployability" (line 158),
  and the Honest Standing section makes the unorderedness the authors' concession that fine ranking
  is not obtainable (line 186). It is not decoration anywhere in this skill.
- "Others Considered" is mandatory and is given a reason the worksheet does not give:
  `eliciting-and-capping.md` §"Others Considered is an artefact, not a bin" — "an exclusion nobody
  recorded is indistinguishable, eighteen months later, from an oversight", tied to the
  HealthCare.gov record. The ADR template carries a populated Others Considered list.
- The "try to drop one (or two)" instruction survives (body line 99).

---

## 1. Technical accuracy — **MAJOR (two misattributed figures)**

Most claims trace cleanly and provenance is marked at the point of use: the three-part test carries
"(_Fundamentals_ 1st ed., ch. 4 — four agreeing note sets, not the book text)"; the reference files
carry a `[PRIMARY]` / `[notes]` / `[SEI]` marker legend and apply it per claim. HealthCare.gov,
GAO-15-238, the ATAM "not refutable" quote, the Silicon Sandwiches explicit/implicit split, the
worksheet definitions and the concurrency implication all match the brief exactly.

Two figures do not.

**MAJOR-3a — Ameller et al. validation count is wrong.**
Body line 144: "**11 of 13** declared every NFR met, one having validated more than three attribute
types."
Brief Table IV: validated three types = 1; two = 3; one = 4; none = 1; no detail = 4. **No architect
validated more than three.** Exactly one validated three. The skill asserts a positive the table
contradicts. The brief's own summary prose says "at most one of them had validated across more than
three attribute types"; the skill dropped "at most" and the hedge was the only thing making the
sentence true. Direction of the argument is unaffected (the truth is slightly more damning), which is
why this is MAJOR and not BLOCKER — but it is a wrong number attributed to a named table.
Fix: "…and only one of them validated as many as three attribute types."

**MAJOR-3b — Eckhardt figures attributed to a subgroup they do not describe.**
Body line 96: "Eckhardt et al. (530 NFRs, 11 specs, 5 companies): embedded 54% Reliability; **business
systems 27.2% Functionality, 19.6% Security**."
Brief: 27.2% / 19.6% are the **corpus-wide** distribution across all 530 NFRs. The brief says only that
business information systems "skew to Security/Functionality" and gives no subgroup percentages. The
54% for embedded is correctly a subgroup figure, which is what makes the pairing look symmetrical and
is exactly why it misleads.
This also fails item 12: `taxonomy-and-iso.md` line 157–161 states the same numbers correctly as
"Their distribution, **aggregated** to ISO 9126 classes" — so the body contradicts its own reference.
Fix: "corpus-wide 27.2% Functionality, 19.6% Security; embedded 54% Reliability."

Everything else in this item passes.

## 2. Terminology fidelity — **PASS**

All five bracketed pairs are present in the body's pairs table with an axis and a stated cost of
conflating them, and again in full in `definitions-and-composites.md` with verbatim worksheet
definitions. Checked against the brief, not folklore:

| Pair                              | Skill's axis                                                                           | Brief                                                                                 | Verdict                                                    |
| --------------------------------- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| scalability ↔ elasticity          | "growth over time at constant error rate vs 20 → 250,000 instantly — the axis is time" | "The distinguishing variable is **time**, not size"                                   | correct, and the "axis is time" framing is the brief's own |
| performance ↔ responsiveness      | "time to process a business request vs time to get a response to the user"             | verbatim worksheet                                                                    | correct                                                    |
| availability ↔ fault tolerance    | "uptime in 9s vs other parts continuing when fatal errors occur"                       | verbatim worksheet                                                                    | correct                                                    |
| data integrity ↔ data consistency | "correct and not lost, per datum, vs in sync across stores"                            | correct; brief's "a saga does not threaten integrity" is carried verbatim in the body | correct                                                    |
| adaptability ↔ extensibility      | "adapt to a changed environment vs add function to a fixed one"                        | correct                                                                               | correct                                                    |

Reliability is handled as the brief requires — **not** as a member of the pairs table, with an explicit
sentence saying why: "**Reliability is absent here because it is not primitive**; neither is agility."
The three-way reliability/availability/fault-tolerance trap is worked in
`definitions-and-composites.md`, including the consequence the brief flags — that a strict availability
number selects _against_ the graceful degradation fault tolerance buys — plus recoverability,
continuity and robustness as words routinely folded into "reliability" that are not it.

**Quantum wording drift — handled, not smoothed.** Body line 84–86 gives the 1st-ed. definition
verbatim, then: "_The Hard Parts_ restates it as high static plus synchronous dynamic coupling, **so say
which book you quote**." `definitions-and-composites.md` §"The quantum wording drifts between books"
gives both, calls it "a citation hazard", and adds "do not assume the 2nd ed. … uses either wording —
**that is unverified**." This is exactly what the brief asked for.

## 3. ISO 25010 — **PASS on the blocker check; MINOR on version naming in the body**

- **No clause number appears anywhere in the skill.** Grepped all five files: the only `§` in the
  package is `CMU/SEI-2000-TR-004 §5.3`, which is an SEI technical-report section the brief cites
  directly and quotes from. Nothing ISO-numbered. `taxonomy-and-iso.md` states the prohibition in
  text: "**No clause number is cited anywhere in this skill, for this or anything else.**" No BLOCKER.
- 2011 vs 2023 are treated as materially different, with the full change list (Safety added ninth;
  Usability → Interaction Capability; Portability → Flexibility; scalability new under Flexibility;
  maturity → faultlessness; accessibility split) and the standing rule "**Say which version you mean,
  every time.**"
- The scalability point the brief singles out is carried: "**new in 2023**; absent by name from 2011,
  so 'ISO says scalability' must cite 2023."
- **The testability conflict is carried, not resolved.** "On two separate fetches the arc42 page
  rendered **testability under Flexibility**, not Maintainability… the standard text is paywalled and
  was never read… If the placement matters to your compliance argument, buy the standard; do not
  resolve it from this file." The table places it under Maintainability _and says so as a choice_.
  Correct handling.
- 403 provenance is disclosed in the reference itself ("`iso.org` returned 403 to every fetch, so the
  standard text was never read for this skill").

See MINOR-3: the body's one ISO mention omits the version.

## 4. No unconditional recommendations — **PASS**

The costing test the item demands ("one on the list costs something, and the skill must say what") is
met structurally, not rhetorically:

- Body line 99: "No slot is free — each charges design complexity before the business problem is
  touched, which is the whole argument for the cap."
- Each of the four candidate sets gets a bullet naming what it charges _when it wins_ and the
  observation that reverses it — G buys a permanent staleness decision on every read plus rented
  headroom idling between spikes, reversing when the peak-to-median ratio flattens; C buys "the whole
  right side of that table at once", reversing the moment a named person states a tolerable
  disagreement window; U buys redundant paths exercised only in the failure you did not model; A buys
  nothing until decomposed.
- The skill also charges _itself_: "Too small to earn it" gives a floor below which the exercise is
  net-negative, with the reason ("a three-slot ceremony over a list of one teaches the team that the
  ritual was the point").
- The strongest candidate for an unconditional rule — "No fitness function is affordable for it →
  ungoverned by construction, which makes it a wish" — is the brief's own position (§10.3, the
  authors' logic), and it is stated with its consequence rather than as an imperative. Not a finding.

No "always", no "best practice", no recommendation without a reversal condition.

## 5. Trade-offs qualified, not listed — **PASS, with MINOR-2**

The §2 table is the best-constructed trade-off artefact in the suite so far on one specific count:
**each column heading is a question that names the measurement that settles the dimension in the
reader's own system**, not a label.

- Consistency window — "can a stakeholder name a period in which two stores may legitimately disagree?"
- Latency and uptime — "which clock does the customer feel: business-request time, or time-to-response?"
- Growth vs burst — "90-day peak-to-median arrival ratio: trend or spike?"
- Coupling — "how many deployables does one feature touch today?"

Dimension, direction and magnitude are all present, magnitudes sourced to named saga-table rows, and
where the source has no magnitude the skill says so rather than inventing one: the U row reads
"replicas and failover paths to operate; **direction not tabulated**". That refusal is the right move
and it is rare.

MINOR-2 concerns which rows the C magnitudes come from.

## 6. Evangelism and evidence honesty — **PASS, and this is the skill's best section**

Every element the item requires is present, in the skill's own voice, in the body, not buried:

- "**No outcome evidence shows that capping the list at three improves anything.** Four searches found
  none: it is a practitioner heuristic from two consultants with a large teaching practice, published
  without data."
- "**Miller's 7±2 is not support** — nothing connects it to characteristic counts." Explicitly ruled
  out, as instructed.
- The measured thing is offered in its place and correctly scoped: SEI's H/M/L finding, quoted
  verbatim with the report id, plus "A long ranked list is fiction, and the distributions above are
  concentrated enough that a cap is cheap" — corroboration for the _shape_, not the number.
  `eliciting-and-capping.md` makes that explicit: "Two traditions independently arriving at single
  digits is weak corroboration for the _shape_ of a cap. **It is not evidence for the number three.**"
- **Both sides named.** Richards & Ford (cap at ≤7, unordered three) against "_The SEI tradition_
  (Kazman, Klein, Clements): prioritise only over concretised scenarios, never over attribute names,
  and on two dimensions, importance and risk."
- The sharpest evidence is reported as cutting _against_ the skill's own primary source, and the skill
  says so: "The sharpest evidence is from inside the rigorous camp and cuts against the simple cap."
  The Figure-3 finding is quoted verbatim, and `eliciting-and-capping.md` states the consequence
  plainly: "The stakeholders' first pick missed two of the four attributes that mattered."
- **It lands exactly where the item says the honest conclusion is**, and overclaims in neither
  direction: "**'ask for three and stop' is contradicted; 'translate, cap, get three, then concretise
  and re-check' is not.**" The five-step combined procedure in the reference operationalises it, with
  step 4 handed to `architecture-decision-making` rather than annexed.
- The weak supporting evidence is labelled weak: the Falessi/113-students material is introduced as
  "the nearest thing to supporting evidence is indirect and is about consensus, not outcomes", both
  papers marked unread, closing "They support _'structure the decision'_. They do not support
  _'three'_, and nothing located does."

No evangelism anywhere. The skill is more sceptical of its own primary source than the brief required.

## 7. Governance realism — **PASS on structure; MINOR-4, MINOR-5, MINOR-6**

The chain is complete and every link is specific.

| Link           | Content                                                                                                                                                         | Judgement                                                                                                                         |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Characteristic | Elasticity **not** scalability, with both worksheet definitions quoted to justify the choice                                                                    | Correct — the fitness function starts by resolving the pair the skill teaches, which is the right demonstration                   |
| Metric         | Error rate and p99 during a synthetic arrival step from median to the observed 90-day peak multiple, applied inside 60 seconds                                  | Specific and computable                                                                                                           |
| Tool           | k6, open-model (constant-arrival-rate), "so the generator keeps arriving when the system slows rather than measuring its own client"                            | Technically correct — see the k6 verification below; the open-vs-closed-model reasoning is the right reason to name that executor |
| Threshold      | Error rate under the intake SLO figure; p99 under 2× steady-state p99 for no longer than the autoscaler's measured scale-out time, with the justifying sentence | Justified — with one gap, MINOR-4                                                                                                 |
| Site           | Nightly against staging, reviewed weekly, stated in-text as deliberately not a PR gate                                                                          | Correct, and the reasoning holds — see below                                                                                      |

**Does the site match the metric's shape? Yes, and the reasoning is sound.** The metric requires a load
generator, a warm autoscaler and a 60-second arrival step measured to p99. None of that is producible
inside a pull-request check: a PR gate has no autoscaler in a steady state to scale out from, and a
p99 over a one-minute step needs enough traffic that the percentile means something. The skill states
the general principle rather than just the instance — "a fitness function whose site cannot produce
its metric is decoration" — and then applies it a second time, correctly, to deployability
("deployability's metric is trailing too, so it belongs in that same weekly review and never on a PR
gate"). This is a stronger treatment of the site question than skill 1's, which stated the inverse
case (PR gate, nightly too late) but did not generalise the rule.

**k6 verification (I have network access; the author did not resolve this).** The skill hedges: "Not
verified as still maintained; check." **The hedge is no longer warranted — k6 is unambiguously alive:**

- `grafana/k6` is not archived; last push **2026-08-28** (today), 31,340 stars.
- Latest release **v2.2.0, published 2026-08-10**.
- The `constant-arrival-rate` executor survives the v2 major version and is still documented as an
  open-model executor: "It is an open-model executor, meaning iterations start independently of system
  response." The v2 migration guide removes `externally-controlled` and explicitly names
  `constant-arrival-rate` as a migration target — so the skill's chosen executor is not merely extant,
  it is the recommended one.

So the fitness function is implementable as written today. The hedge should be replaced with a
verified fact in skill 1's format — `k6 (v2.2.0, 2026-08-10)` — which also fixes the calibration gap:
skill 1 pinned `ArchUnit (v1.5.0, 2026-08-04)`, skill 2 did not pin anything. Recorded as MINOR-5, not
higher, because an honest hedge is not a defect; it is just weaker than the fact that was available.

**Verdict on "borrowed, not chosen": the strongest threshold justification in the suite so far, not a
dodge — but the claim is not literally true of all three numbers.**

The argument for it being genuinely strong, not a dodge:

1. A dodge would push the number onto the reader with no principle ("use whatever your SLO says").
   This does the opposite: it gives a _reason why borrowing is correct here_ for the second threshold,
   and the reason is a real principle — the autoscaler's measured scale-out interval is "the window in
   which degradation is physics — past it, it belongs to the design." That sentence draws a line
   between degradation the architecture cannot be blamed for and degradation it can. That is a
   substantive, falsifiable boundary, and it is the best threshold reasoning in either skill.
2. For the first threshold, "the SLO is a promise already made" is thinner but still correct: a fitness
   function stricter than the promise is theatre, and one looser than the promise is a second, hidden
   promise. Refusing to invent a competing number is a reasoned position, not an evasion.
3. Both thresholds force the reader to go and _measure something in their own system_ (the existing
   SLO figure; the autoscaler's actual scale-out time) rather than adopt the author's number. That is
   the property a threshold in a skill should have, and skill 1's "zero new violations" does not have
   it — skill 1 justified a chosen number well; skill 2 avoided needing to choose one.

The gap, recorded as MINOR-4: **the p99 threshold contains a third number, "2×", which is chosen and
carries no justifying sentence.** So "Both borrowed, not chosen" overclaims about the skill's own
provenance discipline in the one place it is proudest of it. Either justify the multiplier or say
plainly that it is the one chosen number and why 2 rather than 1.5 or 3.

## 8. Scale honesty — **PASS**

Body line 35–40. The floor is a **three-part conjunction**, all of which must hold: one quantum; one
team with no stakeholder outside it; and "nothing nameable beyond the standing implicit four —
feasibility (cost/time), security, maintainability, observability."

- **Is the marking adequate?** Yes. "(under about eight engineers, **a rule of thumb, not sourced**)"
  is inline, parenthetical to the number itself, unmissable, and uses the identical formula skill 1
  used — consistent across the suite, which is the right outcome for a figure that recurs.
- **Is the figure defensible?** As a number, eight is arbitrary and the skill does not pretend
  otherwise. What makes it defensible is that **it is not the operative test**: the third clause is,
  and it is observable ("nothing nameable beyond the standing implicit four"). A nine-engineer team
  with one nameable driving characteristic still falls under the floor by clause three; a
  six-engineer team with three quanta does not, by clause one. The headcount is a prompt, the clause
  is the test. That is the correct way to ship an unsourced number.
- The consequence is stated, not implied: "Write the one characteristic that shapes the design and
  stop; a three-slot ceremony over a list of one teaches the team that the ritual was the point."

## 9. Scope hygiene — **MAJOR**

**MAJOR-1 — the description's leading trigger collides with two neighbours and contradicts the
skill's own body routing.**

The three descriptions, as an agent sees them at selection time:

| Skill                          | Trigger text                                                                |
| ------------------------------ | --------------------------------------------------------------------------- |
| `architecture-characteristics` | "Use when a requirement says **'must be scalable' with no number**"         |
| `architecture-decision-making` | "when a requirement reads **'must be scalable'** or 'must be maintainable'" |
| `requirements-and-acceptance`  | "when 'fast', 'secure' or 'reliable' appears **without a number**"          |

The author's narrowing was "with no number". **It does not separate anything**, for two reasons:

1. **ADM's trigger is the superset.** ADM fires on "must be scalable" whether or not a number is
   present, so every prompt matching AC's trigger also matches ADM's — and ADM's is the _verbatim_
   phrase. AC's qualifier can only shrink its own claim inside ADM's, never carve territory out of it.
   And the set of "must be scalable" requirements _with_ a number is close to empty; that is the whole
   premise of both skills. The narrowing is therefore nearly vacuous in practice.
2. **The "with no number" half is `requirements-and-acceptance`'s own signature.** R&A's trigger is
   literally "an adjective without a number". AC's qualifier does not distinguish it from ADM; it
   moves it toward a _third_ skill.

The decisive point is internal. **AC's body immediately routes this exact case away from itself:**

> "If the requirement itself is ambiguous, clarify it first (`requirements-and-acceptance`)."
> "**The list exists and the task is making one observable** — `architecture-decision-making` owns the
> scenario and the record."

So the description advertises for work the body hands to two other skills on arrival. That is the
strongest form of this finding: not a boundary judgement I disagree with, but a description that
contradicts its own body. Test prompt N-9 below is the misroute, and skill 1 shipped with an open
misroute against ADM already (residual 9a); this is a second one.

**Is the separation genuine or merely apparent?** The _skill's_ separation is genuine; the _trigger's_
is apparent. The real division of labour is clean and the body states it correctly: AC owns whether a
list exists, what is on it, at what grain, scoped to which quantum, and what was excluded on the
record; ADM owns turning one name into a scenario and recording the decision; R&A owns making an
ambiguous requirement checkable. Nothing overlaps. Only the first of AC's eight triggers fails to
express that, and it is the only one that does.

**The other seven triggers are excellent and collide with nothing** — "a dozen -ilities are all called
driving", "'reliability' or 'agility' is claimed as one characteristic", "scalability and elasticity
used interchangeably", "strong consistency and high availability both hold a top-three slot", "an
estate has one system-wide list", "a quality model is offered as the list". Each names a situation no
neighbouring skill claims, and each is observable in a prompt. The description does not need the first
trigger; deleting it outright would raise the description's precision at no cost to recall. A better
replacement, if one is wanted, is list-shaped: _"when 'must be scalable' is the entire list"_, or
_"when a service's driving list has never been written down"_.

**Does skill 2 restate skill 1's method? No — PASS.** Checked deliberately, because §2's table is
shaped like a mode-B comparison matrix and could easily have drifted into one. It has not:

- The _object_ differs. Skill 1 compares architectural **options** on characteristic dimensions; skill
  2 compares candidate **characteristic sets** for list slots. Different decisions, different outputs.
- Skill 2 never rates in isolation, never consolidates to ordinal words, never reads the matrix for
  correlations, never mentions MECE, never discusses qualitative-vs-quantitative mode selection. None
  of skill 1's method appears.
- The deferral is explicit and total, in both the body and the description: "**The argument is over
  which option serves an agreed characteristic** — that method is `architecture-trade-off-analysis`;
  **this skill defers to it entirely**."
- The handoff is bidirectional and already anticipated: skill 1's fitness-function section says
  "`architecture-characteristics` … goes deeper; neither exists yet." Skill 2 now fills that without
  re-opening skill 1's method.

The `slo-and-alerting` boundary is also clean, and better than a mere exclusion: skill 2's fitness
function _consumes_ an SLO ("the figure already in the intake SLO") rather than setting one, which
demonstrates the boundary instead of asserting it.

## 10. Diagram accuracy — **PASS (vacuous)**

No diagrams in any of the five files. Content is Markdown tables and two `text` fenced blocks (the
fitness function, the ADR). Nothing requires a notation statement. This matches the brief's
expectation that there should be none.

## 11. Trigger quality — **one misroute (MAJOR-1), one borderline, ten clean**

Judged from name + description only, as an agent routes.

### Positives — must select `architecture-characteristics`

| #   | Prompt                                                                                                   | Verdict                                                                                                                                                                                                                                                                   |
| --- | -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P-1 | "Our architecture doc lists fourteen -ilities and every one is marked as driving. Help me cut it down."  | **PASS** — "a dozen -ilities are all called driving" is a near-verbatim match; no neighbour claims it                                                                                                                                                                     |
| P-2 | "Our top three is reliability, agility and performance. Is that a usable list?"                          | **PASS** — "'reliability' or 'agility' is claimed as one characteristic" matches exactly; composites are named in the covers clause                                                                                                                                       |
| P-3 | "The platform team keeps one quality-attribute list covering all eleven services. Is that right?"        | **PASS** — "an estate has one system-wide list" plus "scoping each list to one quantum"                                                                                                                                                                                   |
| P-4 | "The spec says scalability, ops keeps saying elasticity. Are they the same thing?"                       | **PASS** — "scalability and elasticity are used interchangeably", verbatim                                                                                                                                                                                                |
| P-5 | "Sign-off request: top three is strongly consistent, highly available, low latency."                     | **PASS** — "strong consistency and high availability both hold a top-three slot", verbatim. Some pull toward `architecture-trade-off-analysis` ("two advocates each hold an internally consistent case"), but AC's phrase match is exact and ATOA's is generic            |
| P-6 | "Compliance wants ISO 25010 adopted as our architecture driver list."                                    | **PASS** — "a quality model is offered as the list"; `taxonomy-and-iso.md` is routed by exactly this condition                                                                                                                                                            |
| P-7 | "We're splitting the monolith into three services next quarter — do we need three characteristic lists?" | **BORDERLINE PASS** — the body owns "whenever a quantum splits", but the _description_ only offers "scoping each list to one quantum" in the covers clause and the estate-wide trigger. It should still win; no neighbour is closer. Worth a trigger if one slot frees up |

### Negatives — must route elsewhere

| #    | Prompt                                                                               | Should select                     | Verdict                                                                                                                                                                                                                                                                           |
| ---- | ------------------------------------------------------------------------------------ | --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| N-8  | "The ticket says the report page must be fast. What acceptance criteria do I write?" | `requirements-and-acceptance`     | **PASS** — R&A names "fast" verbatim; AC's trigger is scoped to "must be scalable" and does not reach                                                                                                                                                                             |
| N-9  | "The PM wrote 'the checkout service must be scalable'. What now?"                    | ADM or R&A                        | **FAIL — the misroute.** AC ("'must be scalable' with no number"), ADM ("a requirement reads 'must be scalable'") and R&A ("without a number") all match one short prompt. AC's own body then sends this case to R&A. This is MAJOR-1                                             |
| N-10 | "We've agreed availability is the driver. Kafka or RabbitMQ?"                        | `architecture-trade-off-analysis` | **PASS** — AC's exclusion names the trade-off method; nothing in AC's trigger list matches an option comparison                                                                                                                                                                   |
| N-11 | "We've settled on 99.9% availability — now set up the alerting."                     | `slo-and-alerting`                | **PASS** — AC excludes "operational targets and alerting (slo-and-alerting)" by name                                                                                                                                                                                              |
| N-12 | "We picked event-driven for the order service. Write the ADR."                       | `architecture-decision-making`    | **PASS** — AC excludes "recording the decision" by name; no AC trigger matches                                                                                                                                                                                                    |
| N-13 | "Turn 'must be maintainable' into a testable scenario."                              | `architecture-decision-making`    | **PASS** — AC excludes "turning a characteristic into a scenario" by name, and its own triggers are all list-shaped. Clean, and notably it is the _same adjective family_ as N-9 yet routes correctly — which isolates the defect to AC's one trigger rather than to the boundary |

Twelve prompts realistic at selection time; one fails. The failure is a single clause, and N-13
demonstrates the boundary itself is sound.

## 12. Internal consistency — **PASS except for the MAJOR-3b contradiction**

- **`skill.yaml` vs frontmatter: verified byte-identical at 1014 characters each.** Extracted both
  folded scalars, normalised whitespace, compared character by character: `identical true`, both
  `1014`. The author's claim is exactly right. (The scalar indicators differ — `>` in the frontmatter,
  `>-` in the manifest — which affects only a trailing newline, not the value; both round-trip to the
  same string, and `validate` accepts both.)
- Frontmatter promises five things — three-part test, explicit/implicit sourcing, the two caps with
  Others Considered, composites decomposed to be measured, scoping to one quantum. All five are in the
  body, each with a dedicated section. No promise unhonoured; no major body section unadvertised.
- All three references are routed from the body by an explicit condition ("Read before running the
  stakeholder session", "Read when two people use one of these words differently…", "Read when someone
  cites 'the book's three categories'…"). House standard gate met.
- No reference duplicates the body: the body states the pairs table in one line each, the reference
  gives the verbatim definitions; the body states the caps, the reference gives the full Instructions
  block and the procedure. Removing any of the three loses a capability.
- `files:` in the manifest matches what ships; `validate` reports 5 files, no issues; no frontmatter
  `version` to conflict with the manifest's `1.0.0`.
- **The one contradiction is MAJOR-3b**: the body's Eckhardt figures disagree with
  `taxonomy-and-iso.md`'s correct statement of the same numbers.
- MINOR-6 is a second, softer inconsistency between two body blocks (the 12-minute window and the
  60-second step).

---

## Judgement on §2 — the four candidate sets — **MAJOR-2**

**Is it a genuinely exclusive option set, or a menu wearing a decision's clothes?**

**It is a genuine decision, and the construction is tighter than it first appears.** The arithmetic is
the point and it is easy to miss: there are four sets and three slots; G and C are mutually exclusive
in slot one; therefore choosing between G and C eliminates exactly one set, and the remaining three
fill the remaining three slots exactly. "One loses outright" is not a throwaway — it is the load
sentence, and it means the _entire list_ is determined by a single decision about where atomicity
lives. That is a real decision with a real forcing structure, not a menu.

The exclusivity itself is properly grounded rather than asserted. It comes from the _Hard Parts_ saga
table read as a conflict statement — atomic versus eventual is a genuine either/or, and the skill
attaches the observation that settles it in the reader's system ("Reverses the moment a named person
in the business can state a tolerable disagreement window; that sentence is the reversal"). A named
person naming a tolerable window is an unusually good reversal test: it is cheap, it is verifiable,
and it converts an architectural argument into a question for a specific human.

**But the construction is the author's, and it is not marked as the author's. That is MAJOR-2.**

Nothing in the brief groups characteristics into G/C/U/A, or into four sets, or into any sets. The
brief supplies the saga table's _magnitudes_ and nothing else. The skill attributes precisely that —
"Magnitudes are _The Hard Parts_ (2021) saga table read as a conflict statement" — and by attributing
the magnitudes it implies, without saying so, that the framework carrying them is equally sourced. It
is not. Three things in §2 are the author's own and unmarked:

1. the four sets and their membership;
2. the four column dimensions and the measurement question attached to each;
3. the three-slots-four-sets arithmetic that makes the section a decision at all.

Skill 1 is the calibration target and it marks exactly this class of move, twice and explicitly:
"applying them to analysis effort is **this skill's extension, not the authors'**", and "A–D are
**scaffolding here, not the authors' vocabulary**." Skill 2 makes a larger construction with no
equivalent sentence, in the section headed "**The decision this skill makes**" — the section a reader
is most likely to take as the authors' method.

I considered BLOCKER (unsourced-and-unmarked) and settled on MAJOR: the _factual_ content of §2 (the
magnitudes) is sourced and attributed correctly; what is unmarked is a framing device, and framing
devices are legitimate when labelled. One sentence fixes it — e.g. "The four sets and their dimensions
are this skill's construction, not the authors'; only the magnitudes are theirs."

A second, smaller point on the same section: the four sets are presented as the universe of candidates
for any quantum, when they are the plausible candidates for the _worked_ quantum. A system whose
drivers are security, interoperability and workflow does not appear anywhere in the table. The same
marking sentence should say the set is illustrative, or the section should name the quantum it is
constructed for — the ADR block later does name one (order intake), and pulling that forward would
cost a clause.

---

## Findings by severity

### BLOCKER — none

### MAJOR — 3 (gate: zero)

- **MAJOR-1** — Scope. The description's leading trigger, "a requirement says 'must be scalable' with
  no number", collides with `architecture-decision-making`'s superset trigger and with
  `requirements-and-acceptance`'s "without a number", and contradicts AC's own body, which routes that
  exact case to both of them. Second open misroute against ADM in the suite. Fix: delete the trigger
  or replace it with a list-shaped one.
- **MAJOR-2** — Provenance. §2's four candidate sets, their four measurement dimensions, and the
  three-slots-four-sets arithmetic are the author's construction, unmarked, in the section headed
  "The decision this skill makes". Skill 1 marks its equivalent twice. Fix: one sentence.
- **MAJOR-3** — Two misattributed figures. (a) Ameller: "one having validated more than three
  attribute types" — Table IV shows none did and exactly one validated three; the brief's "at most"
  was dropped. (b) Eckhardt: 27.2% / 19.6% are corpus-wide, presented as business-systems figures,
  contradicting the skill's own `taxonomy-and-iso.md`.

### MINOR — 8

1. The body's "Worksheet, verbatim:" list ends with `"in the Others Considered list"`; the worksheet
   says "…**to** the _Others Considered_ list". A preposition changed inside an explicitly verbatim
   quotation. The reference carries the full block correctly.
2. §2's C row takes all four magnitudes from the Epic row and labels them as such, but the saga table
   has a _second_ atomic pattern — orchestrated, at medium responsiveness and lower coupling. A reader
   over-prices atomic consistency. The exclusivity claim is unaffected (both atomic rows are atomic);
   the cost estimate is not. Fix: one clause naming the orchestrated row as the cheaper atomic option.
3. The body's only ISO mention — "feasibility (cost/time) has no ISO 25010 equivalent" — omits the
   version, while the skill's own reference makes "**say which version you mean, every time**" a
   standing rule. The claim happens to hold for both versions, which is why this is MINOR, but the
   body breaks its own rule in the only place it could.
4. "Both borrowed, not chosen" overclaims: the p99 threshold contains a third number, the **2×**
   multiplier, which is chosen and unjustified. Justify it or name it as the one chosen number.
5. The k6 hedge ("Not verified as still maintained; check") is now replaceable with a verified fact:
   k6 v2.2.0, published 2026-08-10, repo pushed 2026-08-28, not archived, `constant-arrival-rate`
   still documented as open-model and named as a v2 migration target. Skill 1 pinned its tool with
   version and date; skill 2 should match that format.
6. The fitness function applies the peak step "inside 60 seconds"; the ADR block describes the same
   quantum's peak as "41x over a **12-minute** window". The synthetic ramp is roughly twelve times
   steeper than the observed event, and no sentence reconciles them — a reader implementing both hits
   this immediately. Either justify the harsher ramp or align the numbers.
7. "modifiability 26–35% of scenarios" merges two different denominators: 26% _of scenarios_ in study
   2, and 35% _of embedded-systems concerns_. Presented as one range over one denominator.
8. Two of the four "Push on — add the slot" rows (Eckhardt's distribution, ATAM's 15-year data) are
   population base rates, not tests applicable to the system in front of you. The other two rows are
   genuine tests ("Test 2 bites: you can point at the structural consequence"), and the mixture
   weakens what is otherwise the body's best decision aid.

### NIT — 4

1. The body says the March 2024 worksheet drops the taxonomy "for one flat list, adding observability,
   deployability, elasticity, workflow, feasibility, data integrity/consistency" — but observability
   and feasibility live in the worksheet's _separate implicit box_, not the flat "Common" list. The
   body says so correctly two sections later, and `taxonomy-and-iso.md` gets it right.
2. "**The taxonomy you meet elsewhere is not the authors' current method**" attributes to both authors
   a worksheet that is Richards' alone; the next clause says "Richards' own worksheet", which corrects
   it. Ford has published nothing that abandons the split.
3. "FF-11" is cited in the ADR's Compliance line, but the fitness-function block it points at carries
   no label. Skill 1 has the same gap with FF-07; consistent, and still a dangling reference.
4. The body compresses the scalability definition to "growth over time at constant error rate"; the
   worksheet holds _three_ things invariant — responsiveness, performance and error rate.
   `definitions-and-composites.md` has all three.

---

## Weakest thing that is not a formal finding

**The skill's best argument has no step for its own consequence.** Its sharpest move — the one that
resolves the live disagreement honestly — is "get three, then concretise and re-check", grounded in
SEI's finding that the stakeholders' first pick missed two of the four attributes that mattered.
`eliciting-and-capping.md` builds it into a five-step procedure and ends step 5 with "Expect the list
to change here; if it never does, step 4 was not done properly."

But neither the body nor the reference says **what to do when the re-check returns a fourth
characteristic** — which, on SEI's own evidence, is the expected outcome rather than the edge case. The
cap says three. The evidence says the first three are incomplete. Step 5 says expect change. The
procedure then stops, with the two halves of the skill's own argument unreconciled: does the fourth
displace one of the three, does it go to Others Considered having just been shown to matter, or does
the cap bend? Every one of those is defensible and the skill picks none.

This is an omission, not an error, and it is a gap in the strongest section rather than the weakest —
which is precisely why it is worth naming. One paragraph in `eliciting-and-capping.md` would close it.

---

## Mechanical output

```
$ node packages/cli/bin/agent-skills.mjs validate skills/architecture-characteristics
architecture-characteristics@1.0.0

  C:\git\agent-skills\skills\architecture-characteristics
  5 files

✓ Valid — no issues found

EXIT=0
```

```
$ npx prettier --check "skills/architecture-characteristics/**/*.{md,yaml}"
Checking formatting...
All matched files use Prettier code style!
EXIT=0
```

```
$ wc -l skills/architecture-characteristics/SKILL.md skills/architecture-characteristics/references/*
  200 skills/architecture-characteristics/SKILL.md
  146 skills/architecture-characteristics/references/definitions-and-composites.md
  160 skills/architecture-characteristics/references/eliciting-and-capping.md
  170 skills/architecture-characteristics/references/taxonomy-and-iso.md
  676 total
```

Description length check (frontmatter vs manifest):

```
SKILL len 1014
yaml len 1014
identical true
```

`registry:build` and `verify` deliberately not run — seven unrelated `gof-*` packages lack
`skill.yaml` and both abort. Not in scope for this skill.

External verification performed by the validator (the author could not reach these):

| Fact                                                    | Source                                                                           | Result                                                                                                                                                    |
| ------------------------------------------------------- | -------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| k6 maintained?                                          | `api.github.com/repos/grafana/k6`                                                | Not archived; pushed 2026-08-28; 31,340 stars                                                                                                             |
| k6 latest release                                       | `api.github.com/repos/grafana/k6/releases/latest`                                | **v2.2.0, published 2026-08-10**                                                                                                                          |
| `constant-arrival-rate` still exists and is open-model? | `grafana.com/docs/k6/latest/using-k6/scenarios/executors/constant-arrival-rate/` | Yes — "It is an open-model executor, meaning iterations start independently of system response." Survives v2; named as a migration target in the v2 guide |

---

---

# ITERATION 2 — PASS

**0 BLOCKER, 0 MAJOR. 1 new MINOR, 1 new NIT. 8 MINOR and 2 NIT from iteration 1 resolved; 2 NIT
declined by the author, both accepted. Gate met.**

Re-read from disk before judging. Counts as measured, which differ from the coordinator's summary:
**all 3 MAJOR, all 8 MINOR and 2 of 4 NIT were addressed** (the coordinator reported six MINORs and
three NITs; the actual figure is eight MINORs and two NITs — MINOR-1, -2, -3, -4, -5, -6, -7 and -8
are all fixed in the current text, and the two remaining NITs are the declined pair, not unaddressed
ones).

## The two changes read closest

### The 2x (iteration 1 MINOR-4) — **naming it is sufficient. RESOLVED.**

Current text: _"Two of the three are borrowed, not chosen: the SLO is a promise already made, and the
scale-out interval is the window in which degradation is physics — past it, it belongs to the design.
The 2x is the one chosen number, a convention not a derivation; replace it with the multiple your own
incident record shows customers actually complain at."_

I agree with the coordinator's lean, but the reason matters more than the conclusion, because "it
hands the reader a way to derive their own" would also excuse a much weaker fix.

**The finding was never that the number was unjustified. It was that the block claimed a provenance
discipline it did not uniformly hold.** "Both borrowed, not chosen" was a claim about the block's own
honesty, and it was false of one of its three numbers. That claim is now true as stated ("Two of the
three"), so the defect the finding named is gone regardless of what happened to the 2x.

What happened to the 2x is separately good. The threshold block's virtue is that no number in it is
the author's invention presented as derived — each sends the reader to a source they already have: the
existing SLO, the measured autoscaler scale-out time, and now the incident record. The 2x is the one
number that could not be borrowed, and it is now the only one _marked_ as the author's, with a named
replacement source. "The multiple your own incident record shows customers actually complain at" is a
real, commonly available signal and the right one for a responsiveness threshold — it is a derivation
instruction, not a shrug.

**Does an unjustified number survive by being labelled rather than fixed? Yes — and that is the
correct outcome here.** The alternative was to invent a justification for 2 (a plausible-sounding
interaction-budget argument would have been easy to write and impossible to source), which is exactly
the failure this suite is calibrated against. Naming a convention as a convention is strictly more
honest than dressing it as a derivation, and the skill loses nothing by it: the number is a
placeholder, is flagged as a placeholder, and the reader is told what to put in its place. Sufficient.

### The fourth characteristic — **position accepted; framing gap is new MINOR-9.**

Iteration 1 raised this as a non-finding; the coordinator promoted it to a required fix. The section
`eliciting-and-capping.md` §"When the re-check returns a fourth characteristic" takes a position — the
fourth **displaces** one of the three, and the displaced one goes to Others Considered — and conditions
both alternatives rather than listing them.

**Does the displacement rule contradict anything else in the package? No. Checked against six things:**

| Package element                                                                                                                   | Interaction                                                                                                                                                                                                                                                                                                                                                                                                          | Verdict                                                               |
| --------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| The ≤7 / top-3 cap (worksheet)                                                                                                    | Displacement preserves both caps by construction                                                                                                                                                                                                                                                                                                                                                                     | Consistent                                                            |
| "Pick the top 3 **in any order**"                                                                                                 | The obvious naive rule — "drop the weakest of the three" — _would_ have contradicted this, since an unordered list has no weakest member. The author avoided it: "Which one is displaced is decided the same way the original three were: run the trade-off table again with the new candidate in it, and drop whichever set now loses outright." That is a re-run of the selection, not a ranking of the incumbents | **Consistent, and deliberately so — the sharpest part of the answer** |
| "Others Considered is an artefact, not a bin" (same file)                                                                         | The displaced characteristic lands there with a reason, which is what that section demands. It arrives with a _better_ record than an ordinary exclusion — it held a slot and lost to evidence                                                                                                                                                                                                                       | Consistent, reinforcing                                               |
| The authors' "try to drop one (or two)"                                                                                           | Displacement is that instruction applied at re-check time                                                                                                                                                                                                                                                                                                                                                            | Consistent, reinforcing                                               |
| The ADR Compliance line — "a characteristic reaching a review with no fitness function moves to Others Considered at that review" | This is the _same rule_ as the section's second branch ("send it to Others Considered when step 4 could not produce a response measure"), applied at a later moment. The package now has one coherent principle about unmeasurable characteristics, stated twice                                                                                                                                                     | Consistent — the coherence is unremarked and worth more than it costs |
| Step 4 belonging to `architecture-decision-making`                                                                                | The rule consumes step 4's output (a scenario with a response measure) and acts on the list, which is this skill's object. No annexation                                                                                                                                                                                                                                                                             | Boundary held                                                         |

**Does it survive the SEI evidence, where two attributes arrived late rather than one?** This is the
right question and the answer is split.

- **The mechanism survives.** "Run the trade-off table again with the new candidate in it, and drop
  whichever set now loses outright" is not a one-for-one swap — it is a re-run of the selection with
  the candidate pool enlarged. Two arrivals enter the same re-run and three survive. Nothing about the
  procedure breaks at n=2.
- **The framing does not.** The heading is "When the re-check returns a **fourth** characteristic", the
  position sentence says "the fourth displaces **one** of the three", and the motivating evidence
  quoted four lines above is a case where _two_ arrived at once ("their first pick missed two"). A
  reader who takes the singular literally has no stated instruction for the case the section was
  written to answer. That is a genuine gap in the strongest new material, and it is one clause wide.
- **A partial defence the section does not make:** SEI's engagement was not operating under a cap of
  three — ATAM's utility tree is exhaustive with a "top five scenarios" cutoff — so it never had to
  choose among four, and reading it as a counterexample to the cap imports a constraint SEI never
  applied. The reference already holds this distinction elsewhere ("this does not invalidate 'pick
  three' — it invalidates **stopping** there"), so the material to close the gap sits unused in the
  same file.
- **The wrong-branch signal nearly covers it:** "if the re-check returns a fourth characteristic every
  time you run it… step 1 is under-translating." Two arriving from a single re-check is a stronger
  instance of that signal than one arriving. The section does not say so.

**Verdict: the position is defensible, internally consistent, well-mechanised and correct on the
merits — it is the only branch that keeps the cap a corollary rather than an arbitrary number, and the
author is right about that. Recorded as new MINOR-9 for the n=1 framing only.** The fix is one clause:
say that two arriving at once is the same procedure and a stronger signal that step 1 under-translated.

## 1. MAJOR-1 — trigger. **RESOLVED. The list-shaped form carves real territory.**

New trigger: _"Use when **'must be scalable' is the entire list**"_. The old one was "…with no number".

The change is not cosmetic: **it changes the trigger's object from a requirement to a list.** That is
the actual dividing line between the two skills' work — ADM acts on a requirement, this skill acts on a
list — so the discriminator now sits where the boundary sits. Three consequences, all verified:

- **The `requirements-and-acceptance` collision is removed outright.** "with no number" was R&A's own
  signature ("when 'fast', 'secure' or 'reliable' appears without a number"). Those words are gone from
  this description; nothing in it now claims an ambiguous-requirement case.
- **The `architecture-decision-making` overlap now resolves in this skill's favour only where this
  skill is correct.** ADM's trigger still fires on the bare phrase, but a prompt must now _establish
  that a list exists and has one member_ to reach this skill. Where it does, this skill is the right
  answer; where it does not, ADM wins on a verbatim phrase match.
- **The body no longer contradicts its own description.** The body still routes ambiguous requirements
  to `requirements-and-acceptance` — now consistent with a description that does not claim them.

**Does it move the collision somewhere new? No.** Probed against all four declared neighbours plus the
covers clause: `architecture-trade-off-analysis` has no list language; `slo-and-alerting` none;
`estimation-under-uncertainty` none; R&A's overlap is removed rather than relocated. The one place the
new form could over-reach is a prompt phrasing a single stated NFR as "our only NFR" while asking for
acceptance criteria — tested as N-15 below, and it comes out borderline rather than wrong.

### Routing suite re-run — 15 prompts, 13 clean, 2 borderline; **1 changed, 0 regressions**

Iteration 1's thirteen re-run verbatim, plus two new probes for the rewritten trigger.

| #        | Prompt                                                                                                           | Should select                     | Iter 1     | Iter 2         | Change                                                                                                                                                                                                                           |
| -------- | ---------------------------------------------------------------------------------------------------------------- | --------------------------------- | ---------- | -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P-1      | "Our architecture doc lists fourteen -ilities and every one is marked as driving."                               | this skill                        | PASS       | PASS           | —                                                                                                                                                                                                                                |
| P-2      | "Our top three is reliability, agility and performance. Is that a usable list?"                                  | this skill                        | PASS       | PASS           | —                                                                                                                                                                                                                                |
| P-3      | "The platform team keeps one quality-attribute list covering all eleven services."                               | this skill                        | PASS       | PASS           | —                                                                                                                                                                                                                                |
| P-4      | "The spec says scalability, ops keeps saying elasticity. Same thing?"                                            | this skill                        | PASS       | PASS           | —                                                                                                                                                                                                                                |
| P-5      | "Sign-off: top three is strongly consistent, highly available, low latency."                                     | this skill                        | PASS       | PASS           | —                                                                                                                                                                                                                                |
| P-6      | "Compliance wants ISO 25010 adopted as our architecture driver list."                                            | this skill                        | PASS       | PASS           | —                                                                                                                                                                                                                                |
| P-7      | "We're splitting the monolith into three services — do we need three lists?"                                     | this skill                        | BORDERLINE | BORDERLINE     | — (carried residual)                                                                                                                                                                                                             |
| N-8      | "The ticket says the report page must be fast. What acceptance criteria?"                                        | `requirements-and-acceptance`     | PASS       | PASS           | cleaner — the shared "without a number" phrasing is gone                                                                                                                                                                         |
| **N-9**  | **"The PM wrote 'the checkout service must be scalable'. What now?"**                                            | ADM, or R&A                       | **FAIL**   | **PASS**       | **CHANGED — the misroute is closed.** The prompt establishes a requirement, not a list; this skill's trigger no longer reaches it, ADM matches verbatim                                                                          |
| N-10     | "We've agreed availability is the driver. Kafka or RabbitMQ?"                                                    | `architecture-trade-off-analysis` | PASS       | PASS           | —                                                                                                                                                                                                                                |
| N-11     | "We've settled on 99.9% availability — now set up the alerting."                                                 | `slo-and-alerting`                | PASS       | PASS           | —                                                                                                                                                                                                                                |
| N-12     | "We picked event-driven for the order service. Write the ADR."                                                   | ADM                               | PASS       | PASS           | —                                                                                                                                                                                                                                |
| N-13     | "Turn 'must be maintainable' into a testable scenario."                                                          | ADM                               | PASS       | PASS           | —                                                                                                                                                                                                                                |
| **P-14** | **new probe:** "The architecture doc's driving-characteristics section contains one line: 'must be scalable'."   | this skill                        | —          | **PASS**       | new. Near-verbatim match on the rewritten trigger; ADM's promise ("turning quality attributes into observable scenarios") does not fit a task that is _building the list_                                                        |
| **N-15** | **new probe:** "Our only stated NFR is 'must be scalable' and I need acceptance criteria for the sprint ticket." | `requirements-and-acceptance`     | —          | **BORDERLINE** | new. "our only stated NFR" is the closest a prompt gets to "the entire list" while the _ask_ is R&A's verbatim territory. R&A should win on the verb; this skill is a plausible second. Named honestly, not counted as a failure |

**Count: 15 prompts. 13 clean passes, 2 borderline (P-7 carried, N-15 new), 0 failures. One prompt
changed — N-9, from FAIL to PASS. Nothing regressed in either direction.**

## 2. MAJOR-2 — provenance marking. **RESOLVED.**

Current text, lines 57–60, immediately before the table:

> **The four sets, their dimensions and the three-slots arithmetic are this skill's construction, not
> the authors'** — only the magnitudes are theirs, from _The Hard Parts_ (2021) saga table read as a
> conflict statement — and they are the candidates for the order-intake quantum worked below, not a
> universe: a system driven by security, interoperability and workflow appears nowhere in the table.

Checked against what the finding required:

- **Marks the whole construction** — sets, dimensions _and_ arithmetic are each named. All three
  elements identified in iteration 1 are covered; nothing is left implicitly attributed.
- **Marks what is sourced, separately** — "only the magnitudes are theirs", with the book and year. A
  reader can now tell exactly which half is Richards & Ford's.
- **Before the table** — the marking is at lines 57–60; the table begins at line 62. The sets are
  introduced at line 53, four lines earlier, so a reader meets the construction and then the marking
  within the same paragraph, bolded, before any of the table's content. That satisfies "before rather
  than after".
- **Beyond what was asked** — it also closes the smaller point raised alongside the finding: the set is
  now explicitly illustrative ("the candidates for the order-intake quantum worked below, not a
  universe"), with the counter-example spelled out. This is now marked to skill 1's standard or above.

## 3. MAJOR-3 — both figures. **RESOLVED. Body and reference agree.**

Re-read against the brief, not against the previous text.

- **Ameller.** Now: "**11 of 13** declared every NFR met, while only one of them validated as many as
  three attribute types." Brief Table IV: validated three types = 1; two = 3; one = 4; none = 1. "As
  many as three" correctly makes three the ceiling reached, and "only one of them" is the table's
  figure. Correct.
- **Eckhardt.** Now: "Eckhardt et al. (530 NFRs, 11 specs, 5 companies), **corpus-wide** 27.2%
  Functionality and 19.6% Security, **embedded systems** 54% Reliability." Brief: those two are the
  aggregate over all 530; 54% is the embedded subgroup. Correct, and the two populations are now
  visibly distinct.
- **Body vs reference:** `taxonomy-and-iso.md` line 158 states the same figures as "Their distribution,
  aggregated to ISO 9126 classes: Functionality 27.2%, Security 19.6%… with embedded systems at 54%
  Reliability." **The two now agree.** The iteration 1 self-contradiction is gone.
- One residue, recorded as new NIT-5: the body says "corpus-wide" where the reference says "aggregated
  to **ISO 9126** classes". Same meaning, but the body uses a 9126 class label ("Functionality", which
  25010 renamed Functional Suitability) without naming the model — in a skill whose standing rule is to
  name the standard version every time. One clause.

## 4. Regression check — **none found. Two of the three strongest parts improved.**

Line counts: SKILL.md 200 → **199**; `eliciting-and-capping.md` 160 → **188** (+28, entirely the new
§"When the re-check returns a fourth characteristic", lines 152–178); the other two references
unchanged at 146 and 170.

**All three references still routed from the body by an explicit condition:**

| Reference                       | Routing condition in the body                                                                                               | Status                                                                                                                              |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `eliciting-and-capping.md`      | "Read before running the stakeholder session."                                                                              | Intact, and the summary was _extended_ to name the new content ("and what to do when the re-check returns a fourth characteristic") |
| `definitions-and-composites.md` | "Read when two people use one of these words differently, or reliability or agility is claimed as a single characteristic." | Intact, unchanged                                                                                                                   |
| `taxonomy-and-iso.md`           | "Read when someone cites 'the book's three categories' or a quality model is offered as the driving list."                  | Intact, unchanged                                                                                                                   |

**Nothing was cut to pay for the trigger rewrite.** The body's net −1 line is re-wrapping, not removal.
Every source attribution present at iteration 1 is still present and was individually re-checked:
_Fundamentals_ 1st ed. ch. 4 with the four-note-sets caveat (line 25); the March 2024 worksheet (30);
the _Hard Parts_ saga table (58); the 1st-ed. and _Hard Parts_ quantum definitions with "say which book
you quote" (85–87); Eckhardt (96); ATAM 15-year (97); the worksheet's concurrency sentence (94);
GAO-15-238 (148); Ameller RE'12 Table IV (146); ATAM "not refutable" (147); CMU/SEI-2000-TR-004 §5.3
(183); the Figure 3 finding (190–191). No required property lost: the scale floor and its "a rule of
thumb, not sourced" marking (35–39), the pairs table, the failure signature's four rows, the ADR block,
the Honest Standing section and both caps are all intact.

**The three strongest parts:**

- **Fitness-function block — intact and improved.** All five links present; tool now pinned as
  `k6 (v2.2.0, 2026-08-10)` in skill 1's format, with the general rule retained ("confirm any tool is
  still maintained before a fitness function is allowed to depend on it"); the metric now states and
  justifies the ramp ("12x steeper than the observed ramp, deliberately"), closing MINOR-6; the site
  reasoning and the "a fitness function whose site cannot produce its metric is decoration" principle
  are unchanged.
- **The caps — intact.** Both quoted, in sequence, "Two caps, not one" retained; "(in any order)"
  retained and still load-bearing in the ADR and the Honest Standing argument; "add the rest _'to the
  Others Considered list'_" — the preposition is now the worksheet's, closing MINOR-1; "try to drop one
  (or two)" retained.
- **Taxonomy handling — intact and improved.** 2024 worksheet as current, 2020 as what a reader meets
  elsewhere, 2nd ed. unverified — all three preserved. Both iteration 1 NITs on this paragraph are
  fixed: it now reads "not **Richards'** current method (Ford has published nothing that abandons it)",
  and the flat-list membership no longer absorbs the separately-boxed implicit four.

## 5. The twelve items, re-run

| #   | Item                             | Iteration 2                                                                                                                                                                                                                                                                                                                                                                    |
| --- | -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | Technical accuracy               | **PASS** — both misattributed figures corrected against the brief. New NIT-5 (9126 not named in the body).                                                                                                                                                                                                                                                                     |
| 2   | Terminology fidelity             | **PASS** — unchanged from iteration 1; all five pairs, reliability-as-composite, and the quantum wording drift with "say which book you quote" intact.                                                                                                                                                                                                                         |
| 3   | ISO 25010                        | **PASS** — re-grepped: still **no ISO clause number anywhere**; the only `§` in the package is `CMU/SEI-2000-TR-004 §5.3`, which the brief cites and quotes. Version now named at the body's one ISO mention ("in either the 2011 or the 2023 version"), closing MINOR-3. The testability conflict is still carried unresolved with the paywall disclosed.                     |
| 4   | No unconditional recommendations | **PASS** — improved. The base-rate rows are now demoted in text ("they say where to look first, and only the top two rows decide"), closing MINOR-8; the new displacement position conditions both alternatives and adds a wrong-branch signal rather than issuing a bare rule.                                                                                                |
| 5   | Trade-offs qualified             | **PASS** — the C row now names the cheaper atomic option in all three affected cells ("the orchestrated row is the cheaper atomic option, at medium"; "low orchestrated"; "lower orchestrated"), closing MINOR-2. The measurement-question column headings and the "direction not tabulated" refusal are unchanged.                                                            |
| 6   | Evangelism and evidence honesty  | **PASS** — unchanged and extended. No outcome evidence, Miller's 7±2 ruled out, both sides named, the evidence that cuts against the primary source reported as such, and the conclusion still lands on "'ask for three and stop' is contradicted; 'translate, cap, get three, then concretise and re-check' is not" — now with a pointer to where the fourth name is handled. |
| 7   | Governance realism               | **PASS** — k6 verified and pinned, ramp justified, 2x named as chosen. Chain complete; site still matches the metric's shape.                                                                                                                                                                                                                                                  |
| 8   | Scale honesty                    | **PASS** — unchanged; three-part conjunction, headcount marked "a rule of thumb, not sourced", the observable clause still doing the work.                                                                                                                                                                                                                                     |
| 9   | Scope hygiene                    | **PASS** — MAJOR-1 resolved; the description no longer contradicts its own body; no collision relocated.                                                                                                                                                                                                                                                                       |
| 10  | Diagram accuracy                 | **PASS (vacuous)** — still no diagrams; tables and two `text` blocks only.                                                                                                                                                                                                                                                                                                     |
| 11  | Trigger quality                  | **PASS** — 15 prompts, 13 clean, 2 borderline, 0 failures, 1 changed (N-9 FAIL→PASS).                                                                                                                                                                                                                                                                                          |
| 12  | Internal consistency             | **PASS** — descriptions **byte-identical at 999 characters** (re-measured after the rewrite); body and `taxonomy-and-iso.md` now agree on Eckhardt; the Honest Standing pointer ("the reference says what to do with the fourth name that re-check turns up") resolves to a section that exists.                                                                               |

## 6. Declined NITs — **both declines accepted**

- **NIT-3, the dangling `FF-11` label.** Accepted. The referent is unambiguous — the same line reads
  "FF-11 nightly plus weekly review **(above)**" — and skill 1 has the identical shape with `FF-07`.
  Fixing one skill and not the other would put two sibling ADR templates out of step for no reader
  benefit. If this is ever fixed it should be fixed suite-wide, in one pass, and it is not worth one.
- **NIT-4, the compressed scalability definition.** Accepted, and it is the better call. The body's
  pairs table gives a one-line _axis_, not a definition, and its job is to separate the pair; all three
  invariants (responsiveness, performance, error rate) are in `definitions-and-composites.md`, which
  the body routes to by an explicit condition. That is precisely the house standard's own rule — "IF a
  section is relevant only to some tasks THEN move it to references/ and route to it by condition".
  Expanding the cell would duplicate a routed reference, which a different gate would then flag.

## 7. New findings this iteration — 1 MINOR, 1 NIT

Reported explicitly rather than claiming a clean sweep.

- **MINOR-9 (new).** `eliciting-and-capping.md` §"When the re-check returns a fourth characteristic" is
  framed for n=1 — heading, position sentence and the phrase "the fourth displaces one of the three" —
  while the SEI evidence quoted four lines above, and cited as the reason the section exists, is a case
  where **two** attributes arrived late. The mechanism generalises without amendment ("run the
  trade-off table again with the new candidate in it" is a re-run, not a swap); the framing does not
  say so. One clause fixes it, and the material is already in the same file.
- **NIT-5 (new).** The body's Eckhardt figures are aggregated to **ISO 9126** classes, and the body uses
  a 9126 class name ("Functionality") without naming the model — in a skill whose standing rule is to
  say which version of a standard you mean. `taxonomy-and-iso.md` names 9126 correctly.

---

## Residual list across both iterations — everything shipping unfixed

Four findings and two trigger borderlines. None blocks the gate.

| Item                                                                                                 | Origin            | Severity      | Reason for shipping                                                                                                                                                                                                                                                                                                    |
| ---------------------------------------------------------------------------------------------------- | ----------------- | ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **MINOR-9** — fourth-characteristic section framed for one late arrival; motivating evidence has two | Iter 2, new       | MINOR         | The mechanism it prescribes already handles n=2 without amendment, so the guidance is correct as executed; only the framing is narrow. A reader following the stated procedure reaches the right outcome. One clause when the file is next opened.                                                                     |
| **NIT-5** — body's Eckhardt figures use ISO 9126 class names without naming 9126                     | Iter 2, new       | NIT           | The numbers, populations and source are all correct and now agree with the reference; only the model label is implicit, and the reference states it. No claim is wrong.                                                                                                                                                |
| **NIT-3** — dangling `FF-11` label in the ADR Compliance line                                        | Iter 1, declined  | NIT           | Accepted decline. Referent is unambiguous ("(above)", same line) and skill 1 has the identical `FF-07` shape; fixing one would desynchronise two sibling templates. Suite-wide or not at all.                                                                                                                          |
| **NIT-4** — body's scalability axis names one invariant, the worksheet holds three                   | Iter 1, declined  | NIT           | Accepted decline. The body's cell is an axis, not a definition; all three invariants are in `definitions-and-composites.md`, routed by an explicit condition. Expanding it would duplicate a routed reference.                                                                                                         |
| **P-7** — "we're splitting the monolith into three services, do we need three lists?"                | Iter 1, carried   | not a finding | Borderline, still routes correctly. The body owns "whenever a quantum splits" and the covers clause promises "scoping each list to one quantum"; no neighbour is closer. Worth a description trigger only if a slot frees up — the description is already at 999 characters and its other seven triggers are stronger. |
| **N-15** — "our only stated NFR is 'must be scalable' and I need acceptance criteria"                | Iter 2, new probe | not a finding | Borderline by construction: the noun matches this skill, the verb matches `requirements-and-acceptance`, and the verb should win. Two skills matching one prompt where the correct one is reachable is normal routing, not a misroute. Recorded so a later iteration knows it was probed deliberately.                 |

**Resolved across iterations:** 3 of 3 MAJOR, 8 of 8 MINOR, 2 of 4 NIT (the other 2 declined and
accepted). **Nothing from iteration 1 remains open.**

---

## Mechanical output — iteration 2

```
$ node packages/cli/bin/agent-skills.mjs validate skills/architecture-characteristics
architecture-characteristics@1.0.0

  C:\git\agent-skills\skills\architecture-characteristics
  5 files

✓ Valid — no issues found

EXIT=0
```

```
$ npx prettier --check "skills/architecture-characteristics/**/*.{md,yaml}"
Checking formatting...
All matched files use Prettier code style!
EXIT=0
```

```
$ wc -l skills/architecture-characteristics/SKILL.md skills/architecture-characteristics/references/*
  199 skills/architecture-characteristics/SKILL.md
  146 skills/architecture-characteristics/references/definitions-and-composites.md
  188 skills/architecture-characteristics/references/eliciting-and-capping.md
  170 skills/architecture-characteristics/references/taxonomy-and-iso.md
  703 total
```

Description length check after the trigger rewrite (frontmatter vs manifest):

```
SKILL len 999 | yaml len 999 | identical true
```

ISO clause-number re-grep across all five files — one hit, and it is the SEI technical report, not ISO:

```
$ grep -rnE "§|clause [0-9]" skills/architecture-characteristics/
SKILL.md:183: ... (CMU/SEI-2000-TR-004 §5.3, 2000) ...
```

`registry:build` and `verify` deliberately not run — seven unrelated `gof-*` packages lack `skill.yaml`
and both abort. Not in scope for this skill.

---

---

# ITERATION 3 — FAIL

**1 BLOCKER: none. 1 MAJOR, 4 MINOR, 2 NIT — all new this iteration. Gate requires zero MAJOR.**

Re-read from disk. Phase 4's four scenario harnesses and its routing prompt were not supplied to me,
so where this report reasons about them it says so; everything else is checked against the files.

The rework is a net improvement. Four of the five reported defects are genuinely fixed rather than
argued away, the greenfield clause and the unknown-candidate rule are both good additions the brief
supports, and MINOR-9 is closed with a better argument than the one I asked for. **The single MAJOR is
in the sentence the coordinator asked me not to take on trust, and it is not the escape hatch.**

## MAJOR-4 — §2's slot arithmetic is wrong by one, and the skill's own ADR proves it

Line 55: _"Five candidate sets, three slots — **G** and **C** cannot both hold the first, and **two of
the remaining three lose**."_

Count it. Five sets: G, C, U, P, A. Three slots. Total losers = 5 − 3 = **2**. The G-xor-C constraint
already supplies one of them. So **exactly one** of {U, P, A} can lose. The text says two of them do,
which leaves one winner from {G,C} plus one from {U,P,A} — **two characteristics for three slots.**

The mechanism of the error is visible: at four sets the previous wording, "one loses outright", was
correct. Adding **P** moved the total loser count from 1 to 2, and the new sentence attributes _both_
losers to the remaining three, when one of them was always the G/C loser.

**The skill's own worked example contradicts it.** ADR-021 (line 159) picks elasticity (**G**),
availability (**U**), deployability (**A**) — three table sets. Only C and P lose. That is one of the
remaining three losing, not two. A reader who applies the stated rule to the skill's own case gets a
different answer from the skill's own answer.

This is MAJOR rather than MINOR because it is the load-bearing sentence of the section — the one that
makes §2 a decision rather than a menu, and the one my iteration 1 finding was protecting. As written
the arithmetic does not force correctly; it over-forces and leaves a slot empty.

**Fix, one clause.** Either _"and of the five, two lose"_, or _"and exactly one of the remaining three
loses"_ — plus, if the escape hatch is to be honoured, _"fewer table slots if an off-table driver takes
one"_ (see the next section).

## The escape hatch — **it did not cost what you feared, and it is the right addition**

The hatch: _"The table settles which slots the **conflicting** characteristics take; a driver that
conflicts with nothing in it — interoperability, workflow, a regulatory obligation — takes a slot
without appearing here at all."_

Verified rather than taken on the author's word, by separating two different things the section was
doing at iteration 1.

- **The conflict-based forcing survives intact.** G xor C is a substantive claim about the world —
  you cannot hold both eventual-across-stores and atomic-across-stores — sourced to the saga table and
  carrying a named reversal test ("the moment a named person in the business can state a tolerable
  disagreement window"). **No off-table driver lets you have both.** The hatch opens a door into the
  slot count; it opens no door around the conflict. This is the more consequential half and it is
  untouched.
- **The counting-based forcing is now conditional, and the text states it unconditionally.** "Five
  sets, three slots" only closes if the five sets are the only claimants. With one off-table driver
  there are four slots' worth of claimants for two table slots; with two, for one. The arithmetic
  sentence asserts a closed system in the same paragraph that declares the system open.

**Verdict: §2 is not a menu with a side door. It is a genuine exclusion mechanism plus a priced
candidate set — but it is no longer the closed arithmetic I praised at iteration 1, and it still
claims to be one.** That is not a reason to remove the hatch. The hatch fixes a real defect that I
raised at iteration 1 in this report's own words ("a system driven by security, interoperability and
workflow appears nowhere in the table"), and removing it would restore a false universality. The fix
is to stop the arithmetic sentence over-claiming, which is the same one-clause edit MAJOR-4 needs.

So the section keeps the property that matters — something is eliminated by construction, and it is
the elimination with the largest design consequence — while losing the property that it determines the
whole list. The honest sentence is: the table settles one exclusion and prices five candidates; it does
not by itself fill three slots.

## 1. The C row against the pairs table — **the reported contradiction is fixed; a narrower one remains (MINOR-10)**

**Fixed, and genuinely, not by rewording.** The C cell now reads: _"atomic **across stores** — the only
set that buys it; atomicity inside one store is a transaction, not a characteristic, and is not on this
table."_ The pairs table says a saga threatens consistency, not integrity. These are now statements
about two different distinctions — integrity vs consistency, and single-store vs cross-store atomicity
— and neither denies the other. That is agreement, not overlap. The dimension heading moved with it
("Cross-store agreement"), and the set was renamed from "correctness across stores" to "agreement
across stores", which is the correct term for what the column measures.

**MINOR-10 (new).** Set C is still _"agreement across stores: data consistency, **data integrity**"_.
By the skill's own pairs table, data integrity is per-datum correctness and no loss — **not** a
cross-store agreement property. So C bundles a member the column heading does not describe, and prices
it with magnitudes the saga table attributes to consistency. A reader who wants integrity and reads
C's row inherits "very high coupling" and "low responsiveness" that the cited source charges to
consistency.

This is narrow and specific, not a general complaint about set structure: G's two members are both
load-driven, U's are both staying-up, P's are two clocks, A's are three change-speed primitives. **C
is the only set that pairs two things the skill explicitly teaches are different axes**, and the
skill's own pairs table is what catches it.

## 2. The delivery lines — **usable as written. PASS.**

Lines 173–177. Judged against the test "is this advice, or advice about advice":

- **A literal sentence to say**, not a description of one: _"Yes to three of these, no to the rest, and
  here is the one exclusion that changes the design."_ Executable verbatim, and it front-loads the
  answer a sign-off request actually asks for.
- **Three literal substitution strings**, each checkable against produced output: _one deployable's
  list_ for quantum, _too vague to measure, so measure its parts_ for composite, _decided against,
  written down_ for Others Considered. The composite rendering is the best of the three because it
  carries the reasoning rather than a synonym — it tells the listener why the word was refused.
- **A specific tactic for the hardest case**, with a constraint: _"If the list arrives already approved,
  do not reopen the format — name the single characteristic whose exclusion nobody has actually
  decided, and let that carry it."_ That is a concrete move (find the one undecided exclusion, lead
  with it) plus an explicit prohibition on the tempting wrong move.

Advice about advice would read "tailor the message to your audience". None of this does. **PASS.**

**NIT-6 (new).** The lay rendering of quantum — "one deployable's list" — drops the database, which is
the one part of the definition the body stresses ("the database is inside the quantum if the system
will not run without it"), and it is stressed because it is the part people get wrong. The register is
right for a sign-off audience; the omission is of the load-bearing half.

## 3. The size threshold — **observable, better than the figure it replaced; MINOR-11 on the middle case**

**The unit change is a clear improvement.** _"The unit is quantum count, not headcount: twenty-five
engineers on one deployable still do not need the ceremony, and six engineers across three quanta do."_
Quantum count is observable — count independently deployable artefacts plus the stores they cannot run
without, which the body already defines — where headcount was a proxy for it. This removes the last
unsourced number in the skill and replaces it with something a reader can count, and the two worked
figures make the direction unmistakable. Better than the marking I accepted at iterations 1 and 2.

**MINOR-11 (new) — the middle case waives the artefact the skill argues hardest for.** The new middle
bullet: _"one quantum, but someone outside the team wants a list: translate their concerns out loud,
name three, stop. **No ≤7 pass, no Others Considered, no worksheet.**"_

- Waiving the **≤7 pass** is harmless and reasoned: at this size there may be fewer than seven
  candidates, so the reduction step has nothing to reduce. No contradiction with "two caps, not one".
- Waiving **Others Considered** is a different matter. `eliciting-and-capping.md` §"Others Considered
  is an artefact, not a bin" argues for it on a _failure_ ground, not a cost ground: "an exclusion
  nobody recorded is indistinguishable, eighteen months later, from an oversight", grounded in
  HealthCare.gov, where the unrecorded capacity exclusion is the whole finding. **That failure mode
  does not get cheaper at one quantum**, and the artefact it needs is a line of names. The stated
  justification — that "the full ceremony at this size becomes the ritual the first bullet warns
  about" — is a cost argument aimed at a claim that was never about cost.

Not MAJOR: the exception is explicit, bounded, and attached to a situation (someone asked for a
sign-off, not for governance). But the skill should either keep the one-line list here or say why the
HealthCare.gov argument does not reach this size.

## 4. The unknown-candidate rule — **PASS, and a real gap closed**

Lines 101–103: a name the worksheet does not carry is admitted by the same three-part test, then
decomposed by asking what would be measured; if the answer is a list, it is a composite and its
primitives take the slot.

Checked against the brief's composite handling (§5): the worksheet carries exactly two composites with
decompositions; the governance consequence is "you cannot measure a composite directly, you measure its
primitives"; the authors' own diagnostic is "what is agility composed of?".

- **The rule is the authors' diagnostic turned into a test**, applied to a name outside their list.
  That is an application, not an extension of their claims — the worksheet's list is headed "Common
  Architecture Characteristics", so it does not assert completeness, and applying the three-part test
  to an uncommon name stays inside the authors' frame. **No provenance marking needed**, and its
  absence is not a finding.
- **The test works on its own examples.** Disaster recovery is measured by RPO and RTO — a list, so a
  composite, whose primitives are recoverability and continuity, both of which
  `definitions-and-composites.md` already separates and defines. Auditability decomposes the same way.
  The rule lands on vocabulary the package already carries rather than inventing any.
- It closes a gap the flat-list model creates and that Phase 4 would predictably hit: the worksheet
  enumerates, so a reader with a name not on it has nowhere to go.

## 5. MINOR-9 — **closed, and with a better argument than the finding asked for**

`eliciting-and-capping.md` now states the n=2 case explicitly ("in their Figure 3 engagement **two**
arrived together, performance and availability, not one") and says the rule "survives n=2 unchanged,
but only as a **re-run, not a swap**: with two new candidates you have five names and three slots, so
you go back to the trade-off table with all five in it rather than displacing twice in sequence."

Then the part I did not ask for and would not have written: _"Displacing one at a time gives a
different answer depending on the order you do it in, which is the sign you were not running the
comparison at all."_ That converts the re-run framing from an assertion into a reason — order-dependence
is a property a reader can check on their own case, and it explains why the one-at-a-time reading is
not merely narrower but wrong. **RESOLVED, above the bar the finding set.**

Worth noting for contrast: the arithmetic in this passage — three incumbents plus two arrivals is five
names for three slots — is correct. The arithmetic error of MAJOR-4 is confined to the body's §2.

## 6. Routing — 18 prompts, 15 clean, 3 borderline, 0 failures; **1 changed, plus MINOR-12**

New trigger: _"when two stakeholders both claim the top priority and will not rank"_.

**The seam against `architecture-trade-off-analysis` holds, and it holds on vocabulary rather than
luck.** ATOA's neighbouring trigger is "when two advocates each hold an internally consistent case and
there is no agreed basis for choosing". The two are separated by their _objects_: this skill's trigger
is stakeholders refusing to rank **priorities**, ATOA's is advocates holding cases for **options**. The
discriminating words are "top priority" and "rank" on one side, "case" and "choosing" on the other. No
prompt phrased about options matches this skill's wording, which is the direction a collision would
have to run.

Phase 4's routing prompt was not supplied, so it could not be re-run verbatim; N-16 and N-17 below
probe the seam it was presumably aimed at, from both sides.

| #        | Prompt                                                                                                                                                    | Should select                     | Iter 2     | Iter 3         | Change                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- | ---------- | -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P-1      | "Fourteen -ilities in the doc, every one marked driving."                                                                                                 | this skill                        | PASS       | PASS           | —                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| P-2      | "Top three is reliability, agility and performance. Usable?"                                                                                              | this skill                        | PASS       | PASS           | —                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| P-3      | "One quality-attribute list covering all eleven services."                                                                                                | this skill                        | PASS       | PASS           | — (wording moved to "an estate shares one list"; still matches)                                                                                                                                                                                                                                                                                                                                                                                                       |
| P-4      | "Spec says scalability, ops says elasticity. Same thing?"                                                                                                 | this skill                        | PASS       | PASS           | —                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| P-5      | "Top three is strongly consistent, highly available, low latency."                                                                                        | this skill                        | PASS       | PASS           | —                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| P-6      | "Compliance wants ISO 25010 as our driver list."                                                                                                          | this skill                        | PASS       | PASS           | —                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| P-7      | "Splitting the monolith into three services — three lists?"                                                                                               | this skill                        | BORDERLINE | BORDERLINE     | — (carried)                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| N-8      | "Report page must be fast. What acceptance criteria?"                                                                                                     | `requirements-and-acceptance`     | PASS       | PASS           | —                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| N-9      | "PM wrote 'the checkout service must be scalable'. What now?"                                                                                             | ADM / R&A                         | PASS       | PASS           | —                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| N-10     | "Availability is the driver. Kafka or RabbitMQ?"                                                                                                          | `architecture-trade-off-analysis` | PASS       | PASS           | —                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| N-11     | "99.9% availability settled — set up the alerting."                                                                                                       | `slo-and-alerting`                | PASS       | PASS           | —                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| N-12     | "We picked event-driven. Write the ADR."                                                                                                                  | ADM                               | PASS       | PASS           | —                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| N-13     | "Turn 'must be maintainable' into a testable scenario."                                                                                                   | ADM                               | PASS       | PASS           | —                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| P-14     | "Driving-characteristics section contains one line: 'must be scalable'."                                                                                  | this skill                        | PASS       | PASS           | —                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| N-15     | "Only stated NFR is 'must be scalable'; I need acceptance criteria."                                                                                      | R&A                               | BORDERLINE | BORDERLINE     | — (carried)                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| **P-16** | **new:** "Finance says data consistency is the top priority, Ops says availability. Neither will back down."                                              | this skill                        | —          | **PASS**       | new. Matches the new trigger near-verbatim _and_ the existing "strong consistency and high availability both hold a top-three slot" — two triggers, and §2's G/C/U conflict is literally the subject                                                                                                                                                                                                                                                                  |
| **N-17** | **new:** "Platform lead wants Kafka, app lead wants RabbitMQ, both arguments are coherent."                                                               | `architecture-trade-off-analysis` | —          | **PASS**       | new. The new trigger does not reach: these are advocates for _options_, and neither "top priority" nor "rank" appears. **No collision introduced**                                                                                                                                                                                                                                                                                                                    |
| **N-18** | **new:** "Nothing in the requirements mentions availability but the system obviously needs it — how do I get the unstated characteristics onto the list?" | this skill                        | —          | **BORDERLINE** | new, and this is MINOR-12. Iteration 2's description advertised "explicit versus implicit sourcing"; iteration 3 deleted that phrase to make room for the new trigger. The body still teaches it in full (§"Where the list comes from"), but no trigger now names it and only the generic covers clause ("Deriving … the architecture characteristics") reaches. ADM ("separating drivers from wishes") and R&A ("naming assumptions") are both plausible competitors |

**Count: 18 prompts. 15 clean, 3 borderline (P-7 and N-15 carried, N-18 new), 0 failures. One prompt
changed — N-18 is new and lands borderline; nothing that passed before regressed.**

**MINOR-12 (new).** "explicit versus implicit sourcing" was removed from the covers clause to fund the
new trigger. The trigger is worth having and the description is at 1008 characters, so something had to
give — but what gave is the only selection-time signal for a body section that survives in full, and
implicit sourcing is one of the three sources the skill's own §"Where the list comes from" is built on.
The cheaper cut is elsewhere: "composites that must be decomposed to be measured" duplicates the
"'reliability' or 'agility' is claimed as one characteristic" trigger four clauses later.

## 7. Regression — **two removals, one of them load-bearing (MINOR-13, NIT-7)**

Line counts: SKILL.md **199** (unchanged; 161 non-blank); `eliciting-and-capping.md` 188 → **193**
(+5, the n=2 passage); `definitions-and-composites.md` 146 and `taxonomy-and-iso.md` 170 unchanged.

**References — all three still routed by an explicit condition** (lines 197–199): "Read before running
the stakeholder session", "Read when two people use one of these words differently, or reliability or
agility is claimed as a single characteristic", "Read when someone cites 'the book's three categories'
or a quality model is offered as the driving list." Intact.

**Source attributions — all intact**, re-checked individually: _Fundamentals_ 1st ed. ch. 4 with the
four-note-sets caveat (25); worksheet March 2024 (30); _Hard Parts_ saga table (60); both quantum
definitions with "say which book you quote" (85–87); the worksheet's concurrency quote (94); Eckhardt
(96); ATAM 15-year (97); Ameller Table IV (146); ATAM "not refutable" (147); GAO-15-238 (148);
CMU/SEI-2000-TR-004 §5.3 (186); the Figure 3 quotes (193). Nothing lost.

**The caps — unchanged.** Worksheet verbatim block (51–53), "Two caps, not one", "(in any order)" in
both the quote and the Honest Standing argument, Others Considered, "try to drop one (or two)" (99).

**The taxonomy handling — unchanged** (28–31), including the Richards-not-Ford attribution and the
2nd-ed. unverified marking.

**The fitness-function block — NOT unchanged. MINOR-13 (new).** The threshold line lost seven words.

> Iteration 2: "…the scale-out interval is the window in which degradation is physics **— past it, it
> belongs to the design.**"
> Iteration 3: "…the scale-out interval is the window in which degradation is physics."

The deleted clause was the inference, not decoration: it said _why_ the scale-out interval is the right
boundary — past it, degradation is attributable to the design rather than to physics. Without it,
"the window in which degradation is physics" asserts the boundary and withholds the reason. This is
the sentence I singled out at iteration 2 as the best threshold reasoning in either skill, and the
"borrowed, not chosen" argument is weaker for its loss. MINOR, because the threshold is still
implementable, still borrowed, and still sends the reader to a measurement in their own system.

**NIT-7 (new).** ADR-021's elasticity justification changed from "the 90-day peak-to-median arrival
ratio is 41x over a 12-minute window, **flat year on year**" to "a 41x spike over 12 minutes at
on-sale, **not a rising trend**". The new form is better aligned with the new "Load shape" dimension
and "at on-sale" adds that the spike is scheduled — but "flat year on year" was the _evidence_ that it
is a spike and not a trend, and "not a rising trend" now asserts the conclusion without it.

Everything else in the block — characteristic, metric, tool pin, site, and the "a fitness function
whose site cannot produce its metric is decoration" principle — is byte-identical modulo re-wrapping.

**Additions that cost nothing and are worth naming:** the greenfield clause (line 61 — "for a system
that does not exist yet, every measurement below lives in the system being replaced; with no
predecessor the number is an assumption and the ADR records it as one") closes a hole every one of
these measurement-based dimensions had, and does it by routing to an existing discipline rather than
inventing a number.

## 8. The twelve items, re-run

| #   | Item                             | Iteration 3                                                                                                                                                                                                                                                                                                                                                                                                                             |
| --- | -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Technical accuracy               | **PASS** — new content checked: "scalability for a trend, elasticity for either spike" is correct against the worksheet's "unexpected **or anticipated** extreme loads"; the P row's "batching moves the two in opposite directions" matches the pairs table and the brief. No new unsourced claim.                                                                                                                                     |
| 2   | Terminology fidelity             | **PASS with MINOR-10** — all five pairs intact and unchanged; the C row's atomicity-scope conflation is fixed; set C's membership still pairs integrity with consistency under a consistency-only heading.                                                                                                                                                                                                                              |
| 3   | ISO 25010                        | **PASS** — re-grepped: still no ISO clause number anywhere; the only `§` is `CMU/SEI-2000-TR-004 §5.3`. Version named at the body's one ISO mention. Testability conflict still carried unresolved with the paywall disclosed.                                                                                                                                                                                                          |
| 4   | No unconditional recommendations | **PASS** — the five set bullets each still charge a cost and name a reversal, and P's is new and specific ("a latency budget spent here is not spent on the other three"). The middle-case bullet is directive but conditioned on a stated situation.                                                                                                                                                                                   |
| 5   | Trade-offs qualified             | **PASS** — dimension, direction, magnitude and settling measurement all survive the rebuild; two unusable dimension questions were replaced with answerable ones ("is demand a trend, a scheduled spike, or an unscheduled one?" is answerable from a traffic chart, where the old "90-day peak-to-median arrival ratio" presumed the reader had already computed it); "direction not tabulated" refusals retained on U and added on P. |
| 6   | Evangelism and evidence honesty  | **PASS** — unchanged.                                                                                                                                                                                                                                                                                                                                                                                                                   |
| 7   | Governance realism               | **PASS with MINOR-13** — chain still complete end to end and site still matches the metric's shape; the threshold lost its justifying inference.                                                                                                                                                                                                                                                                                        |
| 8   | Scale honesty                    | **PASS with MINOR-11** — the unit is now observable and the last unsourced number is gone; the middle case waives Others Considered on a cost argument that does not reach it.                                                                                                                                                                                                                                                          |
| 9   | Scope hygiene                    | **PASS** — the new trigger does not reach ATOA's deadlock territory (N-17); no collision introduced.                                                                                                                                                                                                                                                                                                                                    |
| 10  | Diagram accuracy                 | **PASS (vacuous)** — still none.                                                                                                                                                                                                                                                                                                                                                                                                        |
| 11  | Trigger quality                  | **PASS with MINOR-12** — 18 prompts, 15 clean, 3 borderline, 0 failures; one body capability lost its selection-time signal.                                                                                                                                                                                                                                                                                                            |
| 12  | Internal consistency             | **FAIL — MAJOR-4.** §2's stated arithmetic and ADR-021's worked list give different answers on the same example. Descriptions remain byte-identical (1008 chars).                                                                                                                                                                                                                                                                       |

## 9. New findings this iteration — 1 MAJOR, 4 MINOR, 2 NIT

- **MAJOR-4** — §2's slot arithmetic is wrong by one and contradicts ADR-021.
- **MINOR-10** — set C pairs data integrity with data consistency under a cross-store-agreement heading
  and prices both with consistency magnitudes; the skill's own pairs table denies the pairing.
- **MINOR-11** — the middle-size case waives Others Considered on a cost argument, when the skill's
  case for Others Considered is a failure argument that does not get cheaper at one quantum.
- **MINOR-12** — "explicit versus implicit sourcing" cut from the description to fund the new trigger,
  leaving a body section with no selection-time signal.
- **MINOR-13** — the threshold's justifying clause ("past it, it belongs to the design") was deleted,
  reducing the strongest threshold argument in the suite to an assertion.
- **NIT-6** — the lay rendering of quantum drops the database, the part of the definition the body
  stresses because readers get it wrong.
- **NIT-7** — ADR-021 lost "flat year on year", the evidence for its spike-not-trend claim.

**Nothing from iterations 1 or 2 reopened.** All three iteration-1 MAJORs, all eight iteration-1
MINORs and MINOR-9 remain closed.

---

## Residual list across all three iterations

Shipping-blocked at present by MAJOR-4. The table records what would ship on a fix, including Phase 4
dispositions as reported to me.

| Item                                                                      | Origin           | Severity      | Disposition / reason for shipping                                                                                                                                                             |
| ------------------------------------------------------------------------- | ---------------- | ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **MAJOR-4** — §2 arithmetic wrong by one, contradicts ADR-021             | Iter 3           | MAJOR         | **Blocks.** One clause.                                                                                                                                                                       |
| **MINOR-10** — set C pairs integrity with consistency                     | Iter 3           | MINOR         | Would ship: the column heading and the atomicity-scope fix are both correct, and the pairs table two sections later gives a reader the means to catch it. Costs a parenthesis to fix.         |
| **MINOR-11** — middle case waives Others Considered                       | Iter 3           | MINOR         | Would ship: the exception is explicit and bounded to a sign-off request rather than silent, and the ≤7 half of the waiver is sound.                                                           |
| **MINOR-12** — implicit sourcing lost its selection signal                | Iter 3           | MINOR         | Would ship: the body section survives in full and the covers clause still reaches; the description is at 1008 chars and the new trigger earns its place.                                      |
| **MINOR-13** — threshold's justifying clause deleted                      | Iter 3           | MINOR         | Would ship: the threshold is still implementable, still borrowed, and still sends the reader to their own measurement.                                                                        |
| **NIT-6** — lay rendering of quantum drops the database                   | Iter 3           | NIT           | Would ship: correct register for the audience; the full definition is two sections above.                                                                                                     |
| **NIT-7** — ADR lost "flat year on year"                                  | Iter 3           | NIT           | Would ship: the replacement is better aligned to the new dimension and "at on-sale" carries that the spike is scheduled.                                                                      |
| **MINOR-9** — fourth-characteristic section framed n=1                    | Iter 2           | —             | **CLOSED at iteration 3**, above the bar the finding set.                                                                                                                                     |
| **NIT-5** — Eckhardt figures use ISO 9126 class names without naming 9126 | Iter 2           | NIT           | Ships. Numbers, populations and source correct and agreeing with the reference; only the model label is implicit.                                                                             |
| **NIT-3** — dangling `FF-11` label                                        | Iter 1, declined | NIT           | Ships. Referent unambiguous ("(above)", same line); skill 1 has the identical `FF-07` shape. Suite-wide or not at all.                                                                        |
| **NIT-4** — scalability axis names one invariant                          | Iter 1, declined | NIT           | Ships. The cell is an axis, not a definition; all three invariants are in the routed reference.                                                                                               |
| **P-7** — "splitting the monolith, three lists?"                          | Iter 1           | not a finding | Routes correctly; borderline only. No description room.                                                                                                                                       |
| **N-15** — "only stated NFR" + acceptance criteria                        | Iter 2           | not a finding | Borderline by construction; the verb should win for R&A.                                                                                                                                      |
| **N-18** — unstated characteristics                                       | Iter 3           | not a finding | Borderline; the observation is recorded as MINOR-12.                                                                                                                                          |
| **Phase 4: four scenario runs**                                           | Phase 4          | —             | Reported to me as performing well on all four. Not independently verified — the transcripts were not supplied.                                                                                |
| **Phase 4: §2 table hit by three of four harnesses**                      | Phase 4          | —             | Addressed by the rebuild: P added, C row de-conflated, two dimension questions replaced, escape hatch added. Four of five defects verified fixed here; the fifth (the arithmetic) is MAJOR-4. |
| **Phase 4: pairs table used against the C row**                           | Phase 4          | —             | The reported contradiction is fixed (item 1 above). The narrower residual is MINOR-10.                                                                                                        |

---

## Mechanical output — iteration 3

```
$ node packages/cli/bin/agent-skills.mjs validate skills/architecture-characteristics
architecture-characteristics@1.0.0

  C:\git\agent-skills\skills\architecture-characteristics
  5 files

✓ Valid — no issues found

EXIT=0
```

```
$ npx prettier --check "skills/architecture-characteristics/**/*.{md,yaml}"
Checking formatting...
All matched files use Prettier code style!
EXIT=0
```

```
$ wc -l skills/architecture-characteristics/SKILL.md skills/architecture-characteristics/references/*
  199 skills/architecture-characteristics/SKILL.md
  146 skills/architecture-characteristics/references/definitions-and-composites.md
  193 skills/architecture-characteristics/references/eliciting-and-capping.md
  170 skills/architecture-characteristics/references/taxonomy-and-iso.md
  708 total
```

Description check after the trigger addition (frontmatter vs manifest):

```
SKILL 1008 | yaml 1008 | identical true
```

ISO clause-number re-grep — one hit, the SEI technical report, not ISO:

```
$ grep -rnE "§|clause [0-9]" skills/architecture-characteristics/
SKILL.md:186: ... (CMU/SEI-2000-TR-004 §5.3, 2000) ...
```

`registry:build` and `verify` deliberately not run — seven unrelated `gof-*` packages lack `skill.yaml`
and both abort. Not in scope for this skill.

---

---

# ITERATION 4 — FAIL

**0 BLOCKER, 1 MAJOR, 2 MINOR, 1 NIT. MAJOR-4 is correctly fixed; the sweep it prompted found a third
cardinality error that predates all four iterations and that I missed three times.**

Re-read from disk. Every count below was re-derived from the artefact it describes rather than checked
against the author's statement — which is the whole lesson of this iteration and is written up as a
standing check at the end.

## 1. The arithmetic — verified independently, both wordings, against ADR-021

**Body §2, lines 55–56:** _"Five candidate sets, three slots, so two lose in total — **G** and **C**
cannot both hold the first, which accounts for one, and exactly one of the remaining three loses too."_

Derived from scratch, not read for plausibility:

| Step                 | Derivation                                                | Check                                        |
| -------------------- | --------------------------------------------------------- | -------------------------------------------- |
| Total losers         | 5 sets − 3 slots = **2**                                  | matches "two lose in total"                  |
| G-xor-C              | exactly one of {G, C} is excluded                         | accounts for **1**                           |
| Remaining pool       | winner of {G,C} + U + P + A = **4** claimants for 3 slots | **1** more must lose                         |
| Source of that loser | must come from {U, P, A}                                  | matches "exactly one of the remaining three" |
| Sum                  | 1 + 1 = 2                                                 | **closes**                                   |

**ADR-021 checked against the rule, not asserted to agree.** The worked list is elasticity (**G**),
availability (**U**), deployability (**A**). Losers: **C** (excluded by G-xor-C — and the Decision
block independently records why: "Data consistency is excluded deliberately — Finance named 15 minutes
as a tolerable window") and **P** (the one loser from {U, P, A}). Two losers, one from each source.
**The rule and the worked example now produce the same answer.** Iteration 3's contradiction is gone.

**Second wording, `eliciting-and-capping.md`:** "drop whichever set now loses outright" →
_"drop whichever candidate it now places last"_ (line 168). Verified. This matters more than a word
swap: "loses outright" was four-set vocabulary in which one candidate is eliminated by construction,
and it survived into a passage about a five-candidate re-run where nothing is eliminated by
construction. "Places last" asks for a single boundary distinction — which one candidate falls out —
rather than a ranking, so it stays compatible with "(in any order)". Correct fix.

Line 157's arithmetic in the same passage — "with two new candidates you have five names and three
slots" — re-derived: 3 incumbents + 2 arrivals = 5. Correct.

**MINOR-15 (new, and the unactioned half of an iteration-3 note).** The count is now internally right,
but it is stated as necessity when it is contingent on two unstated preconditions:

- **that one of G or C is driving at all.** A quantum with no cross-store agreement concern and no
  growth concern loses _both_, and then none of {U, P, A} loses. The sentence does not describe that
  reader's case.
- **that no off-table driver takes a slot.** The escape hatch two sentences later permits exactly
  that, at which point three slots are contested by more than the five sets.

At iteration 3 I wrote the fix as the count correction "plus, if the escape hatch is to be honoured,
'fewer table slots if an off-table driver takes one'." The count half was taken; the caveat half was
not. MINOR, not MAJOR: §2 still forces the exclusion that matters, and the reader who hits either
precondition gets a sentence that does not fit rather than a wrong answer.

## 2. The sweep — **MAJOR-5, a third occurrence, in the translation table's own commentary**

I swept the package for every cardinality claim, not only for four-set vocabulary: two regexes across
all five files, one for counting words next to "set / slot / candidate / name / characteristic", one
for the four-set idiom. Eleven claims surfaced. Ten re-derive correctly, including
`SKILL.md:134`'s "Two of the three are borrowed" (three numbers in the threshold: the SLO figure and
the scale-out interval are borrowed, the 2x is chosen — 2 of 3, correct).

The eleventh does not.

**`eliciting-and-capping.md:33`:** _"Note also that agility, testability and deployability appear in
**four of the five rows**."_

Counted from the table three lines above it, in the same file:

| Row                                                                                                           | Contains agility, testability, deployability? |
| ------------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| Mergers and acquisitions — interoperability, scalability, adaptability, extensibility                         | **no — none of the three**                    |
| Time to market — agility, testability, deployability                                                          | yes                                           |
| User satisfaction — performance, availability, fault tolerance, testability, deployability, agility, security | yes                                           |
| Competitive advantage — agility, testability, deployability, scalability, availability, fault tolerance       | yes                                           |
| Time and budget — simplicity, feasibility                                                                     | **no — none of the three**                    |

**Three of five, not four.** The table matches the research brief exactly, so the table is right and
the sentence counting it is wrong.

**Severity: MAJOR, and I want the reasoning on the record because it is a close call.**

- _For MAJOR:_ it is factually wrong against an artefact reproduced three lines above it — the most
  checkable kind of claim a skill can make. At iteration 1 I graded the Ameller miscount MAJOR on
  exactly this ground ("a wrong number attributed to a named table"), and grading this one MINOR
  because the table happens to be the skill's own would be an inconsistency I could not defend —
  least of all in the iteration whose subject is cardinality errors.
- _Against MAJOR:_ the sentence's conclusion is unaffected. Agility, testability and deployability are
  over-represented because agility decomposes into precisely those three, and that holds at 3-of-5 as
  it does at 4-of-5. Nothing downstream depends on the number.
- I have graded it MAJOR on the first ground. The fix is one word.

**The important part is its provenance, which is not what the coordinator expected.** This is **not** an
echo of the four-set→five-set change: the translation table and its commentary have been untouched
since iteration 1. It is an independent, pre-existing miscount that survived the author's writing, the
author's own sweep this iteration, and **three of my reviews** — iterations 1, 2 and 3 all read that
sentence and none counted the table under it. That has a direct consequence for the standing check,
below.

## 3. Set C's split — **the right fix, and better than the explanation it replaced. MINOR-14 on the route out.**

Set C is now _"**C — agreement across stores**: data consistency"_ — one member — with the row
carrying the reason integrity left: _"Atomicity inside one store is a transaction, not a
characteristic; data integrity is the other axis of that pair — per-datum correctness, which a saga
does not threaten — so neither is priced here."_

**Splitting beats explaining, and this is worth naming as a pattern.** Iteration 3's MINOR-10 was that
C priced two members with magnitudes the saga table charges to only one. An explanation would have
left the mispricing in place and asked the reader to discount it. Removing the member fixes it at the
root: the row's magnitudes are consistency magnitudes and the set now contains consistency alone.

**Does the five-set arithmetic still hold with C at one member?** Yes — the arithmetic counts _sets_,
not members, and the sets are still five. Membership size was never load-bearing: A has three members,
C now has one, and the G-xor-C constraint is a claim about what C _is_ (atomic across stores), not
about how many names it carries. Verified rather than assumed.

**Do the magnitudes still price what remains?** Yes, and more exactly than before. Every C cell is
sourced to a saga-table row (Epic, with orchestrated named as the cheaper atomic option), and the saga
table's consistency column is exactly what a one-member consistency set should be priced by. The
iteration-3 defect — integrity inheriting "very high coupling" from a source that never charged it —
is gone.

**Does routing integrity through the escape hatch weaken the hatch's boundary?** No, and this is the
strongest thing about the change. The hatch admits "a driver that conflicts with nothing in it". The
skill's own reasoning establishes that integrity qualifies on the merits — a saga does not threaten
it, so it does not trade against consistency, availability or latency in any tabulated way. The hatch
is being _applied_ by its stated criterion rather than used as a catch-all, which is evidence the
criterion does real work. And the row is careful in the right direction: it says integrity is "not
priced here", which is an honest statement about the table's coverage, not a claim that integrity is
free.

**MINOR-14 (new).** The route is implied, never stated. The hatch's example list still reads
"interoperability, workflow, a regulatory obligation" — data integrity is not in it — and C's row says
only where integrity _is not_ priced, not where it goes. A reader who needs data integrity is left one
inference short, and it is the inference the split created. Two words in the hatch's example list
close it.

## 4. MINOR-12's swap — **the dropped clause was redundant as claimed; no new collision; NIT-8 on the residue**

Description now 992 characters, byte-identical across frontmatter and manifest. Verified
programmatically: `explicit versus implicit sourcing` present, `composites that must be decomposed`
absent.

**Was the dropped clause genuinely redundant?** Mostly, and the exception is mine to own. For the two
composites the worksheet actually carries, yes — the trigger "when 'reliability' or 'agility' is
claimed as one characteristic" names both by name, which is a stronger selection signal than the
generic covers-clause phrase it replaced. The gap is names the worksheet does _not_ carry, which is
precisely the case iteration 3's new unknown-candidate rule was added to handle. When I recommended
this swap at iteration 3 I under-weighted a rule that had been added in the same iteration.

**Did restoring the sourcing clause create a collision?** No. It sits in the covers clause, not the
trigger list, so it advertises a capability rather than claiming a situation, and it is scoped by
"the architecture characteristics a system is built for" — it does not reach
`requirements-and-acceptance`'s "naming assumptions where they can be contradicted", which is about
assumptions in general. Probed as N-19 below.

### Routing — 20 prompts, 17 clean, 3 borderline, 0 failures; one improvement, one new borderline

Only changed and new rows shown; P-1 to P-7, N-8 to N-15, P-16 and N-17 all re-checked and unchanged
from iteration 3.

| #        | Prompt                                                                                                                                           | Should select                 | Iter 3     | Iter 4         | Change                                                                                                                                                                                                                 |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------- | ---------- | -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **N-18** | "Nothing in the requirements mentions availability but the system obviously needs it — how do I get the unstated characteristics onto the list?" | this skill                    | BORDERLINE | **PASS**       | **CHANGED, improved.** "explicit versus implicit sourcing" is restored and matches directly. MINOR-12 closed                                                                                                           |
| **N-19** | **new:** "Our design has assumptions nobody wrote down — how do I surface them?"                                                                 | `requirements-and-acceptance` | —          | **PASS**       | new. The restored clause is scoped to characteristics; R&A owns assumptions generally. No collision                                                                                                                    |
| **P-20** | **new:** "Someone put 'auditability' in our top three and nobody can measure it."                                                                | this skill                    | —          | **BORDERLINE** | new, and this is NIT-8. The unknown-candidate rule handles it in the body, but no trigger names an unknown composite; ADM's "turning quality attributes into observable scenarios" competes on "nobody can measure it" |

**Count: 20 prompts. 17 clean, 3 borderline (P-7 and N-15 carried, P-20 new), 0 failures.**

**NIT-8 (new).** After the swap, a composite that is not reliability or agility has no selection-time
signal. The description is at 992 characters, down from 1008, so there is room to restore a short
form — "composites decomposed to their primitives" — without displacing anything.

## 5. Regression — **verified against the files, not the accounting; the stated mechanism is wrong and the stated outcome is right**

Line counts: SKILL.md 199 → **198**; `eliciting-and-capping.md` **193** unchanged;
`definitions-and-composites.md` **146** and `taxonomy-and-iso.md` **170** unchanged.

**The threshold clause is restored.** Line 136 now reads "…the scale-out interval is the window in
which degradation is physics **— past it, it belongs to the design.**" MINOR-13 closed. This restores
the inference I called the best threshold reasoning in the suite.

**The stated payment is not what happened, and I checked rather than accepted it.** The claim was that
the clause was funded by reflowing the ADR Decision block "from five lines to four". The Decision block
was **already four lines at iteration 3** (lines 159–162 of that revision) and is four lines now. So
the line did not come from there. What did change in the Decision block is a net _gain_:

> Iteration 3: "…a 41x spike over 12 minutes at on-sale, not a rising trend… and that sentence makes
> it an exclusion, not an oversight."
> Iteration 4: "…a 41x spike over 12 minutes at on-sale, **flat year on year**, not a rising
> trend… **making it** an exclusion, not an oversight."

"flat year on year" is restored (NIT-7 closed) and "and that sentence" contracts to "making it" — the
demonstrative pointer to Finance's utterance-as-artefact is slightly weaker, but the utterance itself
is still named in the preceding sentence, so nothing is lost that a reader needs. **No content lost:
confirmed by comparison, not by accounting.** The −1 line comes from set C's membership contraction in
§2, not from the ADR.

**The six declared-untouched items, each verified rather than accepted.** Two of the six were in fact
touched, both correctly:

| Item                   | Verified state                                                                                                                                                                                                                                                                                                                                                                            |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Caps                   | **Untouched.** All four worksheet elements present (grep count 4): "Identify no more than 7", "Pick the top 3 … (in any order)", "to the Others Considered list", "try to drop one (or two)". "Two caps, not one" intact                                                                                                                                                                  |
| Taxonomy handling      | **Untouched.** Lines 28–31 byte-identical: Richards-not-Ford attribution, March 2024 worksheet, "Whether the 2nd ed. follows the worksheet is **unverified**"                                                                                                                                                                                                                             |
| Delivery lines         | **Touched — correctly.** The quantum rendering is now "_one deployable and the store it cannot run without_", which is the NIT-6 fix. The literal sign-off sentence, the other two renderings and the already-approved tactic are unchanged                                                                                                                                               |
| Size threshold         | **Touched — correctly.** The first bullet is unchanged (quantum count, both worked figures). The middle bullet is the MINOR-11 fix and now reads "Skip the ≤7 pass and the worksheet — **but not Others Considered, which is one line and is what stops an exclusion reading as an oversight in eighteen months**" — the failure argument, not the cost one, exactly as the finding asked |
| Unknown-candidate rule | **Untouched.** Lines 101–103 byte-identical                                                                                                                                                                                                                                                                                                                                               |
| Escape hatch           | **Untouched.** Line 61 byte-identical — which is also why MINOR-14 stands: integrity was routed to a list that was not extended to name it                                                                                                                                                                                                                                                |

**Source attributions — all intact**, re-counted by grep across the body: the four-note-sets caveat,
March 2024 worksheet, _Hard Parts_, Eckhardt, ATAM 15-year, Ameller Table IV, GAO-15-238,
CMU/SEI-2000-TR-004 §5.3, the ATAM and Figure 3 quotes. No ISO clause number anywhere; the sole `§` in
the package remains the SEI report's.

## 6. The twelve items, re-run

| #   | Item                             | Iteration 4                                                                                                                                                                               |
| --- | -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Technical accuracy               | **FAIL — MAJOR-5.** "Four of the five rows" is three of five. Every other claim re-derived clean.                                                                                         |
| 2   | Terminology fidelity             | **PASS, improved.** The C split removes the last conflation; the five pairs are intact and the row now states the integrity/consistency axis explicitly where a reader meets the mistake. |
| 3   | ISO 25010                        | **PASS.** No clause numbers; version named at the body's ISO mention; the testability conflict still carried unresolved with the paywall disclosed.                                       |
| 4   | No unconditional recommendations | **PASS.** Five set bullets, each with a cost and a reversal.                                                                                                                              |
| 5   | Trade-offs qualified             | **PASS, improved.** C's magnitudes now price exactly one member, all sourced to named saga rows.                                                                                          |
| 6   | Evangelism and evidence honesty  | **PASS.** Unchanged.                                                                                                                                                                      |
| 7   | Governance realism               | **PASS.** The justifying inference is restored; the chain is complete and the site still matches the metric's shape.                                                                      |
| 8   | Scale honesty                    | **PASS, improved.** Quantum count observable; the middle case now keeps the artefact on the argument that actually supports it.                                                           |
| 9   | Scope hygiene                    | **PASS.** No collision from the restored sourcing clause.                                                                                                                                 |
| 10  | Diagram accuracy                 | **PASS (vacuous).**                                                                                                                                                                       |
| 11  | Trigger quality                  | **PASS with NIT-8.** 20 prompts, 17 clean, 3 borderline, 0 failures.                                                                                                                      |
| 12  | Internal consistency             | **FAIL — MAJOR-5.** A sentence contradicts the table three lines above it. Descriptions byte-identical at 992.                                                                            |

## 7. New findings this iteration

- **MAJOR-5** — "agility, testability and deployability appear in four of the five rows" is three of
  five, against the table immediately above it. Pre-existing since iteration 1.
- **MINOR-14** — data integrity's route through the escape hatch is implied, never stated; the hatch's
  example list was not extended when the split sent integrity to it.
- **MINOR-15** — §2's count is stated as necessity but is contingent on one of G/C being driving and
  on no off-table driver taking a slot. The unactioned half of an iteration-3 fix note.
- **NIT-8** — after the MINOR-12 swap I recommended, an unknown composite has no selection signal;
  the description has 16 characters of headroom to restore one.

**Closed this iteration:** MAJOR-4, MINOR-10, MINOR-11, MINOR-12, MINOR-13, NIT-6, NIT-7. Nothing from
iterations 1–3 reopened.

---

## The cardinality lesson — for the nineteen skills still to be built

**Stated plainly, as requested, and then corrected on one point.**

MAJOR-4 was a **cardinality error introduced by a fix that was itself correct.** Adding set **P** to
§2's table was the right response to a Phase 4 finding — a harness had to allocate performance by hand
because no set held it. But adding a fifth set moved the total loser count from one to two, and the
sentence describing the arithmetic was updated in a way that read fluently and did not balance: it
attributed both losers to the remaining three, when one of them had always been the G/C loser. The
result claimed five sets and three slots while filling only two.

**It survived the author's handback and my iteration-3 approval-in-principle because the sentence read
fluently.** "Two of the remaining three lose" has the cadence of a derivation. Nothing about it
signals that it needs checking, and everyone in the loop — author, coordinator, validator — read it as
prose rather than as arithmetic.

**What caught it was checking the rule against the skill's own worked example.** ADR-021 picks three
characteristics from the table; running the stated rule over that example yields two. The contradiction
is immediate, mechanical, and requires no domain judgement at all — only the willingness to apply the
rule to the case sitting eighty lines below it.

**The correction, and it matters for how the standing check is scoped.** "Re-run the worked example
against the rewritten rule whenever a fix changes the count of anything" would **not** have caught
MAJOR-5. That error changed nothing and was introduced by no fix: it has been in
`eliciting-and-capping.md` since the skill was written, and it survived three of my reviews because I
read the sentence and never counted the table under it. A check scoped to _fixes_ audits only the
places someone has recently touched, which are the places already receiving attention.

The check that catches both is scoped to _claims_, not to edits:

> **Any sentence that counts anything is re-derived from the artefact it counts — the table, the list,
> the worked example — on first review and after any edit near it. A count is never read for
> plausibility.**

Cheap to run: this iteration's sweep was two regexes over five files and surfaced eleven cardinality
claims, of which ten re-derived clean in a few minutes and one did not. Worth running on every skill in
the suite, and worth running once retrospectively over the skills already shipped — skill 1 included,
since nothing about this failure mode is particular to skill 2.

---

## Mechanical output — iteration 4

```
$ node packages/cli/bin/agent-skills.mjs validate skills/architecture-characteristics
architecture-characteristics@1.0.0

  C:\git\agent-skills\skills\architecture-characteristics
  5 files

✓ Valid — no issues found

EXIT=0
```

```
$ npx prettier --check "skills/architecture-characteristics/**/*.{md,yaml}"
Checking formatting...
All matched files use Prettier code style!
EXIT=0
```

```
$ wc -l skills/architecture-characteristics/SKILL.md skills/architecture-characteristics/references/*
  198 skills/architecture-characteristics/SKILL.md
  146 skills/architecture-characteristics/references/definitions-and-composites.md
  193 skills/architecture-characteristics/references/eliciting-and-capping.md
  170 skills/architecture-characteristics/references/taxonomy-and-iso.md
  707 total
```

Description check (frontmatter vs manifest), and the MINOR-12 swap verified programmatically:

```
SKILL 992 | yaml 992 | identical true
has sourcing: true | has composites clause: false
```

ISO clause-number re-grep — one hit, the SEI technical report, not ISO:

```
$ grep -rnE "§|clause [0-9]" skills/architecture-characteristics/
SKILL.md:185: ... (CMU/SEI-2000-TR-004 §5.3, 2000) ...
```

`registry:build` and `verify` deliberately not run — seven unrelated `gof-*` packages lack `skill.yaml`
and both abort. Not in scope for this skill.

---

## Residual list across all four iterations, plus Phase 4

Blocked at present by MAJOR-5. This table is the permanent record for the package; on a fix it is what
ships.

| Item                                                                           | Origin           | Severity      | Disposition / reason for shipping                                                                                                                                            |
| ------------------------------------------------------------------------------ | ---------------- | ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **MAJOR-5** — "four of the five rows" is three of five                         | Iter 4           | MAJOR         | **Blocks.** One word. Conclusion unaffected; the count is wrong against a table in the same file.                                                                            |
| **MINOR-14** — integrity's escape-hatch route implied, not stated              | Iter 4           | MINOR         | Would ship: integrity genuinely qualifies under the hatch's stated criterion, and C's row points at the pairs table. Two words to close.                                     |
| **MINOR-15** — §2's count stated as necessity, contingent on two preconditions | Iter 4           | MINOR         | Would ship: the count is internally correct and matches the worked example; a reader hitting either precondition gets a sentence that does not fit, not a wrong answer.      |
| **NIT-8** — unknown composites have no selection signal                        | Iter 4           | NIT           | Would ship: the body's unknown-candidate rule handles the case once selected, and the covers clause reaches. 16 characters of headroom exist to fix it.                      |
| **NIT-5** — Eckhardt figures use ISO 9126 class names without naming 9126      | Iter 2           | NIT           | Ships. Numbers, populations and source correct and agreeing with the reference.                                                                                              |
| **NIT-3** — dangling `FF-11` label                                             | Iter 1, declined | NIT           | Ships. Referent unambiguous; skill 1 has the identical `FF-07` shape. Suite-wide or not at all.                                                                              |
| **NIT-4** — scalability axis names one invariant                               | Iter 1, declined | NIT           | Ships. The cell is an axis, not a definition; all three invariants are in the routed reference.                                                                              |
| **P-7** — "splitting the monolith, three lists?"                               | Iter 1           | not a finding | Routes correctly; borderline only.                                                                                                                                           |
| **N-15** — "only stated NFR" + acceptance criteria                             | Iter 2           | not a finding | Borderline by construction; the verb should win for R&A.                                                                                                                     |
| **P-20** — "auditability in our top three, nobody can measure it"              | Iter 4           | not a finding | Borderline; recorded as NIT-8.                                                                                                                                               |
| MAJOR-1 — trigger collided with ADM and R&A                                    | Iter 1           | —             | **CLOSED iter 2.** List-shaped trigger changed the object from requirement to list.                                                                                          |
| MAJOR-2 — §2 construction unmarked                                             | Iter 1           | —             | **CLOSED iter 2.** Marks sets, dimensions and arithmetic, before the table.                                                                                                  |
| MAJOR-3 — Ameller and Eckhardt misattributed                                   | Iter 1           | —             | **CLOSED iter 2.** Both re-derived from the brief; body and reference agree.                                                                                                 |
| MINOR-1 … MINOR-8                                                              | Iter 1           | —             | **CLOSED iter 2.** All eight.                                                                                                                                                |
| MINOR-9 — fourth-characteristic section framed n=1                             | Iter 2           | —             | **CLOSED iter 3**, above the bar the finding set.                                                                                                                            |
| MAJOR-4 — §2 arithmetic wrong by one                                           | Iter 3           | —             | **CLOSED iter 4.** Verified by re-derivation and against ADR-021.                                                                                                            |
| MINOR-10 — set C paired integrity with consistency                             | Iter 3           | —             | **CLOSED iter 4** by splitting rather than explaining.                                                                                                                       |
| MINOR-11 — middle case waived Others Considered                                | Iter 3           | —             | **CLOSED iter 4** on the failure argument.                                                                                                                                   |
| MINOR-12 — implicit sourcing lost its signal                                   | Iter 3           | —             | **CLOSED iter 4.** Residue is NIT-8.                                                                                                                                         |
| MINOR-13 — threshold's justifying clause deleted                               | Iter 3           | —             | **CLOSED iter 4.** Restored verbatim.                                                                                                                                        |
| NIT-6, NIT-7                                                                   | Iter 3           | —             | **CLOSED iter 4.**                                                                                                                                                           |
| **Phase 4: four scenario runs**                                                | Phase 4          | —             | Reported as performing well on all four. Not independently verified — transcripts not supplied.                                                                              |
| **Phase 4: §2 table hit by three of four harnesses**                           | Phase 4          | —             | Addressed across iterations 3–4: P added, C split, two dimension questions replaced, escape hatch added, arithmetic corrected. All five reported defects now verified fixed. |
| **Phase 4: pairs table used against the C row**                                | Phase 4          | —             | Closed at iteration 4 by splitting C.                                                                                                                                        |

---

---

# ITERATION 5 — PASS

**0 BLOCKER, 0 MAJOR, 0 MINOR, 0 NIT new. All three count errors verified corrected by re-derivation;
a targeted spot-check of the declared-clean set found no failure. This section is the permanent record.**

Re-read from disk. Every number below was re-derived from the artefact it describes. Nothing was
accepted on the author's statement, including the statements that were correct.

## 1. The three corrections — re-derived independently

**Correction 1 — `eliciting-and-capping.md:33`, MAJOR-5.** Now "appear in **three** of the five rows".
Re-derived from the table three lines above it: Mergers and acquisitions (interoperability,
scalability, adaptability, extensibility) contains none of the three; Time to market, User satisfaction
and Competitive advantage each contain all three; Time and budget (simplicity, feasibility) contains
none. **Three of five. Correct.**

The conclusion was kept at full strength rather than trimmed to fit the smaller number: "That is a
symptom of the composite problem, not a finding: agility decomposes into exactly those, so any row
containing it contains them." That is the right call — the claim was never about how many rows, it was
about why the three travel together, and that holds identically at 3-of-5. Softening it to match a
smaller count would have been the worse repair.

**Correction 2 — `definitions-and-composites.md:108`, eight → seven.** Re-derived against the composites
table as it now stands, not against the arithmetic as stated:

| Component                                                                                                                                 | Count |
| ----------------------------------------------------------------------------------------------------------------------------------------- | ----- |
| Reliability's primitives, from the file's own Composite box: availability, testability, data integrity, data consistency, fault tolerance | **5** |
| The other two slots in the top three                                                                                                      | **2** |
| Total once reliability is decomposed                                                                                                      | **7** |

**Seven is correct.** The decomposition matches the research brief's transcription of the worksheet's
Composite box exactly (five members). The error mechanism in "eight" is visible and worth recording:
5 primitives + 3 slots = 8 **double-counts the slot reliability was occupying**. It is the same shape
of mistake as MAJOR-4 — a quantity added to a total that already contained it.

**Correction 3 — `SKILL.md:99`, "top two" → "top three".** Re-derived by classifying all five rows of
the Push-on column:

| Row | Content                                                              | Kind                                       |
| --- | -------------------------------------------------------------------- | ------------------------------------------ |
| 1   | "Test 2 bites: you can point at the structural consequence"          | test                                       |
| 2   | "A domain concern translates to it with the stakeholder in the room" | test                                       |
| 3   | "It is implicit _and critical_ — … become slots only on that test"   | **test** — and it says so in its own words |
| 4   | Eckhardt distribution                                                | base rate                                  |
| 5   | ATAM 15-year data                                                    | base rate                                  |

Three tests, two base rates. "The last two left-hand rows are population base rates … only the top
three decide" is **correct**, and "the last two" correctly identifies rows 4 and 5. Row 3 was genuinely
orphaned by the old sentence — it was being classified as a base rate by omission while its own text
calls itself a test. This was the most consequential of the three: it silently withdrew a decision rule
the reader is meant to apply.

## 2. Spot-check of the 58 declared clean — **no failure found**

Not a re-verification of all 58. I selected on three criteria and say which and why, so the coverage of
this check is auditable rather than reassuring.

- **(a) Recently edited** — claims inside passages rewritten during iterations 3–5, where drift is
  most likely.
- **(b) A count of a table in the same file** — the exact failure mode of MAJOR-5, and the one that
  survived four iterations because reading substitutes for counting.
- **(c) Counts where an error is an honesty defect, not arithmetic** — provenance counts and figures
  attributed to cited primary tables, where being wrong misrepresents the evidence base.

| #   | Claim                                                                                                                                                            | Why chosen                                                                                  | Re-derived                                                                                                                                                         | Result                                 |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------- |
| 1   | §2: "two of the five lose", with the new modality                                                                                                                | (a) — edited in three consecutive iterations; load-bearing                                  | 5 − 3 = 2; G-xor-C accounts for 1; 4 claimants for 3 slots leaves 1 from {U,P,A}; 1 + 1 = 2                                                                        | **clean**                              |
| 2   | `taxonomy-and-iso`: ISO 2023 "nine"                                                                                                                              | (b) — counts a table 20 lines below it                                                      | Table has rows 1–9; Safety is row 9, matching "added as a ninth"                                                                                                   | **clean**                              |
| 3   | ISO 2011 "eight product-quality characteristics"                                                                                                                 | (b)                                                                                         | Enumerated in the same sentence: Functional Suitability, Performance Efficiency, Compatibility, Usability, Reliability, Security, Maintainability, Portability = 8 | **clean**                              |
| 4   | "Security (top-level, **six** subs)"                                                                                                                             | (b) — a sub-count one table-hop from its source                                             | confidentiality, integrity, non-repudiation, accountability, authenticity, resistance = 6                                                                          | **clean**                              |
| 5   | "Reliability (top-level with **four** subs)"                                                                                                                     | (b)                                                                                         | faultlessness, fault tolerance, availability, recoverability = 4                                                                                                   | **clean**                              |
| 6   | "The **five** bracketed pairs"                                                                                                                                   | (b) + cross-file: the reference's subsection count must equal the body's table rows         | 5 `###` subsections in the reference; 5 `↔` rows in the body's pairs table                                                                                         | **clean, and consistent across files** |
| 7   | Provenance: "**four** independent note sets" (translation table), "**three** independent note sets" (ch. 4 taxonomy), "**three** note sets" (quantum definition) | (c) — a wrong provenance count misstates the evidence base                                  | All three match the research brief's own corroboration counts for those specific claims                                                                            | **clean**                              |
| 8   | "**four** implicit characteristics" / "the standing implicit **four**"                                                                                           | (b) — appears in three places in the body                                                   | feasibility (cost/time), security, maintainability, observability = 4, at every occurrence                                                                         | **clean**                              |
| 9   | Ameller: 10 of 13, 9 of 13, 0 of 13, 11 of 13, "only one … as many as three"                                                                                     | (c) + (a) — I corrected this at iteration 2; checked for drift across three later revisions | All five figures match brief Table IV                                                                                                                              | **clean, no drift**                    |
| 10  | Worksheet flat list in `taxonomy-and-iso`                                                                                                                        | (b) — checked whether a count is claimed at all                                             | **No count is claimed**; the enumeration matches the brief's 18 members, and "a separate box of four implicit ones" names 4                                        | **clean**                              |
| 11  | "Two of the three are borrowed" (threshold) and "five names and three slots" (n=2 passage)                                                                       | (a) — both sat in passages edited at iterations 3 and 4                                     | 3 threshold numbers, 2 borrowed (SLO figure, scale-out interval), 1 chosen (2x); 3 incumbents + 2 arrivals = 5                                                     | **clean**                              |

**Eleven claims across all four files, zero failures.** This does not prove the remaining ~47 are
clean, and I do not claim it does. It does mean the check was applied competently in the places where
misapplication would have mattered most, so the "58 clean" figure is corroborated where it is load-
bearing. Had one failed, the finding would have been about the check's application rather than about
the number — that case did not arise.

## 3. MINOR-15's modality fix — **correct, and not vacuous**

Now: _"Five candidate sets, three slots — **while one of G/C is genuinely driving and no off-table
driver takes a slot**, two of the five lose: G and C cannot both hold the first, which accounts for one,
and exactly one of the remaining three loses too."_

Both preconditions I named at iteration 4 are stated, and only those two — no defensive padding.

**Does the qualification weaken it into vacuity?** No, on three tests:

- **The guards are checkable before the rule is applied**, not after. "Is one of G/C genuinely driving?"
  is answered by the table's own first column question (can a named person state a tolerable
  disagreement window?). "Does an off-table driver take a slot?" is answered by the hatch sentence two
  lines later. A vacuous hedge is one whose condition can only be evaluated once you already know the
  answer; neither of these is.
- **Inside the guards the rule still fully determines the outcome** — two losers, one from each source.
  Nothing was softened from "exactly" to "typically".
- **The unconditional part stayed unconditional.** "G and C cannot both hold the first" carries no
  guard, which is correct: that exclusivity is a claim about the world, not about this reader's
  circumstances, and it is the half that makes §2 a decision rather than a menu. The guards attach to
  the _counting_, which is where the contingency actually lives.

The word "genuinely" is doing real work — it blocks the reader who names C because it is on the table
rather than because a store-agreement problem exists.

**MINOR-14 also closed.** The hatch's example list now reads "**data integrity**, interoperability,
workflow, a regulatory obligation". Integrity's route out of the split set is now stated rather than
inferred, in exactly the two words the finding predicted.

## 4. Routing after the NIT-8 trigger rewrite — 21 prompts, 19 clean, 2 borderline, 0 failures

The composite trigger is now _"when 'reliability', 'agility' or a home-grown -ility is claimed as one
characteristic"_. Description 1013 characters, byte-identical across frontmatter and manifest; both the
restored sourcing clause and the new trigger verified present programmatically.

This is a better repair than the one NIT-8 asked for. I proposed restoring a covers-clause phrase
("composites decomposed to their primitives"), which would have been a _capability_ signal. Extending
the existing trigger instead keeps it a _situation_ signal, which is what the house standard says
discriminates at selection time — and it costs 21 characters against 32 characters of headroom rather
than adding a clause.

Only changed and new rows shown; P-1 to P-7, N-8 to N-19 all re-checked and unchanged.

| #        | Prompt                                                                                                                         | Should select  | Iter 4     | Iter 5   | Change                                                                                                                                                                                                                       |
| -------- | ------------------------------------------------------------------------------------------------------------------------------ | -------------- | ---------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **P-20** | "Someone put 'auditability' in our top three and nobody can measure it."                                                       | this skill     | BORDERLINE | **PASS** | **CHANGED.** "a home-grown -ility … claimed as one characteristic" matches the subject near-verbatim, and beats ADM's "turning quality attributes into observable scenarios", which only matches the complaint. NIT-8 closed |
| **N-21** | **new probe:** "Our platform team publishes an 'observability maturity' scorecard each quarter — how do we improve our score?" | not this skill | —          | **PASS** | new. Probes whether "home-grown -ility" over-reaches. It does not: the trigger requires the name to be _claimed as one characteristic_, i.e. holding a slot. A quarterly scorecard claims no slot, so nothing here fires     |

**No new collision.** The trigger names a _subject_ (an -ility occupying a slot); ADM's triggers name
requirements and options, `requirements-and-acceptance`'s name adjectives without numbers, and
`architecture-trade-off-analysis`'s name competing options. None of them claims a home-grown -ility.

**Count: 21 prompts. 19 clean, 2 borderline (P-7 and N-15, both carried and both routing correctly),
0 failures.**

## 5. Regression — **nothing lost; the three count fixes cost nothing**

Line counts: SKILL.md **198** (unchanged from iteration 4); `definitions-and-composites.md` **146**,
`eliciting-and-capping.md` **193**, `taxonomy-and-iso.md` **170** — all unchanged. All three
corrections were word-level substitutions ("four"→"three", "eight"→"seven", "two"→"three"), so no
reflow occurred and nothing had to be paid for. The description grew 992 → 1013 within the same
folded-scalar line count.

**The six protected items, each verified rather than accepted:**

| Item                   | Verified state                                                                                                                                                                                                       |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Caps                   | **Intact.** All four worksheet elements present, plus "Two caps, not one"                                                                                                                                            |
| Taxonomy handling      | **Intact.** Lines 28–31 unchanged: Richards-not-Ford attribution, March 2024 worksheet, 2nd-ed "unverified"                                                                                                          |
| Delivery lines         | **Intact.** All three renderings present, including "one deployable and the store it cannot run without" (line-wrapped across 174–175, which a line-based grep initially missed — verified by reading the paragraph) |
| Size threshold         | **Intact.** Quantum-count unit with both worked figures; middle case still keeps Others Considered on the failure argument                                                                                           |
| Unknown-candidate rule | **Intact.** Lines 101–103 unchanged — and now backed by a selection-time trigger for the first time                                                                                                                  |
| Escape hatch           | **Changed correctly.** Extended by "data integrity" — the MINOR-14 fix. Boundary criterion untouched                                                                                                                 |

**Source attributions — all intact** (grep count 8 across the body): the four-note-sets caveat, March
2024 worksheet, _Hard Parts_, Eckhardt, ATAM 15-year, Ameller Table IV, GAO-15-238,
CMU/SEI-2000-TR-004 §5.3. The threshold's restored inference ("past it, it belongs to the design"),
"Two of the three are borrowed", the n=2 passage's "five names and three slots" and "places last" all
survive. No ISO clause number anywhere; the sole `§` remains the SEI report's.

## 6. The twelve items — final

| #   | Item                             | Iteration 5                                                                                                                                                                                             |
| --- | -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Technical accuracy               | **PASS.** All three count errors corrected and re-derived; eleven further claims spot-checked clean.                                                                                                    |
| 2   | Terminology fidelity             | **PASS.** Five pairs intact and cross-file consistent; C's split holds; reliability-as-composite now counted correctly.                                                                                 |
| 3   | ISO 25010                        | **PASS.** No clause numbers; both versions named; 2011/2023 counts and both sub-counts verified against the file's own table; testability conflict still carried unresolved with the paywall disclosed. |
| 4   | No unconditional recommendations | **PASS.** Five set bullets with cost and reversal; the restored third Push-on row returns a decision rule to the reader.                                                                                |
| 5   | Trade-offs qualified             | **PASS.** Dimension, direction, magnitude, settling measurement; C priced to its single member.                                                                                                         |
| 6   | Evangelism and evidence honesty  | **PASS.** Unchanged since iteration 1 and still the strongest section.                                                                                                                                  |
| 7   | Governance realism               | **PASS.** Chain complete, tool pinned and verified, threshold inference restored, site matches the metric's shape.                                                                                      |
| 8   | Scale honesty                    | **PASS.** Observable unit; no unsourced figure remains.                                                                                                                                                 |
| 9   | Scope hygiene                    | **PASS.** No collision from the rewritten trigger.                                                                                                                                                      |
| 10  | Diagram accuracy                 | **PASS (vacuous).** None.                                                                                                                                                                               |
| 11  | Trigger quality                  | **PASS.** 21 prompts, 19 clean, 2 borderline, 0 failures.                                                                                                                                               |
| 12  | Internal consistency             | **PASS.** Every count now agrees with the artefact it describes; descriptions byte-identical at 1013.                                                                                                   |

**New findings this iteration: none.**

---

# THE COUNTING CHECK — the case for keeping it

Written up as the standing check for the remaining nineteen skills, because the evidence for it is now
stronger than it was when I proposed it, and stronger in a way that changes its scope.

## What it caught

Applied package-wide, the check re-derived **61 count-claims and failed 3**:

| Error                                  | Location                        | Wrong because                                                                                              | Latent since                                |
| -------------------------------------- | ------------------------------- | ---------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| "two of the remaining three lose"      | `SKILL.md` §2                   | Five sets and three slots give two losers total; G-xor-C already supplied one. Filled two slots, not three | **Introduced iteration 3** by a correct fix |
| "four of the five rows"                | `eliciting-and-capping.md`      | Three of five; two rows contain none of the three characteristics                                          | **First draft**                             |
| "the top three is really eight things" | `definitions-and-composites.md` | 5 primitives + 3 slots double-counts the slot reliability occupied. Seven                                  | **First draft**                             |
| "only the top two rows decide"         | `SKILL.md`                      | Three of the five Push-on rows are tests; row 3 was orphaned                                               | **First draft**                             |

Four errors, not three, counting MAJOR-4 which prompted the check.

## Why reading did not catch them

**MAJOR-4 was a cardinality error introduced by a fix that was itself correct.** Adding set P was the
right response to a Phase 4 finding — a harness had to allocate performance by hand because no set held
it. But a fifth set moved the loser count from one to two, and the sentence describing the arithmetic
was rewritten in a way that read fluently and did not balance.

**It survived the author's handback and my review because the sentence read fluently.** "Two of the
remaining three lose" has the cadence of a derivation. Nothing in it signals that it needs checking,
and everyone in the loop read it as prose.

**What caught it was checking the rule against the skill's own worked example.** ADR-021 picks three
characteristics from that table; the stated rule yields two. Mechanical, immediate, no domain judgement.

## The scope correction, which is the important part

A check scoped to _fixes_ — "re-run the worked example whenever a fix changes the count of anything" —
would have caught MAJOR-4 and **none of the other three**. Those changed nothing and were introduced by
no fix. They were in the first draft, and they survived four gate iterations, the author's own writing
and rewriting, five coordinator reviews and four of mine. **Two of the check's three catches were latent
from the first draft and were found by counting rather than by reading** — and reading had been applied
to those sentences, attentively, at least nine times between us.

That is the argument for the check, and for its scope:

> **Any sentence that counts anything is re-derived from the artefact it counts — the table, the list,
> the worked example — on first review and after any edit near it. A count is never read for
> plausibility.**

Scoped to _claims_, not to edits. A check that audits only what someone recently touched audits only
the places already receiving attention.

## Cost

61 claims across 707 lines and five files; two regexes to enumerate them, a few minutes to re-derive.
The three failures were each a one-word fix costing no reflow. This is among the cheapest checks in the
suite and it is the only one so far that has found errors invisible to careful reading — including
mine, three iterations running.

**Recommendation: run it on every skill in the suite, and run it retrospectively over the skills
already shipped, `architecture-trade-off-analysis` included.** Nothing about this failure mode is
particular to skill 2; what is particular to skill 2 is that somebody counted.

---

# PERMANENT RECORD

## Iterations and dispositions

| Iteration | Verdict  | Findings                | Disposition                                                                                                                                                                                                                    |
| --------- | -------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **1**     | FAIL     | 3 MAJOR, 8 MINOR, 4 NIT | MAJOR-1 trigger collision with ADM and R&A; MAJOR-2 §2 construction unmarked; MAJOR-3 Ameller and Eckhardt figures misattributed. All 3 closed iter 2. All 8 MINOR closed iter 2. 2 NIT closed iter 2, 2 declined and accepted |
| **2**     | PASS     | 1 MINOR, 1 NIT new      | MINOR-9 (fourth-characteristic section framed n=1) closed iter 3, above the bar the finding set. NIT-5 ships                                                                                                                   |
| **3**     | FAIL     | 1 MAJOR, 4 MINOR, 2 NIT | MAJOR-4 §2 arithmetic wrong by one, contradicting ADR-021 — closed iter 4. MINOR-10/11/12/13 and NIT-6/7 all closed iter 4                                                                                                     |
| **4**     | FAIL     | 1 MAJOR, 2 MINOR, 1 NIT | MAJOR-5 "four of the five rows" — closed iter 5. MINOR-14, MINOR-15, NIT-8 all closed iter 5                                                                                                                                   |
| **5**     | **PASS** | none                    | Gate met. 0 BLOCKER, 0 MAJOR, 0 MINOR outstanding                                                                                                                                                                              |

Across five iterations: **5 MAJOR raised, 5 closed. 15 MINOR raised, 15 closed. 8 NIT raised, 5 closed,
2 declined and accepted, 1 ships.**

## Phase 4 findings and resolutions

Numbering is mine — the originals were not supplied to me, so these are reconstructed from the
coordinator's report of them and their resolutions verified in the files.

| #   | Phase 4 finding                                                                                          | Resolution                                                                                                                                                                                                     | Verified                              |
| --- | -------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| F-1 | Three of four harnesses hit §2's table; one had to allocate performance by hand because no set held it   | Set **P — the user's clock** (performance, responsiveness) added, with its own cost-and-reversal bullet                                                                                                        | Iter 3                                |
| F-2 | One harness used the skill's own pairs table against the C row — integrity and consistency priced as one | Set C **split** to data consistency alone; integrity routed through the escape hatch and named in it                                                                                                           | Iter 4 (split), iter 5 (route stated) |
| F-3 | Two dimension questions unusable as posed                                                                | Replaced with "is demand a trend, a scheduled spike, or an unscheduled one?" and "how many deployables must change together for one feature, today or by design?" — both answerable from evidence a reader has | Iter 3                                |
| F-4 | No route for a driver that conflicts with nothing in the table                                           | Escape hatch added; boundary criterion is "conflicts with nothing in it", which integrity satisfies on the merits                                                                                              | Iter 3                                |
| F-5 | Four scenario runs                                                                                       | Reported as performing well on all four. **Not independently verified — transcripts were not supplied to me**                                                                                                  | —                                     |

F-1's fix is what introduced MAJOR-4, which is the case study above.

## Residual list — what ships

**0 MAJOR, 0 MINOR, 3 NIT, 2 trigger borderlines.**

| Item                                                                                    | Origin           | Severity      | Shipping reason                                                                                                                                                                                                                          |
| --------------------------------------------------------------------------------------- | ---------------- | ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **NIT-3** — dangling `FF-11` label in the ADR Compliance line                           | Iter 1, declined | NIT           | Referent is unambiguous — the same line reads "(above)" — and skill 1 carries the identical `FF-07` shape. Fixing one skill would desynchronise two sibling templates. Suite-wide in one pass, or not at all                             |
| **NIT-4** — body's scalability axis names one invariant where the worksheet holds three | Iter 1, declined | NIT           | The body's cell is an axis, not a definition; all three invariants are in `definitions-and-composites.md`, routed by an explicit condition. Expanding it would duplicate a routed reference, which the house standard's own rule forbids |
| **NIT-5** — body's Eckhardt figures use ISO 9126 class names without naming 9126        | Iter 2           | NIT           | Numbers, populations and source are correct and agree with the reference, which names 9126. Only the model label is implicit; no claim is wrong                                                                                          |
| **P-7** — "we're splitting the monolith into three services — three lists?"             | Iter 1           | not a finding | Routes correctly; borderline only. The body owns "whenever one splits" and the covers clause promises per-quantum scoping. No neighbour is closer                                                                                        |
| **N-15** — "our only stated NFR is 'must be scalable' and I need acceptance criteria"   | Iter 2           | not a finding | Borderline by construction: the noun matches this skill, the verb matches `requirements-and-acceptance`, and the verb should win. Two skills matching where the correct one is reachable is normal routing                               |

## Final mechanical output

```
$ node packages/cli/bin/agent-skills.mjs validate skills/architecture-characteristics
architecture-characteristics@1.0.0

  C:\git\agent-skills\skills\architecture-characteristics
  5 files

✓ Valid — no issues found

EXIT=0
```

```
$ npx prettier --check "skills/architecture-characteristics/**/*.{md,yaml}"
Checking formatting...
All matched files use Prettier code style!
EXIT=0
```

```
$ wc -l skills/architecture-characteristics/SKILL.md skills/architecture-characteristics/references/*
  198 skills/architecture-characteristics/SKILL.md
  146 skills/architecture-characteristics/references/definitions-and-composites.md
  193 skills/architecture-characteristics/references/eliciting-and-capping.md
  170 skills/architecture-characteristics/references/taxonomy-and-iso.md
  707 total
```

Description and trigger verification:

```
SKILL 1013 | yaml 1013 | identical true
sourcing: true | home-grown trigger: true
```

ISO clause-number re-grep — one hit, the SEI technical report, not ISO:

```
$ grep -rnE "§|clause [0-9]" skills/architecture-characteristics/
SKILL.md:185: ... (CMU/SEI-2000-TR-004 §5.3, 2000) ...
```

`registry:build` and `verify` deliberately not run — seven unrelated `gof-*` packages lack `skill.yaml`
and both abort. Not in scope for this skill.
