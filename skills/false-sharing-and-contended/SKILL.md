---
name: false-sharing-and-contended
description: >
  Proving and fixing false sharing: hardware-counter evidence, object layout and Compact
  Object Headers, @Contended mechanics and the two flags it needs, padding strategies and
  their memory cost, LongAdder and Striped64.Cell internals, and validating the fix under
  the production thread count. Use when throughput falls or scales sub-linearly as threads
  are added with high CPU and no I/O wait, when a long array is indexed directly by thread
  id, when cache-misses or LLC-load-misses are disproportionate to the bytes actually
  touched, when @Contended produces no measurable change, when a class carries unused
  p1..p7 padding fields, when a hot AtomicLong is contended, or when
  -XX:+UseCompactObjectHeaders is weighed for its effect on field adjacency. Not the
  introductory cache treatment or NUMA (cpu-cache-and-numa), contention on a lock
  (lock-inflation), thread pinning (numa-and-cpu-affinity), or sizing objects in bytes and
  what compact headers do and do not save (object-layout-and-footprint).
---

# False Sharing and @Contended

## Purpose

Establish that a scaling problem is physical cache-line contention and not logical data
contention, then fix it without paying for padding that buys nothing. The failure this
prevents is the padding applied on suspicion: `@Contended` costs 128 bytes per annotated
field and a stride of 8 costs 7× the memory per useful slot, and on a field written by one
thread — or mostly read — that is pure cost.

The second failure is subtler and silent. `@Contended` outside `java.base` is ignored
without warning unless `-XX:-RestrictContended` is set, so a benchmark comparing "with and
without `@Contended`" can unknowingly be comparing two identical layouts.

## Workflow

1. **Rule out real data contention first.** If the threads share a lock, an `Atomic*` or a
   collection, that is logical contention — a different problem with a different fix.
   False sharing is threads writing _logically independent_ variables.
2. **Look for the shape.** High-frequency writes from different threads to fields that are
   physically close: fields of one class, an array indexed without stride, small objects
   allocated back to back.
3. **Get hardware evidence.** `perf stat -e cache-misses,cache-references,`
   `L1-dcache-load-misses,LLC-load-misses,node-load-misses`. The signal is misses
   disproportionate to the bytes the code actually touches.
4. **Compare two profiles over the same interval.** Frames prominent in an
   `L1-dcache-load-misses` flame graph but modest in a `cpu` one are strong candidates —
   the time is spent waiting for the line, not computing.
5. **Choose a mitigation from the decision matrix**, weighing its memory cost against the
   service's budget. See `references/proving-and-fixing.md`.
6. **Confirm the padding actually exists** with JOL, not with a throughput number.
7. **Validate under the production thread count**, across three or more JMH forks, and
   check the gain is the order of magnitude removing an RFO round trip predicts — a
   disproportionately "magical" improvement means something else changed too.

## Rules

- `@Contended` outside `java.base` needs **both**
  `--add-exports java.base/jdk.internal.vm.annotation=ALL-UNNAMED` (at compile time and at
  run time) **and** `-XX:-RestrictContended`. `--add-opens` does not substitute for the
  first: opens enables deep reflection at run time, it does not expose the type for
  compilation.
- `RestrictContended` defaults to `true` on JDK 25. With the default, the annotation on an
  application class is ignored **silently** — no warning, no error, no bytecode
  difference, no padding.
- Confirm the padding with JOL (`ClassLayout.parseInstance(...).toPrintable()`), run under
  the same flags. A throughput delta is not confirmation.
- `-XX:ContendedPaddingWidth` defaults to 128 bytes — twice a 64-byte line, so it also
  absorbs the adjacent-line prefetcher that many Intel microarchitectures use. Exactly 64
  would still leave indirect contention through prefetch on those CPUs.
- Do not attribute manual-padding fragility to the JIT. C1/C2 do not eliminate instance
  fields; they optimise code, not storage layout. The real mechanism is HotSpot's field
  layout (JEP 142), which regroups declared fields by size and does not preserve
  declaration order — so `p1..p7` are not guaranteed adjacent to the field they claim to
  protect.
- Never index a per-thread `long[]` by thread id directly. Eight `long`s share one 64-byte
  line, so threads 0 through 7 fight over one line with zero logically shared data. Use a
  stride of 8 and index `threadId * 8`.
- The JVM uses `@Contended` internally on `java.util.concurrent.atomic.Striped64.Cell` and
  on `ForkJoinPool.WorkQueue`'s `top`, `phase`, `stackPred`, `source`, `nsteals` and
  `parking`. It does **not** appear on `AtomicLong` internals or on
  `Thread.threadLocalRandomSeed`. Before citing an internal field as annotated, check the
  OpenJDK source for the baseline version rather than reasoning from what would make sense.
- `LongAdder` beats `AtomicLong` under contention because it removes the data contention by
  striping, and then uses `@Contended` so the striping does not recreate the problem at the
  cache level. Its `sum()` is O(number of cells) — do not read it on a hot path.
- Compact Object Headers shrinks the header from 12–16 bytes to 8: product on JDK 25 behind
  `-XX:+UseCompactObjectHeaders` (JEP 519), **off by default through JDK 26 and on by
  default from JDK 27** (JEP 534). It does not eliminate false sharing; it raises object
  density per line and so
  slightly raises the chance two independent small objects land on one line.
- Benchmark with JMH — `@Warmup`, `@Measurement`, `@Fork`, and `@Group`/`@GroupThreads` (or
  `@Threads`) for deterministic thread-to-field assignment. Never a manual `Thread[]` with
  `System.nanoTime()`. Put the `@Contended` flags in the JMH `@Fork` arguments so they
  cannot be forgotten.
- JFR has no false-sharing event, and monitor events such as `jdk.JavaMonitorEnter` are
  unrelated — false sharing passes through no monitor. Use JFR only to correlate _when_ the
  pattern appeared.
- Validate at the real production thread count, not at the development machine's core
  count.

## References

- [Layout and @Contended mechanics](references/contended-mechanics.md) — where false
  sharing appears in the runtime, the object header table with and without Compact Object
  Headers, how `@Contended` inserts padding, the two flags and how each fails, the verified
  internal usages, and why HotSpot's field layout defeats manual padding. Read before
  applying or reviewing any padding, and when reconciling against material that describes
  a fixed 12/16-byte header.
- [Proving it and fixing it](references/proving-and-fixing.md) — the `perf` and
  async-profiler command recipes, the JOL confirmation step, the mitigation decision matrix
  with costs, the stride and thread-local accumulation patterns, and the measurement and
  validation checklists. Read when collecting evidence or choosing between mitigations.
