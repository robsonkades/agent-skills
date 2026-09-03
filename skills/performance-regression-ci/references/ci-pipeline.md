# Constructing the regression pipeline

## Separate measurement, comparison, and promotion

Use three independently testable components:

1. **Measurement** builds a pinned artifact and emits raw result plus fingerprint.
2. **Comparison** consumes two compatible evidence sets and emits a structured decision.
3. **Promotion** runs only in a trusted context and publishes an immutable baseline.

This prevents a pull request from redefining its comparator, replacing the baseline, or
turning malformed input into a pass.

## Result bundle contract

Store one immutable bundle per trial:

```text
manifest.json              # schema, commit, digest, epoch, tool/runtime/environment
jmh-result.json            # unmodified JMH output
independent-units.jsonl    # retained fork/session/block-level observations
stdout.txt
stderr.txt
diagnostics/               # JVM/OS evidence required by failure policy
decision.json              # comparator output, not input to later recomputation
```

The manifest should include at least benchmark FQCN, parameters, mode, unit, direction,
threads, forks, warm-up/measurement configuration, JMH and JDK identities, JVM arguments,
artifact and dataset digests, runner pool, host/CPU/cgroup identity, timestamp, and workflow
run/attempt. Canonicalize and hash it. Do not compare merely because JSON benchmark names
match.

## Comparator contract

The comparator should:

1. validate schema, checksums, finite numeric values, and expected entries;
2. enforce the compatibility/epoch policy;
3. normalize direction so positive means worse;
4. analyze independent blocks/units under the predeclared method;
5. apply MPIR, absolute guardrails, and multiplicity policy;
6. emit every benchmark result and an aggregate decision;
7. return a stable process status.

Example decision object:

```json
{
  "schemaVersion": 1,
  "status": "inconclusive",
  "reason": "interval_crosses_mpir",
  "baselineDigest": "sha256:...",
  "currentDigest": "sha256:...",
  "method": "paired-log-ratio-bootstrap-by-session",
  "mpir": 0.05,
  "effect": 0.043,
  "interval": [0.011, 0.071],
  "multiplicity": "holm-critical-family",
  "entries": []
}
```

Use separate statuses for `pass`, `regression`, `invalid`, and `inconclusive`. A new optional
benchmark can be `unbaselined`; disappearance of a required benchmark is invalid. Invalid
numeric values, duplicate keys, incompatible units, empty input, or unknown schema must not
be silently skipped.

## JMH configuration is an experimental input

Do not copy a universal annotation block. Choose forks, warm-up, measurement time, threads,
heap, collector, and parameters through benchmark validation and gate calibration. Record
the effective command line even when annotations supply defaults.

For a controlled microbenchmark profile, a command may look like:

```bash
java -jar target/benchmarks.jar \
  -f 4 -wi 5 -i 8 \
  -rff results/jmh-result.json -rf json \
  'com.example.CriticalPath.*'
```

Those numbers are examples, not recommended defaults. A target-like profile may deliberately
retain production heap/collector ergonomics. If two versions use different JDKs or flags,
that is a factorial experiment or a new epoch—not a clean code-only comparison.

JMH's aggregate `score`, `scoreError`, and `scoreUnit` are useful report fields. They are not
a substitute for retaining the observations and block identities required by the declared
comparison.

## Safe Bash status capture

GitHub documents explicit `shell: bash` as `bash --noprofile --norc -eo pipefail {0}`. A
failing comparator in `compare | tee report` therefore exits at the pipeline before the next
line can read `PIPESTATUS`. Capture deliberately:

```bash
set +e
python3 scripts/compare_benchmarks.py \
  --baseline results/baseline \
  --current results/current \
  2>&1 | tee results/comparison.txt
compare_status=${PIPESTATUS[0]}
set -e

printf 'exit_code=%s\n' "$compare_status" >> "$GITHUB_OUTPUT"
exit 0
```

The step exits zero only to allow unconditional report/artifact steps to run; a later policy
step interprets the recorded code. Capture `PIPESTATUS` immediately—any subsequent command
overwrites it. If the comparator may be killed before producing a decision, the policy step
must map missing output to `invalid`, not pass.

An alternative is to avoid the pipe: redirect comparator output to a file, capture `$?`
inside a `set +e` region, then display the file. Prefer the simplest pattern that the
repository tests on its actual shell.

## Workflow sketch

This is architecture, not copy-paste production YAML; pin action SHAs and permissions under
the repository's supply-chain policy.

```yaml
name: performance-screen

on:
  pull_request:

permissions:
  contents: read

jobs:
  measure:
    runs-on: [self-hosted, perf-screen]
    steps:
      - uses: actions/checkout@<pinned-sha>
        with:
          persist-credentials: false
      - uses: actions/setup-java@<pinned-sha>
        with:
          distribution: temurin
          java-version: '25'
      - name: Restore dependency cache only
        uses: actions/cache/restore@<pinned-sha>
        with:
          path: ~/.m2/repository
          key: m2-${{ runner.os }}-${{ hashFiles('**/pom.xml') }}
      - name: Build and measure untrusted candidate
        run: ./scripts/run-performance-trial.sh results/current
        shell: bash
      - name: Obtain read-only trusted baseline
        run: ./scripts/fetch-verified-baseline.sh results/baseline
        shell: bash
      - name: Compare and preserve status
        id: compare
        run: |
          set +e
          ./scripts/compare-performance.sh results/baseline results/current \
            2>&1 | tee results/comparison.txt
          status=${PIPESTATUS[0]}
          set -e
          printf 'exit_code=%s\n' "$status" >> "$GITHUB_OUTPUT"
        shell: bash
      - name: Upload evidence
        if: always()
        uses: actions/upload-artifact@<pinned-sha>
        with:
          name: performance-evidence-${{ github.run_id }}-${{ github.run_attempt }}
          path: results/
      - name: Enforce policy
        if: always()
        env:
          STATUS: ${{ steps.compare.outputs.exit_code }}
        run: ./scripts/enforce-performance-status.sh "$STATUS"
        shell: bash
```

The promotion workflow is separate and triggered from trusted trunk/scheduled/manual policy.
It rebuilds or verifies the artifact, rejects incompatible/invalid evidence, and publishes a
content-addressed baseline plus provenance. A `pull_request`-only workflow cannot contain a
reachable `github.ref == 'refs/heads/main'` promotion path.

## Trust boundary

Performance jobs execute repository code and benchmark payloads. For fork/untrusted PRs:

- expose no secrets or write-capable repository token;
- do not run untrusted code on persistent self-hosted infrastructure unless it is ephemeral,
  isolated, and rebuilt between jobs;
- use restore-only dependency caches and treat restored content as untrusted executable
  input;
- never let the PR upload/replace the trusted baseline;
- do not use `pull_request_target` to check out and execute the PR in privileged context;
- verify baseline digest/provenance after download;
- pin third-party actions according to policy.

GitHub-hosted ephemeral runners may be safer for untrusted code but noisier for small-effect
measurement. That favors an unprivileged screen followed by controlled confirmation of an
already-built, verified change—not weakening the trust boundary of a dedicated runner.

## Artifact and baseline transport

CI dependency caches are not a baseline registry: eviction, fallback keys, branch scope, and
unsigned restored contents make them unsuitable as the source of truth. Use an artifact or
object registry with immutable names/digests, retention policy, access control, and
provenance. Keep dependency caching separate.

Downloading “the latest artifact named baseline” is ambiguous when workflow runs, attempts,
branches, and expiry coexist. Resolve an explicit promoted manifest or commit and verify its
digest. Bootstrap is a calibration state, not a pass: collect history until the policy has
enough evidence.

## End-to-end validation matrix

| Scenario                             | Expected result                                          |
| ------------------------------------ | -------------------------------------------------------- |
| Compatible no-change trials          | Calibrated pass/inconclusive distribution                |
| Injected effect below MPIR           | Usually pass or inconclusive per declared error rate     |
| Injected effect at/above MPIR        | Target detection power; confirmation blocks              |
| Missing/malformed/empty baseline     | Invalid; no promotion                                    |
| Unit, mode, JDK, or epoch mismatch   | Invalid or explicit recalibration path                   |
| Comparator exits 1 through `tee`     | Report uploaded; policy blocks                           |
| Comparator crashes/exits 2           | Report uploaded; policy fails closed or routes by policy |
| Evidence remains inconclusive        | No fabricated pass; bounded escalation/retry             |
| Required benchmark disappears        | Invalid unless removal approval is supplied              |
| Runner cancellation/timeout/OOM      | Outcome retained with diagnostics                        |
| Untrusted PR attempts baseline write | Denied                                                   |
| Gradual series of sub-MPIR changes   | Champion/guardrail trend detects budget exhaustion       |

Test the real workflow trigger and permissions, not only the comparator locally. Exercise
cancellation and artifact-upload behavior because “always” does not make a step immune to
every job termination mode.

## Operational review

- Track gate duration, queue wait, cost, invalid/inconclusive rate, false alerts, confirmed
  regressions, and time to diagnosis.
- Quarantine a demonstrably invalid benchmark with an owner and expiry; do not silently
  remove it from the family.
- Recalibrate after runner/JDK/harness/data changes and periodically challenge the gate with
  a known injected regression.
- Preserve raw evidence long enough to investigate drift; summaries alone cannot repair a
  flawed model.
- Make overrides explicit, authorized, expiring, and linked to the accepted performance
  budget or follow-up work.

## Authoritative references

- [GitHub Actions workflow syntax](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax) — shell invocation and step semantics.
- [GitHub Actions secure-use reference](https://docs.github.com/en/actions/reference/security/secure-use) — untrusted checkout, action pinning, and self-hosted runner risks.
- [GitHub Actions dependency caching](https://docs.github.com/en/actions/reference/workflows-and-actions/dependency-caching) — cache scope and poisoning considerations.
- [GitHub Actions artifacts](https://docs.github.com/en/actions/how-tos/writing-workflows/choosing-what-your-workflow-does/storing-and-sharing-data-from-a-workflow) — artifact retention and transport primitives.
- [OpenJDK JMH](https://github.com/openjdk/jmh) — authoritative harness source and samples.
