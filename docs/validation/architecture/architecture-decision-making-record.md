# Release record — `architecture-decision-making` 2.0.0

A **rework**, not a new package: v1.0.0 existed and was over-triggered, with three cross-package
defects logged against it by two prior gates. The name is unchanged because 26 other skills
reference it by name and it is an installed package identity.

|                  |                                                                                                     |
| ---------------- | --------------------------------------------------------------------------------------------------- |
| **Version**      | 2.0.0 (from 1.0.0)                                                                                  |
| **Package**      | `SKILL.md` (188-line body) + `skill.yaml` + 3 references — 753 lines total                          |
| **Subject**      | The architecture decision as a durable record — what earns one, and how it is re-opened             |
| **Dependencies** | defers to `architecture-trade-off-analysis` for method, `architecture-characteristics` for the list |
| **Status**       | validated, **not published** — `registry:build` blocked, see Known limits                           |
| **Validation**   | 3 gate iterations (FAIL, PASS, PASS) + Phase 4 usage testing · 6 test prompts, 2 adversarial        |

## What the rework changed, and why

v1.0.0 was a first-generation package: a prose "Rules" list, no trade-off table, no failure
signature, no fitness function, no honest-standing section. It also **claimed territory it did not
own**, which is what forced the rework rather than a polish.

Three defects were already logged against it before this work started:

1. Its description advertised _"comparing alternatives only on the forces that differ"_ — analysis
   method, owned by `architecture-trade-off-analysis`.
2. It carried **no reciprocal exclusion** against that skill, while that skill excluded it. Phase 4
   of `architecture-trade-off-analysis` demonstrated the consequence: a deadlocked comparison was
   claimed by both descriptions and nothing decided between them.
3. It claimed the trigger _"must be scalable / must be maintainable"_ without owning the vagueness
   problem, which belongs to `architecture-characteristics` (naming and capping) and
   `requirements-and-acceptance` (a requirement without a number).

All three are closed, verified by parsing both descriptions and comparing programmatically.

**Five contested trigger phrases were arbitrated by the coordinator before drafting**, because
omitting them would have decided the question by accident:

| Phrase                                      | Ruling                                                                        |
| ------------------------------------------- | ----------------------------------------------------------------------------- |
| "must be scalable" / "must be maintainable" | **Dropped.** The scenario act survives in the body only, on AC's own handoff. |
| "two options argued on taste"               | **Dropped.** Analysis in a different costume.                                 |
| Saying no                                   | **Kept, narrowed to the artefact** — a rejected record with a written reason. |
| Reversibility                               | **Split by application**, stated in one sentence so a reader can route.       |
| "a shortcut being recorded"                 | **Dropped.** `technical-debt-decisions` owns it.                              |

The reversibility split is the one worth restating: `architecture-trade-off-analysis` reads
irreversibility as a driver of **how much analysis** to do; this skill reads reversibility class as
a driver of **how much record** the decision earns. Same axis, same source, two different outputs.
A shared source is not a collision, but without the sentence naming the split it reads as one.

## Sources

| Source                                       | Edition / version              | Role                                                                                                                         |
| -------------------------------------------- | ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| Nygard, "Documenting Architecture Decisions" | 2011, primary text read        | The template and the **four** statuses: proposed, accepted, deprecated, superseded                                           |
| Joel Parker Henderson, ADR collection        | primary text read              | Source of "what becomes easier or more difficult…" and of `rejected` — **both universally misattributed to Nygard**          |
| MADR                                         | 4.0.0                          | The `date` field as a mutation affordance; renamed "Markdown **Any** Decision Records" 2022–2024                             |
| Fowler, "Who Needs an Architect?"            | _IEEE Software_, 2003          | Irreversibility, credited by Fowler to the economist Enrico Zaninotto at XP 2002                                             |
| Bezos, shareholder letter                    | **2015**                       | One-way / two-way doors — a **separate** provenance, not to be blended with Fowler's                                         |
| _Fundamentals of Software Architecture_      | **1st ed., 2020**, ch. 19      | The decision anti-patterns; 2nd ed. (March 2025) ch. 21 **unverified**, reached only via a search-engine read of the TOC     |
| ISO/IEC/IEEE 42010                           | **2022**, clauses 5.2.12, 6.10 | Verbatim Scope: _"This document does not specify any format or media for recording an AD."_ ADRs conform to 6.10; no rivalry |
| Buchgeher et al., _IEEE Access_              | 2023                           | Adoption: ~50% of ADR-using GitHub repos hold 1–5 records                                                                    |
| Falessi et al.; Bratthall et al.             | 2006; 2000                     | The only two experiments — n=50 students; n=17, significant on **one of two** systems                                        |
| Backstage                                    | read live                      | The counter-example: 15 ADRs in ~5.5 years; ADR013→ADR014 a 35-month supersession re-opened on evidence                      |
| `npryce/adr-tools`                           | verified 2026-08-28            | Failure record: stopped updating its own `doc/adr` on 2018-06-26 and kept committing for 21 months                           |
| mdbook-lint                                  | v0.16.1, 2026-08-27            | The one governance option implementable end to end — shipped with its 29-stars / pre-1.0 / one-maintainer caveat             |

## Validation iterations

| #   | Verdict          | Findings                | Disposition                                                                                                                                                                            |
| --- | ---------------- | ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **FAIL**         | 1 MAJOR, 2 MINOR, 5 NIT | The fitness function **gated on a rule that cannot fire**: mdbook-lint ADR016 is MADR-only and keys on `## Considered Options`, while the package's own worked record is Nygard-shaped |
| 2   | **PASS**         | 1 NIT                   | MAJOR closed at all four sites; under-triggering closed by **widening** an existing trigger rather than adding one                                                                     |
| —   | **Phase 4**      | 2 MINOR, 2 NIT          | Six isolated runs. **0/6 refusals** — the narrowed-skill failure mode did not reproduce                                                                                                |
| 3   | **PASS — ships** | none                    | Confirmatory. Routing not re-run: the description was byte-identical to the string cleared 28/28                                                                                       |

Totals across three iterations plus Phase 4: **1 MAJOR, 4 MINOR, 8 NIT raised**; all closed except
one NIT declined with reasons (below).

## What this build contributed to the process

**A handoff must be an instruction, not a fence.** Phase 4 found the ATA boundary stated only as a
prohibition — _"scoring options here means you have crossed over"_ — which tells an agent what not
to do and nothing about what to do. A compound request ("compare these **and write it up**") walked
straight through it: the run performed the entire comparison and never named the skill that owns it.

The same defect class appeared independently in the sibling package the same day, where three
handoffs to `enterprise-architecture-smells` were all read as routing and none blocked the
behaviour they existed to prevent. Two samples, two authors, two packages.

The fix landed in the artefact as a rule rather than as three patched clauses:

> A handoff is an instruction, not a fence.

**An option with no delivery move is not an option.** Class **N** ("nothing beyond the commit
message") never fired in any Phase 4 run — including the prompt built for it. The cause is
structural, not editorial: N is not something an agent can hand to someone who asked for a record,
so under a mandate it produces something heavier instead. N now carries an executable form.

This generalises to every option table in the suite, and was checked against the sibling's four
readings, where **U** carries the same risk and escapes it only because the package obliges the
reader to name a measurement.

**Corollary from the counting check.** The author's first draft of the handoff generalisation said
_"Same split on the other two"_ over a bullet list of four handoffs. It was repaired the durable
way — by claiming **no count at all** ("Same split wherever the request is compound") — so the list
can grow without stranding an arithmetic claim above it. Fixing the class beats fixing the instance.

## Residual findings — shipping unfixed

| ID        | Severity | Item                                                        | Why it ships                                                                                                                                                                                                          |
| --------- | -------- | ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **NIT-3** | NIT      | No `engineering-communication` exclusion in the description | No headroom after the trigger trade. Both descriptions already discriminate in testing. **The fix belongs in EC's exclusion list**, not here — EC claims the act of refusing, this skill has narrowed to the artefact |
| —         | —        | 7 characters of description headroom (1017 of 1024)         | Recorded as a constraint, not a defect: any future trigger is a trade, not an addition                                                                                                                                |

## Known limits

- **No outcome evidence exists.** Six searches found nothing showing that recording decisions
  improves any system outcome. The two real experiments measure decision-making under a rationale
  document, never a system outcome, and one of them was significant on only one of its two systems.
  The skill says this in its own voice.
- **The tooling ecosystem is largely dead**, and the skill names the state of each tool it mentions
  rather than recommending silently. Exactly one option is implementable end to end, and it is a
  pre-1.0 project with one maintainer.
- **"ADR Guard" does not exist.** Search results describe it fluently, with a waiver syntax. A
  direct repository search found nothing matching. It appears in the package only as a name being
  refused. This is the same failure mode that previously burned this suite with an archived tool,
  and it is now a standing check.
- **_Fundamentals_ 2nd edition is unverified.** Chapter renumbering (19 → 21, 23 → 25) was reached
  only through a search-engine reading of the O'Reilly table of contents; direct fetch returns 403.
  Written as unverified throughout.
- **v1.0.0 is unrecoverable.** The entire architecture suite is untracked, so the iteration-1
  regression check could not be run against git and was reconstructed from the research brief
  instead — 12 of 14 quoted passages verified surviving intact.
- **`registry:build` cannot be run.** `skills/java-domain-modeling/` is an incomplete stub
  (untracked; `scripts/` and an empty `references/`, no `SKILL.md`, no `skill.yaml`) and the index
  builder aborts on the first invalid package. Pre-existing and outside this work's scope; awaiting
  a decision. Required before publish, since every file under `skills/` feeds package integrity.

## Verification at close

```
agent-skills validate skills/architecture-decision-making   ✓ Valid — no issues found
prettier --check skills/architecture-decision-making/**     All matched files use Prettier code style!
wc -l   SKILL.md 204 (body 188) · writing-the-record 200 · templates-and-lifecycle 189 · evidence-and-tooling 160
descriptions   byte-identical, 1017 characters / 1019 bytes, compared programmatically
routing        28/28, cleared against a byte-identical description
counting       138 + 41 + 34 claims re-derived across three gate iterations
```

Uncommitted.
