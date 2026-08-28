---
name: architecture-decision-making
description: >
  Writing an architecture decision down so it can be re-opened on evidence: what earns an ADR,
  reversibility pricing how much record it earns, superseding rather than editing in place, and
  the recorded refusal. Use when nobody can say why the system is built this way, when the same
  decision is argued or deferred for the third time, when an accepted record is about to be
  edited in place, when every record says "accepted" and none says "superseded", when nobody can
  say who may change a status, or when a rejected proposal is being closed without a written
  reason. Does not cover the choice itself (layering-and-boundaries, distribution-boundaries),
  naming and capping the characteristics (architecture-characteristics), deliberate shortcuts
  (technical-debt-decisions), choosing a pattern once the forces are known
  (pattern-selection-and-composition), or the method of analysing the trade-off itself — MECE
  option sets, qualitative versus quantitative analysis, resisting evangelism
  (architecture-trade-off-analysis).
---

# Architecture Decision Making

## Purpose

Produce a record the next person can re-open on evidence: the forces that drove the choice, the alternatives genuinely considered, the consequences already known to be unpleasant, and the observation that would reverse it.
The analysis belongs to another skill; **what survives the analysis belongs to this one.**

Two failure modes this exists to prevent. The first is the decision with no problem — a pattern chosen because it is respectable, whose driver, when asked for, turns out to be "this is how it is done". The second is the
decision made once and then treated as permanent, so that five years later nobody can say whether its context still holds and nobody dares touch it.

**Reversibility is read twice in this suite and the readings do not collide.** `architecture-trade-off-analysis` reads irreversibility as a driver of how much _analysis_ to do — its mode selection; this skill reads
reversibility class as a driver of how much _record and rigour_ the decision earns. Same axis, same source (Fowler, _IEEE Software_ 2003), two different outputs.

## When to use — and when not

Use it at the moment a decision is made, not at the end of the project: a record written retrospectively captures the justification rather than the reasoning, and those differ in exactly the places that matter.

- **Too small for this to matter** — reversible by one person in a day inside one module; the commit message is the record. **No study establishes a team or system size below which records are net-negative**, and four
  searches found none, so no headcount threshold is offered here. The evidence gives a ceiling and a collaboration condition instead: Zimmermann (2020, updated 2026-03), an AD log over 100 entries "will probably put you
  readers (and you) to sleep, and be really hard to maintain"; Buchgeher et al. (2023), that sustained sets are written by "two or more users over a longer period". Backstage's rate is the realistic one — 15 records in
  about five and a half years.
- **The characteristics are not named or capped yet** — `architecture-characteristics`, which hands the scenario and the record back here once its list is set.
- **The argument is which option is better** — `architecture-trade-off-analysis` owns that method entirely; scoring options here means you have crossed over. On a compound request — _compare these and write it up_ — do the
  comparison under `architecture-trade-off-analysis`, return here for the record, and say which half you are doing.
- **The refusal has to be delivered rather than filed** — `engineering-communication` owns the conversation, the escalation and the act of saying no. This skill owns only the artefact: a rejected proposal closed with a
  written reason and a status.
- **It is a shortcut with a repayment plan** — `technical-debt-decisions`. The distinguishing question is whether the thing has a status lifecycle and a supersession, or a backlog item.

**A handoff is an instruction, not a fence** — a boundary stated only as a prohibition is one you walk through under a deadline. Same split wherever the request is compound: cap the list under `architecture-characteristics` and carry one
named characteristic back as a scenario; deliver the refusal under `engineering-communication` and file the rejected record here.

## The decision this skill makes

**How much record does this decision earn?** Ask what undoing it would cost **after** six months of code has been written on top of it. Four classes; for one decision at one moment they are mutually exclusive.

- **N — nothing beyond the commit message.** When a process mandates a record for an N-class decision, write the **S** form and say inside it that the decision is N-class and why.
- **S — a short record**: context, decision, consequences.
- **F — a full record**: alternatives with the reasons their advocates would recognise, plus an assumption / trigger / then block.
- **O — a one-way record**: F, plus an argument for the smallest surface that satisfies the drivers, and delay named as a legitimate option rather than an absence of one.

| Class | Cost of undoing it after six months                                              | What the record must carry                                               | Wins when                                                                              | Loses when                                                                                                                                                                |
| ----- | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **N** | a refactor inside one module, one owner                                          | nothing — the commit message names the choice                            | the decision is genuinely local and the next reader is the person who made it          | "one module" was the diagram's opinion, not the pipeline's — see `architecture-coupling-and-quanta`                                                                       |
| **S** | a refactor plus its tests; one team, one deploy                                  | context, decision, consequences including the disliked ones              | the option that keeps the next decision open is obvious and the argument was short     | the short form hides that two credible options existed, and the second one returns as a proposal in six months                                                            |
| **F** | a data migration, a client change, or a deploy coordinated across teams          | S, plus alternatives and the assumption most likely to be wrong          | the decision will be argued again and the argument is worth having once, on the record | it is written after implementation, so the alternatives are strawmen and the record is a compliance artefact                                                              |
| **O** | a published contract, a datastore engine, a process boundary — not undone at all | F, plus why this surface and not a larger one, and what delay would cost | being wrong about the details is near-certain and the surface area is the only defence | delay is used as the decision: a record that defers with no ending event is `architecture-trade-off-analysis`' mode D — refusing to decide — wearing this skill's costume |

What each class charges when it is the right one, how it goes wrong, and what reverses it:

- **N** — price: the next team re-decides from scratch, and correctly so. Fails when the module turns out to be a quantum. Reverses the third time the same question is asked.
- **S** — price: the rejected option is unnamed, so nobody can tell a re-proposal from a new idea. Fails as consequences written as benefits. Reverses when a second team depends on the choice.
- **F** — price: real hours, and a document whose links someone must maintain. Fails as ceremony, written to satisfy a gate. Reverses when the trigger you wrote fires, and only then.
- **O** — price: the smallest-surface argument makes the design less capable than it could be, on purpose, and somebody will say so. Fails when "delay is a strategy" becomes indefinite. Reverses on evidence — a driver
  changed, a scenario is now missed, a cost came in differently — never on a newer technology existing.

**The "future" clause cuts across all four.** If the driver cannot be stated without the word "future" it is not a driver: record it as an assumption with a trigger — "if we exceed N tenants, revisit" — and build for
today. **And keep two provenances apart.** Fowler (_IEEE Software_, 2003) credits _irreversibility_ as a driver of complexity to the economist Enrico Zaninotto, from a talk at XP 2002, adding his own line about "finding
ways to eliminate irreversibility in software designs"; one-way and two-way doors is separate, from Bezos' 2015 shareholder letter under "Invention Machine". Do not attribute doors to Fowler, or irreversibility to Amazon.

## The status lifecycle, and the recorded refusal

**Nygard's own statuses are four: proposed, accepted, deprecated, superseded.** `rejected` is not his — it arrives through MADR's `status` enum, AWS's process and Joel Parker Henderson's collection; teach five values by
all means, but say you are teaching an accretion. **Also: "What becomes easier or more difficult to do because of this change?" is Joel Parker Henderson's phrasing, not Nygard's**, despite being quoted as his nearly
everywhere. Nygard's own rule is plainer: "All consequences should be listed here, not just the 'positive' ones."

**Who may move a status has three named, incompatible answers and the literature settles none of them.** Nygard is silent; AWS Prescriptive Guidance says the ADR owner, after a review meeting with a silent-reading slot;
Harmel-Law's advice process says anyone may decide, provided they first consult the affected parties and the subject-matter experts — advice, not consent, no veto. Pick one and write down that you picked; the record below
uses the AWS answer. **The refusal is the artefact this skill owns**, and AWS gives its reason directly: the owner adds a reason for the rejection "to prevent future discussions on the same topic".

## Drivers for writing a record, and for not writing one

| Push on — write it                                                               | Push back — do not                                                                   |
| -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| A driver is organisational — "two teams must deploy independently"               | Nothing structural changes; it is a coding convention with a linter                  |
| Two credible options existed and one lost for a reason its advocate would accept | The decision is already forced by a constraint — record the constraint, not a choice |
| The question has been asked before, in a meeting nobody minuted                  | Someone wants a sign-off artefact and no decision has actually been taken            |
| The proposal is being rejected and the topic will return                         | The set already has more entries than anyone re-reads (Zimmermann's ceiling)         |
| An assumption is load-bearing and an observation would disprove it               | It is a shortcut with a repayment plan — `technical-debt-decisions`                  |

When both columns are heavy, write the record short (**S**) and put the argument in the alternatives section rather than skipping the record: the reason decays first, not the choice.

## Fitness functions

Governing a decision set is possible, but the ecosystem is thinner than its reputation and every option below is a dependency you own rather than one maintained for you. A Compliance line naming a human review is the
weakest form there is: it fires only when someone remembers.

```text
Characteristic  Re-openability — a superseded record that never names its replacement, or a link
                to a record that no longer exists, silently ends the chain the set exists to be.
Metric          Violations of ADR010 (superseded records reference a replacement) and ADR013 (ADR
                links resolve to existing files) — both format-agnostic. ADR016, the two-options
                check, is MADR-only: it keys on the literal heading "## Considered Options", so
                it is inert on the Nygard-shaped record below and is not in this gate.
Tool            mdbook-lint v0.16.1, released 2026-08-27, last commit the same day, both read
                2026-08-28 — the only checker found with real ADR semantics, validating Nygard
                and MADR 4.0 shapes. Say its state whenever you name it: created 2025-08-04,
                pre-1.0, 29 stars. A gate on it is a gate on one maintainer.
Threshold       Zero on both, changed files only, today's count baselined. Zero because each is a
                broken reference rather than a matter of degree — a supersession with no
                replacement link is not a weaker link, it is no link; the baseline stops the gate
                blocking on records written before it existed.
Site            The pull-request check on the decision directory — the only site that works: the
                record is written in that pull request, and a nightly job reports the broken
                chain after the merge that broke it.
```

Two more, both of which you write yourself:

- **Age of `status: proposed`.** No tool ships it — not mdbook-lint, not `structured-madr`, not `adrkit`; `pyadr` covers the lifecycle transitions but its five most recent commits are all `renovate[bot]` (all checked
  2026-08-28). MADR 4.0.0's frontmatter gives `status` and `date` as first-class fields, so a scheduled job can fail on `proposed` older than N days in a few lines — **the one concrete argument for MADR frontmatter over
  Nygard's prose status line**. Threshold from your own cadence: proposed for longer than the gap between architecture reviews is not proposed, it is abandoned. Site: scheduled, never a gate, because a stale record is not
  the fault of the commit in front of you.
- **A pull request touching a flagged path must cite a record.** Write it as one job that always runs and decides internally whether the path matched. **Do not implement it with `paths`/`paths-ignore` on a required
  check**: a skipped workflow never reports, so the required status waits forever (GitHub community discussions #26857, #54877). The only concrete implementation found was `adrkit`'s Action — created 2026-07-18, 9 stars,
  too new to depend on. A widely-described "ADR Guard" Action could not be shown to exist; do not reach for it.

**Say the state of the tool you name.** `npryce/adr-tools`, the one most readers reach for, has had no release since 3.0.0 on 2018-07-25, last commit 2020-03-30, and issue #94 "Still maintained?" open since 2020-03-29.
`log4brains` last released v1.1.0 on 2024-12-17, with issue #150 — "yarn audit says 84 critical vulns" — open since 2025-10-29. `adr-manager` reads `docs/adr` while MADR 4.0.0 tells you to create `docs/decisions`. All read
2026-08-28. None of this makes them unusable; it makes them yours.

## Failure signature

What a decision set looks like a year and a half to two years after it stopped being maintained.

| Pattern                                   | 18 months on                                                                                                                                                                                                                                                                                | Earliest detectable symptom                                                                                                 |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| **The set stops, the project does not**   | `npryce/adr-tools` — the canonical ADR tool — holds 9 records, last touched 2018-06-26, while the repository kept receiving commits until 2020-03-30: 21 months of change against a frozen log. Latest release 2018-07-25; issue #94 "Still maintained?" open since 2020-03-29              | Two consecutive decisions ship without a record and nobody notices. Count records per quarter against merged pull requests  |
| **Abandonment after the pilot**           | Buchgeher et al. (_IEEE Access_ 11, 2023): about **50% of GitHub repositories that use ADRs hold one to five records**. The same study finds sustained sets are written by "two or more users over a longer period" — a correlation, not a cause, and the honest reading is ambiguous       | One person's name on every record in the set. A single-author set is the one that stops                                     |
| **Status never changes**                  | Everything says "accepted"; nothing superseded, nothing deprecated, and the set no longer describes the system. Read a set with years of history and no superseded entries as archaeology, not as constraint                                                                                | The first decision that reversed an earlier one was written as a new record with no link back                               |
| **The rationale was never there to lose** | A rewrite team removes choices that look like obvious mistakes and rediscovers why they were made — Magnus (2023): "The existing design document just listed a way the system was, but not the reasons for it being that way." **A single practitioner's blog; illustration, not evidence** | A record's consequences are all positive. That is the most reliable indicator that the decision was announced, not compared |

**The counter-example belongs here too, or this section is advocacy.** Backstage runs 15 numbered records over about five and a half years — roughly three a year on a very large project — and shows what re-opening on
evidence looks like: ADR013 (2021-12-21) is marked superseded by ADR014 (2024-11-29), nearly three years later, and ADR014 states its driver — a raised Node.js minimum, a stable native `fetch`, a linked issue. That is a
platform capability change, not a newer technology existing. Their index: records "are never deleted but can be marked as superseded by new decisions or deprecated".

## How to record it

```text
ADR-014  Enforce order invariants in the domain model, not in SQL
Status       accepted (2026-03-11) · supersedes ADR-006 · owner moved it after review
Context      Pricing rules changed 9 times in 12 months across three places; two of the last four
             incidents were a rule applied in one and not the others. Peak 12k orders/hour. The
             ledger schema is owned by Finance and cannot change.
Decision     Invariants enforced in the Order aggregate; Data Mapper over the existing schema.
Alternatives Rules stay in SQL plus a test harness — cheapest, rejected because rule changes need
             a DBA-owned deploy window. Transaction Script — adequate today, rejected on the 7
             pricing rules, 4 of them conditional on each other.
Consequences One aggregate load (4 queries) where the procedure did one; measured 40 ms p95 on an
             800 ms budget, accepted. The Finance report still duplicates the discount rule.
Assumption   Peak order volume stays below 20k/hour.
Trigger      Sustained 15k/hour for three consecutive days.
Then         Re-open — aggregate load per order becomes the constraint.
Compliance   ADR010 and ADR013 on the pull-request check (above); the supersedes link on ADR-006
             is set in this same change, not later.
```

**Cost the losing option honestly.** If the rejected alternative is described in a way its advocates would not recognise, the record is worthless and the decision gets re-fought as a fresh proposal. "Adequate today" is the
shape of a real concession; "does not scale" usually is not.

The assumption / trigger / then block separates a considered decision from a bet, and nothing in the literature reviewed here writes it down in that form. One characteristic — already named and agreed by
`architecture-characteristics` — enters as an observable scenario rather than an adjective; naming and capping stay theirs. Link the record to the code it governs: a one-line comment naming the record number at the
boundary it constrains is the only mechanism that reliably reaches whoever is about to violate it. Review triggers, not the whole set — quarterly re-reading of sixty records does not happen; reviewing the eight with live
triggers does.

## Honest standing

**No outcome evidence exists that recording a decision improves any system outcome** — defect rate, change cost, incident count, time to onboard, rework avoided. Six searches found none. The two controlled experiments
measure decision-making under a rationale document, not the system: Falessi et al. (ISESE 2006, 50 postgraduate students) found rationale improved the _effectiveness_ of decisions under requirement change and left
efficiency unchanged; Bratthall et al. (PROFES 2000, 17 subjects) found "a significant improvement in correctness and speed" — **for one of the two systems studied, not both**, and that split is the finding. The rest
measures adoption (Buchgeher), template preference (Nogueira et al., 33 undergraduates, where Nygard's template beat MADR _after_ expert screening had scored MADR higher) or perceived challenges (Ahmeti et al., one
company, three months).

**Two live disagreements, both sides.** _Immutable, or edited in place?_ Nygard; Fowler ("Once an ADR is accepted, it should never be reopened or changed - instead it should be superseded"); Microsoft's Well-Architected
Framework ("The ADR serves as an append-only log. Don't go back and edit accepted records"); AWS ("When the team accepts an ADR, it becomes immutable"). Against those four stands an artefact rather than an argument: MADR
4.0.0's own template ships `date: {YYYY-MM-DD when the decision was last updated}`. Neither side acknowledges the other and nothing has tested either. _Who may change a status?_ The three answers above, unreconciled.

**Three more things worth saying plainly.** ISO/IEC/IEEE 42010:2022 is not a rival to the ADR: clause 6.10 requires that decisions and rationale be recorded, and clause 1 Scope says, verbatim, "This document does not
specify any format or media for recording an AD." An ADR set is one conforming way to satisfy 6.10. And MADR contradicts itself in public — its docs say "Do not take the term 'architecture' too seriously", the acronym
officially stood for "Markdown **Any** Decision Records" between 2022 and 2024 before 4.0.0-beta reverted it, and `adr-manager` reads a directory MADR 4.0.0 no longer writes to. Richards and Ford's additions to Nygard
(Compliance, Notes) are cited here from _Fundamentals_ **1st ed., ch. 19** through two agreeing note sets rather than the book text; the 2nd edition (March 2025) renumbers it to ch. 21 and **everything this skill says
about that edition is unverified**.

## References

- [Templates and the lifecycle](references/templates-and-lifecycle.md) — Nygard verbatim, the misattribution, MADR 4.0.0, Y-statements, arc42, 42010:2022, which template to teach.
- [Writing the record](references/writing-the-record.md) — the worked record, drivers versus wishes, the scenario form, the assumption block, keeping the set alive, failure modes.
- [Evidence and tooling](references/evidence-and-tooling.md) — the studies one by one, the tool table as verified, the two fitness functions you write yourself, the scale numbers.
