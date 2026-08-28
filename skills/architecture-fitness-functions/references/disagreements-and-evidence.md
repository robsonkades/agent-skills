# Disagreements and the evidence base

Read when someone claims the practice is proven, or argues that a rule is a straitjacket. Both
disagreements are live, both sides are named, and neither is settled by evidence — because there
is none.

## What the evidence actually supports

**There is no empirical evidence that adopting architecture fitness functions improves outcomes.**
No controlled study, no cohort comparison, no industry survey isolating the practice. The literature
is practitioner advocacy: two O'Reilly books by the same author group, a Technology Radar blip
authored by the same organisation, conference talks by the same authors, and consultancy blog posts.
That is a statement of evidentiary status, not a criticism of the idea — but a skill that claims
measured benefit is lying.

| Evidence                                                                                                                                                                                                                                                                                                                  | What it shows                                                                                                                                                                                   | What it does **not** show                                                                    |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Li, Liang & Avgeriou (2023), _Warnings: Violation Symptoms Indicating Architecture Erosion_ (arXiv:2212.12168): 606 violation-related comments mined from 21,583 code-review comments across four OpenStack and Qt projects; 10 symptom categories; about 90% of identified violations resolved by refactoring or removal | Architecture violations are real, frequent enough to be minable from review traffic, and developers act on them once they can see them                                                          | Anything about whether automated conformance checking finds them earlier, cheaper, or at all |
| DORA, _Loosely coupled architecture_: among the strongest predictors of continuous-delivery performance; teams meeting reliability targets are about 3× more likely to have one                                                                                                                                           | The **characteristic** is worth having and correlates with delivery outcomes                                                                                                                    | Anything about the **mechanism** used to preserve it — DORA measures the property            |
| Google Testing Blog, _Where do our flaky tests come from?_ (17 Apr 2017), over ~4.2M automated tests                                                                                                                                                                                                                      | Flakiness rises with test size; the cost side of a large suite is real and was unquantified even at Google                                                                                      | Anything about fitness functions specifically                                                |
| Fowler, _TestCoverage_ (17 Apr 2012) and _AssertionFreeTesting_ (3 Aug 2004)                                                                                                                                                                                                                                              | Coverage-as-target is gamed in practice, with a named real case: every public method had a JUnit test, a green bar was demonstrated to the client, and the tests contained no assertions at all | Anything about non-coverage checks                                                           |

The honest summary: **a well-argued discipline with a plausible mechanism and no efficacy data**,
whose strongest supporting evidence is indirect — the problem it addresses (erosion) is
demonstrably real, and the characteristics it governs (loose coupling) demonstrably matter.

## Disagreement 1 — a new idea, or a rebranding of tests and static analysis?

**Rebranding.** The strongest evidence comes from the proponents. The Technology Radar entry
(_Architectural fitness function_, Trial, Vol. 17, Nov 2017; repeated Vol. 18, May 2018; not on the
current Radar) says a fitness function _"may encompass existing verification criteria, such as unit
testing, metrics, monitors, and so on"_ — the mechanisms are conceded to be pre-existing. Piotr
Kubowicz (_ArchUnit: Forget Architecture, It's a Flexible and Intelligent Linter_, nexocode,
14 Mar 2022) argues the flagship tool is best read as a high-level linter over bytecode, valuable
because _"things that are hard to achieve in existing style checkers/linters like CheckStyle or
ktlint can be done in ArchUnit without much effort"_ — a convention enforcer, not an architecture
verifier. He documents a hard technical ceiling: Java's type erasure means you cannot express "no
controller method returns `SecretKey` / `Mono<SecretKey>` / `Flux<SecretKey>`", because the tool
sees `Mono<Object>`. Ben Morris (18 Jun 2018) adds that the approach _"takes a very narrow view of
the system"_ — performance, security, data, operability and integration resist automated tests, so
what survives automation is disproportionately structural, which is what static analysis already did.

**Genuinely new.** Neal Ford (Thoughtworks podcast, 6 Mar 2025): the distinguishing move is the
_subject_. Unit and functional tests verify business behaviour; fitness functions verify
architectural capabilities — the -ilities. A JUnit-shaped thing asserting on package dependencies is
answering an architectural question, and no prior category named that. Rebecca Parsons: the
contribution is the objectivity criterion, plus a taxonomy that tells you where a check belongs and
an ownership model that makes governance a continuously executed artefact rather than a document.

**Fair statement.** The mechanisms are unambiguously not new — every row of the catalogue is a
linter, a test, a scanner or a monitor. What is new is putting all of them in one named category
with one acceptance test, making "which architecture characteristic does this defend?" the
organising question, and attaching an owner and a review cadence. Whether that is an idea or a
repackaging is a judgement about the value of vocabulary. **Both readings predict the same
practice**, which is why taking a side changes nothing you would do.

## Disagreement 2 — do encoded rules become a straitjacket?

**Yes.** Over-restrictive rules get read as red tape; introducing them late on an existing codebase
produces a wall of failures; naive rules produce false positives; and every legitimate architectural
change now also requires a test change. _The sources here are weak_ — practitioner blog posts, not
authorities — so treat it as widely repeated folklore, except for Kubowicz's erasure example, which
is the concrete verified version: some legitimate rules simply cannot be expressed, which pushes
teams to enforce the rules the tool _can_ express rather than the ones that matter.

**No, say the proponents.** The taxonomy anticipates this in three places: **intentional over
emergent** admits the set is incomplete and must grow; the **annual review** exists so rules can be
changed or retired; and **`FreezingArchRule` / refreeze** exists precisely so a rule can yield to
reality on purpose. Parsons reframes a blocking rule as the trigger for a trade-off discussion:
_"when two fitness functions objectively contradict each other, then we have to stop with that
illusion"_ that every characteristic is simultaneously achievable.

**Where both sides agree:** a fitness function that cannot be changed by the team that lives with it
is a straitjacket regardless of its content. Ford's warning against building _"an antagonistic, a
police state"_ is the proponents conceding the failure mode — and his stated reason is the one that
matters operationally: developers who do not understand why a rule exists route around it, and
cannot give the feedback that the rule conflicts with a legitimate requirement.

## The maintenance-cost question

**No published data.** Nothing measures the maintenance cost of a fitness function suite. The best
available proxy is Google's flakiness data (above): flakiness rises with test size, and holistic +
dynamic + continual checks are structurally the largest tests an organisation owns — full
environment, real load, injected faults. **The class with the highest architectural value is the
class most prone to becoming untrustworthy.** That is a defensible inference from real data, not a
measurement of this practice.

A commenter datum from the same Google post, worth its caveat: when a stable test became flaky and
the cause was traced to a specific change, it was a genuine production bug about **1 time in 6** —
so flaky is not the same as worthless, which is exactly why "just disable it" is dangerous.

The counter-datum on cost: static, atomic rules are cheap, and a few thousand classes against a
handful of rules fits inside a normal test phase. _That timing claim is practitioner-reported, not
measured._ The maintenance cost concentrates in the holistic/dynamic tail, not in the bulk.

There is **no named, documented case** of a specific fitness function being disabled for flakiness.
The practice is universally described anecdotally and never written down. Present it as a
mechanism-backed prediction, never as a case study you cannot cite.

## Two claims not to repeat

- That automated governance is _more reliable_ than manual governance, attributed to Gregor Hohpe's
  _The Software Architect Elevator_ — surfaced only as a search snippet, primary source never
  fetched. **Unverified. Do not quote it.**
- Anything page-level from either book. Neither chapter text was read directly; O'Reilly returned
  403, and the researcher declined the pirated copies that search surfaced. Every book attribution
  in this skill comes from the authors' own podcasts, an unofficial reproduction of the 1st edition,
  or reader notes. Whether the 2022 edition of _BEA_ changed the taxonomy, and whether the March 2025
  edition of _Fundamentals_ changed ch. 6, are both **unverified**.
