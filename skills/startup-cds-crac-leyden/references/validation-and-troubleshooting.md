# Validation and troubleshooting

Every fact here was executed on Temurin 25.0.3 (Windows) or read from the JDK 25 GA sources
named in brackets. Re-run the reproduction on the JDK actually deployed before relying on a
row — JDK-8377932 in particular changes the picture on 27.

## What is validated at startup

| Check                                    | `.jsa` (AppCDS, static or dynamic)           | `.aot` (JEP 483/514, JDK 25)                              | On failure                                             |
| ---------------------------------------- | -------------------------------------------- | --------------------------------------------------------- | ------------------------------------------------------ |
| JDK build and modules image              | Yes                                          | Yes                                                       | Header rejected; `AutoCreateSharedArchive` regenerates |
| `UseCompressedOops`, class pointers      | Yes                                          | Yes                                                       | Header rejected; a G1 cache fails under ZGC on 25      |
| `UseCompactObjectHeaders`                | Yes — `does not equal the current … setting` | Yes                                                       | Header rejected; regenerated under `AutoCreate`        |
| Boot classpath, module path              | Yes                                          | Yes                                                       | `shared class paths mismatch`; **not** regenerated     |
| App classpath order and length           | Yes — `does not match`, `fewer elements`     | **Skipped** (JDK-8377932)                                 | `.jsa`: mismatch; `.aot`: accepted                     |
| App classpath appended entries           | Allowed (JEP 483 rule: append only)          | Allowed                                                   | —                                                      |
| JAR size and mtime                       | Yes — `not the one used … timestamp/size`    | **Skipped** (JDK-8377932; affects 25 and 26, fixed in 27) | `.jsa`: mismatch; `.aot`: **stale classes run**        |
| Directory on the classpath               | Not archived                                 | Unsupported (JEP 483)                                     | Classes load from disk as usual                        |
| `java.system.class.loader` property      | App classes disabled with a warning          | Rejected if aot-linked classes present [`filemap.cpp`]    | —                                                      |
| Early JVMTI `ClassFileLoadHook` (agents) | Disabled: `CDS is disabled because early …`  | Rejected if aot-linked classes present                    | An APM agent can silently remove the whole gain        |

Under the defaults (`-Xshare:auto`, `-XX:AOTMode=auto`) every failure above degrades to a
normal, cold start, with the reason only in `-Xlog:cds` / `-Xlog:aot` and the per-entry
verdict only in `-Xlog:class+path=info`. Under `-Xshare:on` / `-XX:AOTMode=on` the same
failures exit with status 1 — except the skipped checks, which no mode can turn into a
failure on 25.

## The JDK-8377932 reproduction

```bash
java -XX:AOTCacheOutput=app.aot -cp app.jar Main      # prints "hello"
# edit Main to print "HELLO-V2", rebuild app.jar at the same path
java -XX:AOTCache=app.aot -XX:AOTMode=on -cp app.jar Main
# prints "hello" — Main came from the cache, exit status 0, no warning
```

`-Xlog:class+path=info` shows the tell: `Archived boot classpath validation: passed` and
`Archived module path validation: passed` with **no** `Archived app classpath validation`
line at all. The static `.jsa` produced by `-Xshare:dump` from the same JAR prints
`Checking app classpath` and rejects the touched JAR. Cause in the JDK 25 source: the app
classpath check is guarded by `need_to_check_app_classpath()` [`aotClassLocation.hpp`], which
evaluates false for a cache assembled by the `AOTMode=create` child.

Consequence for a pipeline: a hotfix that replaces a JAR under a running image, a `docker cp`
into a container, or an image rebuild that keeps a cached `.aot` layer all run the previous
build's classes. Keep the cache and the JARs in one immutable artefact, and encode the build
id in the cache file name so a mismatch is impossible to assemble.

## Symptom table

| Symptom                                                                        | Likely cause                                                            | How to distinguish                                                                  | Remediation                                                                            |
| ------------------------------------------------------------------------------ | ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| No speedup; `-Xlog:class+load` shows app classes with `source: file:`          | Archive rejected, run continued under `auto`                            | `-Xlog:cds,class+path=info`: `validation: failed`, `mismatch`, `does not equal`     | Fix the listed entry; deploy cache and JARs together; add `on` mode to fail loudly     |
| Old code runs after a deploy with `-XX:AOTCache`                               | JDK-8377932: JAR changed at the same path                               | `class+path=info` lacks `Archived app classpath validation`; class `source: shared` | Rebuild the cache in the same build; never patch JARs in place; upgrade to 27          |
| `AutoCreateSharedArchive` never rewrites the `.jsa`                            | Failure is in classpath validation, not the header                      | `Unable to use shared archive. The top archive failed to load` and unchanged mtime  | Delete the file in the build step; name it per build                                   |
| `AutoCreateSharedArchive is ignored because X is a static archive`             | `SharedArchiveFile` points at `-Xshare:dump` output                     | The warning itself                                                                  | Point at a new path; the flag manages dynamic archives only                            |
| `Unable to use AOT cache … UseCompressedOops … different from runtime`         | Cache built under G1, consumed under ZGC on JDK 25 (or `-Xmx` > 32 GB)  | The `aot` warning names the flag                                                    | Train with the production collector and heap; JDK 26 (JEP 516) removes the GC coupling |
| Cache created but smaller than expected, `Archived java heap is not supported` | Training ran under ZGC on JDK 25                                        | `-Xlog:aot=info` during creation                                                    | Train under G1 (or Serial/Parallel) on 25, or move to 26                               |
| `JAVA_TOOL_OPTIONS` appears in the training output                             | Normal: the JEP 514 child JVM receives its flags that way               | The line lists `-XX:AOTMode=create`                                                 | None; put child-only options in `JDK_AOT_VM_OPTIONS`                                   |
| Training exits 0 but no `.aot` file                                            | Child JVM failed (bad `JDK_AOT_VM_OPTIONS`, resource limit)             | Output has `Launching child process` with no `AOTCache creation is complete`        | Assert the file in CI; inspect the child's stderr                                      |
| `CDS is disabled because early JVMTI ClassFileLoadHook is in use`              | A Java agent that transforms classes at load                            | Message with `-Xlog:cds`                                                            | Load the agent later, scope its filter, or accept the loss and measure it              |
| Gain measured in dev vanishes in the container                                 | Different JDK build, flags, `-Xmx`, or a `jlink` image with no base CDS | `java -version` ends `mixed mode` without `sharing`; header mismatch in the log     | Same base image for training and run; `jlink --generate-cds-archive`                   |
| `Unrecognized VM option 'CRaCCheckpointTo=…'`                                  | Standard JDK build                                                      | `PrintFlagsFinal` grepped for `crac` is empty                                       | CRaC-enabled build (Zulu, Liberica, `openjdk/crac`) or a managed equivalent            |

## Ownership in the pipeline

Build the archive where the JARs are final, on the JDK image that will run it, with the
production collector and heap flags, and copy it into the same image layer as the JARs. An
archive produced in a separate stage on a different base image satisfies none of the header
checks; one produced before a JAR is re-signed, re-timestamped by a reproducible-build tool or
re-packed by a buildpack fails the mtime check for `.jsa` and — on 25 — passes it wrongly for
`.aot`. The archive is a derived artefact of the exact JAR bytes, and the pipeline should treat
it as one.
