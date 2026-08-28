# Execution record — container CPU arithmetic verified on cgroup v2

**Date:** 2026-08-28. **Closes:** the largest residual risk logged in
`jvm-performance-suite-record.md` — _"The container CPU arithmetic has never been executed
on Linux, including the formula that carried the BLOCKER."_

## Environment

Rancher Desktop VM, Linux 6.18.33 (WSL2 kernel), **cgroup v2 unified hierarchy**,
24 logical CPUs, 15.5 GB. One container per data point, `--rm`, no shared state.
Three JDKs, all Temurin, all 2026-07-21 builds:

| JDK | Build     |
| --- | --------- |
| 21  | 21.0.12+7 |
| 25  | 25.0.4+7  |
| 26  | 26.0.2+7  |

JDK 27 was not exercised — GA is 2026-09-15. Its claims remain source-derived.

## Result: every prior claim held

Fifteen claims were executed. **None was falsified.** All three JDKs agreed on every row,
which upgrades the previously _asserted_ "no behavioural difference between JDK 21, 25 and
26" to a measured one.

| #   | Claim                                                                           | Result                                                             |
| --- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| 1   | `ActiveProcessorCount = min(host_cpus, ceil(quota/period))`                     | CONFIRMED — 1500m→2, 2500m→3, 3100m→4                              |
| 2   | `ceil`, not `floor`                                                             | CONFIRMED — 100m→1, 900m→1                                         |
| 3   | `limit_count = host_cpus` when no quota (**the line that carried the BLOCKER**) | CONFIRMED — no quota → 24, not 0                                   |
| 4   | cpu _shares_ no longer influence the count                                      | CONFIRMED — `--cpu-shares` 512 and 2048 both → 24                  |
| 5   | `UseContainerCpuShares` / `PreferContainerQuotaForCPUCount` expired in 21       | CONFIRMED — `Unrecognized VM option`, exit 1, already on 21.0.12   |
| 6   | `-XX:ActiveProcessorCount=n` overrides                                          | CONFIRMED — quota 2, flag 3 → 3                                    |
| 7   | …and is honoured with `-XX:-UseContainerSupport`                                | CONFIRMED — → 3                                                    |
| 8   | `-XX:-UseContainerSupport` alone falls back to the host                         | CONFIRMED — → 24 under a 2-CPU quota                               |
| 9   | `PrintFlagsFinal` reports `ActiveProcessorCount = -1` regardless                | CONFIRMED — `-1 {default}` on all three JDKs under a real quota    |
| 10  | `jcmd VM.flags -all` cannot reveal it either                                    | CONFIRMED — and see below                                          |
| 11  | cgroup v2 file and field names; no `/sys/fs/cgroup/cpu/` subdirectory           | CONFIRMED — `nr_periods`, `nr_throttled`, `throttled_usec` present |
| 12  | `MaxRAMPercentage` computes from `limits.memory`                                | CONFIRMED — 4 GB limit: 25/50/75/90% → 1.00/2.00/3.00/3.60 GB      |
| 13  | No `limits.memory` → ~25% of the node                                           | CONFIRMED — 3.87 GB of a 15.5 GB node                              |
| 14  | `grep -w` needed: `MaxHeapSize` also matches `SoftMaxHeapSize`                  | CONFIRMED — both present under ZGC                                 |
| 15  | `jfr view container-configuration` fields                                       | CONFIRMED — `Container Type: cgroupv2`, `Effective CPU Count: 2`   |

**The sharpest single result** is #10. In one `jcmd <pid> VM.flags -all` output:

```text
int  ActiveProcessorCount = -1 {product} {default}
uint ParallelGCThreads    =  2 {product} {default}
```

`-all` _does_ surface ergonomically derived values — `ParallelGCThreads = 2` under a 2-CPU
quota proves it. `ActiveProcessorCount` is simply never rewritten. The rule was right, and
the contrast is now evidence rather than assertion.

**Cross-platform confirmation of the previously disputed finding.** The compressed-oops
ergonomic trap, arbitrated on Windows in the prior increment, reproduces on Linux exactly:

```text
-XX:MaxRAM=128g -XX:MaxRAMPercentage=85                        → 108.8 GB
-XX:MaxRAM=128g -XX:MaxRAMPercentage=85 -XX:+UseCompressedOops →  30.0 GB
```

## Corrections applied

**1. `jvm-performance-review/references/container-arithmetic.md` — the manifest table
under-reported the collector consequence.** The `≥1792 MB` server-class test was attributed
to `limits.memory` alone. Measured, it is a **conjunction**, and either half sinks it:

| `--cpus` | `--memory` | collector (21, 25, 26) |
| -------- | ---------- | ---------------------- |
| 1        | 8g         | **SerialGC**           |
| 4        | 1700m      | **SerialGC**           |
| 2        | 1792m      | G1                     |
| 2        | 4g         | G1                     |

`limits.cpu: "1"` is a very common manifest, and it silently selects SerialGC however large
the memory. The `limits.cpu` row now carries that consequence. The skill's deeper reference,
`flag-cost-and-defaults.md`, already stated the conjunction correctly — this was an internal
inconsistency in the table a reviewer reads first, not a wrong belief.

Clause 3 of `is_server_class_machine` (the hyper-threading divisor) **did not trigger** in
this environment: `--cpus=2` yielded G1, not Serial. It is left as documented; it is
source-real and environment-dependent, and this run neither confirms nor refutes it.

**2. Provenance upgraded.** The formula section now carries the executed evidence table and
names the environment, replacing a statement that read as source-derived.

**3. `container-awareness/SKILL.md` — a new misreading trap.** Both skills prescribe
`-XshowSettings:system`. Under `--cpus=2` on a 24-CPU host it prints:

```text
Effective CPU Count: 2
List of Effective Processors, 24 total:
```

The `24` is the host affinity mask, one line below the answer. A rule now names
`Effective CPU Count` as the field to read.

## Residual, non-gating

- `cpu.stat` on v2 also carries `nr_bursts` / `burst_usec` (CFS burst). Not added — the
  skill's field list exists for throttling measurement and is correct for it.
- JDK 27 remains unexecuted (GA 2026-09-15). JEP 523, which makes G1 the default in all
  environments, will retire correction 1's finding for 27+; the correction is scoped to
  21/25/26, where it was measured.
- Clause 3 of the server-class test is unreproduced, as noted above.

## Repository state

238 skills, 238 registry entries, `registry:check` up to date, both edited packages
`✓ Valid — no issues found`, architecture boundaries OK, both edited files Prettier-clean.

**Scope note.** `npm run registry:build` regenerates the index wholesale, so it necessarily
picked up three skills belonging to concurrent work in this tree
(`architecture-fitness-functions`, `schema-evolution-and-compatibility`, and
`java-domain-modeling`, which appeared during this session). Their content was not touched.
