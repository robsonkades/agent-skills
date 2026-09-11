# The gate catalogue

Placement below is a starting point within the required-check policy. Measure elapsed and queue
time, cold/warm runs, scope and versions before comparing cost. Classify actual reports as defects,
policy violations, false positives or invalid runs; neither runtime nor noise is a tool constant.

| Gate                     | Evidence provided                                                  | Candidate placement                                |
| ------------------------ | ------------------------------------------------------------------ | -------------------------------------------------- |
| Compile                  | Syntax/type errors in compiled sources for the selected toolchain  | Local / PR                                         |
| `-Xlint:all -Werror`     | Enabled javac warnings, promoted to errors                         | Local / PR after adoption review                   |
| Format check             | Drift from configured formatting                                   | Local / PR                                         |
| Unit tests               | Violations of exercised assertions and contracts                   | Local fast subset / PR                             |
| Error Prone              | Configured source-level bug-pattern findings                       | PR                                                 |
| NullAway                 | Nullness findings within configured analysis scope                 | PR                                                 |
| SpotBugs                 | Configured bytecode-level bug-pattern findings                     | PR / main according to risk                        |
| Architecture tests       | Violations of encoded rules over imported classes                  | PR                                                 |
| Integration tests        | Exercised schema, SQL, wiring and transaction behavior             | PR                                                 |
| Dependency vulnerability | Inventory matches against a vulnerability feed, requiring triage   | Changed dependencies on PR / scheduled inventories |
| Contract verification    | Violations of exercised consumer expectations                      | PR (producer side)                                 |
| Performance regression   | Changes in measured metrics under the gate's comparison protocol   | Calibrated PR / main (performance-regression-ci)   |
| Reproducible build check | Byte differences across specified builds                           | Release                                            |
| SBOM generation          | Inventory artifact; generation alone establishes no safety verdict | Release                                            |

## Compiler-level gates

The compiler is the cheapest analyser you own and the most under-used.

`-Xlint:all -Werror` promotes every javac warning to a build failure. Verified on JDK 25: a raw
`List` produces `warning: [rawtypes] found raw type: List`, and with `-Werror` the build stops
with `error: warnings found and -Werror specified`.

Turning it on for an existing codebase produces hundreds of findings at once. Ratchet: enable
per module as each is cleaned, or enable specific categories (`-Xlint:rawtypes,unchecked`)
and add categories over time.

**Error Prone** hooks into javac and adds several hundred bug patterns — `==` on boxed types,
format-string mismatches, misused `Optional`, ignored return values. Triage a representative sample
and measure compile cost before rollout. **NullAway** rides on it and enforces
nullability contracts, including JSpecify with appropriate version/configuration. Other checkers
also enforce nullness; annotations alone do not. Inspect supported javac/annotation versions and
configured analysis scope before adoption (java-null-safety).

## Static analysis on bytecode and source

**SpotBugs** analyses bytecode and finds a different class of defect from Error Prone — unclosed
resources on exception paths, inconsistent synchronisation, exposure of internal
representation. Select placement from measured cost and when the risk must be caught; a check
run only on main cannot block the original merge. Review exclusion files like code.

**Checkstyle** and **PMD** overlap with formatting and with the smell catalogue. Keep only the
rules that encode a decision the team actually made — a default rule set produces exactly the
comment-noise that trains people to ignore the tool.

Formatting is not a static-analysis question: enforce it with a formatter (Spotless with
google-java-format or palantir-java-format) so that the only possible outcome is "reformatted",
never a discussion.

## Test gates

Use a fast relevant subset locally when it helps feedback; required CI must independently run
the selected checks because local hooks may not execute. Choose broader unit/integration coverage
from risk and measured cost (java-testing-strategy). For database integration checks, use the real
engine via Testcontainers or an equivalent isolated engine. They exercise selected schema/SQL behavior,
not every migration state, query or production configuration.

Two failure modes specific to test gates:

- **Flaky tests**, which convert a red build into "run it again" and destroy the signal for
  every other gate. Quarantine is a stopgap with an expiry date, not a resting place
  (java-test-design).
- **Coverage thresholds**, which measure execution rather than verification. Report coverage on
  the diff for the reviewer to read; if a threshold is required, pair it with meaningful
  behavioral assertions and reviewed exclusions rather than treating it as sufficient quality.

## Dependency and supply-chain gates

A CVE in a transitive dependency on a path you never call may still require investigation.
Separate feed matches from applicability and exploitability. Scan changed dependencies on PRs as
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
4. Batch fixes by independent behavior and verification. A deterministic mechanical rewrite may
   be reviewable at scale; separate semantic repairs and preserve generated-change provenance
   rather than deciding solely by finding count (java-refactoring).

Primary references: [Maven dependency convergence](https://maven.apache.org/enforcer/enforcer-rules/dependencyConvergence.html),
[Maven reproducible builds](https://maven.apache.org/guides/mini/guide-reproducible-builds.html), and
[NullAway](https://github.com/uber/NullAway), [Error Prone installation](https://errorprone.info/docs/installation),
and the [JDK 25 javac manual](https://docs.oracle.com/en/java/javase/25/docs/specs/man/javac.html).
Tool compatibility and configured scope require local verification; the compiler's runtime and
the application's target release are separate constraints.
