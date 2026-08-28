# Test prompts — `architecture-characteristics`

Phase 4 of the architecture suite build. Five prompts, each executed by an **isolated agent**
holding only this skill. Two adversarial by design.

Outputs are **excerpted, not complete**. Full transcripts were reviewed in session.

---

## T1 — adversarial: fourteen mandatory NFRs

> Our architecture review board wants sign-off on the non-functional requirements for a new
> claims-intake platform. Here's the list they approved — all fourteen are marked mandatory:
> availability, scalability, performance, security, maintainability, testability,
> deployability, observability, portability, interoperability, usability, auditability,
> disaster recovery, cost efficiency. Can you confirm we've covered everything, and flag
> anything missing before I send it back signed?

**The request pushes toward adding.** The correct answer is that a list where everything is
mandatory has chosen nothing.

Verdict: **pass**. Refused the sign-off and capped, rather than extending. Identified the list
as approximately the ISO 25010 enumeration — a model exhaustive by construction, built to
evaluate a finished product rather than to prioritise a design — and noted that in 25010:2023
portability became Flexibility and usability became Interaction Capability. Applied quantum
scoping to show a claims platform is several quanta (intake, adjudication, payment, portal) and
therefore several lists. Struck `cost efficiency` as a constraint rather than a characteristic
and `disaster recovery` as a continuity requirement needing decomposition into recoverability
with named RTO/RPO.

What it found missing was not on the list: **data consistency and data integrity** — intake,
rules engine, financial reserve and payment disagreeing with each other is the central risk of a
claims system, and none of the fourteen covered it.

**Marginal contribution, self-reported:** without the skill it would have done the opposite and
worse — validated the fourteen and suggested adding two or three more, which is the
completeness-checklist behaviour the skill names as the failure.

**Produced findings G1** (no tone guidance for refusing a format already treated as approved)
**and G2** (no procedure for a candidate characteristic absent from the worksheet list — the
agent decomposed `auditability` and `disaster recovery` by analogy and flagged it as its own
extrapolation).

---

## T2 — adversarial: five nines for twelve analysts

> We're building an internal reporting tool — twelve analysts in one office, batch job
> overnight. My director wants "five nines availability" written into the design because
> that's what the customer-facing platform has, and he says our standards should be consistent
> across the company. I think that's overkill but I can't articulate why in a way that lands.
> We're three engineers.

**The hardest objection to counter is the one given:** consistency of standards across the
company. The test is whether the skill supplies the argument, not just the verdict.

Verdict: **pass, and the most practically useful output of the suite so far.** Three moves, none
of which is disagreeing with the director:

1. **Scope.** A characteristic has quantum scope, not company scope — "the company is 99.999%"
   is a malformed sentence. What can and should be consistent is the **method**, not the number.
2. **The word is wrong.** Availability is uptime in nines; fault tolerance is blast radius;
   reliability is a **composite** and can never hold a slot because it has no measure. The
   director's actual fear, once named, is likely data integrity of the batch plus recoverability.
3. **The number refutes itself.** 99.999% is 5.26 minutes per year including deploys and
   patching, for three engineers with no 24×7 rota.

Sharpest argument, which the agent said it would not have formulated alone: **a strict nines
target selects against fault tolerance** — a design that degrades gracefully reports _worse_
availability than one that is either wholly up or wholly down.

**Produced findings G3** (the size threshold is binary and its failure has no middle case: 12
users, 3 engineers, but an external stakeholder, and the skill then offers nothing) **and G4**
(the vocabulary is expensive to carry to a director; no one-sentence rendering exists).

---

## T3 — the implicit characteristic

> Greenfield: a platform for pharmacy benefit claims. Business told us three things — handle
> 8x volume when we onboard two big health plans next year, the UI has to be faster than what
> it replaces because pharmacists complain, and it has to be cheap to run. So we've settled on
> scalability, performance and cost. Sanity-check that?

**Tests whether the implicit/explicit split and domain-concern sourcing do real work.** All three
stated characteristics are plausible; what matters is what nobody said.

Verdict: **pass**. Renamed two of the three (8x with a known date is growth, possibly not a
characteristic at all if the design is identical with and without it; "pharmacists complain about
the UI" is responsiveness, not performance) and struck cost as a constraint. Then found, from the
domain concerns rather than the requirements: **interoperability** (NCPDP D.0/SCRIPT, X12
834/835 — "onboarding two health plans" is literally the M&A row of the translation table),
**adaptability/configurability** (benefit and formulary design vary per plan), **data integrity
vs data consistency** around deductible accumulators, and **availability** (a counter outage is a
patient without medication).

**Marginal contribution, self-reported, verbatim:**

> Interoperability and configurability from the plan onboarding, and the integrity/consistency
> split around accumulators, I probably would not have isolated as names — I would have said
> "there will be NCPDP integration" as a technical detail, not as a characteristic competing for
> a slot.

**Produced findings G5** (the four-set table is calibrated to the worked example and covers
neither interoperability nor regulatory drivers, yet occupies central space), **G6** (greenfield
has no measurement path — the skill demands a 90-day peak-to-median ratio for a system that does
not exist) **and G7** (the response reads as obstruction in a real kickoff; no short version).

---

## T4 — three non-negotiables in conflict

> Ticketing for large venue on-sales — 200,000 people in the first ninety seconds. Product has
> given us three non-negotiables: never sell the same seat twice, absorb the spike, and hold
> seat-selection response under 150ms at peak. Leadership treats all three as equally mandatory
> and has said so in writing. Twenty-five engineers.

**Attacks §2's claim that growth and atomic consistency cannot share the first slot**, in the case
where leadership has put all three in writing.

Verdict: **pass**. Renamed all three from the pairs table (integrity not consistency; elasticity
not scalability; responsiveness not performance), then dissolved the conflict by **splitting the
quantum**: admission and shopfront (elasticity, availability, responsiveness) versus seat
inventory (data integrity, responsiveness, availability), with **elasticity deliberately excluded
from the inventory quantum** — admission control means it never sees 200,000 arrivals, only the
rate you admit.

**Produced findings G8 and G9.** G8: responsiveness belonged to no set in the table and had to be
placed by hand, and the C row conflated atomicity-within-a-store with cross-store consistency —
the distinction the skill's own pairs table insists on. The agent's words: _"I used the pairs
table against the set table."_ G9, a correction to a rule this project had approved: _"the
'too small to earn it' gate is framed around ~8 engineers, but the real gate should be quantum
count — 25 engineers on one quantum would still not need this ceremony."_

---

## T5 — routing

Seven requests judged against six competing skills, frontmatter only.

| #   | Request                                                         | Result                                              |
| --- | --------------------------------------------------------------- | --------------------------------------------------- |
| R1  | Only NFR is "must be scalable", need sprint acceptance criteria | `requirements-and-acceptance` — borderline ~60/40   |
| R2  | Make "must be maintainable" testable                            | `requirements-and-acceptance` — weak discrimination |
| R3  | Error budget and paging for checkout                            | `slo-and-alerting` — clean                          |
| R4  | Driving-characteristics section contains one line               | this skill — clean                                  |
| R5  | Availability and time-to-market both "number one"               | this skill — borderline ~55/45                      |
| R6  | Twelve quality attributes mandatory, which three matter         | this skill — cleanest in the set                    |
| R7  | Two architects, both convincing docs, break the tie             | `architecture-trade-off-analysis` — clean           |

**The systemic finding.** "Must be scalable" is a trigger phrase in **three of six** descriptions
and carries no routing signal at all. R1, R2 and R4 all contain it and route three different ways;
the discriminator is always the **deliverable requested**, never the phrase. Keyword matching gets
R1 and R2 wrong.

**And the cause:** `architecture-decision-making` is over-triggered — it claims the "must be
scalable / must be maintainable" phrase without owning the vagueness problem, competing in two
prompts and winning neither. Removing that phrase from its trigger list improves routing for
three neighbours at once. Deferred to the planned ADM upgrade, together with the two changes
already queued from skill 1's Phase 4.

R5 was fixed inside this skill by adding a trigger for stakeholders who will not rank. At gate
iteration 5 the seam against `architecture-trade-off-analysis` was verified to hold on
vocabulary rather than luck: this skill's trigger is stakeholders refusing to rank **priorities**;
that skill's is advocates holding cases for **options**.

---

## Findings this phase produced

| ID         | Defect                                                                                                                         | Resolution                                                                                                                                                                     |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| G5, G8     | The candidate-set table: one row contradicted the pairs table, one characteristic had no set, two dimension questions unusable | **MAJOR.** Rebuilt to five sets with P (the user's clock); C row scoped to cross-store agreement; dimension questions replaced; escape hatch added for non-conflicting drivers |
| G1, G4, G7 | Reaches the right answer, cannot deliver it — no tone for refusing an approved format, no lay rendering, no short version      | **MAJOR.** Delivery paragraph added: one sentence before the list, three plain-language substitutions, and a tactic for a list that arrives pre-approved                       |
| G9         | Size threshold measured in headcount                                                                                           | Adopted the tester's correction: quantum count, an observable unit, and the last unsourced number is gone                                                                      |
| G3         | Threshold failure has no middle case                                                                                           | Middle case added: translate out loud, name three, stop — waiving the ≤7 pass and worksheet but **not** Others Considered                                                      |
| G2         | No procedure for a candidate absent from the worksheet                                                                         | Unknown-candidate rule: admitted by the three-part test, decomposed by asking what would be measured                                                                           |
| G6         | Greenfield has no measurement path                                                                                             | Measurements live in the system being replaced; with no predecessor the number is an assumption and the ADR records it as one                                                  |
