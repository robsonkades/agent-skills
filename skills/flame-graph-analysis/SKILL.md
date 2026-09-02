---
name: flame-graph-analysis
description: >
  Reading a flame graph and turning it into a decision: width as responsibility versus
  self-width as blame, the alphabetical X axis, sample counts, infrastructure frames as the
  diagnosis, differential graphs and normalisation, and Amdahl's conversion from width to
  time saved. Use when a flame graph is open and the next step is unclear, when the widest
  frame is main, when someone reads horizontal position as chronology, when a narrow frame
  is being optimised before a wide one, when a differential graph comes out in one colour,
  when a frame disappeared after a change, or when a development-machine profile is being
  extrapolated to production. Does not cover collecting the profile
  (jfr-and-async-profiler), microbenchmarking the fix (jmh-microbenchmarks), or the
  statistics of latency (latency-statistics). Engine selection and output conversion is
  async-profiler-advanced.
---

# Flame Graph Analysis

## Purpose

Convert a flame graph into a ranked decision rather than an impression. The graph is a
histogram of call paths — not a timeline — and almost every misreading traces back to
forgetting that one sentence.

## Workflow

1. **Find the widest frame with high self-width**, not simply the widest frame. The widest
   frame is usually `main`, which is never the bottleneck. Look for the **plateau**.
   `W_self(A) = W(A) − Σ W(children)`.
2. **Read the sample count**, not only the percentage. ~100 samples give ~10% relative
   error; 6 samples give 41%.
3. **Check the `[unknown_Java]` fraction** before trusting anything. A high fraction means
   stack walking is failing and the whole profile is suspect.
4. **Use search (Ctrl+F)** to sum a theme spread across many paths — serialisation, logging,
   a specific library — which no single frame reveals.
5. **For infrastructure frames, look at who calls them.** They are the diagnosis, not
   noise.
6. **Apply Amdahl before writing code.** A 45% frame gives 1.82× speedup, which is a **45%
   reduction** — not "82% faster". Below ~5%, the effort rarely justifies itself.
7. **After the fix, re-profile identically and generate a differential with `-n`**, then
   compare throughput and percentiles. Graph topography is not evidence of improvement.

## Rules

- The X axis is **alphabetical within each parent**, not chronological. That ordering
  exists so two profiles of the same program are comparable frame by frame — which is what
  makes differential graphs possible. For temporal analysis use the JFR timeline in JMC,
  `jfrconv --from/--to` to cut a window, or heatmap mode.
- Width is responsibility; **self-width is blame**.
- Know which sampler fed the graph before reading a width as CPU. JFR's
  `jdk.ExecutionSample` counts only threads executing Java code and `jdk.NativeMethodSample`
  counts threads in native code _executing or waiting_ — so a JMC or `jfr view hot-methods`
  graph shows a blocked `SocketRead` as hot and is neither a CPU nor a wall profile. The
  CPU-proportional JFR source is `jdk.CPUTimeSample` (JEP 509, JDK 25, Linux, experimental,
  off in both stock profiles); async-profiler `cpu`/`ctimer`/`itimer` are CPU, `wall` is wall.
- In a wall-clock graph every thread contributes one sample per tick whether it works or
  idles, so twenty idle pool workers make `LockSupport.park` the widest frame. That width
  is not a finding: split by thread (`-t`), filter to request threads (`-I`), or read only the
  `-s sleeping` graph of the threads that carried requests.
- A reversed graph (`asprof -r`, `jfrconv -r`, `flamegraph.pl --reverse`) merges stacks from
  the leaf, so it answers "which leaf method is hot across all callers" — the sum that step 4
  otherwise does by search. Icicle is only the reversed graph drawn top-down; it changes no
  number.
- Infrastructure frames _are_ the diagnosis and what matters is directly below them:
  `Object.wait` → who called wait and on what condition; `LockSupport.park` → which
  resource is scarce; `SocketRead` → which host, which timeout; `Arrays.copyOf` → which
  structure grows without pre-sizing.
- A CPU graph is blind to I/O and to locks. High latency with low CPU needs wall clock, and
  the on/off-CPU split happens at **conversion** (`jfrconv -s runnable|sleeping`) — there
  is no collection flag for "blocked threads only".
- An allocation graph is mandatory for GC cost. Allocation cost does not appear where it
  happens; it reappears later as a pause attributed to another thread, and it affects pause
  **frequency**, not duration.
- Differential graphs require normalised totals: `difffolded.pl -n`, or async-profiler's
  `jfrconv --diff base.jfr new.jfr`. Without normalisation, profiles with different totals
  render as a single colour — that is arithmetic, not regression. Normalisation fixes the
  total; it does not fix different load or different warm-up, and no flag does.
- A frame that disappeared may have been inlined. `--cstack` is about native stacks and
  does not undo Java inlining.
- A graph whose base is many unrelated frames instead of a few thread roots is truncation,
  not structure: JFR keeps the leaf-most 64 frames (`stackdepth`) and drops the root end,
  so deep framework stacks stop merging under `main`. Raise the depth at startup
  (jfr-advanced) rather than reading the fragments.
- Development profiles do not extrapolate: assertions and `TieredStopAtLevel=1` mean the
  measured code is not the executed code; small datasets hide quadratic complexity; without
  concurrency, contention does not exist; and x86 and aarch64 have different barrier costs.
  The small-dataset item is the most treacherous — a routine that is imperceptible over 20
  items is the bottleneck over 20,000.

## References

- [Reading and comparing graphs](references/reading-and-comparing.md) — the graph-type
  table, self-width worked through, the differential recipe, and the post-fix validation
  checklist. Read with a graph open.
- [Sources, orientations and broken graphs](references/sources-and-orientations.md) — what
  each sampler counts and therefore what a width means, standard versus reversed versus
  icicle, reading an off-CPU graph, and the symptom table for a graph that is itself
  suspect (all `park`, no thread roots, `[unknown_Java]`, `Interpreter`). Read when the
  graph came from JFR, from a wall-clock run, or looks wrong before any analysis.
