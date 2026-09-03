---
name: startup-cds-crac-leyden
description: >
  Cutting JVM startup and warm-up while staying on the JVM: CDS and AppCDS, the Leyden AOT
  cache (JEP 483/514/515), CRaC checkpoint and restore and its constraints, what each
  mechanism actually accelerates, verifying the cache is really in use, and measuring
  time-to-first-good-response instead of time-to-port-open. Use when cold start hurts a
  serverless or autoscaled deployment, when a CI pipeline pays for hundreds of JVM launches,
  when a CRaC flag fails with Unrecognized VM option, when an AppCDS archive is
  ignored after a JAR changes, when an outdated -XX:AOTCache is suspected after a rebuild, when
  -XX:AOTCacheOutput is in the production start command, when spring-boot:build-image is
  expected to yield a CRaC image, or when a startup speedup percentage is quoted without a
  source. Does not cover the warm-up curve and traffic gating (jit-compilation), loading,
  linking and initialisation (jvm-class-loading), or leaving the JVM behind
  (graalvm-native-image).
---

# Startup: CDS, CRaC and Leyden

## Purpose

Choose the startup mechanism whose granularity and deployment contract match the measured cost.
CDS/AOT archives reuse selected class metadata, linked state and heap artifacts. JDK 25 AOT
profiles can seed later compilation but do not archive native application code. CRaC preserves a
warmed process image, including heap/JIT state subject to engine and resource policies, so it can
remove much more work but requires a CRaC-enabled runtime, compatible Linux environment and an
explicit lifecycle for external resources, time and identity.

The failures this prevents are all failures of premise: teaching `-Xshare:dump` before checking
the default archive in the deployed image; writing CRaC flags that a standard
Temurin or Oracle JDK 25 does not recognise at all; leaving `-XX:AOTCacheOutput` in the
production start command, where it retrains the cache on every launch; and quoting a speedup
percentage nobody measured.

## Workflow

1. **Measure the real target.** Record port-open/readiness, first successful representative
   response, first response meeting the latency SLO and time/requests to stable throughput.
   Improving class loading can affect several phases, but it does not prove warm-up is solved.
2. **Account for the actual runtime image.** Mainline 64-bit JDK images commonly ship a default
   CDS archive and `-Xshare:auto` is the default; custom `jlink` images and vendor/platform builds
   may differ. Verify use with logs instead of inferring it from version alone.
3. **Select by constraint, then by granularity.** Use the decision tree in
   `references/technique-selection.md`; the choice is decided by platform and build control
   long before it is decided by expected gain.
4. **Use dynamic/AppCDS deliberately.** `AutoCreateSharedArchive` is convenient for repeated
   local/CLI launches that exit cleanly and have a writable path; an immutable production image
   should normally build and validate its archive in CI rather than mutate it at shutdown.
5. **Use the JDK 25 AOT cache** when training/assembly can run against the exact deployable image.
   The JEP 514 training-output flag and the production-consumption flag are different.
6. **Make the training run representative.** Profiles are only worth what the training
   exercised; a run that starts and exits immediately profiles nothing an endpoint will use.
7. **Build the archive and application image as one immutable, signed unit.** Validation details
   changed in JDK 25 updates (including the JDK-8377932 fix); never use a historical weakness as
   the design. Pin the exact vendor/build and run a changed-JAR negative test in CI.
8. **Verify the cache is actually in use, then report the distribution with its protocol** and the
   phase it applies to—total startup or one phase. Use `-Xshare:on`/`AOTMode=on` as CI
   compatibility gates; in production weigh fail-fast against crash-loop availability and expose
   fallback explicitly.

## Rules

- CRaC is **not mainline in OpenJDK 25**. `-XX:CRaCCheckpointTo`, `-XX:CRaCRestoreFrom` and
  `jcmd JDK.checkpoint` need an explicitly CRaC-enabled build (Azul Zulu with CRaC, BellSoft
  Liberica with CRaC, or the `openjdk/crac` fork); Temurin 25.0.3 rejects them with
  `Unrecognized VM option 'CRaCCheckpointTo=…'` and `PrintFlagsFinal | grep -i crac` prints
  nothing. Confirm that before writing a single CRaC flag.
- JEP 483 (AOT class loading and linking) is **Delivered in JDK 24 — not preview**; it needs no
  `--enable-preview`. JEP 514 (one-command ergonomics) and JEP 515 (AOT method profiling) are
  Delivered in JDK 25. JEP 516 (AOT object caching with any GC) is **Delivered in JDK 26**. On
  JDK 25, archived-heap support and cache compatibility depend on collector/build constraints;
  JEP 516 removes the any-GC restriction for AOT object caching in JDK 26, not every other cache
  compatibility constraint.
- `-XX:AOTCacheOutput=<file>` requests training/assembly on each invocation and replaces output
  on success. The production start command—systemd unit, Docker ENTRYPOINT—
  must use `-XX:AOTCache=<file>`. These are different flags, not aliases.
- JDK-8377932 allowed affected AOT-cache builds to accept a changed application JAR. It has been
  fixed/backported in JDK 25 update distributions, so behavior cannot be inferred from feature
  version alone. Verify the vendor build's release notes and negative-test replacement of a JAR;
  regardless of the result, deploy cache and application artifacts atomically and never patch a
  live image in place.
- `-XX:+AutoCreateSharedArchive` creates/replaces a dynamic archive at normal VM exit under its
  documented conditions. Same-version classpath mismatch behavior has varied by update; do not
  call it self-healing. Use a build-id path and negative tests instead of relying on overwrite
  heuristics or concurrent production writers.
- Under fallback modes (`-Xshare:auto`, `-XX:AOTMode=auto`), an incompatible application archive
  may be skipped while the application continues. Turn rejection into a failed
  start with `-Xshare:on` or `-XX:AOTMode=on` where an unexpectedly cold JVM is worse than a
  crash-loop — verified: a compact-headers mismatch exits with status 1 under `on`.
- `JDK_AOT_VM_OPTIONS` configures the assembly child of the JEP 514 flow. Treat the overall
  command's exit status as insufficient evidence: assert a fresh non-empty output, inspect the
  assembly log and consume it once with `AOTMode=on`. Respect the exact JEP/runtime restrictions
  on classpath/module-path changes and unsupported inputs.
- A custom `jlink` image does not automatically prove a usable generated CDS archive. Use
  `jlink --generate-cds-archive` when supported/desired, inspect `-Xlog:cds`, and measure the size
  and startup trade-off. Do not attribute a result to module stripping or CDS without a controlled
  comparison; `java -version` text is a hint, not an acceptance test.
- Traditional CDS does not archive native application code or trained method profiles; it reuses
  selected class metadata/heap artifacts and can reduce startup and multi-process footprint. Keep
  its effect distinct from JEP 515 profile seeding.
- JEP 515 persists execution **profiles**, not compiled code. The target still compiles; it just
  does not restart branch and type statistics from zero.
- Every CRaC-held external resource needs an owned lifecycle, whether supplied by framework
  integration, `org.crac.Resource`, or an engine policy. Database/messaging/HTTP connections,
  files, native state, TTL caches and timers need explicit checkpoint semantics. Restore may land
  on another host, so reconnect with current DNS, credentials, identity and clock assumptions.
- `spring-boot:build-image` is a packaging mechanism, not proof of a CRaC-enabled runtime or
  checkpoint. Inspect the selected buildpack/JRE and resulting flags; checkpoint/restore also
  needs engine-specific Linux capabilities/policies at runtime. These inputs evolve independently.
- On AWS Lambda the supported mechanism is **SnapStart** with `org.crac` hooks — the platform
  performs the Firecracker checkpoint and restore. Invoking `jcmd JDK.checkpoint` or
  `-XX:CRaCRestoreFrom` inside the function runtime is not a supported path.
- A CRaC image and restore path depend on process memory, dirty/resident pages, engine, storage,
  compression and lazy-page strategy—not class count alone. Image transfer and page faults are
  workload/platform costs, not constants.
- Always state whether a percentage covers total startup or one phase. The two are routinely
  swapped, and the swap is what makes the claim unfalsifiable.
- Treat `.jsa`, `.aot` and CRaC images as sensitive executable-derived artifacts. Pin provenance,
  restrict write/read access, scan/sign them with the application image, and assume a CRaC image
  contains every secret observed before checkpoint. Rotate credentials after restore when the
  provider contract requires freshness.

## References

- [Technique selection](references/technique-selection.md) — the granularity table showing what
  each mechanism preserves and what it does not, the constraint-first decision tree, the JEP
  status timeline, measurement contract and AOT-coverage rules. Read before choosing a mechanism
  or defending the choice.
- [Flags and workflows](references/flags-and-workflows.md) — the flag reference per technique,
  the AutoCreateSharedArchive and Leyden training flows end to end with the log lines each
  prints, the Spring training-run recipe, the verification commands that prove an archive or
  cache is in use, the CRaC resource lifecycle and container deployment gate. Read when writing start
  commands, a Dockerfile, a CI step or a deployment manifest.
- [Validation and troubleshooting](references/validation-and-troubleshooting.md) — what each
  artefact checks at startup (JDK, flags, classpath, JAR size and mtime, module path), what
  happens under `auto` versus `on`, when the archive is regenerated, and the symptom table.
  Read when an archive or cache falls back, when old code runs after a deploy, or
  before deciding where the archive is built in the pipeline.
