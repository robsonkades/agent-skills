# Measuring the unit

Three measurements that turn a coupling argument into a number, and the honest list of what has no
measurement at all. Every version and date below was verified on **2026-08-28**; re-check before any
of them decides anything, because a stale tool fact is how a fitness function quietly stops meaning
what it says.

Whether any of these should be governed — what happens when one goes red, who owns it — is
`architecture-fitness-functions`' decision, not this file's. What follows is candidate metrics with
their preconditions, defaults and lies.

## 1. Change coupling — the one with an empirical literature

**What it measures.** For a pair of artefacts (A, B) over a window of revisions: coupling degree =
shared revisions ÷ revisions of whichever of the two changes more often, expressed 0–100. Read it as
code-maat's own README does: each time one is modified, that is the percentage risk the other must be
modified too.

**Granularity, and why it matters here.** Compute it between **modules or repositories**, not files.
The architecture-scale question is which deployables co-change; file-level change coupling is a
code-level concern and belongs to `java-cohesion-coupling` and the code-review skills. Running it at
file level and then aggregating by eye is how a real signal gets turned into an anecdote.

**Tool: code-maat v1.0.4.**

```bash
git log --pretty=format:'[%h] %an %ad %s' --date=short --numstat > logfile.log
java -jar code-maat-1.0.4-standalone.jar -l logfile.log -c git -a coupling
```

Its defaults, from the project README:

| Option                  | Default | Meaning                                          |
| ----------------------- | ------- | ------------------------------------------------ |
| `-n, --min-revs`        | 5       | minimum revisions for an entity to be considered |
| `-m, --min-shared-revs` | 5       | minimum revisions the pair must share            |
| `-i, --min-coupling`    | 30      | minimum coupling degree (%) to report            |
| `-x, --max-coupling`    | 100     | upper cut-off                                    |

**Maintenance status, which must be stated whenever the tool is named.** Last release 2023-02-20;
last commit 2025-07-03; 2,626 stars; not archived and not dead, but not actively developed, and its
own README directs users to the commercial CodeScene as its successor. This is the lesson the older
skills in this suite learned from recommending an archived tool: name the date, not just the tool.

**Thresholds, and where they come from.** Report a pair only at **≥10 shared commits** and **≥50%
coupling degree**, excluding changesets touching **more than 50 files**. These are CodeScene's
published production defaults — its documented rationale is that below ten revisions the coupling may
be accidental, and that sweeping renames and formatting commits generate false pairs. They are
strictly stricter than code-maat's own defaults above, so they under-report rather than over-report,
which is the direction you want for a number that will be used in an argument. **They are not derived
from a study**, and no threshold here is; what they have is a stated rationale and production use.

**The limitation to state out loud.** Kirbas et al. (_JSEP_ 29(4), 2017) found evolutionary coupling
_"is less likely to have a relationship to software defects for parts of the software with fewer files
and where fewer developers contributed"_. Run over a two-person module, this measurement produces
noise that looks exactly like signal.

**Where it runs.** On a schedule, over a 90-day window or one release train, reviewed by people. Never
a build gate: the input is history, and no commit can fix history. A fitness function that fails on
the past fails forever.

## 2. Deployment coupling — measuring "must release together"

**There is no off-the-shelf tool.** DORA's loosely-coupled-teams capability frames the question — can
teams _"make large-scale changes to the design of their systems without the permission of somebody
outside the team or depending on other teams"_, and its component criteria include deploying and
releasing independently of service dependencies and testing on demand without an integrated
environment — but that is a survey instrument, not a measurement of your estate.

**The computation, on data you already have.** Treat each production deployment as an event
`(service, timestamp, change-ref)`. For each ordered pair (A, B), confidence = the fraction of A's
deployments in the window that are followed by a deployment of B for the same change-ref inside a
coordination window. It is the same association statistic as §1, applied to deploy events instead of
commits. Sources: GitHub Actions deployment events, Argo CD `Application` sync history, Spinnaker or
Harness pipeline executions, or a change-management table.

**Threshold: confidence ≥ 0.8 over ≥ 10 deployments of A. This is this skill's own construction, not
an empirical result.** No study establishes 0.8, and none establishes 10. The justification is
definitional: at 0.8 the sentence "these deploy independently" is false four times in five, which is
enough to make the pair one deployment unit in practice. State that it is definitional every time you
report it, and replace it with a figure your own release record justifies once you have one.

**The two confounders, without which the metric lies — and it lies in the flattering direction, which
is worse.**

1. **A release train.** If everything ships on Thursday, every pair's confidence approaches 1.0 and
   the metric has measured your process, not your architecture. Fix: compute over **change-refs**, not
   wall-clock proximity — pairs that shipped together because one change touched both.
2. **Deploy-on-merge in a monorepo.** Every merge redeploys services whose own inputs did not change,
   producing identical artefacts and perfect confidence. Fix: exclude no-op deployments.

**A cheaper leading indicator on the same data:** count cross-repository pull requests that must merge
together — the linked or "depends on" PRs. One shared-library upgrade forcing N coordinated PRs is
Segment's 120 live library versions in embryo (see `evidence-and-disagreements.md`).

## 3. Shared-database coupling — three techniques, weakest first

**The finding is: more than one service writing to a schema.** Read-only consumers are a graded case,
reported separately, because that is exactly the point where the two taxonomies disagree — the quantum
reading is binary and Newman's is graded. The justification is definitional and both taxonomies agree
on the writer case.

1. **Static — scan the configuration.** Grep every service repo for JDBC or connection URLs and group
   by `host + database + schema`. Cheap, catches the common case, and fails precisely where the
   interesting cases hide: config servers and secret managers, where the datasource is not in the
   repo at all. An estate that answers this question from config alone will report itself clean.
2. **Runtime, from the database — the most reliable.** Every connecting application declares itself
   and the database records it.
   - PostgreSQL: `pg_stat_activity` exposes `datname`, `usename`, `client_addr` and
     **`application_name`**, which the client sets in its connection string. Group distinct
     `application_name` per `datname`; more than one is shared-database coupling, on the record.
   - SQL Server: the equivalent column is `program_name` in `sys.dm_exec_sessions`.
   - **The precondition that makes or breaks it:** if services do not set `application_name` /
     `Application Name=`, every session appears under the driver's default and the query returns
     nothing useful. Setting it is a one-line change per service and is a **prerequisite** for this
     measurement, not an afterthought — put it in the ADR, as `SKILL.md`'s sketch does.
3. **Runtime, from tracing — crosses services and databases at once.** OpenTelemetry's database client
   span conventions are Stable as of semantic conventions **v1.33.0 (2025)**. Group distinct
   `service.name` per (`db.system.name`, `db.namespace`) — `db.system.name` takes values such as
   `postgresql`, `microsoft.sql_server`, `mysql`, `oracle.db`; `db.namespace` is the database name,
   or `{instance_name}|{database_name}` for a named SQL Server instance. With statement-level
   attributes collected you can go to table granularity. **Migration warning:** these are the _new_
   stable names. Older instrumentation emits `db.system` and `db.name`, and OTel publishes a migration
   guide; a query or an example written against the old names is wrong today, and a mixed estate will
   emit both.

**Where it runs.** A scheduled query against the database or the observability backend. Never a build
gate — the fact being measured is production topology, which no build can see.

## 4. What has no measurement at all

State this plainly rather than letting a reader assume a gap is an oversight.

- **Connascence has no analyser.** The curated `analysis-tools.dev` catalogues list 137 Java tools and
  135 Python tools, and nothing connascence-specific appears in either. No linter in general use
  implements the taxonomy. Any claim that a pipeline enforces connascence is false; it is a review
  vocabulary and its governance surface is the review itself.
- **Quantum count has no analyser.** It is derived by hand from §2 and §3 plus the dependency graph.
  This is not a tooling gap waiting to be filled — the derivation needs the judgement calls in
  `SKILL.md`'s method, and a tool that guessed them would produce a confident wrong number.
- **Abstractness and distance from the main sequence stop at the deployable.** ArchUnit 1.5.0
  (released 2026-08-04, latest as of 2026-08-28) computes them inside a codebase —
  `ArchitectureMetrics.componentDependencyMetrics(components)` exposes afferent and efferent coupling,
  instability, abstractness and normalised distance from the main sequence — but across a process
  boundary "abstract" has no nominal type system to count, so the metric has no referent at all.
  Their use inside a codebase belongs to `component-and-release-boundaries`, which also holds this
  suite's position on absolute thresholds for them; do not import a number from there to here.

**One Maven Central caveat worth carrying.** On 2026-08-28 `search.maven.org`'s index still reported
1.4.1 as the latest `archunit-junit5` version while `maven-metadata.xml` for
`com.tngtech.archunit:archunit` already listed 1.5.0. Verify tool versions against `maven-metadata.xml`
rather than the search UI, or a fitness function's stated version will be wrong the day it is written.
