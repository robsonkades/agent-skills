# Pipeline construction

## The benchmark, configured for CI

```java
@BenchmarkMode(Mode.AverageTime)
@OutputTimeUnit(TimeUnit.MICROSECONDS)
@Warmup(iterations = 3, time = 2)       // reduced for pipeline speed
@Measurement(iterations = 5, time = 2)
@Fork(value = 2, jvmArgsAppend = {      // 2 forks: speed against reliability
    "-Xms512m", "-Xmx512m",             // fixed heap: no variable GC ergonomics
    "-XX:+AlwaysPreTouch",
    "-XX:+UseG1GC"
})
@State(Scope.Benchmark)
public class CriticalPathBenchmarks {

    @Param({"100", "1000", "10000"})    // never a single value
    int dataSize;
    ...
}
```

The `@Param` spread is not decoration. A change from O(n) to O(n^2) is invisible at
`size=10` and catastrophic at `size=100000`. A fixed per-call overhead does the opposite:
it looks like a regression at the small size and is a real gain at the large one.

## Running and exporting

```bash
#!/bin/bash
set -euo pipefail

mvn clean package -DskipTests -q

java -jar target/benchmarks.jar \
    -f 2 \
    -wi 3 -w 2s \
    -i 5  -r 2s \
    -rff results/benchmark-results.json \
    -rf json \
    -bm avgt \
    -tu us \
    ".*CriticalPath.*"
```

## Comparison script contract

Read `primaryMetric.score`, `primaryMetric.scoreError` and `primaryMetric.scoreUnit` per
entry, keyed by benchmark name plus its `params`, so each `@Param` combination is compared
against its own counterpart.

Exit codes, and why the third one matters:

| Code | Meaning                                      |
| ---- | -------------------------------------------- |
| 0    | No regression                                |
| 1    | Regression detected                          |
| 2    | Parse error — file missing or malformed JSON |

A missing baseline must not exit 0. Distinguishing 2 from 0 is what stops "the file was not
there" from reading as "nothing regressed". The same applies to a file that parses but
contains no benchmark entries: that is a code 2, not a clean run.

Classification order inside the script, for `Mode.AverageTime`:

```python
combined_noise = (base.score_error + curr.score_error) / base.score
is_significant = abs(delta) > combined_noise and abs(delta) > noise_threshold

if not is_significant:             # STABLE — inside the noise
elif delta > regression_threshold: # REGRESSION — collected, exit 1 at the end
elif delta > warning_threshold:    # WARNING — flagged, does not block
elif delta < -noise_threshold:     # IMPROVEMENT — recorded
else:                              # STABLE
```

A benchmark present in `current` but absent from `baseline` is new, not a regression —
report it and move on.

## GitHub Actions workflow

```yaml
name: Performance Regression Check

on:
  pull_request:
    paths: ['src/**/*.java', 'pom.xml']

jobs:
  benchmark:
    runs-on: [self-hosted, benchmark-dedicated] # not ubuntu-latest

    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0 # history is needed to locate the baseline

      - name: Set up JDK 25
        uses: actions/setup-java@v4
        with:
          java-version: '25'
          distribution: 'temurin'

      - name: Cache Maven
        uses: actions/cache@v4
        with:
          path: ~/.m2
          key: ${{ runner.os }}-m2-${{ hashFiles('**/pom.xml') }}

      - name: Run benchmarks (PR branch)
        run: |
          mvn clean package -DskipTests -q
          mkdir -p results
          java -jar target/benchmarks.jar \
            -f 2 -wi 3 -w 2s -i 5 -r 2s \
            -rff results/current.json -rf json \
            -bm avgt -tu us

      - name: Fetch baseline from main
        run: |
          gh run download -n benchmark-baseline --dir results/ || true
          if [ ! -f results/baseline.json ]; then
            echo "No baseline found. Using this run as the baseline (first run)."
            cp results/current.json results/baseline.json
          fi
        env:
          GH_TOKEN: ${{ github.token }}

      - name: Compare benchmarks
        id: compare
        run: |
          python3 scripts/compare_benchmarks.py \
            results/baseline.json results/current.json \
            --threshold 0.15 --warning 0.05 \
            2>&1 | tee results/comparison.txt
          echo "exit_code=${PIPESTATUS[0]}" >> "$GITHUB_OUTPUT"

      - name: Comment PR
        if: always()
        uses: actions/github-script@v7
        with:
          script: |
            const fs = require('fs');
            const comparison = fs.readFileSync('results/comparison.txt', 'utf8');
            const exitCode = '${{ steps.compare.outputs.exit_code }}';
            const status = exitCode === '0' ? 'No regressions' : 'Regressions detected';
            github.rest.issues.createComment({
              issue_number: context.issue.number,
              owner: context.repo.owner,
              repo: context.repo.repo,
              body: `## Performance Benchmark Report\n\n**${status}**\n\n\`\`\`\n${comparison}\`\`\``
            });

      - name: Fail if regression
        if: steps.compare.outputs.exit_code != '0'
        run: exit 1

      - name: Save baseline (main branch only)
        if: github.ref == 'refs/heads/main' && steps.compare.outputs.exit_code == '0'
        uses: actions/upload-artifact@v4
        with:
          name: benchmark-baseline
          path: results/current.json
          retention-days: 90
```

## The exit code of a pipe, precisely

The claim that `$?` after `cmd | tee file` always gives `tee`'s status holds only when the
shell's `pipefail` option is off. What actually happens depends on the shell and its options:

- **bash with `set -o pipefail`** — the default for a `run:` step with no explicit `shell:`
  on `ubuntu-latest` and `macos-latest`, where the internal command is
  `bash --noprofile --norc -eo pipefail {0}`. The pipeline's status is already the first
  failing command's. Combined with `set -e` (also on), a failing `python3 ... | tee file`
  aborts the whole script at that line, **before** the next line runs — so the output is
  never written and the step fails with no contextualised diagnosis.
- **bash without `pipefail`** — the documented case for the bash shipped with Git for
  Windows, used on `windows-latest` when `shell: bash` is selected explicitly
  (`bash --noprofile --norc -e {0}`). Here `$?` really does reflect only `tee`'s status,
  typically `0`, so a real regression never reaches `exit_code` even though the Python
  script returned `1` correctly.
- **With `continue-on-error: true` added** to the compare step in a `pipefail` environment,
  the `set -e` interaction reproduces the worst case: the script aborts before writing its
  output, the step is marked failed-but-continue, and `steps.compare.outputs.exit_code` is
  **empty**. An empty string is not equal to `'0'`, so `Fail if regression` evaluates true
  by accident — until someone "fixes" that logic without understanding the cause, and the
  gate silently stops blocking anything.

`${PIPESTATUS[0]}` depends on none of this. `PIPESTATUS` is a bash array holding the exit
status of every command in the last pipeline, whether or not `pipefail` is set, so index 0
is always `python3`'s status — in any bash, with or without `-e`/`pipefail`, on any runner.

`if: always()` on the reporting step is the matching correction: without it, an abort in the
compare step silently skips the comment and nobody sees the diagnosis.

## Validating the pipeline itself

- [ ] The comparison script's exit code captured via `PIPESTATUS`, not raw `$?` after a pipe
- [ ] The PR-comment step carries `if: always()`, so an earlier failure cannot suppress it
- [ ] A deliberate regression injected and the PR confirmed blocked end to end — not merely
      that the script returns the right code locally
