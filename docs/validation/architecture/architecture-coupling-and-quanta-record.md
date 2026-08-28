# Release record — `architecture-coupling-and-quanta` 1.0.0

The first new package of this increment, and the vocabulary the rest of the suite's decomposition
skills will defer to. It answers one cross-level question: **given a system that already spans
packages, jars, services and databases, what is the unit that can ship on its own, and which
coupling crosses that unit's edge?**

|                  |                                                                                                    |
| ---------------- | -------------------------------------------------------------------------------------------------- |
| **Version**      | 1.0.0                                                                                              |
| **Package**      | `SKILL.md` (214-line body) + `skill.yaml` + 3 references — 748 lines total                         |
| **Output**       | A map and two counts — quanta and deployment units. Not a plan, not a verdict                      |
| **Dependencies** | defers to `architecture-trade-off-analysis` for method                                             |
| **Status**       | validated, **not published** — `registry:build` blocked, see Known limits                          |
| **Validation**   | 4 gate iterations (FAIL, PASS, FAIL, PASS) + Phase 4 usage testing · 6 test prompts, 2 adversarial |

## Why it exists, given nine neighbours

The research brief's own conclusion was that the overlap "may be fatal", and it named the test the
package had to survive: every neighbour owns either a **level** (class/package, module/release,
in-process layer, process boundary) or an **activity** (deciding, testing, governing, naming the
smell). What none owned was the cross-level derivation — take the transitive closure across all four
levels, and compare quantum count against deployment-unit count.

The package survives on that line and on nothing wider. It is deliberately thin, and it holds
because it refuses to say what to do next: the process-boundary decision is `distribution-boundaries`',
the verdict is `enterprise-architecture-smells`', the Martin metrics and shared-jar policy are
`component-and-release-boundaries`', and the method is `architecture-trade-off-analysis`'.

## Sources

| Source                                      | Edition / version               | Role                                                                                                                               |
| ------------------------------------------- | ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| _Fundamentals of Software Architecture_     | **1st ed., 2020**, ch. 3, 7     | Connascence's use; the quantum as "high functional cohesion **and synchronous connascence**"                                       |
| _Software Architecture: The Hard Parts_     | 2021, ch. 2                     | Static vs dynamic coupling; the quantum as "high functional cohesion, **high static coupling, and synchronous dynamic coupling**"  |
| _Building Evolutionary Architectures_       | 1st ed. 2017; 2nd ed. 2022      | The definition's earliest form ("component") and its convergence on the _Hard Parts_ wording                                       |
| _Fundamentals_                              | 2nd ed., March 2025             | Ch. 3 and 7 titles confirmed; **whether either chapter's text changed is unverified** and written as such                          |
| Page-Jones, CACM 35(9)                      | 1992; book 1996                 | Connascence: five static forms, four dynamic; strength, degree, locality                                                           |
| Ford, InfoQ _Hard Parts_ podcast transcript | verified live at gate           | The coupling test the package runs on: "if that thing changes, I might have to change"                                             |
| El Emam et al., _IEEE TSE_ 27(7)            | 2001                            | 4 of 24 metrics survive size control — **its published rebuttal was not read**, so carried as unsettled                            |
| Kirbas et al., _JSEP_ 29(4)                 | 2017                            | 176k files, 7 years, two industrial systems. The one sourced scale finding: the signal weakens with few files and few contributors |
| D'Ambros et al., WCRE                       | 2009                            | Cited for the question and its standing only; effect sizes paywalled and never attributed                                          |
| Segment (Noonan)                            | 10 July 2018                    | 140+ destinations in 140+ repos, **120 live versions of the shared libraries**, 3 engineers full-time                              |
| Uber (Gluck)                                | 23 July 2020                    | "Networked monoliths"; 2,200 critical microservices, ~70 domains, one root cause touching 50 services across 12 teams              |
| ArchUnit                                    | 1.5.0, 2026-08-04               | Verified live to expose `getAbstractness` / `getInstability` / `getNormalizedDistanceFromMainSequence`                             |
| code-maat                                   | v1.0.4, 2023-02-20              | `archived:false`, last push 2025-07-03 — shipped **with those dates attached**, because it is dormant, not dead                    |
| CodeScene; OpenTelemetry semconv            | published defaults; **v1.33.0** | Change-coupling thresholds verbatim; `db.system.name` / `db.namespace`, whose older forms would have been silently wrong           |

Every book quotation in this package is **secondary**. No page number appears anywhere, because
none existed in the research and any would have been invented.

## Validation iterations

| #   | Verdict          | Findings                | Disposition                                                                                                                                          |
| --- | ---------------- | ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **FAIL**         | 1 MAJOR, 4 MINOR, 4 NIT | The shipped quantum definition contradicted the package's own table, method and worked ADR, and matched no book                                      |
| 2   | **PASS**         | 1 MINOR                 | The fix created one defect — the **against** side of a disagreement was left on the old definition, and the package's own ADR was its counterexample |
| —   | **Phase 4**      | 2 MAJOR, 3 MINOR        | Six isolated runs. Both MAJORs were behavioural: **static coupling had no floor**, and the verdict handoff did not survive adversarial pressure      |
| 3   | **FAIL**         | 1 MAJOR, 1 MINOR        | The floor was fixed **where it was reported and nowhere else** — one site of eight                                                                   |
| 4   | **PASS — ships** | none                    | Site inventory converged at eight on the third independent enumeration. Nothing ships open                                                           |

Totals: **4 MAJOR raised and discharged** (2 at the gate, 2 in usage testing), **9 MINOR**, **4 NIT**.
Plus one Phase 4 observation recorded as not a skill defect.

## What this build contributed to the process

**A conceptual defect must be fixed where the concept lives, not where it was reported.** This
package produced three instances and they are the clearest evidence in the suite:

| Defect                 | Reported at | Actually present at                        |
| ---------------------- | ----------- | ------------------------------------------ |
| The quantum definition | 4 sites     | **7** — the author found the other three   |
| The static leg's floor | 1 site      | **8** — including the leg's own definition |
| The "against" case     | 2 sites     | **3**, in two incompatible wordings        |

The procedure that closed it: **grep the concept and enumerate every site before editing any of
them**, then make one site authoritative and have the rest route to it rather than restate the rule
— a restatement in a reference is a second authority to drift from.

**A concept can have two vocabularies, and a pattern for one misses the other.** The eighth site
escaped two enumerations because it states the leg as boot-and-correctness ("everything the part
needs in order to boot and be correct") rather than as categories (schema, library, infrastructure).
Both the gate's pattern and the author's first pattern were built for categories.

**A count check that runs on physical lines lies after any rewrap.** Caught as a near-miss: a
line-wise grep returned "two legs → 1" because a bolded phrase spanned two lines. Joined text
returns 2. Counting now joins before counting.

**Three fixes in this suite would have introduced a new defect and were caught before landing** —
one of them a wording the gate itself proposed. Every correction must pass through the same gate as
the original text.

## Residual findings — shipping unfixed

| ID  | Severity | Item                                                                    | Why it ships                                                                                                                                                                                                             |
| --- | -------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| —   | —        | **A2's column 2 is load-bearing for the static-coupling floor**         | The S table row's column 1 reads unbounded standing alone; what bounds it is column 2, "the obligation runs to every reader". If column 2 is ever compressed, column 1 needs "at a compatible version **it must track**" |
| —   | —        | `enterprise-architecture-smells` is not in the description's exclusions | Routing works by presence — "distributed monolith" is in that skill's description and nowhere in this one — and the body defers three times. Priced deliberately; one borderline prompt recorded                         |
| —   | —        | Description headroom is 2 bytes of 1024                                 | Any future trigger is a trade, not an addition                                                                                                                                                                           |

## Known limits

- **The architecture quantum has no empirical literature at all.** A bibliographic search for the
  construct returns quantum-computing papers. It lives in practitioner books and the teaching around
  them. The skill says so in its own voice.
- **Connascence is essentially unstudied** — 16 works in OpenAlex, 23 citations on the 1992 article,
  and **no connascence analyser exists** in either curated catalogue checked (137 Java, 135 Python
  tools). Any claim that a pipeline enforces it is false, and the skill says that too.
- **The strength ordering is an unvalidated heuristic** whose advocates hedge it, and whether
  Page-Jones claimed a total or partial ordering could not be resolved.
- **The static leg's floor is this skill's own construction.** Nothing in the books bounds it; read
  literally it swallows every shared broker and every unversioned contract, and almost any estate
  reduces to one quantum — which is the same as having no map. The package bounds it with Ford's own
  test and marks the bound as its own, in the same voice as its other two self-owned constructions.
- **The "against" case on the quantum's usefulness has no published proponent.** It is argued in the
  skill's own voice and labelled as such; manufacturing a named critic would have been fabrication.
- **Amazon Prime Video's primary post no longer resolves** — it redirects away and survives only in
  the Internet Archive, and Cockcroft rebutted the popular framing. Used only as a citation-decay
  example, never as coupling evidence.
- **`registry:build` cannot be run.** `skills/java-domain-modeling/` is an incomplete stub and the
  index builder aborts on the first invalid package. Pre-existing, outside this work's scope,
  awaiting a decision. Required before publish.

## Verification at close

```
agent-skills validate skills/architecture-coupling-and-quanta   ✓ Valid — no issues found (5 files)
prettier --check skills/architecture-coupling-and-quanta/**     All matched files use Prettier code style!
wc -l   SKILL.md 230 (body 214) · coupling-vocabulary 172 · evidence-and-disagreements 194 · measuring-the-unit 152
descriptions   byte-identical, md5 628765953f… — unchanged across three rounds, folded 1022/1024
routing        30/30, re-judged from scratch after every description change
counting       110 + 118 + 125 + 128 claims re-derived across four gate iterations, on joined text
Phase 4        step 4 performed 3/3 · "too small" veto fired · U used 4/4 with a named measurement
```

Uncommitted.
