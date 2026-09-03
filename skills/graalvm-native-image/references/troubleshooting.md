# Troubleshooting a native build or binary

Start from the symptom, preserve the failing artifact and build metadata, and distinguish the cause
before changing flags. Many failures that look like reachability gaps are actually target, linking,
configuration, or resource-limit problems.

## Build failures

| Symptom                                               | Plausible causes                                                                                        | Distinguishing evidence                                                                                | Remediation                                                                                                  |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------ |
| Builder exits 137 without a Java exception            | container/host OOM kill                                                                                 | cgroup events, pod status, host kernel log, build peak RSS versus limit                                | raise builder memory, set `-J-Xmx`, reduce `--parallelism`, or split/remove unnecessary inputs               |
| `OutOfMemoryError` from builder                       | builder JVM heap exhausted                                                                              | Java stack trace and build resource report                                                             | size builder heap from observed peak; remove broad metadata/classpath; retry once with evidence              |
| unsupported feature/reachability error                | runtime bytecode generation, unknown dynamic loading, unsupported API, absent metadata                  | reported reachability path and library/framework compatibility docs                                    | update integration/library, provide narrow metadata/Feature, substitute only as last resort, or keep HotSpot |
| class initialization conflict                         | class marked runtime-initialized was reached from build-time state, or unsafe object entered image heap | build report and `-H:+PrintClassInitialization`; `--trace-object-instantiation=<type>` where supported | move smallest boundary to runtime; remove package-wide build-time initialization; refactor side effect       |
| `--gc=G1`, PGO, report, or monitoring option rejected | wrong distribution, platform, or release                                                                | full `native-image --version` and installed option help                                                | select a supporting distribution/release or choose another design                                            |
| expert `-H:` flag rejected or ineffective             | renamed/removed internal option, wrong spelling, overridden left-to-right                               | effective arguments, `--expert-options`, detail help, clean build without flag                         | remove it unless a measured current requirement exists                                                       |
| older build produces JVM-like fallback artifact       | fallback was allowed on a pre-25.1 line                                                                 | old build output/artifact dependencies; rebuilding with `--no-fallback` fails                          | fix unsupported feature or reject native for that release; fallback was removed in 25.1                      |

Do not add `--no-fallback` to GraalVM 25.1+ as a ritual: the feature is removed and the flag is
deprecated/no-op. For older maintained releases it is a useful correctness guard.

## Startup and portability failures

| Symptom                                      | Plausible causes                                                                                    | Distinguishing evidence                                                                 | Remediation                                                                                      |
| -------------------------------------------- | --------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| immediate “unsupported CPU feature” exit     | default or explicit `-march` exceeds deployment CPU                                                 | build report target machine; `-march=list`; oldest fleet CPU flags                      | rebuild for an explicit fleet floor or `-march=compatibility`; test there                        |
| loader error or missing shared library       | OS/libc/architecture mismatch or unshipped native dependency                                        | `file`, `ldd`/platform equivalent, linker output, base-image comparison                 | build for target ABI; ship dependency; use supported static strategy after validating behavior   |
| value from CI appears at runtime             | build-time-initialized static state captured host config/secret/time/path                           | initialization report; value changes only after rebuild                                 | ordinary runtime construction or narrow runtime initialization; rotate leaked secret and rebuild |
| fails before/around `main` only in container | target ABI, certificate store, locale/time-zone data, filesystem permissions, or resource inclusion | reproduce in release container; inspect linked libs/resources and effective environment | package/register required material or change base/linking strategy                               |
| TLS/security provider fails                  | provider initialized/registered differently, certificates absent, algorithm/resource excluded       | provider list and trust-store behavior in exact artifact/container                      | use documented JCA configuration, include required resources/providers, avoid blanket metadata   |

## Runtime-only correctness failures

| Symptom                                            | Plausible causes                                                                                     | Distinguishing evidence                                                              | Remediation                                                                              |
| -------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------- |
| `MissingReflectionRegistrationError`               | reflective type/member not registered in exact mode                                                  | error names access and call path                                                     | add the narrow intentional entry or fix framework/library metadata; regression-test path |
| `ClassNotFoundException` / `NoSuchMethodException` | absent artifact, wrong name/version, or non-exact metadata gap                                       | inspect packaged inputs; rerun exact mode with missing-registration `Exit`/`Warn`    | repair dependency/name if genuinely absent; otherwise add owned metadata                 |
| `getResource*` returns null                        | resource omitted, wrong path/case, class-loader semantics, or packaging error                        | inspect reachability metadata and artifact; compare exact container filesystem       | register a narrow resource glob or correct packaging/path                                |
| proxy/serialization/JNI/FFM failure                | missing interface/type/native access, ABI mismatch, or external library absent                       | exact metadata report plus native loader/ABI evidence                                | add precise metadata; package/link correct library; test errors and callbacks            |
| works under JVM tests but fails natively           | tests never execute artifact, agent coverage gap, initialization difference, or unsupported behavior | run same scenario against binary with exact reporting and initialization diagnostics | add native integration gate; repair ownership; keep JVM rollback                         |
| stale configuration after restart                  | artifact-persisted build-time state                                                                  | rebuilding changes value while process restart does not                              | defer read to runtime and invalidate/rebuild compromised artifact                        |

## Memory, GC, and latency

| Symptom                                  | Plausible causes                                                                                                       | What to measure                                                                                              | Remediation                                                                                                  |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------ |
| RSS grows toward container limit         | heap grows toward default ceiling, GC transient copy headroom, native allocation, stacks, allocator retention, or leak | heap/live set after GC, RSS/PSS, NMT where available, thread count/stacks, cgroup events, allocation profile | set `-Xmx` with headroom; choose GC; reduce concurrency/stacks; isolate native leak before blaming Java heap |
| `OutOfMemoryError` below container limit | explicit heap too small or live set retained                                                                           | heap dump/JFR allocation and GC data, post-GC live set                                                       | fix retention or resize heap; do not consume all cgroup headroom                                             |
| container OOM kill without Java OOME     | total RSS/transient GC exceeds cgroup limit                                                                            | cgroup OOM events and peak RSS versus heap                                                                   | lower heap, leave collector/native headroom, reduce threads, or raise limit                                  |
| long pauses with Serial                  | live set/heap too large for stop-the-world single-threaded collection                                                  | pause distribution, live set, allocation rate, CPU quota                                                     | reduce live data/allocation, test G1 where supported, or prefer HotSpot collector options                    |
| native throughput wins only in short run | JVM still compiling or dependency caches differ                                                                        | compilation activity, achieved load over time, connection/cache state                                        | report cold separately; compare defined steady states under same saturation protocol                         |
| PGO regresses a route                    | training traffic underrepresents route or hot code changed                                                             | per-route profiles on independent evaluation load                                                            | recollect representative profile, segment workloads, or ship non-PGO build                                   |

The Serial GC default maximum of 80% of detected physical memory is a ceiling, not proof that a
growing RSS is harmless. Confirm live-set behavior and non-heap/native components before choosing a
remediation.

## Diagnostics unavailable during an incident

| Symptom                                        | Cause                                                                                 | Recovery and prevention                                                                            |
| ---------------------------------------------- | ------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| runtime rejects JFR/heap-dump/NMT feature      | artifact was built without required monitoring support                                | use OS-level evidence now; rebuild with narrowly required features and rehearse                    |
| `jcmd` cannot attach                           | unsupported platform/release or `jcmd` not enabled                                    | use configured JFR/signals/OS tools; current docs exclude Native Image `jcmd` on Windows           |
| stack trace/crash address cannot be symbolized | stripped symbols not retained or build identity lost                                  | preserve binary and core; retrieve exact symbols by build ID; make symbol retention a release gate |
| expected HotSpot event absent                  | event depends on HotSpot runtime or bytecode instrumentation not implemented natively | enumerate events on the real binary; select supported event, custom event, profiler, or HotSpot    |

GraalVM 25.1 added Windows JFR recording and heap dumps, so older blanket statements that JFR is
unavailable on Windows are version-specific. Always test the selected release.

## Escalation bundle

Preserve before rebuilding:

- source/dependency revision, full builder version/distribution, effective options and environment;
- target OS/architecture/libc/CPU, framework and build-plugin versions;
- complete build log/report, peak builder RSS, metadata diff, artifact hash/SBOM/signature;
- failing input, exact command, container image/digest, limits and cgroup events;
- JFR/heap/thread/native-memory/core evidence that the artifact supports;
- equivalent HotSpot result and last known-good native artifact.

Changing several flags and rebuilding destroys causal evidence. Make one hypothesis-driven change,
reproduce the original failure, and validate the surrounding paths before promotion.
