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
  map and container budget (jvm-memory-regions), classloader identity, unloading and
  the retainer hunt for a leak (jvm-class-loading), or anything about compiled code and the
  code cache (code-cache-segments).
---

# Metaspace Internals

## Purpose

Decide which ceiling a metaspace problem is actually hitting, and whether the fix is a
number or a code change. Metaspace has an overall commitment boundary and, when compressed
class pointers are used, a separately reserved class-space boundary; they interact rather
than form two perfectly independent pools. A heap dashboard alone does not distinguish them.
Inspect effective constraints: changing MaxMetaspaceSize can also change class-space reservation
at startup, while a running exhausted class-space reservation cannot expand beyond its limit.

On the checked Temurin 25.0.3+9 Windows x64 build, `MaxMetaspaceSize` defaults to `SIZE_MAX`. In a
container, metadata growth can therefore compete with the whole cgroup before a configured
fail-fast cap is reached; depending on allocation and kernel policy, either a JVM Metaspace
OOM or an external OOM kill may occur. Do not infer one outcome from the missing flag.

Inspect the target toolchain, JDK build, collector, compressed-pointer mode and deployment
before applying the JDK 25 observations below. JDK 16 introduced Elastic Metaspace, but flags,
allocation granularity and diagnostic layouts vary. This skill does not authorize an upgrade.

## Workflow

Use the steps needed for the requested explanation, diagnosis or sizing decision. Reuse matching
configuration, recordings and time series; preserve an adequate cap and class-lifecycle design.
A narrow flag or accounting explanation needs no new capture or sizing campaign. If evidence is
missing, distinguish the supported reading from a hypothesis and identify the observation that
could change the decision. Return the justified change or no-change and checks run versus pending.

1. **Read the exception text before touching a flag.** `OutOfMemoryError: Metaspace` and
   `OutOfMemoryError: Compressed class space` identify different failed allocation domains.
   Inspect both effective constraints and startup ergonomics; increasing an overall cap is
   not a general repair for an independently exhausted class-space reservation.
2. **Compare all memory domains.** Normal heap occupancy does not identify metaspace as
   the cause of RSS growth/OOMKilled; abnormal heap and metadata retention can coexist,
   including Java objects retaining loaders. Correlate cgroup, residency and metadata evidence.
3. **Use a time series for a growth claim.** Reuse adequate observations or capture
   low-impact `VM.metaspace basic` deliberately, use periodic class-loading statistics,
   and interpret `jdk.MetaspaceSummary` at the GC
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
6. **When sizing is needed, use distributions and failure policy.** Cover relevant startup/peak/redeploy/generation
   regimes, class/non-class growth, fragmentation and correlated native peaks. Choose a cap
   that fails before the cgroup only when that fail-fast behavior is desirable; no universal
   `committed × 1.5` margin exists.
7. **Classify runtime generation before changing it.** Unbounded retained generation needs
   lifecycle/cardinality control; a legitimate bounded class population may instead need
   capacity. Record raising a ceiling against unresolved growth as mitigation.

## Rules

- On the checked Temurin 25.0.3+9 Windows x64 build, `MaxMetaspaceSize` prints `SIZE_MAX`. Set it only as
  a derived fail-fast/capacity boundary: too low creates avoidable OOM, and it cannot
  guarantee beating an external cgroup kill caused by another domain or transient overlap.
- The compressed class-space reservation is controlled by
  `CompressedClassSpaceSize`; 1073741824 bytes is the checked build's default, not a
  universal fixed ceiling. Klass metadata lives there; method metadata, constant pools and annotations
  live in the non-class space.
- Compressed class pointers and compressed object references are different mechanisms;
  their effective flags can still be coupled by build, architecture and heap ergonomics.
  The checked JDK 25 build permits class pointers with compressed oops disabled; JDK 17
  source includes architecture-dependent coupling. There is no universal 32 GB heap cutoff:
  encoding, alignment and startup sizing policy matter. Actual class-space reservation depends on
  effective flags, alignment and MaxMetaspaceSize ergonomics; 1 GB is not universal. Check
  flag availability on the exact release rather than using deprecation history as a runtime test.
- On the checked build, `-XX:MetaspaceExpansionSize` is unrecognized. The real flags are
  `-XX:MinMetaspaceExpansion` (327680 bytes) and `-XX:MaxMetaspaceExpansion`
  (5439488 bytes). These are build-specific high-water-mark policy values, not per-chunk
  allocation sizes. `-XX:MetaspaceSize` (22020096 bytes) is the threshold that triggers
  the first metaspace-driven collection, not a size limit.
- Class metadata becomes reclaimable as its CLD unloads; freed chunks can be reused and
  eligible granules can be uncommitted according to Elastic Metaspace policy. Since JEP 387
  (JDK 16+) that return is finer-grained; earlier reclamation was coarser and could retain
  more unused commitment. Do not quote pre-16 behaviour for a JDK 17, 21 or 25
  baseline.
- `System.gc()` does not release a ClassLoader that is still strongly reachable. Remove
  retainers, then verify unloading with the selected collector, flags and collection opportunities;
  reachability changes do not promise immediate collection.
- Distinguish `reserved`, NMT/metaspace `committed`, used, process-resident and cgroup-
  charged in every reading. Committed is not identical to RSS or `memory.current`; reconcile
  timestamps instead of treating it as the bytes the OOM killer sees.
- `jstat -gcmetacapacity` reports `MC` and `CCSC` (the column is `CCSC`, not `CCS`) as
  **capacity**, not usage, and its counters update on internal GC accounting events — a
  freshly started process can report `MC = 0.0` while `VM.metaspace` already shows
  committed memory on some builds. Cross-check `VM.metaspace`; basic output reads live
  counters but is not a guaranteed atomic snapshot of concurrent activity. MC includes class
  and non-class committed space on JDK 25; CCSC is its class-space subset.
- Every non-strong hidden class is its own `ClassLoaderData` with its own chunks —
  the historical 25.0.3 example shows 3 KB of committed chunk capacity, not a universal
  per-class cost or private OS granule (`VM.metaspace show-loaders`). Growth from
  runtime generation is classified by the generator's cache key and loader lifetime.
  Lambdas/proxies are commonly code-keyed and plateau; scripts, expressions and per-instance
  proxies can be data-keyed and grow with distinct inputs. Verify the implementation cache.
- CDS and AppCDS can reduce newly allocated metadata when eligible classes are shared; mapped archives appear
  under `Shared class space` in `VM.native_memory`, not as newly committed metaspace.
- None of this applies to a GraalVM `native-image` binary, where classes are frozen at
  build time under its own constraints. HotSpot with a Graal JIT still uses HotSpot metaspace;
  verify build-specific flags and account separately for compiler allocations.

## References

- [Reading metaspace from a live JVM](references/reading-metaspace.md) — the `jcmd`
  commands, the real nested `VM.native_memory` layout, and the JFR events confirmed
  against `jfr metadata` on JDK 25. Read before capturing evidence from a running
  process, or when a tool's output does not look like what you expected.
- [Flags, defaults and the sizing protocol](references/sizing-and-flags.md) — measured
  build-specific values for the listed metaspace flags and the step-by-step sizing and
  validation procedure. Read when choosing a value for `MaxMetaspaceSize` or
  `CompressedClassSpaceSize`, or when validating that a change worked.
- [Runtime class generation](references/runtime-class-generation.md) — what a generated
  class costs, which generators are bounded by code and which grow with data (lambdas,
  proxies, method handles, mocks, scripting and expression engines), the naming patterns
  that attribute them in `show-loaders`, and the fix per finding. Read when metaspace grows
  in a process that never redeploys, or when `classloader_stats` shows many one-class
  loaders or `+ hidden classes` rows.
