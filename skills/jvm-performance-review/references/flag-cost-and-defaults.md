# Flag cost, and the defaults it competes against

Read at step 4, once `references/flag-lifecycle.md` has established that a flag is live on
the target release. Two halves: what a commonly-set flag spends and buys, and what the
ergonomic default already does. A flag that loses to the default is a P4 finding; a flag
that spends something real is P3.

---

## Part 1 — flags that exist but are near-always a mistake in production

Each entry is **what it spends / what it buys / what measurement would prove it helped**.

### `-XX:TieredStopAtLevel=1` in a long-running server

HotSpot's compilation levels are `0` interpreter, `1` C1 with no profiling, `2` C1 plus
counters, `3` C1 plus counters and MDO, `4` C2 or JVMCI. `TieredStopAtLevel=1` therefore
means **C2 never runs and C1 does not even collect profiles** — every method is capped at
unprofiled C1 code for the life of the process.

- **Spends:** peak throughput, permanently. No profile-driven inlining, no escape analysis,
  no loop optimisation, no C2 intrinsics. It also shrinks the code cache:
  `ReservedCodeCacheSize` is 240 MB with tiered compilation and 48 MB without.
- **Buys:** faster time-to-first-request, and lower compiler CPU and memory during startup.
- **Magnitude:** unpublished. The flag is not documented in the JDK 25 `java` man page
  except as a suppressor of Client-VM-emulation mode, and no OpenJDK source quantifies the
  throughput loss. **Do not quote a percentage.** State the mechanism and measure locally.
- **Proof:** before/after of (a) process start to first successful request and (b)
  steady-state throughput and p99 after at least ten minutes of the production request mix,
  on the same hardware. If only (a) was measured, the change is unproven. If the goal is
  startup and the process is long-lived, the JDK-25-native answer is the AOT cache (JEP 483)
  or CDS, not disabling C2.

### `-Xmx` set equal to the container memory limit

- **Spends:** the entire non-heap budget. Process RSS is heap **plus** metaspace, code
  cache, GC control structures, thread stacks, direct byte buffers, compiler arenas, symbol
  and string tables, and the C library's malloc arenas — none of which `-Xmx` covers.
- **Buys:** nothing. The kernel OOM-kills the container, so the JVM never throws
  `OutOfMemoryError` and never writes a heap dump.
- **Proof:** `jcmd <pid> VM.native_memory summary scale=MB` at steady state (requires
  `-XX:NativeMemoryTracking=summary` at startup) for the actual non-heap committed total,
  plus peak heap-after-full-GC from the GC log. Headroom is observed non-heap committed
  plus margin. Without an NMT summary or the JFR equivalent, any `-Xmx` in a container is a
  guess — say so rather than proposing a different guess.

### `-XX:MaxRAMPercentage` pushed to 90

The non-heap argument above applies, plus a second effect specific to this flag. Setting
`MaxRAMPercentage`, `MinRAMPercentage`, `InitialRAMPercentage` or `MaxRAM` sets an internal
`override_coop_limit`. When it is set and the resulting heap exceeds the compressed-oops
range, the JVM **disables compressed oops** instead of capping the heap at the range — the
opposite of the default path. So on a large host, `-XX:MaxRAMPercentage=90` can silently
turn 32-bit references into 64-bit ones and _increase_ the live set. The status is logged
under `gc,init` at info: `Compressed Oops: Disabled` or `Enabled (Zero based)`. Do not
reach for `gc+heap+coops` — that tag-set emits nothing at all when compressed oops are
disabled, so it is silent in exactly the case worth detecting.

- **Proof:** `jfr view heap-configuration` reports `usesCompressedOops` and
  `compressedOopsMode` from `jdk.GCHeapConfiguration`; `jcmd <pid> VM.flags` or
  `-Xlog:gc+init` answer the same question. Any `MaxRAMPercentage` above ~50 on
  a host with more than 64 GB should be checked against that field before anything else.

### `-XX:+UseNUMA` without a NUMA topology — the common advice is wrong

On Linux the JVM **self-disables** NUMA when the topology does not warrant it: libnuma
failed to initialise, only a single node is available, the process is bound to a single
memory node, or memory and CPU node configuration do not match. Each path clears both
`UseNUMA` and `UseNUMAInterleaving` ergonomically. **In a single-node container the flag is
a no-op, not a hazard** — reporting it as dangerous is a false positive. Three real
caveats:

1. If NUMA does survive, the JVM also enables `UseNUMAInterleaving`, which changes
   allocation policy for non-NUMA-aware allocations.
2. With ParallelGC + `UseNUMA` + `UseLargePages` on a platform that cannot commit large
   pages, the JVM disables `UseAdaptiveSizePolicy` and `UseAdaptiveNUMAChunkSizing` with a
   warning — a genuine, silent behaviour change.
3. **ZGC turns `UseNUMA` on by default already** on JDK 21, 24, 25 and 26, so
   `-XX:+UseNUMA` next to `-XX:+UseZGC` is pure noise.

- **Proof:** `-Xlog:os=info` prints `UseNUMA is enabled and invoked in '<membind|interleave>'
mode…` when it takes effect and `NUMA support disabled: <reason>` when it does not. One
  log line settles it.

### `-XX:+AlwaysPreTouch`

Touches every page of the heap after requesting it from the OS and before handing it to the
application — one relaxed atomic write per page, parallelised across GC workers, invoked on
**commit**.

- **Spends:** wall-clock at startup, and RSS immediately equal to the committed heap.
  Because it hangs off commit, the cost scales with the **initially committed heap
  (`-Xms`), not `-Xmx`**, and it recurs on every heap expansion.
- **Buys:** removes first-touch page-fault latency — and, with transparent huge pages,
  khugepaged stalls — from the application's critical path, moving it into startup.
- **When it is actively wrong:** with `-Xms` much smaller than `-Xmx` it does not do what
  people think; the heap is still pretouched incrementally as it grows, i.e. during traffic.
  Its only useful form is `-Xms == -Xmx` plus `AlwaysPreTouch`. In a container it also makes
  the pod's RSS jump to the full heap at startup, which interacts badly with a memory
  request derived from observed steady-state RSS.
- **Magnitude:** unpublished. The cost is a function of page size, heap size, memory
  bandwidth and whether THP is in play. **Do not quote a number.**
- **Proof:** p99 over the first N minutes after deploy, with and without, at the same
  `-Xms`/`-Xmx`; plus startup-to-ready time to price the cost.

### Explicit `-XX:ParallelGCThreads` / `-XX:ConcGCThreads` with no measurement

The ergonomic defaults are CPU-count-aware (Part 2). Overriding them usually just breaks
that coupling.

- **Spends:** set too low, longer pauses and — for G1 and ZGC — a concurrent cycle that can
  lose the race with allocation, giving to-space exhaustion or allocation stalls. Set too
  high, GC threads compete with application threads for the CFS quota.
- **Buys:** something only when the container's CPU quota is not what the JVM detects — and
  even then `-XX:ActiveProcessorCount` is the correct lever, because it fixes GC threads,
  JIT compiler threads, `ForkJoinPool.commonPool` and the virtual-thread scheduler in one
  place.
- **Proof:** GC pause distribution _and_ GC CPU time, both. `jfr view gc-pauses` gives
  min/median/avg/P90/P95/P99/P99.9/max over `jdk.GCPhasePause`; `jfr view gc-cpu-time` gives
  user/system/real over `jdk.GCCPUTime`. Changing thread counts with only one of the two is
  trading pause time against CPU while measuring one side.
- Setting either to `0` is a hard startup failure under G1 and ZGC.

### `-XX:+DisableExplicitGC` versus `-XX:+ExplicitGCInvokesConcurrent`

Both default `false`. `DisableExplicitGC` breaks direct byte buffer reclamation, and this
is provable from the JDK source rather than folklore: `java.nio.Bits.reserveMemory` — the
allocation path for every `ByteBuffer.allocateDirect` — reacts to an exhausted
`MaxDirectMemorySize` budget by waiting for reference processing, then **calling
`System.gc()` specifically to trigger reference processing**, then retrying with backoff,
and only then throwing `OutOfMemoryError: Cannot reserve N bytes of direct buffer memory`.
With `System.gc()` ignored, that recovery step does nothing, so any workload whose
direct-buffer high-water mark approaches the budget — Netty, NIO file channels, some JDBC
and Kafka clients — starts throwing under load it previously survived.

`ExplicitGCInvokesConcurrent` is the correct lever when the actual problem is a library's
`System.gc()` causing a stop-the-world full GC: it converts the request into a concurrent
collection rather than suppressing it. The man page scopes it to G1.

- **Proof, before touching either flag:** `jfr view blocked-by-system-gc`, which selects
  `SystemGC` events where `invokedConcurrent = 'false'`, ordered by duration — it gives the
  **stack trace of the caller**. `jdk.SystemGC` is enabled in both `default.jfc` and
  `profile.jfc`, so this costs nothing extra. The view is new in JDK 25; on JDK 21 query the
  `jdk.SystemGC` event directly. **Without that stack trace, `-XX:+DisableExplicitGC` is not
  a supportable recommendation** — the caller may be `Bits.reserveMemory` itself.

### `-Xss` raised to fix a `StackOverflowError`

- **Spends:** per _platform_ thread, as reserved address space that becomes RSS as the stack
  is touched. It is charged to the NMT `Thread Stack` category, i.e. **outside `-Xmx`** — so
  raising it in a memory-limited container moves the failure from `StackOverflowError` to
  OOMKill.
- **Buys:** deeper recursion. That is all.
- **The correctness objection:** a `StackOverflowError` in a server almost always means
  unbounded recursion or a pathological proxy/interceptor chain. Raising `-Xss` converts a
  fast, localised failure into a slower one at greater depth.
- **Virtual-thread wrinkle (JDK 21+):** virtual thread stacks live in the garbage-collected
  heap as stack chunk objects and grow and shrink as the application runs, bounded by the
  configured platform thread stack size. So `-Xss` bounds virtual-thread depth while the
  memory comes out of the _heap_. JEP 444 additionally states that G1 does not support
  humongous stack chunk objects, so a virtual thread stack reaching half the region size —
  possibly as little as 512 KB — may throw `StackOverflowError` anyway; that statement is
  written for JDK 21 and **it is unverified whether it still holds on 25/26**, so do not
  assert it as current behaviour.
- **Proof:** the actual stack trace at the overflow — depth, and the repeating frame cycle.
  If a frame repeats, `-Xss` is the wrong fix at any value.

---

## Part 2 — the defaults a flag is competing against

### Collector selected by ergonomics (JDK 21, 25, 26 — identical)

With no collector flag:

```text
os::is_server_class_machine()  ->  G1
otherwise                      ->  Serial
```

`is_server_class_machine()` is:

1. `-XX:+NeverActAsServerClassMachine` forces `false`; `-XX:+AlwaysActAsServerClassMachine`
   forces `true`.
2. Otherwise **both** must hold: `active_processor_count() >= 2`, **and**
   `physical_memory() >= 1792 MB` (2 GB minus 256 MB).
3. On platforms reporting more than one logical processor per package — x86 with
   hyper-threading via CPUID — it additionally requires
   `active_processor_count() / logical_processors_per_package() >= 2`.

**Audit consequence.** A container with `cpu: 1`, or under 1792 MiB of memory, silently gets
**SerialGC**, not G1 — one of the highest-frequency real causes of "our small pods have
terrible p99". Clause 3 makes it worse on hyper-threaded x86: a 2-vCPU container can compute
`2/2 = 1 < 2` and fall to Serial despite having two vCPUs. Never assume the collector; read
it with `jcmd <pid> VM.flags` or `jfr view gc-configuration`.

JEP 523 changes this: from **JDK 27** the JVM always selects G1 when no collector is
specified, regardless of processors and memory. JDK 27 is at Release Candidate with GA
scheduled 2026-09-15, so treat that as scheduled behaviour, not observed.

### Default heap sizing

- Default max heap is **25% of available RAM** (`MaxRAMPercentage` default `25.0`), where
  available RAM is `min(physical-or-container-limit, MaxRAM)` and `MaxRAM` defaults to
  128 GB on server builds — **unless** any RAM-percentage flag or `MaxRAM` is set
  explicitly, in which case the 128 GB cap disappears and the base becomes true available
  memory. On a 256 GB host, defaults give ≈32 GB while an explicit
  `-XX:MaxRAMPercentage=25` gives ≈64 GB. That asymmetry surprises people and is worth
  stating as a finding when the flag is set to its own default value.
- On small memory (where 50% of RAM is below the 96 MB `MaxHeapSize` floor, i.e. under
  roughly 192 MB of RAM), the heap becomes `MinRAMPercentage` = **50% of RAM** instead.
- Default `-Xms` is `InitialRAMPercentage` = **1.5625%** of the same base, floored at
  `OldSize + NewSize`.

**JDK 26 diffs, both confirmed in source:** the 128 GB `MaxRAM` cap is gone (`MaxRAM` is set
ergonomically to physical memory), so **a 21/25 → 26 upgrade on a host above 128 GB roughly
doubles or more the default max heap**; and `InitialRAMPercentage` drops from 1.5625 to
**0.0**, so default `-Xms` becomes the `OldSize + NewSize` floor. `MaxRAM` and
`AggressiveHeap` are deprecated in 26.

### Default GC thread counts

| Collector | `ParallelGCThreads`                               | `ConcGCThreads`                                                                  |
| --------- | ------------------------------------------------- | -------------------------------------------------------------------------------- |
| Serial    | n/a                                               | n/a                                                                              |
| Parallel  | `ncpus <= 8 ? ncpus : 8 + (ncpus-8) x 5/8`        | n/a                                                                              |
| G1        | same as Parallel                                  | `max((ParallelGCThreads+2)/4, 1)`; `G1ConcRefinementThreads = ParallelGCThreads` |
| ZGC       | `max(min(ceil(ncpus x 0.60), 2%-of-heap cap), 1)` | `max(min(ceil(ncpus x 0.25), 2%-of-heap cap), 1)`, split into young/old          |

`ncpus` is the **container-aware** count (see `container-arithmetic.md`).
`UseDynamicNumberOfGCThreads` defaults to `true`, so these are ceilings the JVM already
scales down at runtime — which is most of the reason an explicit override buys nothing. The
5/8 fraction comes from a source comment describing x86; treat other architectures as
unverified.

### Compressed oops and class pointers

- `UseCompressedOops` is set ergonomically to `true` when
  `max(MaxHeapSize, InitialHeapSize, MinHeapSize)` is within the compressed-oops range.
- That range is `(2^32) << log2(ObjectAlignmentInBytes)` minus a null-page displacement —
  with the default 8-byte alignment, **32 GB**. The heap must be **strictly below** that
  range, so `-Xmx32g` is already off — measured on Temurin 25.0.4: `-Xmx32000m` gives
  `true {ergonomic}`, `-Xmx32g` gives `false {default}`. Do not read "≤ 32 GB" as safe; the
  boundary value itself is not. The `-Xmx31g` folk rule is a correct-for-the-wrong-reason
  approximation of this. Raising `ObjectAlignmentInBytes` extends the range at the cost of
  inter-object padding.
- `UseCompressedClassPointers` defaults `true` on 64-bit and is **deprecated in JDK 25**, so
  `-XX:-UseCompressedClassPointers` warns there; the JDK 26 table pushes obsoletion to 27.

### Compact object headers

| Release | State                                                                       |
| ------- | --------------------------------------------------------------------------- |
| 24      | Experimental; needs `-XX:+UnlockExperimentalVMOptions` (JEP 450)            |
| 25      | Product feature, **default `false`**; the flag alone suffices (JEP 519)     |
| 26      | Still **default `false`**                                                   |
| 27      | **Default `true`** (JEP 534) — Closed/Delivered; 27 not yet GA (2026-09-15) |

JEP 519 and JEP 534 report "22% less heap space and 8% less CPU time" for SPECjbb2015 in one
setting, 15% fewer collections in another, and a JSON parser benchmark 10% faster. **Quote
these only as "OpenJDK reports, without stating JDK build, hardware, heap size or benchmark
configuration".** They are directionally useful and are not a number you can promise an
application. JEP 450's design bound is more usable: no more than 5% throughput or latency
overhead on target 64-bit platforms, and only in infrequent cases.

On JDK 25, `-XX:+UseCompactObjectHeaders` forces `LockingMode = LM_LIGHTWEIGHT` and requires
`UseCompressedClassPointers`. The locking half is a **no-op in practice**: `LM_LIGHTWEIGHT`
(`2`) is already the JDK 25 default, and passing `-XX:LockingMode=1` alongside is coerced back
to `2` with no locking-specific warning (executed, Temurin 25.0.3).

The material conditions are the ones that **silently disable the flag**, leaving it reading
`false {command line, ergonomic}` while the configuration says it was set — a P1-class finding
under this skill's own priority order, because the written configuration is not the running one:

| Condition                                        | Result (executed, Temurin 25.0.3)                      |
| ------------------------------------------------ | ------------------------------------------------------ |
| `-XX:-UseCompressedClassPointers`                | `Disabling compact object headers.` — silent downgrade |
| A moving collector, heap ≥ 8192 GB (`-Xmx8192g`) | disabled; flag reads `false {command line, ergonomic}` |
| ZGC or Epsilon, same heap                        | survives                                               |

The heap bound is **not G1-specific, and not about the collector's name**: it is a
forwarding-pointer bound, so it binds every collector that relocates objects. Executed on
Temurin 25.0.4 — G1, Parallel, Serial and Shenandoah all emit `Compact object headers require
a java heap size smaller than 8191G` and disable the flag; **ZGC and Epsilon keep it `true`**
(Epsilon because it never moves anything). The threshold is exact: `-Xmx8191g` starts clean,
`-Xmx8192g` warns.

Read the flag back off the running JVM rather than trusting the command line.

### Other defaults worth having to hand (JDK 21 / 25 / 26 unless noted)

| Flag                                                | Default                                                                                                     |
| --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `ReservedCodeCacheSize`                             | 240 MB tiered; 48 MB with `-XX:-TieredCompilation`                                                          |
| `SegmentedCodeCache`                                | on when tiered **and** `ReservedCodeCacheSize >= 240 MB`                                                    |
| `TieredCompilation`                                 | `true`                                                                                                      |
| `NativeMemoryTracking`                              | `off` in product builds; **cannot be enabled at runtime**                                                   |
| `AlwaysPreTouch`                                    | `false`                                                                                                     |
| `UseNUMA`                                           | `false`, but forced `true` by ZGC                                                                           |
| `DisableExplicitGC` / `ExplicitGCInvokesConcurrent` | both `false`                                                                                                |
| `UseContainerSupport`                               | `true` (Linux)                                                                                              |
| `ActiveProcessorCount`                              | `-1` (auto)                                                                                                 |
| `TrimNativeHeapInterval`                            | `0` (disabled); **exists from JDK 22, absent on JDK 21**                                                    |
| `ObjectAlignmentInBytes`                            | 8                                                                                                           |
| `GCTimeRatio` (G1)                                  | 12, i.e. roughly an 8% GC overhead goal                                                                     |
| Default `-Xss`                                      | Linux/x64 1024 KB; Linux/AArch64 2048 KB; macOS/x64 1024 KB; macOS/AArch64 2048 KB; Windows: system default |

The `-Xss` row has an audit consequence of its own: the AArch64 default is **double** x64,
so the same `-Xss`-less deployment reserves twice the per-thread stack on Graviton or Ampere
as on x86. For a thread-heavy service inside a fixed memory limit, an x86→ARM move can
OOMKill with no configuration change at all.
