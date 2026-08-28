# Evidence and Tooling

Everything in this file was verified on **2026-08-28** — the tool rows against the GitHub REST API
and the projects' own raw files, not against search-engine summaries. Dates decay; re-check before a
claim here decides anything.

## What has actually been measured

| Finding                                                                                                                                                                                                          | Study                                                                                                                                            | Caveat                                                                                                               |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------- |
| ADR adoption in open source "is still low" and grows year on year; **about 50% of repositories that use ADRs hold one to five records**; systematic use correlates with "two or more users over a longer period" | Buchgeher, Schöberl, Geist, Dorninger, Haindl, Weinreich, "Using Architecture Decision Records in Open Source Projects", _IEEE Access_ 11 (2023) | Reached via the project page and the IEEE listing; **full text not read**. Nygard's template reported as predominant |
| Rationale documentation improves the **effectiveness** of individual and team decision-making under requirement change; **efficiency unchanged**                                                                 | Falessi, Cantone, Becker, ISESE 2006. 50 postgraduate students                                                                                   | Students, and a rationale technique rather than ADRs                                                                 |
| Access to a retrospective design rationale gave "a significant improvement in correctness and speed" — **for one of the two systems studied, not both**                                                          | Bratthall, Johansson, Regnell, "Is a Design Rationale Vital when Predicting Change Impact?", PROFES 2000. 17 subjects, industry and academia     | Small N; **the split result is the finding**, and it is the honest one to carry                                      |
| Nygard's template beat MADR on an overall score (Wilcoxon W = 84.0, p = 0.002, Cliff's delta 0.6364) — **after** expert screening had scored MADR higher (0.900 against 0.868)                                   | Nogueira, Silva, Conte, "One Size Fits All? An Empirical Comparison of ADR Templates", arXiv, submitted 2026-04-30. 33 undergraduates            | Undergraduates; the authors name this as their external-validity threat                                              |
| Introducing ADRs in a microservice company addressed documentation culture, knowledge transfer and prioritisation; challenges specific to **distributed** systems stayed open                                    | Ahmeti, Linder, Groner, Wohlrab, "Architecture Decision Records in Practice: An Action Research Study", ECSA 2024. 7 interviews, 3 months        | One company, three months, action research, no control                                                               |

**The dependent variable in every one of them is a property of the reader or of the corpus, never of
the system.** That is why the skill's honest-standing section says what it says.

## Asserted, never measured

- That capping, templating, or any particular field set improves anything.
- That immutability preserves value better than editing in place. Universally asserted; never tested.
- Zimmermann's ceiling: "Do not document everything; an AD log with more than 100 entries will
  probably put you readers (and you) to sleep, and be really hard to maintain." (2020, updated
  2026-03.) A practitioner's number with no study behind it — but named, dated and falsifiable, which
  is more than the surrounding folklore offers.
- Spotify's trigger (Josef Blake, 14 April 2020): "An ADR should be written whenever a decision of
  significant impact is made; it is up to each team to align on what defines a significant impact."
  Note what it concedes: the significance test is delegated, not defined.
- That recording a refusal reduces re-litigation. The mechanism is documented (MADR's `rejected`
  status; AWS's mandated written reason) and the rationale is named as an anti-pattern — Groundhog
  Day, which **pre-dates Richards and Ford**: Peter Cripps, 2010, verbatim, "Important architectural
  decisions that were once made get lost, forgotten or are not communicated effectively". No study
  measures it.

## Scale

**No study establishes a team or system size below which decision records are net-negative.** Four
searches found none. What exists is an upper bound and a collaboration condition, and no lower bound
at all.

| Datum                                                                                                         | Source              | What it supports                                                                                |
| ------------------------------------------------------------------------------------------------------------- | ------------------- | ----------------------------------------------------------------------------------------------- |
| Sustained sets are written by "two or more users over a longer period"; half of adopting repos stop at 1–5    | Buchgeher 2023      | A **collaboration** threshold, not a headcount one. The single-author set is the one that stops |
| An AD log over 100 entries "will probably put you readers (and you) to sleep, and be really hard to maintain" | Zimmermann 2020     | A **ceiling**, sourced and named — the only published number                                    |
| 15 records in about five and a half years on a project of roughly 30k stars                                   | Backstage, verified | The realistic **rate** for a well-run set: about three a year, not three a sprint               |

`architecture-trade-off-analysis` names "one team under about eight engineers" as its own too-small
test and flags it as a rule of thumb, not sourced. This skill does not add a second unsourced number:
its cap is on rate and volume, not on team size.

## Tooling, verified 2026-08-28

"Last commit" is the default branch head — the honest number, because several of these have a
`pushed_at` kept fresh by bots.

| Tool                                         | Latest release          | Last commit    | Stars | Verdict for a fitness function                                                                                                         |
| -------------------------------------------- | ----------------------- | -------------- | ----- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `adr/madr` (template only)                   | **4.0.0, 2024-09-17**   | **2026-08-28** | 2,427 | **Live.** The format is maintained. It is a template, not a checker                                                                    |
| `npryce/adr-tools`                           | 3.0.0, **2018-07-25**   | 2020-03-30     | 5,631 | **Dormant, not archived.** No release in eight years; issue #94 "Still maintained?" open since 2020-03-29. Do not cite as current      |
| `thomvaill/log4brains`                       | v1.1.0, 2024-12-17      | 2024-12-17     | 1,570 | **Stalled.** Issue #150, "Is this repo being maintained? yarn audit says 84 critical vulns", open since 2025-10-29                     |
| `adr/adr-manager`                            | v2.0.0, 2023-12-05      | 2026-05-18     | 162   | **Live but out of step:** its README supports "MADRs stored in the folder `docs/adr`" while MADR 4.0.0 says to create `docs/decisions` |
| `adr/adr-log`                                | 2.2.0, 2020-10-21       | 2023-01-05     | 106   | Dormant. adr.github.io lists it **twice** — once as MADR tooling, once under "Unmaintained tooling"                                    |
| `mrwilson/adr-viewer`                        | 1.5.0rc1, 2024-07-07    | 2024-12-02     | 191   | Dormant; the latest tag is a release candidate. Rendering only, no checks                                                              |
| `opinionated-digital-center/pyadr`           | v0.20.0, 2023-04-26     | 2026-05-08     | 58    | **Bot-only.** The five most recent commits are all `renovate[bot]`; no human commit found since 2024                                   |
| `joshrotenberg/mdbook-lint`                  | **v0.16.1, 2026-08-27** | **2026-08-27** | 29    | **Actively maintained, and the only checker found with real ADR semantics.** Created 2025-08-04, pre-1.0                               |
| `modeled-information-format/structured-madr` | v1.2.0, 2026-04-09      | 2026-08-03     | 10    | Live but very new (created 2026-01-15). JSON Schema plus a GitHub Action validating frontmatter and section order                      |
| `mbeacom/adrkit`                             | v0.12.0, 2026-08-27     | 2026-08-27     | 9     | Live, but created 2026-07-18 — weeks old, pre-1.0. Too new to depend on                                                                |
| `gwleclerc/adr` (Go)                         | v0.3.0, 2026-07-16      | 2026-08-20     | 3     | Live. Has `adr lint` with a non-zero exit                                                                                              |
| `zircote/git-adr`                            | v1.0.0, 2026-01-16      | 2026-08-24     | 13    | Live. Stores records in **git notes** rather than files                                                                                |
| `adr/adr-j`                                  | none                    | 2022-05-16     | 2     | Dead                                                                                                                                   |

Structurizr also supports decisions with a status ("Proposed", "Accepted", "Superseded", etc.) and a
force-directed graph of decision links — rendering and navigation, not checking.

**Three names to refuse.** Search results describe, fluently and in detail, a GitHub Action called
**"ADR Guard"** that fails a pull request when watched paths change without a record, with an
`ADR-Exempt:` waiver line. A direct repository search found nothing matching. **Treat it as not
verified to exist and do not name it in a recommendation.** `endjin/adr-cli` and
`GoogleCloudPlatform/adr-tools`, both named in secondary listings, return 404 from the GitHub API.

## The one governance option implementable end to end

`mdbook-lint` v0.16.1 validates against both Nygard and MADR 4.0 formats. It ships seventeen ADR rules.
Fifteen bear on a record's body and its cross-references, and are grouped into the nine rows below.
ADR001 (title format) and ADR009 (filename matches the ADR number) are omitted: both check how a
record is named, and naming is a repo convention this skill does not teach.

| Rule                     | Checks                                                                |
| ------------------------ | --------------------------------------------------------------------- |
| ADR002 / ADR007          | Status is defined; status value is recognised                         |
| ADR003 / ADR008          | Date is defined; date is ISO 8601                                     |
| ADR004 / ADR005 / ADR006 | Context, Decision, Consequences sections present (ADR006 Nygard only) |
| **ADR010**               | **Superseded records reference a replacement**                        |
| **ADR011 / ADR012**      | Sequential numbering, no gaps; no duplicate numbers                   |
| **ADR013**               | **Links to other records point to existing files**                    |
| ADR014                   | Required sections have meaningful content                             |
| ADR016                   | Considered Options lists at least two options (MADR)                  |
| ADR015 / ADR017          | Decision Drivers is a bullet list; Consequences split good/bad (MADR) |

ADR010 and ADR013 together are the supersession-link checking, and both are format-agnostic — which
is why they, and only they, are in the gate in `SKILL.md`. **ADR016 is not**: the rule page states
"Applies to: MADR format only" and it keys on the literal heading `## Considered Options`, so on a
Nygard-shaped set it is a check that cannot fail. On a MADR estate it is worth adding, as a
different characteristic — comparison honesty, not re-openability. **The caveat travels with the
recommendation: 29 stars, created 2025-08-04, pre-1.0. A gate on it is a gate on one maintainer**,
and this skill cannot offer an ArchUnit-equivalent because none exists in this domain.

## The two checks you write yourself

**Age of `status: proposed`.** No tool ships it. None of mdbook-lint, `structured-madr` or `adrkit`
was found to carry a rule that fails on a record proposed for N days; `pyadr`'s CLI covers the
lifecycle transitions ("proposal|acceptance|rejection|deprecation|superseding") but it is
bot-maintained. It is trivial to write from MADR 4.0.0's frontmatter, which gives `status` and `date`
as first-class fields — the strongest practical argument for that frontmatter over Nygard's prose
status line. Threshold from your own cadence: a record proposed for longer than the gap between
architecture reviews is not proposed, it is abandoned. **Site: scheduled, never a gate** — a stale
record is not the fault of the commit in front of you, and a gate that fails on someone else's
inaction gets disabled within a month.

**A pull request touching a flagged path must cite a record.** Write it as **one job that always runs
and decides internally whether the path matched**. Do not implement it as a workflow filtered by
`paths` / `paths-ignore` and then marked required: a workflow skipped by the filter never reports a
status, so the required check waits forever and the pull request cannot merge (GitHub community
discussions #26857 and #54877 are the standing reports). The only concrete implementation found was
`adrkit`'s Action, weeks old with 9 stars. Treat the check as bespoke.

## Failure records, and the counter-example

- **`npryce/adr-tools` stopped keeping its own decisions.** The reference implementation of ADR
  practice holds 9 records in `doc/adr`, `0001-record-architecture-decisions.md` through
  `0009-help-scripts.md`. Last commit touching that directory: **2018-06-26**. The repository kept
  receiving commits until **2020-03-30** — so for about 21 months the project changed while its
  decision log did not. This is the cleanest instance available of an ADR set that died, and it is
  the ADR tool.
- **The aggregate.** Buchgeher's ~50% at one to five records. Read carefully: it equally supports
  "abandoned after a pilot" and "most projects have fewer than five architecturally significant
  decisions". The study distinguishes them only by observing that sustained sets have two or more
  authors, which is a correlation. Do not overstate it.
- **Lost rationale driving a rewrite.** Magnus, 5 April 2023: "The existing design document just
  listed a way the system was, but not the reasons for it being that way", after which decisions were
  reversed because "the new team did not want to make what seemed like obvious mistakes", and a
  regression was reintroduced that "only a member of the original team could have pointed out."
  **A single practitioner's blog, no company named, no artefacts — illustration, not evidence.** It
  is the Chesterton's Fence shape (Chesterton, _The Thing_, 1929), which is a folk framing, not a
  source.
- **Quiet, but not dead.** `adr/madr` holds 26 records in `docs/decisions`, last touched 2024-10-08
  while the repo was pushed 2026-08-28; `log4brains` holds 14, last touched on the day of its final
  commit. **Neither is proof of abandonment** — a project can simply make no new decisions. Record
  them as observations.
- **The counter-example, which must travel with the failures.** Backstage runs 15 numbered records
  over about five and a half years. ADR013 "Proper use of HTTP fetching libraries" (added 2021-12-21)
  is titled `[superseded]` and carries an in-page note that it "has been superseded by ADR014 and no
  longer applies"; **ADR014 (added 2024-11-29)** states its own driver — the minimum requirement
  raised to Node.js 20 or newer, a "stable, reliable `undici` based native `fetch`", and a linked
  issue. ADR015 followed on 2025-08-05. Their index states the rule: records "are never deleted but
  can be marked as superseded by new decisions or deprecated", and if a record supersedes an older
  one, the older status becomes "superseded by ADR-XXXX" and links forward. **The re-opening trigger
  was a platform capability change with a defect attached, not a newer technology existing.**
