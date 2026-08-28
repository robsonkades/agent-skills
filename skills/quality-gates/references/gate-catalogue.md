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
JSpecify nullability annotations, which is the only mechanism that makes `@Nullable` contracts
load-bearing rather than documentation (java-null-safety).

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
Testcontainers; they are the only gate that proves the schema and the SQL.

Two failure modes specific to test gates:

- **Flaky tests**, which convert a red build into "run it again" and destroy the signal for
  every other gate. Quarantine is a stopgap with an expiry date, not a resting place
  (java-test-design).
- **Coverage thresholds**, which measure execution rather than verification. Report coverage on
  the diff for the reviewer to read; gating on a percentage buys tests written to raise it.

## Dependency and supply-chain gates

Vulnerability scanning is the noisiest gate in most pipelines: a CVE in a transitive dependency
on a path you never call still fails the build. Run it on a schedule against main rather than
on every pull request, triage with an owner, and record accepted risks with an expiry date so
"accepted" does not silently become "forgotten".

Automated dependency updates (Renovate, Dependabot) plus a real test suite is a stronger control
than a scanner and a manual upgrade backlog, because it keeps the distance to current small
enough that upgrading is routine.

**Maven Enforcer** is worth one rule most teams miss: dependency convergence. Two versions of
the same library on the classpath produce failures that look like anything except what they
are.

## Release gates

- **Reproducible build**: build twice, compare artefacts. `project.build.outputTimestamp` in
  Maven removes the timestamp variance that otherwise makes this impossible. It matters because
  it lets you prove the artefact in production is the artefact from that commit.
- **SBOM** (CycloneDX, SPDX): not a gate — it produces the record you need on the day a CVE is
  announced and someone asks which services ship the affected version.

## Ratcheting a gate onto an existing codebase

1. Run it and count the findings. If under about twenty, just fix them.
2. Otherwise **baseline**: record current violations in a file the tool reads, fail only on new
   ones. Most tools support this directly; where they do not, run against the diff.
3. Give the baseline an owner and a direction — findings removed when a file is touched
   anyway. A baseline nobody shrinks is a permanent exemption with extra steps.
4. Never fix hundreds of findings in one commit. It is unreviewable, it will contain a
   behaviour change, and it will be blamed for the next incident whether or not it caused it
   (java-refactoring).
