---
name: metaspace-internals
description: >
  Metaspace internals on JDK 16+: chunk and arena allocation per ClassLoaderData, the
  compressed class space and its separately configured reservation/limit, chunk waste and fragmentation, when
  memory is actually returned to the OS, and reading `jcmd VM.metaspace` and the nested
  `VM.native_memory` output. Use when `OutOfMemoryError: Metaspace` or `Compressed class
  space` is thrown, when a container is OOMKilled with a healthy heap, when metaspace
  committed grows monotonically, when `MaxMetaspaceSize` is unset or copied from another
  service, when `waste` in the class space is climbing, or when proxies, hidden classes or a
  scripting engine generate classes at runtime. Does not cover the process-wide memory
  memory map and container budget (jvm-memory-regions), classloader identity, unloading and
  the retainer hunt for a leak (jvm-class-loading), or anything about compiled code and the
  code cache (code-cache-segments).
---

# Metaspace Internals

## Purpose

Decide which ceiling a metaspace problem is actually hitting, and whether the fix is a
number or a code change. Metaspace has an overall commitment boundary and, when compressed
class pointers are used, a separately reserved class-space boundary; they interact rather
than form two perfectly independent pools. A heap dashboard shows neither, so teams often
raising `MaxMetaspaceSize` against an error that names `Compressed class space`, where
that flag has no effect at all.

On the verified 64-bit JDK 25 build, `MaxMetaspaceSize` defaults to `SIZE_MAX`. In a
container, metadata growth can therefore compete with the whole cgroup before a configured
fail-fast cap is reached; depending on allocation and kernel policy, either a JVM Metaspace
OOM or an external OOM kill may occur. Do not infer one outcome from the missing flag.

## Workflow

1. **Read the exception text before touching a flag.** `OutOfMemoryError: Metaspace` and
   `OutOfMemoryError: Compressed class space` identify different failed allocation domains.
   Inspect both effective constraints; raising the overall cap cannot enlarge an exhausted
   class-space reservation.
2. **Confirm the heap is healthy first.** If heap usage is normal and the process is
   `OOMKilled` or growing in RSS, the hypothesis moves to metaspace and other native
   memory — not to a heap leak.
3. **Take a time series, not a sample.** Run low-impact `VM.metaspace basic` deliberately,
   use periodic class-loading statistics, and interpret `jdk.MetaspaceSummary` at the GC
   boundaries where it is emitted. Growth in used/committed/classes/loaders plus unload/
   arena-death behavior is the signal; committed alone can reflect policy/fragmentation.
4. **Split non-class from class space.** `VM.metaspace` reports `Non-Class`, `Class` and
   `Both` separately. Interpret used, committed, free chunks and waste together; a rising
   waste percentage indicates allocation/chunk inefficiency, not a deterministic prediction
   of which boundary fails first.
5. **Decide lifecycle versus capacity.** Normalize load, distinct generated inputs,
   redeploys and warm-up. Plateau does not prove correct sizing; continued growth may be
   legitimate cardinality or delayed unloading. Loader/CLD reachability and generator cache
   keys decide whether it is defective (`jvm-class-loading`).
6. **Size from distributions and failure policy.** Cover startup/peak/redeploy/generation
   regimes, class/non-class growth, fragmentation and correlated native peaks. Choose a cap
   that fails before the cgroup only when that fail-fast behavior is desirable; no universal
   `committed × 1.5` margin exists.
7. **Attack the generation rate when classes are generated at runtime.** Raising a
   ceiling against dynamic proxy or script class generation moves the same incident to a
   later date and a larger load. Record the raise explicitly as mitigation.

## Rules

- On the verified 64-bit JDK 25 build, `MaxMetaspaceSize` prints `SIZE_MAX`. Set it only as
  a derived fail-fast/capacity boundary: too low creates avoidable OOM, and it cannot
  guarantee beating an external cgroup kill caused by another domain or transient overlap.
- The compressed class-space reservation is controlled by
  `CompressedClassSpaceSize`; 1073741824 bytes is the verified JDK 25 default, not a
  universal fixed ceiling. Klass metadata lives there; method metadata, constant pools and annotations
  live in the non-class space.
- `UseCompressedClassPointers` is independent of `UseCompressedOops`. Above roughly
  32 GB of heap `UseCompressedOops` turns itself off ergonomically while
  `UseCompressedClassPointers` stays `true` — so every 64-bit HotSpot process reserves
  the same 1 GB of class space regardless of `-Xmx`. The flag is **deprecated from JDK 25
  and obsolete from JDK 27**, where compressed class pointers are always on: on 27 the
  reservation is no longer something a flag can switch off.
- `-XX:MetaspaceExpansionSize` does not exist. The real flags are
  `-XX:MinMetaspaceExpansion` (327680 bytes) and `-XX:MaxMetaspaceExpansion`
  (5439488 bytes). `-XX:MetaspaceSize` (22020096 bytes) is the threshold that triggers
  the first metaspace-driven collection, not a size limit.
- Class metadata becomes reclaimable as its CLD unloads; freed chunks can be reused and
  eligible granules can be uncommitted according to Elastic Metaspace policy. Since JEP 387
  (JDK 16+) that return is finer-grained; before it,
  large blocks stayed committed. Do not quote pre-16 behaviour for a JDK 17, 21 or 25
  baseline.
- `System.gc()` does not release a ClassLoader that is still strongly reachable. Remove
  the reference; the collection follows on its own.
- Distinguish `reserved`, NMT/metaspace `committed`, used, process-resident and cgroup-
  charged in every reading. Committed is not identical to RSS or `memory.current`; reconcile
  timestamps instead of treating it as the bytes the OOM killer sees.
- `jstat -gcmetacapacity` reports `MC` and `CCSC` (the column is `CCSC`, not `CCS`) as
  **capacity**, not usage, and its counters update on internal GC accounting events — a
  freshly started process can report `MC = 0.0` while `VM.metaspace` already shows
  committed memory. Prefer `jcmd VM.metaspace` for a guaranteed-current reading.
- Every non-strong hidden class is its own `ClassLoaderData` with its own chunks —
  3 KB committed for the smallest one on 25.0.3 (`VM.metaspace show-loaders`). Growth from
  runtime generation is classified by the generator's cache key and loader lifetime.
  Lambdas/proxies are commonly code-keyed and plateau; scripts, expressions and per-instance
  proxies can be data-keyed and grow with distinct inputs. Verify the implementation cache.
- CDS and AppCDS reduce metaspace pressure: classes mapped from the shared archive appear
  under `Shared class space` in `VM.native_memory`, not as newly committed metaspace.
- None of this applies to a GraalVM `native-image` binary, where classes are frozen at
  build time. It applies unchanged when Graal runs as a JIT on HotSpot.

## References

- [Reading metaspace from a live JVM](references/reading-metaspace.md) — the `jcmd`
  commands, the real nested `VM.native_memory` layout, and the JFR events confirmed
  against `jfr metadata` on JDK 25. Read before capturing evidence from a running
  process, or when a tool's output does not look like what you expected.
- [Flags, defaults and the sizing protocol](references/sizing-and-flags.md) — measured
  OpenJDK 25 defaults for every metaspace flag and the step-by-step sizing and
  validation procedure. Read when choosing a value for `MaxMetaspaceSize` or
  `CompressedClassSpaceSize`, or when validating that a change worked.
- [Runtime class generation](references/runtime-class-generation.md) — what a generated
  class costs, which generators are bounded by code and which grow with data (lambdas,
  proxies, method handles, mocks, scripting and expression engines), the naming patterns
  that attribute them in `show-loaders`, and the fix per finding. Read when metaspace grows
  in a process that never redeploys, or when `classloader_stats` shows many one-class
  loaders or `+ hidden classes` rows.
