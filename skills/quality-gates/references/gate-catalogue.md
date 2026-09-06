# The gate catalogue

Runtimes are order-of-magnitude for a mid-sized Java service; measure your own. "Noise" is the
rate at which the gate flags things that are not defects — the property that decides whether
people keep it on.

| Gate                     | Catches                                              | Runtime  | Noise            | Belongs on                           |
| ------------------------ | ---------------------------------------------------- | -------- | ---------------- | ------------------------------------ |
| Compile                  | Everything the type system encodes                   | seconds  | none             | pre-commit                           |
| `-Xlint:all -Werror`     | Raw types, unchecked casts, deprecation, fallthrough | seconds  | low              | pre-commit                           |
| Format check             | Formatting drift                                     | seconds  | none             | pre-commit                           |
| Unit tests               | Logic defects in changed code                        | < 1 min  | low              | pre-commit / PR                      |
| Error Prone              | Known bug patterns at compile time                   | +20–50%  | low              | PR                                   |
| NullAway                 | Nullability contract violations                      | small    | medium initially | PR                                   |
| SpotBugs                 | Bytecode-level bug patterns                          | 1–3 min  | medium           | PR / main                            |
| Architecture tests       | Layer and dependency rule violations                 | seconds  | none             | PR                                   |
| Integration tests        | Schema, SQL, wiring, transactions                    | 2–10 min | low              | PR                                   |
| Dependency vulnerability | Known CVEs in the dependency tree                    | 1–3 min  | high             | main / scheduled                     |
| Contract verification    | Breaking a consumer's expectations                   | 1–2 min  | low              | PR (producer side)                   |
| Performance regression   | Latency or throughput regressions                    | long     | high             | main (see performance-regression-ci) |
| Reproducible build check | Non-deterministic build output                       | 2× build | none             | release                              |
| SBOM generation          | Nothing — it produces an artefact for later          | seconds  | none             | release                              |

## Compiler-level gates

The compiler is the cheapest analyser you own and the most under-used.

`-Xlint:all -Werror` promotes every javac warning to a build failure. Verified on JDK 25: a raw
`List` produces `warning: [rawtypes] found raw type: List`, and with `-Werror` the build stops
with `error: warnings found and -Werror specified`.

Turning it on for an existing codebase produces hundreds of findings at once. Ratchet: enable
per module as each is cleaned, or enable specific categories (`-Xlint:rawtypes,unchecked`)
and add categories over time.

**Error Prone** hooks into javac and adds several hundred bug patterns — `==` on boxed types,
format-string mismatches, misused `Optional`, ignored return values. Its findings are usually
real; its cost is compile time and the initial cleanup. **NullAway** rides on it and enforces
nullability contracts, including JSpecify with appropriate version/configuration. Other checkers
also enforce nullness; annotations alone do not. Inspect supported javac/annotation versions and
configured analysis scope before adoption (java-null-safety).

## Static analysis on bytecode and source

**SpotBugs** analyses bytecode and finds a different class of defect from Error Prone — unclosed
resources on exception paths, inconsistent synchronisation, exposure of internal
representation. It is slower and noisier; run it on the pull request or on main, not
pre-commit, and use an exclusion file that is reviewed like code.

**Checkstyle** and **PMD** overlap with formatting and with the smell catalogue. Keep only the
rules that encode a decision the team actually made — a default rule set produces exactly the
comment-noise that trains people to ignore the tool.

Formatting is not a static-analysis question: enforce it with a formatter (Spotless with
google-java-format or palantir-java-format) so that the only possible outcome is "reformatted",
never a discussion.

## Test gates

Unit tests belong pre-commit — if they are not fast enough for that, that is the finding
(java-testing-strategy). Integration tests belong on the pull request with the real engine via
Testcontainers or an equivalent isolated engine. They exercise selected schema/SQL behavior,
not every migration state, query or production configuration.

Two failure modes specific to test gates:

- **Flaky tests**, which convert a red build into "run it again" and destroy the signal for
  every other gate. Quarantine is a stopgap with an expiry date, not a resting place
  (java-test-design).
- **Coverage thresholds**, which measure execution rather than verification. Report coverage on
  the diff for the reviewer to read; if a threshold is required, pair it with meaningful
  behavioral assertions and reviewed exclusions rather than treating it as sufficient quality.

## Dependency and supply-chain gates

Vulnerability scanning is the noisiest gate in most pipelines: a CVE in a transitive dependency
on a path you never call may still require investigation. Scan changed dependencies on PRs as
required by risk/policy and scan deployed/main inventories on a schedule for newly disclosed
issues. Triage severity, reachability, environment and fix availability with an owner, and record accepted risks with an expiry date so
"accepted" does not silently become "forgotten".

Automated dependency updates (Renovate, Dependabot) complement scanning and tests by reducing
upgrade backlog. Currency alone does not establish safety or eliminate newly disclosed vulnerabilities.

**Maven Enforcer** is worth one rule most teams miss: dependency convergence. Two versions of
the same dependency requested along different tree paths expose conflicting expectations.
Maven normally mediates to one version; convergence does not mean both versions were on the
runtime classpath, nor does satisfying it prove binary compatibility.

## Release gates

- **Reproducible build**: independently rebuild specified artifacts from recorded inputs and
  compare bytes. `project.build.outputTimestamp` controls timestamps in supporting Maven plugins;
  plugin versions, generated content, environment and archive ordering can still differ. Confirm
  the deployed artifact digest/provenance separately; two matching local builds do not identify
  what production is running.
- **SBOM** (CycloneDX, SPDX): not a gate — it produces the record you need on the day a CVE is
  announced and someone asks which services ship the affected version.

## Ratcheting a gate onto an existing codebase

1. Run it and classify severity, correctness and repair cost. A finding count does not set scope.
2. Where staged adoption is justified, **baseline**: record current violations in a file the tool reads, fail only on new
   ones where the tool supports reliable finding identity. Diff-only analysis can miss cross-file
   defects; run the complete relevant analysis and compare findings when possible. Do not baseline
   an urgent exploitable defect merely because it predates the change.
3. Give the baseline an owner and a direction — findings removed when a file is touched
   anyway. A baseline nobody shrinks is a permanent exemption with extra steps.
4. Never fix hundreds of findings in one commit. It is unreviewable, it will contain a
   behaviour change, and it will be blamed for the next incident whether or not it caused it
   (java-refactoring).

Primary references: [Maven dependency convergence](https://maven.apache.org/enforcer/enforcer-rules/dependencyConvergence.html),
[Maven reproducible builds](https://maven.apache.org/guides/mini/guide-reproducible-builds.html), and
[NullAway](https://github.com/uber/NullAway). Tool compatibility and configured scope require local verification.
