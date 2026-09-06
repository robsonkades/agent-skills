# Verification and rollout

## The compatibility pass

Run in an isolated environment using the exact target executable. Preserve the same artifact
and supported flags for the first comparison. Use the existing integration harness with
bounded startup/readiness waits, test traffic, stdout/stderr capture, exit status, and cleanup
of the process it owns on success/failure/timeout. Do not connect the compatibility run to
production side effects. A service launch by itself is not a completed compatibility test.

```bash
# Bash: inspect the completed harness capture; case-insensitive includes WARNING.
grep -Ei "warning|Ignoring option|Unrecognized|deprecated|removed in" run.err
```

Keep the entire logs and process result: grep finds candidate diagnostics, not all failures,
and no match is not a passing test. Capture through exercised runtime paths because Unsafe,
native-access and agent warnings may appear after startup. Inspect all option sources, not
only a visible `JVM_OPTS` variable; remove `IgnoreUnrecognizedVMOptions` in this isolated pass.

Three things routinely swallow the evidence, and all three are worth checking before concluding
the run was clean:

- **`-XX:+IgnoreUnrecognizedVMOptions`** turns an expired flag from a startup failure into
  silence.
- **A container log pipeline that keeps only stdout.** The compatibility warnings are on stderr.
- **A JSON log encoder installed early**, which can swallow or reformat pre-logging JVM output.

On a target that supports the options (these examples use JDK 25), add focused strict runs
through the same harness and the real build tool:

```bash
# Additional runtime option: exercise Unsafe memory-access paths under denial.
--sun-misc-unsafe-memory-access=deny

# Additional javac options, passed through the project's existing build configuration:
-Xlint:deprecation -Xlint:removal -Werror
```

`deny` in a test environment is the highest-yield single step in this whole pass, because the
usage is almost always in a dependency and almost never in code you would think to grep.

## What to measure, and against what

Prefer a pre-upgrade baseline with the method repeated on the target. If it was not captured,
rerun the preserved old image/artifact in a comparable isolated environment alongside the new
one. Label that reconstructed baseline and its workload/data/environment differences. Without
a valid comparison, report that performance impact is unproven; do not invent a speedup.

| If the upgrade was justified by   | Measure                                            | Owned by                  |
| --------------------------------- | -------------------------------------------------- | ------------------------- |
| Lower footprint                   | RSS and heap after a settled period under load     | `jvm-memory-regions`      |
| Shorter pauses                    | Pause distribution, p99 and max — never the mean   | `gc-log-analysis`         |
| Faster startup                    | Time to first good response, not time to port open | `startup-cds-crac-leyden` |
| Throughput                        | A load test whose validity conditions hold         | `load-testing`            |
| Nothing — it was security support | That nothing regressed                             | the pre-upgrade baseline  |

The last row is the most common and the most often skipped. An upgrade taken for support reasons
still needs a before-and-after, because "no change expected" is a prediction that can be wrong.

**Change one variable.** The temptation during an upgrade is to also switch collector, resize the
heap or clean up unrelated code. Separate optional tuning from the runtime comparison, while
retaining required compatibility/security changes and recording their effect on attribution.
Do not pin an obsolete or insecure default just to claim one variable changed.

## Staging the rollout

Separate the questions, because they fail differently and at different times.

1. **It starts.** Bounded compatibility pass in CI on the new JDK; catches startup-visible failures.
2. **It is correct.** The full test suite on the new runtime, including whatever exercises
   serialization, cryptography, locale-sensitive formatting and time. These are the areas where a
   changed default (class 4) shows as a wrong answer rather than an error.
3. **It is correct under load.** One instance, real traffic, watched against the baseline. This
   validates actual behavior; inspect selected ergonomic values in the earlier stages too.
4. **It is correct across the fleet.** Wider rollout.

Between 3 and 4, the two versions run at once. That is a mixed-version deploy with the usual
consequences — a serialized cache, a session store or a message contract written by one version
and read by the other. `schema-evolution-and-compatibility` and `rpc-and-api-contracts` own that
half; what belongs here is remembering that a JDK upgrade is one.

## Rollback

State the criterion before starting, not during the incident: which metric, past which value, for
how long, reverts the deploy.

Rollback is a deploy of the previous image, which means the previous image must still exist and
must still be deployable. Two things quietly break that:

- **A migration that ran on the way up** and is not backward-compatible. Then the rollback is not
  a deploy. `flyway`-style expand/contract discipline is what keeps it one.
- **Artefacts regenerated for the new runtime** — CDS and AOT archives are tied to the JDK that
  produced them. Keep the old ones until the new version is fleet-wide, and regenerate rather
  than reuse. Archive incompatibility may cause fallback or startup failure depending on
  artifact/flags/build. For CDS, `-Xshare:on` makes required archive failure fatal whereas
  `-Xshare:auto` permits fallback. Check launch output and actual archive use on both images.

## Primary references

- [JDK 25 java launcher](https://docs.oracle.com/en/java/javase/25/docs/specs/man/java.html) — CDS launch modes, preview and diagnostic options.
- [JDK 25 javac](https://docs.oracle.com/en/java/javase/25/docs/specs/man/javac.html) — release and warning options.

## When it stalls

An upgrade halted halfway, with two JDKs in production and no decommission date, is the same
shape as any stalled migration: the cost is being paid twice and the benefit once. That is
`architecture-refactoring-paths` and `legacy-enterprise-modernization` territory, and the useful
move is to name the blocking dependency explicitly rather than to let the state persist as an
ambient condition.
