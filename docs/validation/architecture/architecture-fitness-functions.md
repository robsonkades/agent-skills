# Validation — `skills/architecture-fitness-functions`

**VERDICT (iteration 2, 2026-08-28): PASS.** Zero BLOCKER, zero MAJOR. 3 MINOR, 4 NIT carried, 1 NIT
new. Six of iteration 1's eleven findings fixed, including all three script defects and the only
counting failure. The script's exception is re-affirmed on fresh fixtures. Permanent record: both
iterations below, the Phase 4 findings with resolutions, the residual list with each item's shipping
reason, and the script exit codes observed across both iterations.

**VERDICT (iteration 1, 2026-08-27): PASS.** Zero BLOCKER, zero MAJOR. 7 MINOR, 4 NIT. The script
earns its exception.

---

# Iteration 1 — 2026-08-27

Validator: independent gate, skill 3 of 21. Read: the 6-file package, the research brief in full,
`skills/skill-engineering/SKILL.md`, `docs/skill-format.md`, and both dangerous neighbours
(`architecture-testing`, `quality-gates`) before judging item 9. Every tool-currency claim
re-verified over the network against the GitHub Releases API on 2026-08-28; `failBuildOnCVSS` and
`failBuildOnUnusedSuppressionRule` re-verified against the vendor documentation.

---

## 1. Technical accuracy — PASS

Every sourced claim traces to the brief and is quoted no further than the brief carries it. Spot-
verified against the brief: the Parsons objectivity line and its date (§1); the two book definitions
with the explicit "via reader notes, never the book text, so no page is claimed" hedge (brief §12.1
demanded exactly this); Juhls & Morales "start with about three" (§3); Parsons' contradiction quote
(§6); Ford's "an antagonistic, a police state" (§6); the four InfoQ judgement-bound categories
(§5.3); Li/Liang/Avgeriou 606 of 21,583 across four OpenStack and Qt projects (§8); Google ~4.2M
tests and the 1-in-6 commenter datum (§7.3); NIST SP 500-235's conditional position (§9.3);
`failBuildOnCVSS` = 11 on 0–10 (§9.1).

**Markings — the author's report overstates what the artefact does.** Visibly flagged: the ungoverned
declaration (`SKILL.md:139` "No source states this as a practice", repeated `ungoverned.md:112` "It
is this skill's construction"); the 2022-edition status of the taxonomy (`SKILL.md:61`); tool
currency provenance (`SKILL.md:107`, `catalogue.md:79-80`); the straitjacket folklore
(`disagreements-and-evidence.md:62`); the practitioner-reported timing claim (`:93`); page-level book
claims (`:105-109`). **Not flagged:** the independent-change-sources unit and its threshold, the
T/C/M/U set as a set, the "overrides outnumbering fixes" reversal signal, the per-mode price/reversal
column, and the handing-it-back section. See MINOR 6 — not a BLOCKER, because none of the five is
attributed to any named source, and because the sibling that passed five gates
(`architecture-characteristics`, "the unit is quantum count, not headcount") is unmarked in exactly
the same way. The convention across the suite is: a citation present means sourced, its absence means
the skill's own voice. That convention is applied consistently here.

## 2. Terminology — PASS

Seven axes, matching brief §2.1–2.7 one for one: atomic↔holistic, triggered↔continual,
static↔dynamic, automated↔manual, temporal, intentional/emergent, domain-specific. The last two are
correctly labelled "reminder, not a pole", which is the honest reading of brief §12.10 (they are the
least-used part of the taxonomy). The continual/continuous drift is flagged in the axis table itself
so a reader can match either word to a source (brief §2.2 asked for this).

The sharp distinction is preserved verbatim: SLO is "a continual + holistic + dynamic fitness
function **iff wired to a consequence** — an error budget that freezes deploys. On a dashboard it is
a metric." The same test separates the rest: quality gate is "a delivery mechanism for the
atomic/static/triggered ones"; architecture test is "a subset — always atomic, static, triggered";
SLA is "never one; it motivates one", with the headroom trap; metric is "the gap is exactly those
three missing clauses". `objective ≠ automated` and `governed ≠ measured` both appear, the latter in
a section heading. 2nd-edition status handled as unverified in all three places the brief required.

## 3. No unconditional recommendations — PASS

`SKILL.md:46-47`: "Nothing here is unconditional, this suite included: one check costs maintenance
and a suite costs more." Every one of the four modes carries a price-when-it-wins and a reversal
signal in the mode table's last column:

| Mode | Price even when right                                     | Reversal signal                     |
| ---- | --------------------------------------------------------- | ----------------------------------- |
| T    | rule changes on every legitimate architectural change     | its site cannot produce its metric  |
| C    | the largest tests you own; flakiness rises with test size | overrides start outnumbering fixes  |
| M    | scarce attention; drift invisible between dates           | only timing was blocking automation |
| U    | the residual is real and nobody watches it                | an agreement-free metric exists     |

Losing conditions live in the "Cost while working — who pays for a red with no defect behind it?"
column. Winning conditions are present but distributed across three places (the "When to use" list,
the drivers table, and the placement table in `catalogue.md`) rather than stated per mode; that is
weaker than skill 2's per-option format but the routing sentence at `SKILL.md:75-76` sends the reader
to the placement table by condition, so nothing is unreachable.

## 4. Trade-off completeness — PASS, and the strongest item in the package

The automated modes are not privileged. T's cost is "every change waits, including ones that could
not have broken it" and its price is "the expressible rule stands in for the one that matters". C
buys "an on-call rota; a false alarm wakes someone". M's objectivity is "depends on the written
criterion, never on the human" — a defence of manual review, not a concession. U gets a whole
reference file, a register schema and the script. The four legitimate reasons a check stays manual
are carried in `catalogue.md:21-26` with the brief's own distinction between the first three (is
automation possible or worth it) and the fourth (timing), plus the warning that a team filing
measurable things under the fourth has stopped governing them. `objective ≠ automated` is stated as
an axis property. No dimension appears only where it flatters an automated mode.

## 5. Trade-offs qualified — PASS

Dimension and direction come from the table's columns. Magnitude appears wherever the brief supports
one — latency as "minutes to a day", "seconds to minutes", "one cadence period", "unbounded"; the
1-in-6 flaky-to-real-bug datum with its caveat; ~4.2M tests. Where the brief has no magnitude
(maintenance cost of a suite) the skill says so rather than inventing one.

The measurement that confirms it in the reader's system is the "Earliest detectable symptom" column:
"It has never gone red"; "Nobody can state the baseline number without opening the file, and nobody
plots it"; "A re-run in the merge log with no accompanying code change"; "A new joiner's model of the
boundaries comes from the code and differs from the ADR". Each is observable without instrumentation.
`SKILL.md:170` adds "give the wait in minutes" — the T-mode cost made measurable.

## 6. Evangelism and evidence honesty — PASS

In the skill's own voice, `SKILL.md:176-181`: "**No study shows that fitness functions improve
outcomes** — no controlled study, no cohort comparison, no survey isolating the practice… Claiming
measured benefit here is lying." The adjacent evidence is correctly apportioned: Li/Liang/Avgeriou
supports the problem, DORA supports the characteristic — "the property, not how you preserve it".

Both live disagreements report both sides with names. The proponents' concession is quoted in the
body, not buried: the Radar's own "may encompass existing verification criteria, such as unit
testing, metrics, monitors, and so on". Kubowicz's linter reading and the type-erasure ceiling are in
the body and expanded in the reference with the concrete `Mono<SecretKey>` case. The closing line
takes no side: "Both predict the same practice; take neither." The Hohpe claim the brief marked
UNVERIFIED is carried into `disagreements-and-evidence.md:102-104` as a claim **not to repeat**.

## 7. Governance realism — PASS, and it beats skill 2's bar

Skill 2 set the bar with "borrowed, not chosen". This skill makes it a stated rule and enforces it in
the catalogue's own rubric: "Threshold column gives the **shape**, not a number you may adopt. Where
a number appears it names its provenance, and **a number without provenance is a number you have not
chosen.**" Every threshold in the row table is a pointer at a commitment the organisation already
made — "your published remediation policy's own score and window", "the allowlist legal already
signed", "the major bump your versioning policy already promised", "the figure already in the SLO",
"the budget derived from the connection profile your users measurably have", "the percentage your
finance owner will actually act on". `catalogue.md:66-75` then takes the one number everyone repeats
(complexity ≤10) and restores NIST's stripped conditions. This is a genuine improvement on skill 2:
provenance is a rule, not a habit.

Site matches the metric's shape throughout: dependency freshness is "nightly — **temporal**, so never
a PR gate"; deployability is "dashboard, reviewed monthly — **never a build gate**, because it trails
the change"; known-vulnerable deps are "PR **and** nightly", with the body explaining that the CVE
feed moves without your code.

**No dead tool is recommended.** The row table names _zero_ tools — an unusually disciplined response
to the brief's §9.4 lesson. Tools appear only in the worked example (OWASP dependency-check, Trivy,
Grype — all current) with an explicit currency disclaimer, and in the status table where the dead
ones appear _as_ dead. All flagged dead/stale tools are marked: Simian Army, Security Monkey,
JDepend, NetArchTest, Lighthouse CI, Structure101, Great Expectations.

**Network re-verification, 2026-08-28** (GitHub Releases API; the package's table claims currency "as
of 2026-08-27" and was verified by the brief, not the skill):

| Tool                   | Package claims                     | Observed 2026-08-28                           | Verdict   |
| ---------------------- | ---------------------------------- | --------------------------------------------- | --------- |
| OWASP dependency-check | v13.0.0, 2026-08-03, current       | v13.0.0, 2026-08-03; pushed 2026-08-27        | confirmed |
| SonarQube Server       | 26.8.0.126808, 2026-08-05          | 26.8.0.126808, 2026-08-05                     | confirmed |
| Trivy / Grype          | v0.74.0 / v0.118.0                 | v0.74.0 (08-14) / v0.118.0 (08-27)            | confirmed |
| Conftest               | current 2026-07/08                 | v0.69.0, 2026-08-03                           | confirmed |
| Chaos Mesh             | current 2026-07/08                 | v2.8.4, 2026-08-18                            | confirmed |
| LitmusChaos            | current 2026-07/08                 | 3.31.0, 2026-07-15                            | confirmed |
| Buf                    | current 2026-07/08                 | v1.72.0, 2026-07-17                           | confirmed |
| japicmp                | current 2026-07/08                 | japicmp-base-0.26.1, 2026-05-27               | confirmed |
| Infracost              | current 2026-07/08                 | v0.10.45, 2026-07-03                          | confirmed |
| Deptrac                | current 2026-08                    | 4.7.1, 2026-07-23                             | confirmed |
| dependency-cruiser     | current 2026-08                    | v18.2.0, 2026-08-10                           | confirmed |
| axe-core               | current 2026-04/08                 | v4.13.0, 2026-08-05; pushed 2026-08-28        | confirmed |
| pa11y-ci               | current 2026-04/08                 | 4.1.1, 2026-05-12; pushed 2026-08-11          | confirmed |
| Sloth                  | current 2026-04/08                 | v0.16.0, 2026-04-04                           | confirmed |
| ts-arch                | v5.4.1, 2024-12-23, slow           | v5.4.1, 2024-12-23; pushed 2026-03-26         | confirmed |
| NetArchTest            | v1.3.2, 2021-05-23, stale          | v1.3.2, 2021-05-23; pushed 2024-07-29         | confirmed |
| Netflix Chaos Monkey   | v2.1.3, 2025-01-06, quiet          | v2.1.3, 2025-01-06; pushed same day           | confirmed |
| Lighthouse CI          | v0.15.1, 2025-06-26, >1 yr         | v0.15.1, 2025-06-26; pushed 2026-03-27        | confirmed |
| Simian Army            | archived, push 2018-12-18          | `archived: true`, pushed 2018-12-18           | confirmed |
| Security Monkey        | archived, push 2021-02-11          | (brief-verified; repo archived)               | accepted  |
| Great Expectations     | repo moved, unverified             | API 301 — still moved                         | confirmed |
| Structure101           | acquired Oct 2024, unverified      | structure101.com → HTTP 301                   | confirmed |
| **JDepend**            | **"no releases"**, push 2020-04-10 | release **2.10, 2020-03-06**; push 2020-04-10 | **NIT 1** |

`failBuildOnCVSS` default of **11 on a 0–10 scale** confirmed verbatim from the vendor doc: _"The
default is 11 which means since the CVSS scores are 0-10, by default the build will never fail."_
`failBuildOnUnusedSuppressionRule` confirmed present, default `false` — so the body's "turn it on"
advice is correct.

## 8. Scale honesty — the argument holds

The author rejected skill 2's quantum-count unit for **independent change sources**: "how many teams,
contractors or agents can merge a change to the thing the rule protects without a shared reviewer",
justified as "`architecture-characteristics` moved off headcount onto quantum count because quanta
measure the problem; here the organisation _is_ the problem — governance exists where judgement stops
scaling across people who never meet."

**Judged on its merits: a genuine domain distinction, not a number wearing a rationale.** The unit is
derived from the failure the skill exists to prevent, and the derivation is checkable. The failure is
"a driving characteristic violated by someone not in the review". What predicts that is who can merge
without a shared reviewer — not how many deployable units exist. One quantum with four merging teams
needs governance; four quanta owned by one co-located pair does not, and a quantum count gets both
backwards. It is also the only unit under which "an agent with commit rights" is a trigger, which is
the case the suite will meet most often from here.

Two further points in its favour. First, it does not contradict skill 2 — it explains why it
diverges, and both skills' reasoning survives. Second, the threshold is deliberately qualitative (one
source versus more than one, plus "no shared reviewer"), so it claims no precision it cannot support;
compare the numeric thresholds that the counting check exists to catch. The transferability claim is
correct: skill 2's reasoning genuinely does not transfer, because a quantum is a property of the
system and a review boundary is a property of the organisation.

## 9. Scope hygiene — a real split against both neighbours, verified after reading both

**Against `architecture-testing`.** That skill owns test levels, ArchUnit rule authoring, query
budgets, the two-thread concurrency test, Testcontainers, contract-test mechanics. This package
contains **no** rule syntax, no test level, no query budget, and — decisively — a catalogue whose row
table names zero tools. ArchUnit appears exactly twice: `FreezingArchRule`'s _semantics_ as a
governance fact ("fails only on new violations and does not enforce that the count falls"), and
Kubowicz's linter critique in the disagreements reference. Neither teaches mechanics. The "Contract
satisfaction" catalogue row gives a metric, threshold and site, never how to write a Pact test.
Zero text overlap. Clean.

**Against `quality-gates`.** The closest brush in the package, and the one the author flagged. That
skill owns: which gate set a change must face, pipeline placement by change risk, the Java toolchain,
**ratcheting onto a legacy codebase**, and bypass mechanics. This package hands all of that over
explicitly and by name — in the description ("pipeline composition and ratcheting onto a legacy
codebase (quality-gates)"), in the body ("Not here: … which checks a change must pass, or introducing
one onto a codebase that already fails it"), and inside a catalogue cell ("zero new (baseline the
rest — that baseline is `quality-gates`)").

What it keeps is the residue: **`FreezingArchRule` does not enforce that the count falls, so a
baseline is not a ratchet.** I checked `quality-gates` for this and it is genuinely absent — that
skill says "baselining current violations and failing only on new ones" and stops there. It never
mentions a freeze store, a stale baseline, or the obligation to pay one down. The failure-signature
row "The pawl nobody pulled" is a governance-health diagnosis ("the rule is documentation with a
build step attached"), not a ratcheting instruction. **This is a thin split, but a real one**, and it
is signposted in both directions.

Two secondary checks that could have produced a collision and did not:

- `quality-gates` rules "Never gate on a coverage percentage." The author **dropped** the brief's
  coverage row (#5, "testability proxy, ≥80% on new code") from the catalogue. Coverage survives only
  as a caution (SonarQube's 80% named as a _vendor default_ "not derived from your risk") and as the
  Fowler assertion-free case in the references. The neighbour is actively respected, not merely
  avoided.
- Red-handling: `quality-gates` gives two outcomes (fix the cause, remove the gate deliberately);
  this skill gives three, scoped to a governed characteristic rather than a pipeline stage, and adds
  the contradiction case. More granular on a different subject. Not a collision.

Placement is the one shared vocabulary: `catalogue.md` maps classification → home → consequence,
while `quality-gates` maps change risk → gate set → stage. Different input axis, same output space,
and the fitness-function rule ("the earlier it runs, the more binary it must be") is a statement
about objectivity versus stage that has no analogue next door. **No misroute found. This does not
repeat skill 1's error.**

## 10. Diagram accuracy — N/A

No diagrams, none expected. The three fenced blocks are records (a fitness-function entry, an ADR, a
JSON register), not depictions of a mechanism.

## 11. Trigger quality — PASS

Judged from descriptions alone. Twelve prompts; see the table at the end of this report. Seven
positives all land on the eight situations the description names, each phrased close enough to the
description to route unambiguously. Five near-miss negatives all route away correctly, each to a
skill this description names in its exclusion clause. The two prompts with genuine competition (the
SLO-with-no-consequence one, against `slo-and-alerting`; the contradicting-checks one, against
`architecture-trade-off-analysis`) resolve correctly because the description carries the situation
verbatim and disclaims the neighbour's subject explicitly. The riskiest — the stale freeze store,
against both `quality-gates` and `architecture-testing` — also resolves correctly: neither neighbour's
description mentions a baseline that has not shrunk.

## 12. Internal consistency — PASS with two findings

- **Frontmatter vs `skill.yaml`**: byte-identical, **1022 characters each**, verified by
  normalising the folded scalars and comparing. The author's claim is exact.
- **Description vs body**: all eight named situations are answered in the body — no check anywhere
  (§When to use), "maintainable" (§What cannot be governed), a threshold that cannot fail (worked
  example + failure signature row 1), the SLO dashboard (terminology table + ADR "without that
  freeze it was a dashboard for two years"), a trailing metric as a PR gate (placement rule +
  deployability row), the frozen baseline (failure signature row 2), the green pipeline (row 3), the
  contradiction (§When one goes red). Nothing promised is missing.
- **References vs body**: each of the three is routed by an explicit condition ("Read when choosing a
  metric and a site", "Read before declaring a characteristic ungoverned", "Read when someone calls
  it proven"). No duplication beyond deliberate one-line restatements.
- **Script vs body**: `SKILL.md:141-142` claims it "fails an entry claiming governance with no
  consequence, or ungoverned with no owner or a lapsed review date". All three verified true. The
  five rules in `ungoverned.md:97-110` are all enforced except for the cadence-vocabulary gap — see
  MINOR 2. The register example embedded in `ungoverned.md` was extracted verbatim and run through
  the script: **exit 0**. Schema and script agree.
- Two findings: MINOR 1 (catalogue title promises a consequence column it does not have) and MINOR 5
  (the `order-intake` quantum has 5 entries in the ADR and 3 in the register example).

---

## MINOR

**MINOR 1 — `catalogue.md`'s title promises a consequence column the row table does not have.** The
H1 is "Catalogue: metric, threshold shape, site, consequence"; the row table's columns are
Characteristic | Metric | Threshold shape | Site | Class. The consequence must be composed by taking
the Class value into the Placement table above. It is derivable and the Class column is the key, but
in a skill whose thesis is "no consequence, a dashboard", consequence is the one clause omitted from
the catalogue, and a reader copying a row gets a dashboard. (`SKILL.md:192-193` routes to the file
accurately — it says "classification" — so the mismatch is internal to the reference.) Fix: add a
Consequence column, or retitle to "…site and class".

**MINOR 2 — the script silently skips the lapse check on an unrecognised `cadence`.** Verified:

```json
{
  "characteristic": "odd-cadence",
  "governance": "M",
  "metric": "m",
  "criterion": "c",
  "cadence": "when we remember",
  "lastVerdict": "2019-01-01",
  "owner": "a",
  "review": "2027-01-01"
}
```

exits **0**. `CADENCE_MONTHS` has five keys (`weekly`, `monthly`, `quarterly`, `half-yearly`,
`annually`); `allowed === undefined` falls through with no failure and no warning. The accepted
vocabulary is documented nowhere — not in `ungoverned.md`'s register schema, not in the script's
header comment. `ungoverned.md:103-104` states the rule unconditionally: "An `M` entry needs a
`lastVerdict` inside one cadence period. A manual check whose verdict has lapsed has silently become
ungoverned, and nobody was told." For any cadence word a reader invents, the script is precisely the
skill's own "It shipped unable to fail" archetype. One-line fix: `fail(name, 'unrecognised cadence')`
when `allowed === undefined`, and list the vocabulary in the schema.

**MINOR 3 — `weekly` maps to 1 month.** A weekly manual check whose last verdict is four weeks old
passes (verified: `cadence: "weekly"`, `lastVerdict: "2026-08-01"`, `--today=2026-08-28` → exit 0).
`monthsBetween` is month-granular by design ("enough for cadence arithmetic"), which makes `weekly`
indistinguishable from `monthly`. Fix: day arithmetic for sub-monthly cadences, or drop `weekly` from
the map so it fails under MINOR 2's fix.

**MINOR 4 — an empty register reports green.** `{"entries":[]}` → `OK — 0 characteristic(s): 0
governed, 0 ungoverned on the record.`, exit 0. A register that governs nothing is the most complete
form of the failure this script exists to catch, and it is the one input that produces a clean bill
of health. Fix: fail, or at minimum warn, on zero entries.

**MINOR 5 — cross-file entry count for the `order-intake` quantum: 5 in the ADR, 3 in the register.**
`SKILL.md:156-166` governs `order-intake` with security→T, availability→C, elasticity→T,
deployability→M and maintainability ungoverned, and its Compliance line says "FF-04, FF-06, FF-11,
FF-14 and one ungoverned entry, **in the register the nightly script checks**" — five entries. The
register example in `ungoverned.md:61-95` carries `"quantum": "order-intake"` and has **three**:
security, deployability, maintainability. Availability and elasticity are absent from the artefact
the ADR points at. Both are illustrative, but they share a quantum name and the ADR explicitly names
the register as its compliance artefact. Fix: rename one quantum, or complete the register.

**MINOR 6 — the author's report to this gate overstates the unsourced markings.** Eight items were
reported as flagged; five carry no visible marking (independent-change-sources unit and threshold;
T/C/M/U as a set; "overrides outnumbering fixes"; the per-mode price/reversal column; the
handing-it-back section). Not a BLOCKER: nothing is attributed to a named source, and
`architecture-characteristics` leaves its own size unit ("the unit is quantum count, not headcount")
unmarked in exactly the same way after five gates, so this matches suite precedent. Reported so the
author stops claiming a discipline the artefact does not apply. If the suite wants the marking, it
needs it in skill 2 as well.

**MINOR 7 — the line-length self-report is wrong.** Three prose lines over 100 characters were
reported (112, 136, 171). Measured, excluding table rows and fenced blocks, there are **seven**: 27
(120), 61 (182), 100 (108), 136 (134), 170 (103), 171 (202), 197 (103). No house rule is breached —
`.prettierrc.json` sets `printWidth: 100` with prettier's default `proseWrap: preserve`, so prose is
never rewrapped, `prettier --check` passes, and `architecture-characteristics` ships 46 such lines.
This is a reporting error, not a defect in the artefact.

## NIT

1. `catalogue.md:97` says JDepend has "no releases". The GitHub API returns release **2.10**
   (2020-03-06). The push date (2020-04-10) and the verdict ("do not recommend") are both correct;
   the error is inherited verbatim from the brief's §10 table.
2. `ungoverned.md:11-12` decomposes reliability into "availability, testability, data integrity, data
   consistency and fault tolerance". That decomposition is not in this skill's brief and carries no
   marking, sitting inside a paragraph that opens by citing _Fundamentals_ ch. 6. It is correct and
   is sourced in the sibling skill
   (`architecture-characteristics/references/definitions-and-composites.md:94`), so no reader is
   misled — but it is the one place where an uncited claim reads as part of a cited one.
3. SLI has no row of its own in the terminology table (brief §10 gives it one). The clause "the SLI
   is the metric, so not yet one" inside the SLO row preserves the distinction; a reader scanning for
   the term finds no row.
4. "Chaos experiment" and the brief's "the steady-state hypothesis **is** the threshold" framing
   survive only as the catalogue's Resilience row. Nothing load-bearing is lost, but that was a clean
   one-line illustration of the metric/threshold/consequence shape.

## The 183-line cap — nothing load-bearing was lost

The body is exactly **183 lines** (198 total minus 15 of frontmatter), matching the author's claim.
Two items were displaced:

- **Fowler's `AssertionFreeTesting` case** → `disagreements-and-evidence.md:21`, where it appears in
  full ("every public method had a JUnit test, a green bar was demonstrated to the client, and the
  tests contained no assertions at all") in the evidence table's "what it shows" cell. Its function —
  proving that a metric made a target is gamed — is served in the body by the `failBuildOnCVSS` case,
  which is the stronger instance because it is a shipped default rather than a consultancy's
  behaviour. Correct call.
- **The "no consequence = dashboard" restatement** → `ungoverned.md:102`. But the claim itself is
  _not_ displaced: it is in the body twice, at `SKILL.md:27` ("No consequence, a dashboard; no site,
  a wish") and in the terminology table's Metric row. Only the restatement moved.

Nothing load-bearing was lost to the cap. For comparison, `architecture-characteristics` (198) and
`architecture-trade-off-analysis` (199) sit at the same size; `architecture-testing` is 146 and
`quality-gates` 83.

---

## Script verdict — EARNS ITS PLACE

`scripts/check-governance-register.mjs`, 129 lines, Node, zero dependencies. First `scripts/`
directory in a repo of 210 skills, so the precedent matters more than the file.

**Test evidence.** I constructed my own registers rather than reusing anything in the package.

_Clean register_ — 4 entries (T with metric/threshold/site/consequence; C likewise; M with criterion,
quarterly cadence and a verdict from 2026-07-02; `none` with a risk sentence), all with owners and
live review dates, `reviewed: 2026-03-01`:

```
clean.json: OK — 4 characteristic(s): 3 governed, 1 ungoverned on the record.
EXIT=0
```

_Hostile register_ — 6 entries, one defect class each, `reviewed: 2024-01-05`:

```
hostile.json: 9 problem(s)
  - security: governance must be one of T, C, M, none — found "U"
  - performance: governed with no threshold — a metric alone is a dashboard
  - performance: governed with no consequence — a metric, not a fitness function
  - availability: review date 2025-06-01 has passed
  - availability: governed with no consequence — a metric, not a fitness function
  - failover: manual verdict last recorded 2025-01-04, past its quarterly cadence
  - maintainability: declared ungoverned with no "risk" sentence naming what is exposed
  - portability: no owner
  - register: last reviewed 2024-01-05 — BEA ch. 2 asks for a review at least once a year
EXIT=1
```

All six claimed detections fire — invalid mode, missing threshold, missing consequence, lapsed
review date, lapsed manual verdict, ungoverned without a risk sentence — plus missing owner and the
register-level annual review, which the author did not claim. Note the `"U"` case: a reader who takes
the mode letter from the body's table and writes it into the register gets a clear error naming the
four legal values, which is the right behaviour and is documented at `ungoverned.md:99`.

_Exit 2 paths_, all four verified: malformed JSON (`cannot read register …: Expected property name
or '}' …`), missing file (`ENOENT`), no argument (usage line), malformed `--today`
(`--today must be YYYY-MM-DD, got 28-08-2026`), and a register with no `entries` array.

_Schema/script agreement_: the JSON register embedded in `ungoverned.md` was extracted verbatim and
run — exit 0. The documented schema and the executable agree, which is the property most likely to
have drifted and did not.

**Does it provide a capability the body cannot?** Yes, on three counts.

1. **It fails a build on a clock.** Prose can state that a lapsed manual verdict is silently
   ungoverned; only a program run nightly turns that into a red build. Nothing about a stale
   governance record changes when code changes, so no code-triggered check can catch it. This is the
   brief's own temporal category applied to the practice's own artefact, which is a construction the
   body could describe but not perform.
2. **It makes the skill's central claim enforceable.** "A metric with no consequence is a dashboard"
   is the thesis; `fail(name, 'governed with no consequence — a metric, not a fitness function')` is
   that thesis with teeth. A skill about governance that only _describes_ governance would be the
   failure it warns about.
3. **It made the schema falsifiable.** The register in `ungoverned.md` is not decoration — it is an
   input format with a checker, and I could verify the two agree. Documentation alone offers no such
   check.

Against: the script's value is contingent on adopting a register format that no source states as a
practice. That is the strongest cut argument, and it is answered honestly in the package itself
(`SKILL.md:139`, `ungoverned.md:112` both say so out loud). The construction is marked, not smuggled.

It is not an illustration wearing an executable's clothes: it has three exit-code semantics, five
error paths, an injectable clock (`--today`) that makes it deterministically testable, and it
enforces rules the prose only states. It also satisfies `skill-engineering`'s own trigger — "IF the
same mechanical operation would be re-derived on every run THEN write a script and have the body
invoke it" — and the body does invoke it, by condition, at `SKILL.md:141`.

**Recommended precedent for the remaining eighteen skills:** a `scripts/` directory is justified when
the script does something a reader cannot get by reading — here, a build that goes red on a date with
no code change. An executable that only demonstrates what the body already says should be cut. This
one passes that test; MINOR 2–4 are three one-line fixes, none of which changes the verdict.

---

## Counting spot-check

The author reports 24 count-claims, each re-derived, and two errors caught. That total is not
evidence and was not used. I re-derived six selections, chosen where an error would matter most (a
count a reader acts on) and where drift is likeliest (counts split across files — the shape of all
four errors found in skill 2, and of several in skill 1).

| #   | Claim                                                                 | Chosen because                                                      | Re-derived                                                             | Result   |
| --- | --------------------------------------------------------------------- | ------------------------------------------------------------------- | ---------------------------------------------------------------------- | -------- |
| 1   | `order-intake` register contents: ADR names 4 governed + 1 ungoverned | **cross-file** count, same named artefact — the highest-drift shape | ADR = 5 entries; `ungoverned.md` register for the same quantum = 3     | **FAIL** |
| 2   | "Axes from _BEA_ ch. 2" — the seven-axis taxonomy                     | a reader may cite it; brief §12.10 warns two axes are contested     | body table rows = 7; brief §2.1–2.7 = 7; one-for-one                   | pass     |
| 3   | "**Four** things deterministic checks cannot see"                     | stated as a number in the body **and** tabulated in a reference     | body names 4 bolded; `ungoverned.md` table = 4 rows; brief §5.3 = 4    | pass     |
| 4   | "the **four** legitimate reasons a check stays manual"                | 3 + 1 from different sources — the classic off-by-one               | body names 4; `catalogue.md:21-26` gives 4; brief = 3 (BEA) + 1 (Ford) | pass     |
| 5   | "**three** legitimate outcomes" when one goes red                     | a reader acts on this list directly                                 | body lists fix / change deliberately / retire = 3; brief §6 = 3        | pass     |
| 6   | description "byte-identical at 1022 chars"; body "183 lines"          | mechanically checkable; a wrong self-report predicts others         | 1022 = 1022, strings identical; 198 − 15 frontmatter = 183             | pass     |

Two further derivations run opportunistically, both pass: the evidence figures (606 of 21,583 across
four OpenStack and Qt projects; ~4.2M tests; 1-in-6) all match the brief exactly; the catalogue row
table has 21 rows against the brief's 22 — the author dropped the coverage row deliberately to
respect `quality-gates`, and makes no count claim about the total, so there is nothing to drift.

**One error found (MINOR 5), in the cross-file selection — the same place skill 2's errors lived.**
The five within-file counts are all correct, which is consistent with the author having re-derived
them; the count that spans two files is the one that slipped, which is the pattern this check exists
for.

---

## Trigger prompts — judged from descriptions alone

**Positives (must select `architecture-fitness-functions`)**

1. "ADR-021 names elasticity as a driving characteristic, but nothing in our build or our dashboards
   checks it. What now?" → description: "a driving characteristic has no check anywhere". Clean.
2. "Leadership wants 'maintainable' adopted as a measurable goal for the platform." → "when
   'maintainable' is proposed as the thing to measure". Clean.
3. "We added a dependency scanner a year ago. It produces a report on every build and has never once
   failed." → "when a scanner ships a threshold that cannot fail". `quality-gates` competes on "a
   check is routinely bypassed or its failures ignored" — but a check that never fires is neither
   bypassed nor ignored, and the phrase here is verbatim.
4. "We call our 99.9% availability SLO a fitness function, but nothing actually stops when we miss
   it." → verbatim in the description. `slo-and-alerting` competes; it owns windows, good-event
   definitions and burn-rate alerting, none of which is asked here, and this description disclaims
   error budgets and paging by name. Correct.
5. "Someone proposed gating pull requests on our change-failure rate." → "when a trailing metric is
   proposed as a pull-request gate". `quality-gates` competes on "a coverage or static-analysis
   threshold is being proposed"; CFR is neither. Correct.
6. "Our frozen violation store was committed 18 months ago and it is exactly the same size today." →
   "when a frozen baseline has not shrunk in a year". The riskiest prompt in the set: `quality-gates`
   owns ratcheting and `architecture-testing` owns ArchUnit. Neither description mentions a baseline
   that has stopped shrinking, and the question is governance health, not rule authoring or
   introduction. Correct — and this is exactly the boundary the author claims.
7. "Our latency check and our data-freshness check now contradict each other; we cannot satisfy
   both." → "when two checks contradict each other". `architecture-trade-off-analysis` competes and
   is correctly the _second_ stop; this description defers the analysis method to it by name, and the
   body hands over at the contradiction.

**Near-miss negatives (must route elsewhere)**

8. "How do I write a rule that forbids the web layer from importing the persistence package?" →
   `architecture-testing`. Disclaimed here as "writing the test".
9. "Our pipeline runs everything on every change, takes 40 minutes, and people push without running
   it." → `quality-gates` (verbatim: "the build is slow enough that people push without running
   it"). Nothing here concerns pipeline speed.
10. "We're introducing a static analyser onto a 12-year-old codebase that produces 400 findings
    today." → `quality-gates` ("ratcheting a gate onto a codebase that already violates it"),
    disclaimed here verbatim.
11. "Our benchmark job on the shared runner fails on a 3% delta we cannot reproduce." →
    `performance-regression-ci` ("a benchmark job runs on a shared runner"), disclaimed here as "CI
    thresholds".
12. "We need to pick the window, decide which status classes count as errors, and set up burn-rate
    alerts for our availability SLO." → `slo-and-alerting`, disclaimed here as "error budgets and
    paging".

Also checked and routing away correctly: "we have not decided which characteristics this service is
built for" → `architecture-characteristics` ("deriving the list", disclaimed); "saga or distributed
transaction, given we need consistency and availability" → `architecture-trade-off-analysis` ("the
analysis method", disclaimed); "rename `OrderService` and update its callers" → no skill.

**No misroute found.**

---

## Mechanical — real output

```
$ node packages/cli/bin/agent-skills.mjs validate skills/architecture-fitness-functions
architecture-fitness-functions@1.0.0

  C:\git\agent-skills\skills\architecture-fitness-functions
  6 files

✓ Valid — no issues found
EXIT=0

$ npx prettier --check "skills/architecture-fitness-functions/**/*.{md,yaml,mjs}"
Checking formatting...
All matched files use Prettier code style!
EXIT=0

$ wc -l skills/architecture-fitness-functions/SKILL.md \
        skills/architecture-fitness-functions/references/* \
        skills/architecture-fitness-functions/scripts/*
  198 SKILL.md
  105 references/catalogue.md
  109 references/disagreements-and-evidence.md
  139 references/ungoverned.md
  129 scripts/check-governance-register.mjs
  680 total
```

`registry:build` and `verify` deliberately not run — seven unrelated `gof-*` packages lack
`skill.yaml` and both abort.

---

# Iteration 2 — 2026-08-28

Re-read from disk in full: `SKILL.md` (198 lines, body 183), `skill.yaml`, three references
(`catalogue.md` 105→136, `ungoverned.md` 139→169, `disagreements-and-evidence.md` 109 unchanged),
and `scripts/check-governance-register.mjs` (129→158). The script was re-tested against **new**
fixtures built for this iteration — not iteration 1's, not the author's. Mutation-runner currency
checked over the network. The full routing suite was re-run against the rewritten description, plus
the two Phase 4 prompts that contested with `architecture-testing`.

**No BLOCKER. No MAJOR.** Nothing new is factually wrong, no dead tool is recommended, no
unconditional recommendation appeared, no evangelism was introduced, and no scope collision opened.

## Phase 4 findings — resolution verified

| #   | Finding                                                      | Resolution shipped                                                                                                                                                                                                                                                                                                  | Verified                                                                          |
| --- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| 1   | MAJOR — no procedure for an inherited estate                 | `## Before deciding, when something already exists`, ahead of the mode decision: four ordered steps, `git blame` on the suppression file, three eliminating questions, route survivors into T/C/M and declare the rest U, deadline rule, plus the provisional-list clause routing to `architecture-characteristics` | **Fixed.** Terminates, does not loop, does not presuppose the list — item 1 below |
| 2   | MAJOR — governance pushed ahead of diagnosis                 | New opening step: "which number, read before the merge, would have been red?" with both branches                                                                                                                                                                                                                    | **Fixed**, with one near-exception worth a clause — MINOR 8                       |
| 3   | Maintainability decomposition missing                        | `catalogue.md` §"Maintainability, decomposed": five constituents, the row governing each, what each does not see, the residual sentence, and the coverage-gate redirect                                                                                                                                             | **Fixed.** Marked as the skill's construction; ISO routed away — item 4           |
| 4   | Mutation-testing row absent                                  | "Test signal" row: mutation score on changed code, own first full run as the baseline, PR-on-diff plus nightly full run                                                                                                                                                                                             | **Fixed.** The currency hedge can now be upgraded — MINOR 9                       |
| 5   | Description did not lead with the testing-vs-governing split | Opening clause now carries "— not how the test is written"; two new situations for the inherited-estate and incident entry points; 1019 chars, byte-identical in both files                                                                                                                                         | **Fixed**, with a routing cost on two prompts — MINOR 10                          |
| 6   | Iteration-1 defects                                          | Script MINOR 2/3/4, counting MINOR 5, marking MINOR 6, JDepend NIT 1                                                                                                                                                                                                                                                | **All fixed** — see Regression                                                    |

## 1. Does the triage path terminate? — YES

Four ordered steps, and every object entering it exits at a named terminal:

- A **rule** exits at step 2 (fails one of the three eliminating questions → retired) or at step 3
  (routed into T, C or M). There is no third destination and no return edge to step 1.
- A **characteristic** exits at step 3, either carrying a survivor rule or declared **U**.
- Step 4 is not a loop but an ordering constraint on steps 2–3 under time pressure ("Retire and
  declare first").

**It does not presuppose the characteristic list it is meant to survive without.** Step 2's first
eliminating question ("which characteristic does it defend") looks like it requires one, and line 60
closes the gap: "If the caller cannot state the characteristic list at all — the normal inherited
case — derive a provisional one from the surviving rules, each of which defends something, and send
it to `architecture-characteristics`." The construction is non-circular by design: a rule that
defends nothing nameable is eliminated at step 2, so **by construction** every survivor names a
characteristic, and the provisional list is the image of the survivor set. The list is an _output_ of
the triage, not an input to it. That is the right dependency direction, and it is the clause that
makes the section usable by the caller who actually arrives.

**"Retiring a rule is a legitimate outcome" does not collide with the three legitimate outcomes.**
Different subjects, checked against iteration 1's verified text: the three outcomes (fix the code;
change the check deliberately with a recorded reason; retire it) govern **a red check already in the
suite** and live under "When one goes red" in the steady state. Triage governs **an inherited rule of
unknown provenance**, before any mode has been chosen, under a heading that says "Before deciding".
`retire` appears in both with one consistent meaning. Triage is not smuggling in a fourth outcome for
a red check — step 2's eliminations are pre-decision, and nothing in the triage section is reachable
from the red-check path.

## 2. The diagnostic step's logic — holds, with one near-exception that wants a clause

The claim: _"which number, read before the merge, would have been red? … None would ⇒ the threshold
value was never the problem, and moving it governs nothing: you are missing a metric, not a number.
One would ⇒ that is the metric, and its site is the earliest place it could have been read."_

The step is sound for the case it targets, and the second branch does real work the rest of the skill
could not: it derives **site** from evidence rather than from taxonomy — the earliest artefact that
carried the signal is the site. That is the strongest single sentence added in this iteration.

**Is there a case where every candidate metric would have been green and the threshold really was the
problem?** Yes, one: **the miscalibrated threshold on a metric you already have.** An incident is
caused by p99 at 380 ms; you measure p99 on the pull request; your threshold is 400 ms, so the check
was green. Read as "which check failed?", nothing was red, and the first branch concludes "you are
missing a metric" — which is false. You have exactly the right metric, at the right site, with a
number nobody derived from user tolerance.

The step survives it, but only on a careful reading. Its wording is "which **number**, read before the
merge, would have been red" — _number_, not _check_ — so the p99 reading of 380 ms **is** the number,
and against a tolerance derived from the incident it would have been red. That lands the case in the
"one would" branch, which is correct, and the branch then does the right thing (that is the metric;
its site is the PR). But "would have been red" invites the "red as configured" reading, and an agent
taking it will spend a step hunting for a metric it already has.

**MINOR 8** — the exception is real and narrow. One clause fixes it, e.g. after the first branch: _a
metric that measured the incident but was compared against too loose a number is the "one would"
case — you have the metric and the site, and the number is what you never derived._ It matters
because the first branch's conclusion is a strong claim ("moving it governs nothing") and this is the
one configuration in which it is wrong.

## 3. The deadline rule — genuinely actionable, not a slogan

_"Under a deadline, green by a date cannot be the goal, since retiring everything achieves it; the
goal is that every remaining red is one somebody chose. Retire and declare first."_

Three things a slogan would not supply:

1. **A named degenerate solution.** "Retiring everything achieves it" is a reductio, not a warning —
   it identifies the exact strategy the deadline incentivises and the exact reason it is void. A
   reader can check whether their own plan _is_ that strategy.
2. **A replacement goal that is checkable.** "Every remaining red is one somebody chose" is auditable
   against the register: enumerate the reds, and for each ask which entry chose it, who owns it, and
   when it is reviewed. The `id`, `owner` and `review` fields make that a mechanical pass, and
   `check-governance-register.mjs` performs part of it.
3. **An ordering instruction with a reason.** "Retire and declare first" is correct under time
   pressure specifically because eliminations and U declarations shrink the set that must be fixed
   before any fixing starts, and because both are cheap and reversible where fixes are neither.

It also composes with the rest of the package rather than standing alone: the output of "retire and
declare first" is a register, and the register has an executable check. Passes.

## 4. The maintainability decomposition — marked, sourced where sourceable, ISO routed away

**Marking**: `catalogue.md:71-73`, bold and immediately above the table — "**The split below is this
skill's construction**: any decomposition survives provided each constituent has a metric two
reviewers would read the same way." Visible, in the right place, and it states an acceptance test
rather than merely disclaiming, which is stronger than any iteration-1 marking.

**ISO routing**: "ISO/IEC 25010 publishes its own sub-characteristics; quality models belong to
`architecture-characteristics`, not here." Correct destination — that skill carries
`references/taxonomy-and-iso.md` with the ISO 25010 mapping. No quality model is asserted here.

**Constituents against the brief.** The brief supports the decomposition _move_ (§5.2: composites
decompose, the composite does not; agility = modularity + testability + deployability) and supports
complexity-as-proxy for maintainability (§5.1), but gives no maintainability decomposition — hence
the marking, correctly applied. All five constituents map to rows that exist in the table above
(verified one by one: Layer/dependency direction, Acyclic components, Complexity ceiling, API
compatibility, Test signal), each carries a "what it does not see", and three of those blind spots
are the InfoQ categories reused honestly (boundary fidelity; semantic contract drift; assertion
quality). The residual sentence is load-bearing and is exactly the deliverable brief §5.2(c) said
everybody skips: "nothing here observes whether the design is understandable to somebody who did not
write it."

The coverage-gate note is the best addition in the reference. It redirects the request people
actually arrive with ("raise the coverage gate") using Fowler's _AssertionFreeTesting_ — which
iteration 1 recorded as displaced into a reference and which now does load-bearing work — and it
**agrees with** `quality-gates`' rule "Never gate on a coverage percentage" instead of competing with
it. Mutation score earns the row precisely because it closes the gap coverage cannot.

## 5. Mutation-runner currency — the hedge stands as honest, and can now be replaced

`catalogue.md:131-132`: "**Mutation runners (PIT for the JVM, Stryker elsewhere) were not in the
research brief's currency sweep and are unverified here** — check them yourself before the
test-signal row depends on one."

Checked over the network on 2026-08-28, the same treatment given ArchUnit and k6:

| Runner                    | Repo                                        | Latest release            | Date           | Repo pushed | Verdict                        |
| ------------------------- | ------------------------------------------- | ------------------------- | -------------- | ----------- | ------------------------------ |
| **PIT**                   | `hcoles/pitest`                             | **1.30.0**                | **2026-08-27** | 2026-08-27  | current — released _yesterday_ |
| **Stryker-JS**            | `stryker-mutator/stryker-js`                | **v10.0.0**               | 2026-08-14     | 2026-08-27  | current                        |
| **Stryker.NET**           | `stryker-mutator/stryker-net`               | **dotnet-stryker@4.16.0** | 2026-07-03     | 2026-08-27  | current                        |
| mutation-testing-elements | `stryker-mutator/mutation-testing-elements` | v3.9.0                    | 2026-07-27     | 2026-08-23  | current                        |

None archived. Both named runners are among the most actively maintained tools in the whole
catalogue — PIT's release is more recent than any other entry in the tool-status table.

**Verdict: the hedge is honest and correctly scoped** — it claims only that _this skill_ did not
verify, which is true, and the package's discipline is to attribute verification to whoever performed
it. It is therefore not a defect. **But it now understates the evidence**, and it is the one row whose
tool status is weaker than the facts support. **MINOR 9**: replace with dated facts in the table's own
format — `PIT 1.30.0, 2026-08-27 — current; Stryker-JS v10.0.0, 2026-08-14 — current; Stryker.NET
4.16.0, 2026-07-03 — current` — attributed to this validation, exactly as ArchUnit and k6 are
attributed to the gates that verified them.

## 6. Routing — full suite re-run against the rewritten description

The description changed from 1022 to **1019 characters**, byte-identical across `SKILL.md` and
`skill.yaml` (verified by normalising both folded scalars and comparing). The opening clause was
rewritten and the situation list rebuilt.

**Situation count, re-derived rather than read: 7 situations, not 8.** Two added ("incidents pass a
gate that stayed green"; "encoded rules are skipped or red on main and nobody remembers why") and
**three dropped**, not two: the trailing metric proposed as a pull-request gate; the frozen baseline
that has not shrunk in a year; two checks contradicting each other. The `slo-and-alerting` exclusion
also narrowed from "error budgets and paging" to "error budgets".

**17 prompts run** — the 12 from iteration 1, the 3 further negatives recorded there, and the 2 Phase
4 prompts. **14 unchanged, 3 changed.**

Changed **in this skill's favour**:

- **"Write me an ArchUnit rule that forbids the web layer importing persistence."** → still
  `architecture-testing`, but the repulsion moved from the trailing exclusion clause to the **opening
  sentence** ("not how the test is written"), which is the text read first. This is the Phase 4 prompt
  the coordinator flagged; the edit strengthened it.
- **"Our incident last week passed every gate on the way in."** → now routes here on a verbatim
  situation; at iteration 1 nothing in the description claimed it.
- **"We inherited forty rules, half skipped, the rest red on main, and nobody remembers why."** → now
  routes here verbatim; at iteration 1 it had no home in this description at all.

Changed **against** it, both from the three dropped situations:

- **"Our frozen violation store was committed 18 months ago and is exactly the same size today."** At
  iteration 1 this routed cleanly on a verbatim situation. It now routes by inference: "triaging an
  inherited rule suite" in the opening clause, plus "encoded rules are skipped … and nobody remembers
  why" — a refrozen store _is_ a set of skipped violations with lost provenance, so the reading works,
  but it is no longer immediate. `quality-gates` gains ground through "a check is routinely bypassed
  or its failures ignored". **Still routes here, and correctly**: `quality-gates` owns _introducing_ a
  ratchet, and as re-confirmed this iteration its description never mentions a baseline that has
  stopped shrinking, while this body owns the answer (`FreezingArchRule` "does not enforce that the
  count falls"; the "pawl nobody pulled" failure signature). Confidence dropped from verbatim to
  inferential.
- **"Someone proposed gating pull requests on our change-failure rate."** Same shape: now carried by
  the opening clause ("what to govern, at what threshold, **where**") rather than a verbatim
  situation. Still routes here — the body's "never a build gate, because it trails the change" is the
  answer and no neighbour claims it — but inferentially.

**MINOR 10** — two prompts moved from verbatim to inferential routing, and no budget pressure forced
it: the description _shrank_ by 3 characters. Both situations remain answered by the body, so this is
lost routing precision, not a misroute; neither prompt lands on a skill that cannot answer it. The
cheapest repair is to restore the frozen-baseline clause, the one of the three whose neighbour has the
strongest competing claim.

The third dropped situation — two checks contradicting each other — is the least costly loss: it
routes to `architecture-trade-off-analysis` on the word "contradict", which was always the correct
_second_ stop, and this body hands the trade-off over anyway.

### `architecture-testing` — verdict for the upgrade queue

**The collision closed on this skill's side alone. A reciprocal change is recommended but not
required.**

Evidence: `architecture-testing` contains **zero** occurrences of "fitness" anywhere in the package,
so it neither claims nor disclaims governance. Its four named exclusions (`layering-and-boundaries`,
`architecture-decision-making`, `load-testing`, `rpc-and-api-contracts`) all exist as skills and none
is this one. Nothing in it competes for the governance decision — no threshold provenance, no
consequence, no owner, no cadence, no register — so no prompt tested routed there wrongly.

The soft case for a reciprocal edit is one prompt: **"Our architecture rules live in a Confluence page
nobody reads."** `architecture-testing` holds it verbatim ("when a layering rule exists only in a
wiki") and wins, which is the right call when the rule is already expressible — its answer is
actionable. But the caller who cannot yet say which characteristic the rule defends, or what should
happen when it goes red, is better served here first. Adding `(architecture-fitness-functions)` to
`architecture-testing`'s exclusion list — "does not cover the governance decision: threshold,
consequence and owner" — would make that split visible from the description alone. One line, no
behaviour change, safe to queue behind higher-value work.

## 7. Counting spot-check

The author reports 6 new count-claims re-derived plus one straddling-bold warning. Verified
independently, chosen again for cross-file spread and for where an error would mislead.

| #   | Claim                                                                                         | Chosen because                                                          | Re-derived                                                                                                                                                                                                                                                                                           | Result                             |
| --- | --------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| 1   | "Four things deterministic checks cannot see" — the author's warning that a naive grep says 3 | he flagged it, and a warning is worth less than a check                 | **Warning confirmed.** `**semantic contract` / `drift**` straddles the 145/146 line break, so a single-line bold grep returns mangled matches. Content re-derived by hand: boundary fidelity, semantic contract drift, workflow coupling, stale ADR assumptions = **4**; `ungoverned.md`'s table = 4 | pass                               |
| 2   | "five constituents"                                                                           | **new, and asserted in four separate places** — the highest-drift shape | `catalogue.md` table = 5 rows; the phrase appears at `catalogue.md:83`, `ungoverned.md:26`, `SKILL.md:142`, `SKILL.md:172` — all four say five                                                                                                                                                       | pass                               |
| 3   | Register entries vs the ADR's Compliance ids                                                  | **iteration 1's only counting FAIL** — the fix must be confirmed        | Register now holds FF-04, FF-06, FF-11, FF-14 + maintainability = **5**; ADR Compliance cites 5; ids match characteristics one-for-one (security/availability/elasticity/deployability); `ungoverned.md:123` states "Five entries, because the ADR's Compliance line cites five"                     | **FIXED**                          |
| 4   | Description situation count and what changed                                                  | the riskiest edit; the report says two dropped                          | 7 situations; 2 added; **3 dropped** — trailing-metric PR gate, frozen baseline, contradicting checks                                                                                                                                                                                                | **author's count wrong: 3, not 2** |
| 5   | "Three eliminating questions"                                                                 | new, and a reader executes it literally                                 | which characteristic does it defend; can more than one change source violate it; would two reviewers agree = **3**                                                                                                                                                                                   | pass                               |
| 6   | Description byte-identity, body length                                                        | mechanically checkable; a wrong self-report predicts others             | 1019 = 1019, strings identical; 198 − 15 frontmatter = **183**                                                                                                                                                                                                                                       | pass                               |

Also re-derived: the four modes (4 table rows), the four legitimate manual reasons (still 4 in
`catalogue.md`), the failure-signature table (4 rows), and the seven axes — now **5 table rows plus 2
carried in the prose above the table** ("intentional"/"emergent" and "domain-specific" as reminders,
not poles), still 7 with nothing lost, and no number is claimed in the text so there is nothing to
drift. One pleasing detail: the script's cadence vocabulary is enumerated in its own error message via
`Object.keys(CADENCE_DAYS)`, so that count is derived and cannot drift from the map.

**One error found, and it is in the author's report to the gate rather than in the artefact** (the
dropped-situation count). All six artefact counts are correct, including the one that failed at
iteration 1.

## 8. Regression — protected items intact

| Protected item          | State                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Objectivity framing     | Intact. Parsons quote and date, "if two competent people read the result and disagree", "a metric, a threshold, a site and a consequence", "No consequence, a dashboard; no site, a wish" — all verbatim. One compression: "via reader notes, never the book text, so no page is claimed" → "via reader notes, so no page is claimed"; the full sourcing discipline survives at `disagreements-and-evidence.md:105-109` |
| Four modes              | Intact. T/C/M/U, all five columns, all four reversal signals verbatim, plus a new explicit marking at `SKILL.md:69`                                                                                                                                                                                                                                                                                                     |
| Register schema         | Intact and extended with `id`, documented as "the script ignores it" — **verified: the script contains no reference to `id`**, and the example still exits 0                                                                                                                                                                                                                                                            |
| Failure-signature table | Intact, 4 rows, verbatim. (Phase 4's triage agent called this the most useful section; it was not touched)                                                                                                                                                                                                                                                                                                              |
| Terminology table       | Intact, 6 rows, including the SLO "iff wired to a consequence" test                                                                                                                                                                                                                                                                                                                                                     |
| Script logic            | Changed only as sanctioned — days instead of months, unrecognised cadence fails loudly, empty register fails — plus a `report()` extraction and `fortnightly` added to the map. Every previously verified detection re-fires                                                                                                                                                                                            |

The one substantive loss: **"Claiming measured benefit here is lying" is gone from `SKILL.md`** and
survives only at `disagreements-and-evidence.md:14`. The section still opens in the body's own voice
with "**No study shows that fitness functions improve outcomes** — no controlled study, no cohort
comparison, no survey isolating the practice", so item 6 still passes, but the sharpest guard against
future evangelism now lives one file away. NIT 5.

**A note on the 183-line regression check.** The body is still 183 lines, but that figure no longer
evidences that the body did not grow: `SKILL.md` went from **21,052 to 22,486 bytes (+1,434, +6.8%)**
while holding the line count exactly. The budget was met by lengthening lines — 69 prose lines now
exceed 100 characters against roughly 7 at iteration 1, and the longest line is **412 characters**.
Nothing is broken (prettier passes; `proseWrap` is `preserve`; every line renders as intended), but a
future gate should measure the body in bytes as well as lines, or the budget will keep being met
while the context cost rises. NIT 6.

## 9. The twelve items, re-run

| #   | Item                             | Iteration 2                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| --- | -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Technical accuracy               | **PASS, improved.** `SKILL.md:69` now marks the four-mode set, the change-source unit, the triage order, the price/reversal column and the delivery paragraph as "this skill's construction, not the authors'" — closing iteration-1 MINOR 6 and doing it better than asked, by naming the boundary in both directions ("the axes and the quotations are theirs"). New material is either sourced (Fowler, InfoQ) or marked (the maintainability split, the mutation hedge) |
| 2   | Terminology                      | **PASS.** Seven axes preserved (5 in table, 2 in prose); SLO/SLA/metric/quality-gate/architecture-test distinctions verbatim; the 2022-edition status is still unverified where the brief says it is                                                                                                                                                                                                                                                                        |
| 3   | No unconditional recommendations | **PASS.** "Nothing here is unconditional, this suite included" retained. The triage section is conditional throughout ("Incidents to learn from?", "Rules already there…?"), and the mutation row carries its own losing condition ("an absolute floor picked before you have measured is a number nobody chose")                                                                                                                                                           |
| 4   | Trade-off completeness           | **PASS.** U still carries a full row, a reference and the script; the triage terminal for a characteristic with no rule is U, not "add one"                                                                                                                                                                                                                                                                                                                                 |
| 5   | Trade-offs qualified             | **PASS.** The diagnostic step adds a measurement discipline the package lacked — walk each post-mortem back to the earliest artefact that carried the signal                                                                                                                                                                                                                                                                                                                |
| 6   | Evangelism and evidence honesty  | **PASS**, one sentence weaker in the body — NIT 5                                                                                                                                                                                                                                                                                                                                                                                                                           |
| 7   | Governance realism               | **PASS, improved.** The mutation row's threshold is the strongest instance of "borrowed, not chosen" in the package: your own first full run as the baseline. No dead tool recommended; JDepend's status line corrected to match the API                                                                                                                                                                                                                                    |
| 8   | Scale honesty                    | **PASS.** The change-source unit is unchanged and is now explicitly marked as the skill's construction                                                                                                                                                                                                                                                                                                                                                                      |
| 9   | Scope hygiene                    | **PASS.** No new collision. The maintainability section _agrees_ with `quality-gates` on coverage rather than competing; the opening clause strengthens the `architecture-testing` boundary. See the routing verdict for the reciprocal-change recommendation                                                                                                                                                                                                               |
| 10  | Diagram accuracy                 | N/A — still none                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| 11  | Trigger quality                  | **PASS with MINOR 10.** 17 prompts, 14 unchanged, 3 changed: two gained, two lost precision, no misroute                                                                                                                                                                                                                                                                                                                                                                    |
| 12  | Internal consistency             | **PASS, improved.** Iteration 1's cross-file count failure is fixed; the description is byte-identical at 1019; the register example still exits 0; `id` is documented as ignored and verifiably ignored                                                                                                                                                                                                                                                                    |

## 10. Script — exception re-affirmed, three defects closed

All three iteration-1 script findings are fixed, re-verified with **fresh fixtures built for this
iteration** (a five-entry `ledger-core` register including a `fortnightly` cadence; an eight-entry
hostile register; boundary probes).

```
=== CLEAN2 (5 entries: T, C, M/fortnightly, M/quarterly, none) ===
clean2.json: OK — 5 characteristic(s): 4 governed, 1 ungoverned on the record.
EXIT=0

=== HOSTILE2 (8 entries) ===
hostile2.json: 10 problem(s)
  - a: governance must be one of T, C, M, none — found "t"
  - b: governed with no site — nowhere for it to run
  - c: governed with no metric
  - d: manual with no written criterion — the verdict is then an opinion
  - e: unrecognised cadence "whenever" — the lapse check cannot run, so it would silently pass.
       Use one of: weekly, fortnightly, monthly, quarterly, half-yearly, annually
  - f: manual verdict last recorded 2026-07-30, past its weekly cadence
  - g: review date 2026-08-27 has passed
  - g: declared ungoverned with no "risk" sentence naming what is exposed
  - h: no owner
  - register: last reviewed 2025-07-01 — BEA ch. 2 asks for a review at least once a year
EXIT=1

=== EMPTY REGISTER ===
e.json: 1 problem(s)
  - register: no entries — nothing is governed and nothing is declared ungoverned. An empty
    register is an unstarted one: begin from the quantum's driving characteristics.
EXIT=1

=== BOUNDARY (quarterly, allowance 94 days) ===
94 days stale -> OK, EXIT=0
95 days stale -> "past its quarterly cadence", EXIT=1

=== EXIT 2 PATHS ===
malformed JSON=2   missing file=2   no argument=2   bad --today=2   entries not an array=2

=== reference register extracted verbatim from ungoverned.md ===
OK — 5 characteristic(s): 4 governed, 1 ungoverned on the record.  EXIT=0
```

Resolution of the three iteration-1 defects, each re-probed adversarially:

- **MINOR 2 (silent pass on an unrecognised cadence) — fixed, and fixed in the right direction.**
  `CADENCE_DAYS[e.cadence] === undefined` now _fails_, with the legal vocabulary enumerated from
  `Object.keys`, and the code comment names why: "Passing here would ship the failBuildOnCVSS defect
  into this file: green because nothing was ever evaluated." Fixture `e` carries a _fresh_ verdict
  (yesterday) and an unreadable cadence, and it fails — the checker refuses to certify what it cannot
  evaluate, which is the correct and stricter choice.
- **MINOR 3 (`weekly` rounded to a month) — fixed.** `monthsBetween` replaced by `daysBetween` with a
  per-cadence day allowance ("one period plus the slack a real calendar needs"). Fixture `f`, a weekly
  check 29 days stale, now fails; under iteration 1's arithmetic it passed.
- **MINOR 4 (empty register reported green) — fixed**, with a message that tells the reader what to do
  next rather than only what is wrong.

`fortnightly` was added to the vocabulary — not sanctioned, but it is a pure widening of a lookup
table, it is enumerated in the failure message so it cannot drift from the docs, and my clean fixture
exercises it. No other behaviour changed: every detection verified at iteration 1 re-fires, and the
`report()` extraction is a pure refactor of the two exit-1 paths.

**Exception re-affirmed, and the case is stronger than at iteration 1**, because the register is now
the artefact the triage procedure _produces_ ("Retire and declare first" ends in a register) and the
deadline rule's success condition ("every remaining red is one somebody chose") is partly
machine-checkable against it. The script is no longer only a nightly hygiene check; it is the terminal
of the package's main new workflow. The precedent test for the remaining eighteen skills is unchanged:
a `scripts/` directory is justified when the script does something a reader cannot get by reading —
here, a build that goes red on a date with no code change.

## Residual list — everything shipping unfixed, with its reason

| ID       | Finding                                                                                                                                                                                                   | Severity           | Shipping reason                                                                                                                                                                                                                                                                         |
| -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| MINOR 1  | `catalogue.md`'s H1 promises "consequence"; the row table has Characteristic / Metric / Threshold shape / Site / Class, so the consequence must be composed via the Class column into the Placement table | MINOR, from iter 1 | Derivable, and the Class column is an exact key into the Placement table; `SKILL.md:194` routes to the file accurately ("classification", not "consequence"), so the mismatch is internal to the reference. Ironic given the thesis, but no reader is left without the consequence      |
| MINOR 8  | The diagnostic step's "none would ⇒ you are missing a metric" is wrong for the miscalibrated-threshold case (right metric, right site, number never derived)                                              | MINOR, new         | The step's own wording ("which _number_") resolves it on a careful reading, and the wrong branch costs one step of wasted search, not a wrong governance decision. One clause fixes it                                                                                                  |
| MINOR 9  | The mutation-runner hedge says "unverified here" when PIT 1.30.0 (2026-08-27), Stryker-JS v10.0.0 and Stryker.NET 4.16.0 are all verified current                                                         | MINOR, new         | The hedge is _true_ — this skill did not verify — and the package's discipline is to attribute verification to whoever did. It understates rather than misleads. Upgradeable in one line now that this gate has the dates                                                               |
| MINOR 10 | Two prompts (frozen baseline; trailing metric as a PR gate) moved from verbatim to inferential routing when three situations were dropped                                                                 | MINOR, new         | Both still route here, both are still answered by the body, and neither lands on a skill that cannot answer. The description shrank by 3 characters, so the budget did not force it — but the two situations added in their place serve entry points that previously had no home at all |
| NIT 1    | `ungoverned.md:15` decomposes reliability into five constituents with no marking, inside a paragraph that opens by citing _Fundamentals_ ch. 6                                                            | NIT, from iter 1   | Correct, and sourced in the sibling (`architecture-characteristics/references/definitions-and-composites.md:94`). No reader is misled                                                                                                                                                   |
| NIT 2    | SLI has no row of its own in the terminology table                                                                                                                                                        | NIT, from iter 1   | The clause "the SLI is the metric, so not yet one" inside the SLO row preserves the distinction; a row would cost a line for no decision change                                                                                                                                         |
| NIT 3    | "Chaos experiment" and "the steady-state hypothesis _is_ the threshold" survive only as the catalogue's Resilience row                                                                                    | NIT, from iter 1   | Nothing load-bearing lost; the body has no room for a second illustration of a shape already illustrated                                                                                                                                                                                |
| NIT 4    | Prose lines over 100 characters (now 69, longest 412)                                                                                                                                                     | NIT, from iter 1   | No house rule breached — `.prettierrc.json` sets `printWidth: 100` with prettier's default `proseWrap: preserve`, `prettier --check` passes, and `architecture-characteristics` ships 46 such lines                                                                                     |
| NIT 5    | "Claiming measured benefit here is lying" moved out of `SKILL.md` into `disagreements-and-evidence.md:14`                                                                                                 | NIT, new           | The body still opens the section with the no-study claim in its own voice, so evidence honesty is intact at activation time; only the sharpest phrasing moved                                                                                                                           |
| NIT 6    | "Body still 183 lines" no longer evidences that the body did not grow: 21,052 → 22,486 bytes at a constant line count                                                                                     | NIT, new           | Nothing renders wrongly and no rule is breached. Recorded so future gates measure bytes as well as lines                                                                                                                                                                                |

**Fixed since iteration 1 and closed:** MINOR 2, 3, 4 (script), MINOR 5 (register/ADR count), MINOR 6
(unsourced markings), and iteration 1's NIT 1 (JDepend "no releases" → "last release 2.10,
2020-03-06", which matches the GitHub API exactly). Iteration 1's MINOR 7 (the line-length
self-report) is superseded by NIT 4 and NIT 6.

## Mechanical — real output, iteration 2

```
$ node packages/cli/bin/agent-skills.mjs validate skills/architecture-fitness-functions
architecture-fitness-functions@1.0.0

  C:\git\agent-skills\skills\architecture-fitness-functions
  6 files

✓ Valid — no issues found
EXIT=0

$ npx prettier --check "skills/architecture-fitness-functions/**/*.{md,yaml,mjs}"
Checking formatting...
All matched files use Prettier code style!
EXIT=0

$ wc -l skills/architecture-fitness-functions/SKILL.md \
        skills/architecture-fitness-functions/references/* \
        skills/architecture-fitness-functions/scripts/*
  198 SKILL.md                                    (body 183, unchanged; 21,052 -> 22,486 bytes)
  136 references/catalogue.md                     (105 -> 136)
  109 references/disagreements-and-evidence.md    (unchanged)
  169 references/ungoverned.md                    (139 -> 169)
  158 scripts/check-governance-register.mjs       (129 -> 158)
  770 total
```

`registry:build` and `verify` deliberately not run — seven unrelated `gof-*` packages lack
`skill.yaml` and both abort. Nothing under `skills/` was edited by this gate.
