# Verification and rollout

## The compatibility pass

Run before changing anything. Same artefact, same flags, new runtime.

```bash
# 1. capture startup output in full — the compatibility warnings appear once, on stderr
java $JVM_OPTS -jar app.jar > run.out 2> run.err &

# 2. read what the JVM objected to
grep -E "warning|Ignoring option|Unrecognized|deprecated|removed in" run.err

# 3. confirm nothing is hiding the answer
grep -q "IgnoreUnrecognizedVMOptions" <<< "$JVM_OPTS" && echo "REMOVE IT FOR THIS PASS"
```

Three things routinely swallow the evidence, and all three are worth checking before concluding
the run was clean:

- **`-XX:+IgnoreUnrecognizedVMOptions`** turns an expired flag from a startup failure into
  silence.
- **A container log pipeline that keeps only stdout.** The compatibility warnings are on stderr.
- **A JSON log encoder installed early**, which can swallow or reformat pre-logging JVM output.

Then make the deprecation warnings fatal where you can:

```bash
# fail on any use of the Unsafe memory-access methods, rather than warning once
java --sun-misc-unsafe-memory-access=deny -jar app.jar

# and for the build
javac -Xlint:all -Werror ...
```

`deny` in a test environment is the highest-yield single step in this whole pass, because the
usage is almost always in a dependency and almost never in code you would think to grep.

## What to measure, and against what

The baseline must have been taken **before** the upgrade, with the method you will repeat
afterwards. A baseline taken after the fact is not a baseline.

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
heap, adopt a new default and clean up the flag list. Do not: if the result is worse, nothing in
that set can be attributed, and the rollback is a rewrite of the configuration rather than a
version change. `performance-methodology` is the discipline; an upgrade is where it is hardest to
hold.

## Staging the rollout

Separate the questions, because they fail differently and at different times.

1. **It starts.** Compatibility pass, in CI, on the new JDK. Catches classes 1, 2, 3 and 5.
2. **It is correct.** The full test suite on the new runtime, including whatever exercises
   serialization, cryptography, locale-sensitive formatting and time. These are the areas where a
   changed default (class 4) shows as a wrong answer rather than an error.
3. **It is correct under load.** One instance, real traffic, watched against the baseline. This
   is the only gate that catches an ergonomic change.
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
  than reuse: a stale archive is ignored silently, so the symptom is a startup time that quietly
  goes back to where it started with no error anywhere.

## When it stalls

An upgrade halted halfway, with two JDKs in production and no decommission date, is the same
shape as any stalled migration: the cost is being paid twice and the benefit once. That is
`architecture-refactoring-paths` and `legacy-enterprise-modernization` territory, and the useful
move is to name the blocking dependency explicitly rather than to let the state persist as an
ambient condition.
