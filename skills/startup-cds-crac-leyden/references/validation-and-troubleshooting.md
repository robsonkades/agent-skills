# Validation and troubleshooting

Archive compatibility is an implementation/update contract, not just a feature-release contract.
For a compatibility/adoption claim, establish `java -Xinternalversion`, vendor/image digest,
OS/CPU and relevant flags; reuse adequate evidence and select the negative tests affected by
the change on the exact deployed build. A source-only flag explanation needs no new cache build.
JDK-8377932 is the concrete warning: affected early
JDK 25 builds and patched JDK 25 updates have materially different JAR validation behavior.

## What is validated at startup

| Compatibility dimension                   | What to test                                                         | Failure policy                                                                      |
| ----------------------------------------- | -------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| JDK vendor/build, modules image, OS/CPU   | Build and consume inside the final runtime image                     | `auto` may fall back; `on` should fail fast for incompatibility                     |
| Heap/class-pointer/object-header/GC flags | Re-run with production memory/collector flags                        | Read the exact `cds`/`aot` rejection, not a generic recipe                          |
| Boot/module/application paths and order   | Remove, append, reorder and replace one artifact                     | Expected acceptance rules differ by archive type/update                             |
| JAR identity/content                      | Replace one class while keeping path stable                          | Patched JDK-8377932 builds must reject; affected builds demonstrate stale-code risk |
| Directories/custom loaders                | Confirm which application classes are actually archived              | Unsupported/uncovered classes load normally and can dominate                        |
| Agents/JVMTI transformations              | Test every production agent and order                                | Early hooks can disable or restrict sharing/AOT                                     |
| Damaged/untrusted archive                 | Truncate/flip bytes; test `-XX:+VerifySharedSpaces` where applicable | Trusted provenance/access policy still applies; CRC is not authenticity             |

Fallback modes are designed to continue for many cache incompatibilities; malformed launch
options and other fatal errors can still stop startup. Use `on` in CI to validate compatibility,
and use `auto` in production only with telemetry that distinguishes application-cache use from
default CDS or a cold fallback. Oracle documents `-Xshare:on` as a testing aid, so decide whether
production crash-loop risk is preferable before adopting it there.

## JDK-8377932 regression test

```bash
java -XX:AOTCacheOutput=app.aot -cp app.jar Main       # expected: BUILD_A
# replace Main with BUILD_B while keeping path stable
java -XX:AOTCache=app.aot -XX:AOTMode=on -cp app.jar Main
# patched build: reject; affected build: may run BUILD_A
```

Use this when qualifying the relevant update/cache identity behavior. The earlier 2026-09-05
review recorded Corretto's develop changelog under **25.0.4.7.1**. The source retrieved on
2026-09-11 instead places JDK-8377932 under **25.0.3.9.1**; that discrepancy does not establish
whether the page changed or the earlier attribution was mistaken. Do not infer a universal
25.0.x fix boundary from either record. A changelog entry alone does not establish a target
binary's behavior, platform availability or deployment. A safe pipeline does not
depend on rejection: cache filename/manifest includes the application digest, both live in one
immutable release under the required provenance controls, and rollout telemetry exposes build ID from executing application code.

Historical local counterexample: Temurin 25.0.3+9 on Windows amd64 accepted a JAR replaced at the same path
after training; both `AOTMode=on` and `auto` exited 0 and printed the cached `BUILD_A`, while
`AOTMode=off` printed `BUILD_B_UPDATED` from the new JAR. Thus neither the feature/update number
nor successful fail-fast consumption proves application/cache consistency on every vendor build.
This probe did not validate Corretto or a newer patched runtime.

## Symptom table

| Symptom                                                                     | Likely cause                                                                   | How to distinguish                                                             | Remediation                                                                          |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------ |
| No speedup; some app classes have `source: file:`                           | Archive rejected, or those classes were untrained/unshareable                  | Compare explicit rejection/mapping logs and trained class coverage             | Fix rejection or coverage according to evidence; test measured dominant startup work |
| Old code runs after a deploy with `-XX:AOTCache`                            | Cache/application mixed across builds; affected JDK-8377932 build possible     | Compare runtime build ID, image/cache/JAR digests, JDK update and class source | Roll back atomically; rebuild cache; use a patched vendor update; add negative test  |
| `AutoCreateSharedArchive` repeatedly skips a stale `.jsa`                   | This build's mismatch path does not replace the existing archive               | Archive logs plus unchanged digest/mtime after a clean exit                    | Remove it in the build pipeline; publish a build-id path; verify next launch         |
| `AutoCreateSharedArchive is ignored because X is a static archive`          | `SharedArchiveFile` points at `-Xshare:dump` output                            | The warning itself                                                             | Point at a new path; the flag manages dynamic archives only                          |
| `Unable to use AOT cache …` names compressed-oops/GC/object-header mismatch | Build/use flags or JDK capabilities differ                                     | The `aot` warning plus `PrintFlagsFinal` on both phases                        | Build with production flags; evaluate JDK 26 JEP 516 if GC portability is required   |
| Cache is much smaller/less effective than expected                          | Training coverage, unsupported archived-heap configuration, or incompatibility | Creation logs and class-source/profile comparison                              | Fix training first; select a supported build/collector rather than guessing          |
| Assembly child has different flags/resources                                | Parent-only settings were assumed to propagate                                 | Inspect child command/log and `JDK_AOT_VM_OPTIONS`                             | Declare assembly inputs explicitly and validate output                               |
| Training exits 0 but no `.aot` file                                         | Child JVM failed (bad `JDK_AOT_VM_OPTIONS`, resource limit)                    | Output has `Launching child process` with no `AOTCache creation is complete`   | Assert the file in CI; inspect the child's stderr                                    |
| `CDS is disabled because early JVMTI ClassFileLoadHook is in use`           | A Java agent that transforms classes at load                                   | Message with `-Xlog:cds`                                                       | Load the agent later, scope its filter, or accept the loss and measure it            |
| Gain measured in dev vanishes in the container                              | Different JDK/image/CPU/quota/flags/training path or absent generated CDS      | Image digest, `-Xlog:cds,aot`, class sources and startup phase timings         | Train inside final image; generate archive for jlink image; rerun controlled cohort  |
| `Unrecognized VM option 'CRaCCheckpointTo=…'`                               | Standard JDK build                                                             | `PrintFlagsFinal` grepped for `crac` is empty                                  | CRaC-enabled build (Zulu, Liberica, `openjdk/crac`) or a managed equivalent          |

## Ownership in the pipeline

Build after JAR signing/repacking in the final runtime image, with production-relevant flags.
Publish application, runtime and cache digests as one release manifest; never reuse a cache layer
only because paths match. For a new artifact pipeline, validate creation, fail-fast consumption,
artifact-identity mismatch handling and startup correctness before promotion; verify measured
benefit when that is the adoption claim. Preserve adequate existing controls for unchanged paths.

## Primary references

- [Java 25 launcher: CDS/AOT options and failure modes](https://docs.oracle.com/en/java/javase/25/docs/specs/man/java.html)
- [Java 25 `jcmd`](https://docs.oracle.com/en/java/javase/25/docs/specs/man/jcmd.html)
- [Amazon Corretto 25 changelog](https://github.com/corretto/corretto-25/blob/develop/CHANGELOG.md)
- [JEP 483 consistency requirements](https://openjdk.org/jeps/483)
