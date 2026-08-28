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
- Differential graphs require `difffolded.pl -n`. Without normalisation, profiles with
  different totals render as a single colour — that is arithmetic, not regression.
  Normalisation fixes the total; it does not fix different load or different warm-up, and
  no flag does.
- A frame that disappeared may have been inlined. `--cstack` is about native stacks and
  does not undo Java inlining.
- Development profiles do not extrapolate: assertions and `TieredStopAtLevel=1` mean the
  measured code is not the executed code; small datasets hide quadratic complexity; without
  concurrency, contention does not exist; and x86 and aarch64 have different barrier costs.
  The small-dataset item is the most treacherous — a routine that is imperceptible over 20
  items is the bottleneck over 20,000.

## References

- [Reading and comparing graphs](references/reading-and-comparing.md) — the graph-type
  table, self-width worked through, the differential recipe, and the post-fix validation
  checklist. Read with a graph open.
