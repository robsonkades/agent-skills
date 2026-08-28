# Catalogue: metric, threshold shape, site, consequence

Read when choosing a metric and a site for a named characteristic. Every row is **replaceable**: the
skill is written against metric + threshold + site + consequence, and tool names rot faster than the
taxonomy does. The tool-status table at the end says exactly what was verified and by whom.

## Placement

Classification predicts cost and home. The rule of thumb: **the earlier it runs, the more binary it
has to be.**

| Classification                 | Natural home                                       | Consequence on failure                             |
| ------------------------------ | -------------------------------------------------- | -------------------------------------------------- |
| atomic + static + triggered    | pre-commit hook or pull-request check              | block the merge                                    |
| atomic + static + temporal     | nightly or weekly scheduled job                    | open a ticket with an SLA; do not block            |
| holistic + static + triggered  | pre-release stage on a production-like environment | block the release                                  |
| holistic + dynamic + triggered | nightly on main, comparing against a baseline      | alert plus owner triage; block only on a big delta |
| holistic + dynamic + continual | production, wired to an error budget               | freeze deploys when the budget is spent            |
| manual                         | a named human stage with a recorded verdict        | the release does not proceed without the verdict   |

**Four legitimate reasons a check stays manual** (three from _BEA_ ch. 2, the fourth from Ford,
2022): a legal requirement that defies automation; engineering practice too immature to have
anywhere to put an automated check; automation not cost-effective for that verification; and timing
that needs judgement — the failover test is objective, but you cannot pull the plug on the database
on every build. The first three are about whether automation is possible or worth it; the fourth is
about _when_, and a team that files measurable things under it has stopped governing them.

## Rows

Threshold column gives the **shape**, not a number you may adopt. Where a number appears it names
its provenance, and a number without provenance is a number you have not chosen.

| Characteristic             | Metric                                                           | Threshold shape                                                                                                                                         | Site                                                      | Class                        |
| -------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- | ---------------------------- |
| Layer/dependency direction | illegal type references between named slices                     | zero new (baseline the rest — that baseline is `quality-gates`)                                                                                         | PR, test phase                                            | atomic, static, triggered    |
| Acyclic components         | dependency cycles among package slices                           | zero cycles, once the current count is zero; otherwise zero new                                                                                         | PR                                                        | atomic, static, triggered    |
| Cohesion drift             | distance from the main sequence, `D = abs(A + I − 1)`            | no component's `D` worsening release over release — a delta, because the absolute value is arguable                                                     | nightly on main                                           | atomic, dynamic              |
| Complexity ceiling         | max cyclomatic complexity per function                           | see "the number everyone repeats" below before adopting 10                                                                                              | PR                                                        | atomic, static, triggered    |
| Known-vulnerable deps      | max CVSS; count matching CISA KEV                                | your published remediation policy's own score and window; zero KEV at any score                                                                         | PR **and** nightly (temporal)                             | atomic, static + temporal    |
| Licence compliance         | licences in the shipped dependency graph                         | the allowlist legal already signed, not one you invent                                                                                                  | PR                                                        | atomic, static, triggered    |
| API compatibility          | breaking-change diff against the published contract              | zero breaking changes without the major bump your versioning policy already promised                                                                    | PR                                                        | atomic, static, triggered    |
| Contract satisfaction      | fraction of active consumer contracts the provider verifies      | 100% for consumers currently in the target environment                                                                                                  | pre-deploy gate                                           | **holistic**, static         |
| Latency budget             | p95/p99 and failure rate under a defined load profile            | the figure already in the SLO; the load profile from your own traffic, not a round number                                                               | nightly + pre-release, prod-like                          | holistic, static             |
| Latency regression         | Δp99 against the stored previous-release baseline                | a delta wide enough to clear the pipeline's own measured variance (`performance-regression-ci`)                                                         | nightly on main                                           | holistic, **dynamic**        |
| Availability               | SLI success ratio over a rolling window                          | the SLO already promised, with the deploy freeze that makes it a fitness function                                                                       | continuous, production                                    | holistic, dynamic, continual |
| Resilience                 | steady-state hypothesis holds while a fault is injected          | error rate stays inside the SLO while one replica, AZ or dependency is killed                                                                           | game day; nightly in staging                              | holistic, dynamic            |
| Infrastructure policy      | policy violations on the plan                                    | zero of the severities your own risk register names; no public ingress to a data tier                                                                   | PR + nightly drift scan                                   | atomic, static               |
| PII containment            | log records matching a shared PII corpus                         | zero matches                                                                                                                                            | continuous, on the log stream                             | **holistic**, static         |
| Startup budget             | container start to first successful readiness probe              | the figure your platform's own scale-out or scheduler behaviour requires                                                                                | PR, on the built artefact                                 | atomic, static               |
| Artefact size              | gzipped bundle or image size                                     | the budget derived from the connection profile your users measurably have                                                                               | PR                                                        | atomic, static               |
| Accessibility              | serious/critical rule violations on key journeys                 | zero on the journeys named in the accessibility commitment you published                                                                                | PR against a preview deploy                               | atomic, static               |
| Cost                       | projected monthly cost delta of an infrastructure change         | the percentage your finance owner will actually act on, with an approval label above it                                                                 | PR                                                        | atomic, dynamic              |
| Dependency freshness       | days between a patched upstream release and its adoption         | the window your security policy already commits to — **temporal**, so never a PR gate                                                                   | nightly                                                   | atomic, temporal             |
| Schema migration safety    | destructive-change detection against the live schema             | zero destructive changes without an explicit expand/contract annotation                                                                                 | PR                                                        | atomic, static               |
| Deployability              | deployment frequency; change failure rate                        | direction of travel, reviewed — **never a build gate**, because it trails the change                                                                    | dashboard, reviewed monthly                               | holistic, dynamic            |
| Test signal                | mutation score — killed mutants / viable mutants on changed code | your own first full run as the baseline, then no regression on changed code; an absolute floor picked before you have measured is a number nobody chose | PR on the diff (a full run is too slow); full run nightly | atomic, static, triggered    |

Two rows that come from named practitioners rather than from this skill: Paula Paul & Rosemary Wang
(Thoughtworks, 11 Jan 2019) govern "no plaintext secrets in the codebase", "every service ships a
runbook and README", and "tracing IDs present" — cheap, binary, and the kind nobody thinks to write
down. Kiran Prakash (martinfowler.com, 5 Sep 2024) governs data products on discoverability,
addressability, self-descriptiveness and interoperability, and states his own limit: the generic set
is _"necessary but not sufficient"_, because _"merely ensuring that the access is blocked by default
is not sufficient to guarantee the security of a data product containing clinical trial data."_
Generic governance never reaches domain risk. That is what the domain-specific category is for.

## Maintainability, decomposed

The composite people actually arrive with, and the one no row above governs — because there is no
agreement-free reading of "maintainable". Run the procedure in `ungoverned.md`, and this is what it
produces. **The split below is this skill's construction**: any decomposition survives provided each
constituent has a metric two reviewers would read the same way. ISO/IEC 25010 publishes its own
sub-characteristics; quality models belong to `architecture-characteristics`, not here.

| Constituent           | Governed by the row above  | What it does not see                                                    |
| --------------------- | -------------------------- | ----------------------------------------------------------------------- |
| Boundary integrity    | Layer/dependency direction | coupling that is semantic rather than structural — boundary fidelity    |
| Cycle-freedom         | Acyclic components         | a cycle broken by an interface nobody needed                            |
| Local intelligibility | Complexity ceiling         | a simple function in the wrong place, and every naming problem there is |
| Contract stability    | API backward compatibility | an API that stays compatible while ceasing to mean the right thing      |
| Test signal           | Mutation score (row above) | whether the assertions test anything a user would notice                |

Five constituents governed, and **the residual is still large**: nothing here observes whether the
design is understandable to somebody who did not write it. That sentence is the deliverable — it is
what turns "we govern maintainability" (false) into "we govern five of its constituents and accept
the rest ungoverned" (true, and recorded as a `governance: none` entry beside them).

Note what this does to the request people usually bring. **"Raise the coverage gate" is not a
maintainability decision**; line coverage measures execution, not assertion — Fowler's
_AssertionFreeTesting_ (3 Aug 2004) records a project with a test per public method, a green bar
shown to the client, and no assertions at all. Mutation score is the signal that closes exactly that
gap, which is why it earns a row and a coverage percentage does not.

## The number everyone repeats

Cyclomatic complexity ≤10 traces to McCabe and NIST SP 500-235. NIST's position is **conditional**:
10 is a reasonable starting point, limits as high as 15 have been used successfully, but a higher
limit should be reserved for projects with specific operational advantages — experienced staff,
formal design, structured programming, walkthroughs, a comprehensive test plan — and an organisation
may raise it _"only if it's sure it knows what it's doing and is willing to devote the additional
testing effort required."_ The conditions travel with the number in the source and are stripped
everywhere else. SonarQube's 80% new-code coverage and 3% duplication are **vendor defaults**:
reasonable, and not derived from your risk.

## Tool status

**Verified by the research brief on 2026-08-27 via the GitHub Releases API, not re-verified by this
skill.** Confirm currency yourself before a fitness function is allowed to depend on a tool.

| Tool                                                             | Status on 2026-08-27                                                                      |
| ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| ArchUnit                                                         | v1.5.0, 2026-08-04 — current (also verified by `architecture-testing`)                    |
| Grafana k6                                                       | v2.2.0, 2026-08-10 — current (also verified by `architecture-characteristics`)            |
| OWASP dependency-check                                           | v13.0.0, 2026-08-03 — current                                                             |
| SonarQube Server                                                 | 26.8.0.126808, 2026-08-05 — current                                                       |
| Trivy / Grype / Syft                                             | v0.74.0 (2026-08-14) / v0.118.0 / v1.51.1 (both 2026-08-27) — current                     |
| dependency-cruiser, import-linter, Deptrac                       | current as of 2026-08                                                                     |
| Buf, oasdiff, japicmp, Pact, Atlas, Conftest, Checkov, Infracost | current as of 2026-07/08                                                                  |
| Chaos Mesh, LitmusChaos                                          | current as of 2026-07/08                                                                  |
| axe-core, pa11y-ci, Sloth                                        | current as of 2026-04/08                                                                  |
| ts-arch                                                          | v5.4.1, 2024-12-23 — maintained but slow                                                  |
| **NetArchTest** (.NET)                                           | v1.3.2, **2021-05-23** — stale; check forks before recommending                           |
| **Netflix Chaos Monkey**                                         | v2.1.3, 2025-01-06 — maintained but quiet                                                 |
| **Lighthouse CI**                                                | v0.15.1, **2025-06-26** — over a year without a release                                   |
| **JDepend**                                                      | last release 2.10, **2020-03-06**; repo pushed 2020-04-10 — dead                          |
| **Netflix Simian Army**                                          | archived; last push **2018-12-18** — dead, and recommended by _Fundamentals_ ch. 6 (2020) |
| **Netflix Security Monkey**                                      | archived; last push **2021-02-11** — dead                                                 |
| **Structure101**                                                 | acquired by SonarSource, announced Oct 2024; product status **unverified**                |
| **Great Expectations**                                           | repository moved; currency **unverified**                                                 |

Mutation runners were outside the research brief's sweep and were dated at this skill's second gate,
2026-08-28: **PIT (JVM) 1.30.0, 2026-08-27** — more recent than any row above — **Stryker-JS v10.0.0,
2026-08-14**, and **Stryker.NET 4.16.0, 2026-07-03**; none archived. Confirm any tool is still
maintained before a fitness function is allowed to depend on it.

The structural lesson is not about Netflix. **A catalogue written against named tools rots faster
than the taxonomy does**, so the durable artefact is the metric, the threshold, the site and the
consequence — the tool is an implementation detail you re-pick every few years.
