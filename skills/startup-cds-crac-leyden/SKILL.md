---
name: startup-cds-crac-leyden
description: >
  Cutting JVM startup and warm-up while staying on the JVM: CDS and AppCDS, the Leyden AOT
  cache (JEP 483/514/515), CRaC checkpoint and restore and its constraints, what each
  mechanism actually accelerates, verifying the cache is really in use, and measuring
  time-to-first-good-response instead of time-to-port-open. Use when cold start hurts a
  serverless or autoscaled deployment, when a CI pipeline pays for hundreds of JVM launches,
  when a CRaC flag fails with Unrecognized VM option, when an AppCDS archive is silently
  ignored after a JAR changes, when -XX:AOTCacheOutput is in the production start command,
  when spring-boot:build-image is expected to yield a CRaC image, or when a startup speedup
  percentage is quoted without a source. Does not cover the warm-up curve and traffic gating
  (jit-compilation), loading, linking and initialisation (jvm-class-loading), or leaving the
  JVM behind (graalvm-native-image).
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
4. **Default to AppCDS with `-XX:+AutoCreateSharedArchive`.** Portable, zero operational
   friction, self-healing when the classpath changes.
5. **Step up to the Leyden AOT cache** when a cache can be produced in CI and shipped, and use
   the one-command JEP 514 flow for training. The production command uses a _different_ flag.
6. **Make the training run representative.** Profiles are only worth what the training
   exercised; a run that starts and exits immediately profiles nothing an endpoint will use.
7. **Verify the cache is actually in use, then report the number with its source** and with the
   phase it applies to — total startup or one phase.

## Rules

- CRaC is **not mainline in OpenJDK 25**. `-XX:CRaCCheckpointTo`, `-XX:CRaCRestoreFrom` and
  `jcmd JDK.checkpoint` need an explicitly CRaC-enabled build (Azul Zulu with CRaC, or the
  `openjdk/crac` fork); a standard JDK 25 rejects them with `Unrecognized VM option`. Confirm
  with `java -XX:+PrintFlagsFinal -version | grep -i crac` before writing a single CRaC flag.
- JEP 483 (AOT class loading and linking) is **Delivered in JDK 24 — not preview**; it needs no
  `--enable-preview`. JEP 514 (one-command ergonomics) and JEP 515 (AOT method profiling) are
  Delivered in JDK 25. JEP 516 (AOT object caching with any GC) is **Closed/Delivered in
  JDK 26**: from 26 the AOT cache no longer constrains collector choice, which is a real
  change to the adoption calculus on 26+.
- `-XX:AOTCacheOutput=<file>` trains and rewrites the cache on **every** invocation, even when
  the file already exists. The production start command — systemd unit, Docker ENTRYPOINT —
  must use `-XX:AOTCache=<file>`. These are different flags, not aliases.
- Prefer `-XX:+AutoCreateSharedArchive` over the manual dump flow. A stale archive is disabled
  _silently_: no error, no speedup. The structural fix is the flag, not remembering to
  regenerate.
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
  the AutoCreateSharedArchive and Leyden training flows end to end, the verification commands
  that prove an archive or cache is in use, and the Kubernetes checkpoint-and-restore pattern.
  Read when writing start commands, a Dockerfile, a CI step or a deployment manifest.
