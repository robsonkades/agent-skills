---
name: startup-cds-crac-leyden
description: >
  Cutting JVM startup and warm-up while staying on the JVM: CDS and AppCDS, the Leyden AOT
  cache (JEP 483/514/515), CRaC checkpoint and restore and its constraints, what each
  mechanism actually accelerates, verifying the cache is really in use, and measuring
  time-to-first-good-response instead of time-to-port-open. Use when cold start hurts a
  serverless or autoscaled deployment, when a CI pipeline pays for hundreds of JVM launches,
  when a CRaC flag fails with Unrecognized VM option, when an AppCDS archive is silently
  ignored after a JAR changes, when old code runs from -XX:AOTCache after a rebuild, when
  -XX:AOTCacheOutput is in the production start command, when spring-boot:build-image is
  expected to yield a CRaC image, or when a startup speedup percentage is quoted without a
  source. Does not cover the warm-up curve and traffic gating (jit-compilation), loading,
  linking and initialisation (jvm-class-loading), or leaving the JVM behind
  (graalvm-native-image).
---

# Startup: CDS, CRaC and Leyden

## Purpose

Choose the startup mechanism whose **granularity** matches the cost you are actually paying.
CDS preserves class metadata, so it removes verification and linking and nothing else. CRaC
preserves the whole process, so it removes JIT warm-up too — at the price of a special JDK
build, Linux, CRIU privileges and explicit management of every external resource. The Leyden
AOT cache preserves linked classes plus execution profiles, so it shortens warm-up without
eliminating it, on any standard JDK 25.

The failures this prevents are all failures of premise: teaching `-Xshare:dump` as step one
when every JDK has shipped a default archive since JDK 12; writing CRaC flags that a standard
Temurin or Oracle JDK 25 does not recognise at all; leaving `-XX:AOTCacheOutput` in the
production start command, where it retrains the cache on every launch; and quoting a speedup
percentage nobody measured.

## Workflow

1. **Measure the real target.** Time to the first response at steady-state latency, not time
   to the port opening. A mechanism that removes class linking and leaves the JIT cold will
   move the second number and not the first.
2. **Account for what is already on.** Since JEP 341 (JDK 12) every JDK ships a default CDS
   archive and `-Xshare:auto` is the default. Any extra work is for AppCDS or regeneration.
3. **Select by constraint, then by granularity.** Use the decision tree in
   `references/technique-selection.md`; the choice is decided by platform and build control
   long before it is decided by expected gain.
4. **Default to AppCDS with `-XX:+AutoCreateSharedArchive`.** Portable and zero friction —
   but it regenerates only when the file is absent or its header is rejected (JDK or flag
   change), never on a classpath or JAR change. Delete the archive in the build step.
5. **Step up to the Leyden AOT cache** when a cache can be produced in CI and shipped, and use
   the one-command JEP 514 flow for training. The production command uses a _different_ flag.
6. **Make the training run representative.** Profiles are only worth what the training
   exercised; a run that starts and exits immediately profiles nothing an endpoint will use.
7. **Build the archive and the JARs in the same step and ship them as one immutable unit.**
   The archive is keyed to the JARs' path, size and mtime; on JDK 25 the AOT cache does not
   even check the JARs (JDK-8377932), so a cache older than the JAR runs old classes.
8. **Verify the cache is actually in use, then report the number with its source** and with the
   phase it applies to — total startup or one phase. In production, make rejection loud with
   `-Xshare:on` (`.jsa`) or `-XX:AOTMode=on` (`.aot`): the JVM exits instead of running cold.

## Rules

- CRaC is **not mainline in OpenJDK 25**. `-XX:CRaCCheckpointTo`, `-XX:CRaCRestoreFrom` and
  `jcmd JDK.checkpoint` need an explicitly CRaC-enabled build (Azul Zulu with CRaC, BellSoft
  Liberica with CRaC, or the `openjdk/crac` fork); Temurin 25.0.3 rejects them with
  `Unrecognized VM option 'CRaCCheckpointTo=…'` and `PrintFlagsFinal | grep -i crac` prints
  nothing. Confirm that before writing a single CRaC flag.
- JEP 483 (AOT class loading and linking) is **Delivered in JDK 24 — not preview**; it needs no
  `--enable-preview`. JEP 514 (one-command ergonomics) and JEP 515 (AOT method profiling) are
  Delivered in JDK 25. JEP 516 (AOT object caching with any GC) is **Delivered in JDK 26**. On
  JDK 25 a cache created under ZGC drops its archived heap objects (`Archived java heap is not
supported`) and a G1-created cache is rejected under ZGC (compressed-oops mismatch); from 26
  the collector no longer constrains the cache.
- `-XX:AOTCacheOutput=<file>` trains and rewrites the cache on **every** invocation, even when
  the file already exists. The production start command — systemd unit, Docker ENTRYPOINT —
  must use `-XX:AOTCache=<file>`. These are different flags, not aliases.
- **On JDK 25 and 26 the AOT cache does not validate the application JARs** (JDK-8377932,
  fixed in 27, no backport as of 2026-09). A JAR rebuilt at the same path is accepted, and
  `-XX:AOTMode=on` does not catch it: reproduced on Temurin 25.0.3, a changed class kept
  running from the cache. AppCDS (`.jsa`) does check size and mtime. Until the fix, the only
  defence is the pipeline: cache and JARs built together, deployed together, never patched in
  place.
- `-XX:+AutoCreateSharedArchive` regenerates in exactly two cases (`cdsConfig.cpp`,
  `filemap.cpp` in JDK 25): the file is missing, or its header fails — JDK build, compressed
  oops, compact headers. A classpath edit or a rebuilt JAR logs `shared class paths mismatch`,
  runs without the top archive and leaves the stale file untouched, on every launch. Prefer the
  flag for the create-when-absent case; do not describe it as self-healing.
- An invalid archive is disabled _silently_ under the defaults (`-Xshare:auto`,
  `-XX:AOTMode=auto`): no error to the console, no speedup. Turn rejection into a failed
  start with `-Xshare:on` or `-XX:AOTMode=on` where an unexpectedly cold JVM is worse than a
  crash-loop — verified: a compact-headers mismatch exits with status 1 under `on`.
- `JDK_AOT_VM_OPTIONS` reaches only the cache-assembly child of the JEP 514 flow. If that
  child fails, no `.aot` is written **and the parent still exits 0** — a CI step must assert
  the file exists. Class paths may only be appended to between training and use, and must
  contain JARs, not directories (JEP 483).
- **A `jlink` runtime image ships no default CDS archive, and nothing says so.** The tell is in
  `java -version`: a stock JDK ends `mixed mode, sharing`; the jlink image ends `mixed mode`.
  Executed on Temurin 25.0.4+7 in a container, `java.base` only: the plain image reports
  `mixed mode`, and `jlink --generate-cds-archive` restores `sharing` at a cost of 56 MB →
  83 MB of image. Separately measured on a Windows host (60 interleaved runs, Temurin 25.0.3):
  a plain jlink image's startup p50 was **73 ms against the full JDK's 53 ms**, distributions
  disjoint, and restoring the archive returned it to 53 ms — **parity, never a win**. So a
  jlink image does not buy startup; any "jlink made us start faster" claim is CDS's doing.
  Check for `mixed mode, sharing` before crediting the image. AppCDS and the Leyden AOT cache are
  unaffected and work normally on a jlink image.
- CDS never eliminates JIT warm-up — it attacks class verification and linking, a structurally
  earlier phase. A 100%-coverage archive still leaves C1 and C2 compiling from scratch.
- JEP 515 persists execution **profiles**, not compiled code. The target still compiles; it just
  does not restart branch and type statistics from zero.
- Every CRaC application component holding external state — database pools, Kafka and RabbitMQ
  clients, HTTP sockets, TTL caches, absolute timestamps — implements `org.crac.Resource` with
  `beforeCheckpoint` and `afterRestore`. Restore may land on a different host, so reconnection
  must resolve addresses at runtime rather than reuse what was captured.
- `spring-boot:build-image` does **not** produce a CRaC-capable image. The default Paketo
  buildpacks ship no CRaC-enabled build, and checkpointing needs runtime privileges
  (`CAP_CHECKPOINT_RESTORE`, `CAP_SYS_PTRACE`) that the sandboxed build step cannot grant.
- On AWS Lambda the supported mechanism is **SnapStart** with `org.crac` hooks — the platform
  performs the Firecracker checkpoint and restore. Invoking `jcmd JDK.checkpoint` or
  `-XX:CRaCRestoreFrom` inside the function runtime is not a supported path.
- A CRaC image scales with the process's memory footprint, not with class count. Restore time
  and image transfer are therefore variable costs, not a small constant.
- The only sourced speedup figure here is **~42% for the Leyden AOT cache** (SoftwareMill,
  Spring PetClinic, 4.486 s to 2.604 s). Publish any other percentage only as an
  order-of-magnitude expectation to be measured locally, and say which it is.
- Always state whether a percentage covers total startup or one phase. The two are routinely
  swapped, and the swap is what makes the claim unfalsifiable.

## References

- [Technique selection](references/technique-selection.md) — the granularity table showing what
  each mechanism preserves and what it does not, the constraint-first decision tree, the JEP
  status timeline for this baseline, the sourced-versus-unsourced numbers table, and which
  classes are eligible for AOT linking. Read before choosing a mechanism or defending the
  choice.
- [Flags and workflows](references/flags-and-workflows.md) — the flag reference per technique,
  the AutoCreateSharedArchive and Leyden training flows end to end with the log lines each
  prints, the Spring training-run recipe, the verification commands that prove an archive or
  cache is in use, and the Kubernetes checkpoint-and-restore pattern. Read when writing start
  commands, a Dockerfile, a CI step or a deployment manifest.
- [Validation and troubleshooting](references/validation-and-troubleshooting.md) — what each
  artefact checks at startup (JDK, flags, classpath, JAR size and mtime, module path), what
  happens under `auto` versus `on`, when the archive is regenerated, and the symptom table.
  Read when an archive or cache is silently ignored, when old code runs after a deploy, or
  before deciding where the archive is built in the pipeline.
