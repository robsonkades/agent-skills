# Test prompts — `architecture-fitness-functions`

Phase 4 of the architecture suite build. Five prompts, each executed by an **isolated agent**
holding only this skill. Two adversarial by design.

Outputs are **excerpted, not complete**. Two harnesses answered in pt-BR to English prompts,
following the machine's global instructions rather than anything in the skill; noted so the
record is not misread.

---

## T1 — adversarial: the CTO mandate

> New CTO mandate: every architecture characteristic in our design docs has to have an automated
> fitness function by end of quarter, no exceptions, and a dashboard showing all of them green.
> Fourteen characteristics across four services. Two engineers for the quarter.

**The popular answer is to plan the fourteen.** The correct one renegotiates the two clauses that
break, and plans the rest.

Verdict: **pass**. The pushback is derived, not asserted: a fitness function is
metric + threshold + site + consequence, and by the objectivity test, if two competent engineers
read the result and disagree it is not one. Vague characteristics fail that test, so forcing 14 of 14 produces checks
that exist to fill the spreadsheet and never go red. The fourth mode is the way out, and the
harness's framing of it is the best sentence the skill produced:

> **U is not a failure of the mandate — it is its most valuable deliverable.** A characteristic
> with no check and no record is indistinguishable from an oversight; declared, it becomes a
> decision someone can reopen.

The all-green dashboard was attacked with both sourced failure records — OWASP dependency-check's
`failBuildOnCVSS` defaulting to 11 on a 0–10 scale, and the baseline frozen for eighteen months
and re-frozen twice — plus the skill's inversion: **the most valuable red is two fitness
functions contradicting each other**, which is where the illusion that everything is
simultaneously achievable collapses.

**Marginal contribution, self-reported:** it would have pushed back on "no exceptions" anyway, but
more weakly ("some are hard to measure"). The skill supplied the **mechanism** — mode U with
owner, risk and review date — that turns the objection into a deliverable. The attack on the
green dashboard was the skill's; alone, the agent would have built the dashboard as asked.

---

## T2 — adversarial: raise the coverage gate

> Our maintainability fitness function is line coverage, gated at 85%. Three production incidents
> last quarter from changes that passed the gate. My proposal is to raise it to 95% and add
> mutation testing on top.

**The popular answer is to agree.** The correct one is that coverage does not govern the
characteristic he thinks it governs.

Verdict: **pass**, and it produced the sharpest formulation in the skill's use:

> Line coverage **is** a valid fitness function — it passes the objectivity test — but of the
> wrong characteristic: it governs what the suite executes, not maintainability. Raising 85 → 95
> raises the price of a check that was never looking at what caused the incidents.

Followed by the distinction that carries the rest: **operationalising is not governing.**
Complexity and coverage are proxies; whatever they do not capture is ungoverned whether or not
anyone writes that down. So the deliverable is three things, not two — a check per constituent,
and a sentence naming what they do not cover.

On the stacking: mutation testing closes exactly the gap line coverage leaves (executing is not
asserting), so stacking both pays twice for one signal — and a 95% ceiling pushes the team toward
the very behaviour mutation testing then fails, tests that touch lines without asserting.

**Produced findings H1** (the skill pushes to decompose-and-declare before anyone has asked what
broke; the harness inverted the order and put the post-mortems first) **and H2** (nothing on
mutation testing, which was half the request).

---

## T3 — the ungovernable characteristic

> We picked maintainability, data integrity and elasticity. The other two I can measure.
> Maintainability, every proposal is either a code metric nobody believes or "the architects will
> review it", which lasted two sprints. Three services, eight engineers, two other teams merge
> into our repos.

**Exercises the skill's distinctive contribution.** If "explicitly ungoverned" produces nothing
better than "give up" or "measure cyclomatic complexity", it is decorative.

Verdict: **pass**. Both prior proposals were diagnosed as failing differently — a complexity
ceiling passes the objectivity test but governs a proxy; "the architects review it" is a
legitimate manual mode but only survives with written criteria, a named owner, a cadence and a
dated verdict, and its absence is exactly what died in two sprints. Then: decompose, three cheap
binary PR checks, complexity demoted from "maintainability governed" to a ratchet on new code,
outcome measures reviewed but never gated, and the residual written down.

**Marginal contribution, self-reported:** without the skill it would have delivered "decompose and
measure the constituents" and stopped. The two mandatory sentences — what is not seen, and what
would change the answer — plus the register with `governance: none` checked by a script were
"structural and specific, the best part of the answer".

**Produced finding H3:** the catalogue had no maintainability row, and the harness bridged to
dependency direction, acyclic components and API compatibility _by analogy_, flagging the bridge
as its own. The skill had the decomposition procedure and no worked decomposition of the
composite people actually arrive with.

---

## T4 — the inherited estate

> Forty architecture rules encoded as tests. Half skipped, most of the rest fail on main,
> everyone ignores the red. A suppression file with 200-odd entries, none dated, none attributed.
> Nobody remembers which rules reflect a decision anyone made. Management wants green by month
> end. Delete them, fix them, or start over?

Verdict: **pass on substance, and it exposed the skill's largest gap.** The answer refused all
three options on the ground that the premise is already refuted by the facts: a red rule everyone
ignores has no consequence, and without a consequence it is not a fitness function but a dashboard
with a build step. So deleting removes the appearance of governance, not governance. The
failure-signature table was called the most useful section — all four rows mapped onto the user's
symptoms almost verbatim.

**Produced finding H5, the most serious of Phase 4.** The body states the decision as "for this
one characteristic". The harness had to assemble the triage sequence itself and reported: _"the
skill offered no ordering."_ It also reframed the deadline goal unaided. One concrete move it
found is worth more than the finding: **`git blame` on the suppression file recovers the date and
author of all 200 entries** — the provenance was never lost, only unread.

**And H6:** the harness inferred `architecture-characteristics` as a precondition, because the
skill names it as "deriving the list" but never says what to do when the caller cannot state the
list at all — which is this case exactly.

---

## T5 — routing

Eight requests judged against seven skills, frontmatter only.

| #   | Request                                              | Result                                              |
| --- | ---------------------------------------------------- | --------------------------------------------------- |
| R1  | Write an ArchUnit rule blocking a layer import       | `architecture-testing` — **contested**              |
| R2  | Architecture rules live in an unread Confluence page | `architecture-testing` — **genuinely ambiguous**    |
| R3  | What runs on a PR versus nightly                     | `quality-gates` — cleanest of the eight             |
| R4  | Is the system still elastic six months on            | this skill — reciprocal disclaimers, well separated |
| R5  | Error budget and 3am paging                          | `slo-and-alerting` — clean                          |
| R6  | p99 regressed 12%, make the build catch it           | `performance-regression-ci` — clean                 |
| R7  | Twelve mandatory attributes, which three matter      | `architecture-characteristics` — clean              |
| R8  | Maintainability can't be measured — give up?         | this skill — easily                                 |

R3 and R8 were predicted hard and were the cleanest. **The collision is R1/R2 against
`architecture-testing`**, separated only by trailing disclaimer pointers and by a
rules-versus-characteristics distinction neither description stated. On R2 the deciding word was
_rules_: had the user written _principles_, the harness would have flipped with equal confidence.

Verdict: _"the disclaimer blocks are doing disproportionate work; move the testing-vs-governing
split into the opening clause."_ Done on this skill's side — the description now opens with the
split and **not how the test is written**. At gate iteration 2 the collision was verified closed
from this side alone: `architecture-testing` contains zero occurrences of "fitness" and no tested
prompt misroutes into it. A reciprocal line on its exclusion list is **recommended, not
required**, and is queued.

---

## Findings this phase produced

| ID  | Defect                                                                               | Resolution                                                                                                                                                                    |
| --- | ------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| H5  | No procedure for an inherited estate — the body governs one characteristic at a time | **MAJOR.** New triage section ahead of the mode decision: inventory with `git blame`, three eliminating questions, route survivors, and a deadline rule                       |
| H1  | Governance pushed ahead of diagnosis                                                 | **MAJOR.** New first step: which number, read before the merge, would have been red — with the narrow exception where recalibrating a threshold you already have _is_ the fix |
| H3  | No worked decomposition of maintainability                                           | Five constituents in `catalogue.md`, the row governing each, and what each does not see                                                                                       |
| H6  | Nothing for a caller who cannot state the characteristic list at all                 | Derive a provisional list from the surviving rules and hand off to `architecture-characteristics`                                                                             |
| H2  | Nothing on mutation testing                                                          | Catalogue row; threshold is the reader's own first full run as a baseline                                                                                                     |
| H7  | Contested with `architecture-testing` on two prompts                                 | Testing-versus-governing split moved into the description's opening clause                                                                                                    |
