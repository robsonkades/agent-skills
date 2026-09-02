---
name: metaspace-internals
description: >
  Metaspace internals on JDK 16+: chunk and arena allocation per ClassLoaderData, the
  compressed class space and its separate 1 GB ceiling, chunk waste and fragmentation, when
  memory is actually returned to the OS, and reading `jcmd VM.metaspace` and the nested
  `VM.native_memory` output. Use when `OutOfMemoryError: Metaspace` or `Compressed class
  space` is thrown, when a container is OOMKilled with a healthy heap, when metaspace
  committed grows monotonically, when `MaxMetaspaceSize` is unset or copied from another
  service, when `waste` in the class space is climbing, or when proxies, hidden classes or a
  scripting engine generate classes at runtime. Does not cover the introductory six-region
  memory map and container budget (jvm-memory-regions), classloader identity, unloading and
  the retainer hunt for a leak (jvm-class-loading), or anything about compiled code and the
  code cache (code-cache-segments).
---

# Metaspace Internals

## Purpose

Decide which ceiling a metaspace problem is actually hitting, and whether the fix is a
number or a code change. Metaspace has two independent limits with two independent flags,
and native memory that a heap dashboard never shows — so the default outcome is a team
raising `MaxMetaspaceSize` against an error that names `Compressed class space`, where
that flag has no effect at all.

The second failure this prevents is the silent one. `MaxMetaspaceSize` defaults to
`SIZE_MAX` — unlimited — so in a container an unbounded metaspace is reclaimed by the
kernel OOM killer instead of by the JVM: no `OutOfMemoryError`, no stack trace, no heap
dump, just a process that disappears.

## Workflow

1. **Read the exception text before touching a flag.** `OutOfMemoryError: Metaspace` and
   `OutOfMemoryError: Compressed class space` are different ceilings.
   `CompressedClassSpaceSize` fixes the second; `MaxMetaspaceSize` does nothing for it.
2. **Confirm the heap is healthy first.** If heap usage is normal and the process is
   `OOMKilled` or growing in RSS, the hypothesis moves to metaspace and other native
   memory — not to a heap leak.
3. **Take a time series, not a sample.** Run `jcmd <pid> VM.metaspace` repeatedly, or
   collect the periodic `jdk.MetaspaceSummary` JFR event. Monotonic growth of `committed`
   is the signal; an absolute value at one instant is not.
4. **Split non-class from class space.** `VM.metaspace` reports `Non-Class`, `Class` and
   `Both` separately, each with `committed`, `used` and `waste`. Rising `waste` inside the
   class space says the 1 GB ceiling will be reached before the metaspace total is.
5. **Decide leak versus sizing.** Growth that plateaus under steady load is a sizing
   problem; growth that never plateaus is retention. Retention means the ClassLoaderData
   is still reachable — hand off to `jvm-class-loading` for the retainer hunt.
6. **Size from a measurement, then validate by repeating it.** Steady-state `committed`
   from the `Both` section, times 1.5. Repeat the same measurement under the same load
   and confirm the plateau.
7. **Attack the generation rate when classes are generated at runtime.** Raising a
   ceiling against dynamic proxy or script class generation moves the same incident to a
   later date and a larger load. Record the raise explicitly as mitigation.

## Rules

- `-XX:MaxMetaspaceSize` defaults to `18446744073709551615` (`SIZE_MAX`, unlimited).
  Always set it explicitly outside local development — that is what converts an
  `OOMKilled` into a diagnosable `OutOfMemoryError: Metaspace`.
- The compressed class space ceiling is `-XX:CompressedClassSpaceSize`, fixed at
  1073741824 bytes (1024 MB) by default, and independent of the metaspace total. Only
  `InstanceKlass` structures live there; method bytecode, constant pools and annotations
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
- Memory returns to the OS only when a ClassLoader is collected and its Metachunks return
  to the free list. Since JEP 387 (JDK 16+) that return is fine-grained; before it,
  large blocks stayed committed. Do not quote pre-16 behaviour for a JDK 17, 21 or 25
  baseline.
- `System.gc()` does not release a ClassLoader that is still strongly reachable. Remove
  the reference; the collection follows on its own.
- Distinguish `reserved`, `committed` and `used` in every reading. Only `committed`
  counts against the cgroup limit and the OOM killer. Sizing a container from `reserved`
  overstates the risk; sizing from `used` understates the real RSS.
- `jstat -gcmetacapacity` reports `MC` and `CCSC` (the column is `CCSC`, not `CCS`) as
  **capacity**, not usage, and its counters update on internal GC accounting events — a
  freshly started process can report `MC = 0.0` while `VM.metaspace` already shows
  committed memory. Prefer `jcmd VM.metaspace` for a guaranteed-current reading.
- Every non-strong hidden class is its own `ClassLoaderData` with its own chunks —
  3 KB committed for the smallest one on 25.0.3 (`VM.metaspace show-loaders`). Growth from
  runtime generation is classified by the generator's cache key: lambdas and `Proxy`
  classes are keyed by code and plateau; scripts, expressions and per-instance proxies
  keyed by data grow with traffic, and no ceiling holds them.
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
