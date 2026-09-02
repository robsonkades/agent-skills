# The feature engineering suite

Fourteen packages that make an agent own a feature request the way a senior engineer does:
understand it, investigate the repository, ask only what the repository cannot answer, price the
options, record the decisions as they are taken, plan, implement resource by resource, validate
each one, track state so the work survives a session boundary, and review against what was
agreed rather than against the build output.

This document explains how the pieces fit. Each package explains itself.

---

## 1. Why fourteen packages and not one

The lifecycle has phases with genuinely different jobs, and an agent that loads all of them for
every request pays for all of them on a one-line change. Splitting lets the orchestrator load
only what a given request's depth warrants — which is the mechanism that keeps the process from
becoming ceremony people route around.

The split also makes the pieces reusable on their own. `feature-progress-tracking` is useful for
any multi-session work; `feature-decision-analysis` is useful the moment someone says "the
project already uses X, so we'll use X" about anything.

---

## 2. The map

```text
                        feature-engineering
                     (depth class, gates, routing)
                                 |
   +-------------+---------------+---------------+--------------+
   |             |               |               |              |
UNDERSTAND    DECIDE           PLAN           BUILD          CLOSE
   |             |               |               |              |
feature-       feature-        feature-       feature-       feature-
discovery      solution-       decomposition  execution      readiness-
               analysis                                      review
feature-       feature-        feature-       feature-
requirement-   decision-       risk-          progress-
clarification  analysis        analysis       tracking
feature-                       feature-
context-                       implementation-
analysis                       plan
feature-
scope-analysis
feature-
architecture-
analysis
```

| Package                             | Owns                                                                     |
| ----------------------------------- | ------------------------------------------------------------------------ |
| `feature-engineering`               | Depth classification, phase order, the two hard gates, routing           |
| `feature-discovery`                 | The fact / assumption / unknown / decision ledger                        |
| `feature-requirement-clarification` | What to ask, when, and what blocks — repository first                    |
| `feature-context-analysis`          | The evidence-cited context report of what the repository already answers |
| `feature-scope-analysis`            | The five scope buckets and creep detection                               |
| `feature-architecture-analysis`     | The impact map, with paths and visibility                                |
| `feature-solution-analysis`         | The option set, including the floor, and the recommendation block        |
| `feature-decision-analysis`         | The decision log, provenance, and decision authority                     |
| `feature-decomposition`             | Whether to split, stories, and the resource list                         |
| `feature-risk-analysis`             | The risk register — detection and fallback, not adjectives               |
| `feature-implementation-plan`       | The executable plan and its amendments                                   |
| `feature-execution`                 | The per-resource implement-validate-record loop                          |
| `feature-progress-tracking`         | The status machine and the resumable artefacts                           |
| `feature-readiness-review`          | The gate before implementing, and the completion review after            |

---

## 3. Where the suite stops and the catalogue starts

The suite owns the **lifecycle of one feature and its artefacts**. It does not re-implement
methods the catalogue already owns; it hands off to them. This is the boundary that keeps the
routing unambiguous — each situation still has exactly one owner.

| Concern                                                                   | Owned by                                                      | The suite's part                            |
| ------------------------------------------------------------------------- | ------------------------------------------------------------- | ------------------------------------------- |
| Restating a requirement without its solution; writing acceptance criteria | `requirements-and-acceptance`                                 | Deciding what to ask and what blocks        |
| Decision-record format, reversibility, supersession                       | `architecture-decision-making`                                | Provenance and authority before the record  |
| MECE option sets, qualitative versus quantitative                         | `architecture-trade-off-analysis`                             | Applying it to a feature-level choice       |
| Order of work for an arbitrary change                                     | `clean-delivery-workflow`                                     | Order of work for a feature, with a dossier |
| Which automated checks a change must pass                                 | `quality-gates`                                               | Which validation each resource warrants     |
| What an agent may claim about its work                                    | `coding-agent-discipline`                                     | Requiring a validation line before DONE     |
| Reviewing a diff for defects and design                                   | `code-review`                                                 | Reviewing a feature against what was agreed |
| Reading an unfamiliar enterprise codebase                                 | `enterprise-application-architecture`                         | A feature-scoped context report             |
| Where a responsibility belongs; the deployable boundary                   | `layering-and-boundaries`, `architecture-coupling-and-quanta` | What this change touches                    |
| Failure-mode taxonomy                                                     | `failure-models`, `distributed-failure-catalogue`             | This feature's risk register                |
| Dates and sizes                                                           | `estimation-under-uncertainty`                                | Nothing — the plan carries neither          |

---

## 4. Depth: the mechanism that keeps this usable

The most important decision in the whole suite is the first one. Three classes:

| Class           | Fits                                                                                   | Dossier    |
| --------------- | -------------------------------------------------------------------------------------- | ---------- |
| **Direct**      | Reversible in a day, one module, no new dependency, no contract or schema change       | none       |
| **Standard**    | Several components, a contract or schema touched, one or two real choices              | no stories |
| **Significant** | New technology, new integration, migration, breaking change, or work spanning sessions | full       |

A Direct-class change runs no checklist, writes no artefact, and produces a three-line report.
That is the point: uniform ceremony is the failure mode this design is built against, not a
safety property.

Escalation is cheap and expected — a question that turns out to change the design moves the
class mid-flight. De-escalation happens only when an answer removes the work that drove the
classification.

---

## 5. Artefacts

```text
docs/features/<feature-slug>/
├── analysis.md        discovery ledger, context report, scope, impact map, options
├── plan.md            the executable plan, its resources, and its amendments
├── progress.md        resource status — the only file that must always be current
├── execution-log.md   append-only chronology
└── decisions/         one record per decision, superseded rather than rewritten
```

If the repository already has a documentation standard — an ADR directory, an RFC convention, a
docs site with a fixed shape — that standard wins. The five artefact **roles** are what matter,
not the file names. `feature-engineering`'s `references/dossier-layout.md` has the adaptation
table.

Resumption is the reason these exist: an agent opening `progress.md` cold gets the status of
every resource, the open blockers with their questions in full, and one unambiguous "next".

---

## 6. The rules the suite enforces

These are the behaviours the packages are written to produce. Each is enforced by a specific
rule in a specific package, not by exhortation.

1. Never invent a requirement, a corporate standard, or a compliance obligation.
2. Never select a major technology silently.
3. Never treat an implementation found in the repository as an organisational standard —
   `PROJECT_EXISTING` does not promote itself.
4. Ask when a high-impact question cannot be settled from the repository; do not ask what a grep
   answers.
5. Prefer the simplest option that satisfies the constraints; the floor is always in the set and
   wins ties.
6. Record a decision when it is taken, with its provenance and its authority.
7. Supersede decisions; never rewrite them.
8. Every resource has a tracked status, and the status is updated at the transition.
9. Nothing is DONE without a validation that was run and read.
10. The plan is a living artefact — deviation is recorded, never silent.
11. Do not split small features; do not expand scope without a written justification.
12. The agent owns _how_; the user owns _what_ and _whether_.

---

## 7. A worked request

> "Add asynchronous processing to order dispatch."

What the suite does, and — as importantly — what it does not.

**It does not** open a broker connection.

```text
1  Depth            Significant: "asynchronous" implies a mechanism the project may not
                    have, and the API contract changes.        [feature-engineering]

2  Ledger           FACT the dispatch API is synchronous (OrderController.java:41).
                    ASSM "asynchronous" means acknowledge-then-complete, not polling.
                    UNK  does the caller need to observe completion? HIGH.
                                                                [feature-discovery]

3  Context          Kafka present, two consumers, used for shipping (pom.xml:104).
                    No retry policy anywhere. Flyway, 41 migrations, versioned.
                    Every controller returns ProblemDetail — 11 of them, no
                    counter-example.                            [feature-context-analysis]

4  Questions        Round 1: what must happen on failure; must the caller observe
                    completion. Round 2: "the project runs Kafka for shipping — should
                    this feature reuse it, or is the transport open?"
                    Not asked: the error shape. The repository answered it.
                                              [feature-requirement-clarification]

5  Scope            In: endpoint, dispatch service, transport, status endpoint.
                    Out: a dispatch dashboard (nobody named an operational question);
                    out: migrating shipping to the new pattern (X-02, agent).
                                                                [feature-scope-analysis]

6  Impact           11 elements across api, application, domain, infrastructure and
                    cross-cutting; two EXTERNAL: the order event payload and a new
                    column with existing rows.        [feature-architecture-analysis]

7  Options          Floor: an outbox table plus a poller. Alternative: the existing
                    cluster. Separated by the replay requirement, not by throughput —
                    4k/day does not separate them.     [feature-solution-analysis]

8  Decision         D-04 reuse the cluster. Provenance USER_MANDATED (round 2).
                    Authority user-confirmed, confirmed. ADR-002 written now, not later.
                                                                [feature-decision-analysis]

9  Breakdown        Two user stories, one technical story, 11 resources, each with a
                    dependency list and a validation.            [feature-decomposition]

10 Risks            K-02 reprocessing after redeploy: HIGH impact, MEDIUM probability,
                    detected only at next-day reconciliation -> mitigation becomes R-07.
                                                                [feature-risk-analysis]

11 Plan             Ordered resources, the compatibility window for the new column, and
                    a rollback story that says which step stops being reversible.
                                                           [feature-implementation-plan]

12 Gate 1           32 items; 2 open, both blocking. Stops. Asks. Resumes.
                                                            [feature-readiness-review]

13 Build            R-01 -> validate -> record -> R-03 -> ... R-07 blocks on Q-08;
                    work continues on R-09 because the arrow was never forced.
                                                   [feature-execution + tracking]

14 Gate 2           One Required scope item has no resource. Complete: no. That is the
                    headline of the report.                  [feature-readiness-review]
```

Step 14 is the one that pays for the other thirteen. The build was green.

---

## 8. Using it

```bash
agent-skills install feature-engineering        # the orchestrator and its closure
agent-skills install feature-progress-tracking  # or one piece, on its own
```

Installing `feature-engineering` pulls the thirteen specialists and the catalogue skills the
routing table promises, so every row in it resolves.

For a single request, invoking the orchestrator is enough — it classifies the depth and loads
only what that class needs. Invoke a specialist directly when you already know which phase you
are in.
