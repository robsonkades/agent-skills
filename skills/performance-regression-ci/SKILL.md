---
name: performance-regression-ci
description: >
  Turning a performance measurement into an automatic gate: choosing a metric stable
  enough to gate on, calibrating thresholds against the pipeline's own measured variance,
  fixed thresholds versus historical trending, noise control on shared CI runners, and
  updating a baseline deliberately. Use when a benchmark job runs on a shared runner,
  when a threshold was picked by convention rather than measured, when a comparison
  script compares means and ignores scoreError, when scoreError is assumed to be a 95%
  interval, when a delta's sign convention was not checked against the BenchmarkMode,
  when a step captures a piped command's status with raw $?, when a benchmark has a
  single @Param value, or when a stale baseline keeps producing false positives. Does
  not cover running or writing the benchmark itself (jmh-advanced), the full-system run
  (load-testing), or the general question of whether two measurements differ
  (latency-statistics).
---

# Performance Regression CI

## Purpose

Build a gate that blocks a real regression and does not block anything else. A performance
benchmark is a noisy test, not a deterministic one, so the comparison logic — not the
benchmark — is where a gate succeeds or fails.

The two failures this prevents sit on opposite sides. A gate calibrated below the runner's
own variance fires constantly, the team learns to ignore it, and real regressions land
under cover of "CI noise". A gate whose comparison silently never fails — a sign convention
applied backwards, an exit code lost in a pipe — approves regressions while displaying a
green tick.

## Workflow

1. **Measure the runner's natural variation before setting any threshold.** Ten runs of the
   same benchmark, no code changes, on the runner that will actually be used. Threshold
   values copied from anywhere else are arbitrary numbers.
2. **Decide whether that runner can host a gate at all.** Shared runners vary 20–50% run to
   run, which forces thresholds too wide to catch a realistic 10–20% regression. The fix is
   dedicated hardware, not a wider threshold.
3. **Pin the measurement's environment**, so run-to-run differences come from the code:
   fixed `-Xms`/`-Xmx`, `-XX:+AlwaysPreTouch`, an explicit collector, isolated forks.
4. **Fix the sign convention from the `BenchmarkMode`** and apply it identically in the
   diagram, the script and the workflow. `AverageTime`/`SampleTime`: positive delta is a
   regression. `Throughput`: negative delta is.
5. **Require significance before thresholds.** A delta must exceed the measurement error
   before its magnitude is compared to anything. See `references/calibrating-the-gate.md`.
6. **Gate on more than one point of the parameter space.** A complexity change from O(n) to
   O(n²) is invisible at the small `@Param` and catastrophic at the large one.
7. **Validate the gate end to end by injecting a deliberate regression** and confirming the
   PR is actually blocked — not merely that the comparison script returns the right code
   locally.
8. **Update the baseline deliberately**, from a green run on the trunk, and persist every
   result with its commit so gradual drift is visible.

## Rules

- Derive `warning_threshold` and `regression_threshold` from measured natural variation:
  roughly 2× and 4× it. A threshold below the environment's own variation generates noise
  forever.
- Never run a gating benchmark on a shared runner (`runs-on: ubuntu-latest`) and then widen
  the threshold to compensate. Use a dedicated, isolated runner.
- Never compare scores alone. A delta must exceed the combined measurement error before it
  is classified at all.
- JMH's `scoreError` is the half-width of a **99.9%** confidence interval
  (`getMeanErrorAt(0.999)`), not 95%, and it is not configurable by annotation. That makes
  the non-overlap criterion more conservative than teams assume — if the interval already
  spans much of the regression size you want to catch, that regression can never cross the
  significance bar even when it is real.
- Distinguish the two variance sources, because their fixes differ. Measurement noise —
  incomplete JIT warm-up, asynchronous GC, hardware jitter — is reduced by more iterations
  and forks. Infrastructure variation — shared runner, CPU throttling — is not reduced by
  more iterations at all.
- Fix the heap in the forked JVM (`-Xms512m -Xmx512m -XX:+AlwaysPreTouch`). Ergonomic heap
  sizing that varies with the runner's available memory changes GC frequency between runs
  and shows up as a fake delta.
- Use `${PIPESTATUS[0]}`, never raw `$?`, to capture the exit code of a command inside a
  pipe. `$?` reflects the last command only when `pipefail` is off, and whether it is on
  varies by runner and by shell selection.
- Put `if: always()` on the step that posts the report. Without it, an abort in the
  comparison step silently skips the diagnosis nobody then receives.
- Never let a comparison script return 0 on a missing or malformed input. Reserve a
  distinct exit code (2) for parse failure, so an absent baseline cannot read as "no
  regression".
- Beware `continue-on-error: true` on the comparison step: combined with `set -e` the
  script can abort before writing its output, leaving the output variable empty — and an
  empty string compares unequal to `'0'`, so the gate appears to work while testing nothing.
- Give every gated benchmark multiple `@Param` values covering small, medium and large
  inputs, and treat a regression that appears at only some sizes as a complexity change,
  not a constant-factor one.
- Persist every result with commit and timestamp. Comparing only against one fixed baseline
  hides gradual drift that no PR-to-PR diff can reveal, and a stale baseline produces false
  positives indefinitely.
- Record the expected outcome before running a comparative benchmark. A result that
  contradicts its own narrative — a parallel version slower than the sequential one at small
  inputs — is usually a parameterisation problem, not a discovery.

## References

- [Calibrating the gate](references/calibrating-the-gate.md) — the natural-variation
  procedure, threshold derivation, the sign-convention table, and the two significance
  criteria with their sensitivity trade-off. Read before enabling a gate in a repository or
  when triaging a regression alert.
- [Pipeline construction](references/ci-pipeline.md) — the JMH CI configuration, the
  comparison script's structure and exit codes, and the GitHub Actions workflow with the
  exit-code and reporting traps already corrected. Read when writing or reviewing the
  workflow itself.
