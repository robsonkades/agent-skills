# Flags and workflows

## Flag reference

| Technique            | Flag                                     | Effect                                                          |
| -------------------- | ---------------------------------------- | --------------------------------------------------------------- |
| CDS                  | `-Xshare:dump` / `-Xshare:on\|auto\|off` | Dump mode / archive usage mode (`auto` is already the default)  |
| CDS                  | `-XX:SharedArchiveFile=<file>`           | Point at a custom archive instead of the embedded default       |
| AppCDS               | `-XX:DumpLoadedClassList=<file>`         | Capture the class list from a training run                      |
| AppCDS               | `-XX:SharedClassListFile=<file>`         | Use that list when dumping the archive                          |
| Dynamic CDS          | `-XX:ArchiveClassesAtExit=<file>`        | Dump at process exit, no manual class-list step                 |
| CDS, recommended     | `-XX:+AutoCreateSharedArchive`           | Create when absent; regenerate only on a header failure         |
| CDS, on demand       | `jcmd <pid> VM.cds dynamic_dump <file>`  | Dump a warmed live process; needs `-XX:+RecordDynamicDumpInfo`  |
| CDS, fail-fast       | `-Xshare:on`                             | Exit instead of running without a rejected archive              |
| Leyden, fail-fast    | `-XX:AOTMode=on`                         | Exit instead of running without a rejected cache                |
| Both, diagnostic     | `-Xlog:class+load`                       | `source: shared objects file` (`(top)` = dynamic archive)       |
| Both, diagnostic     | `-Xlog:cds` / `-Xlog:aot`                | Mapping and rejection reasons for `.jsa` / `.aot`               |
| Both, diagnostic     | `-Xlog:class+path=info`                  | Per-entry classpath validation: `passed` / `failed` and why     |
| Both, diagnostic     | `-XX:+PrintSharedArchiveAndExit`         | Dump the archive's recorded classpath and dictionary, then exit |
| CRaC¹                | `-XX:CRaCCheckpointTo=<dir>`             | Checkpoint directory                                            |
| CRaC¹                | `-XX:CRaCRestoreFrom=<dir>`              | Restore from a checkpoint                                       |
| CRaC¹                | `jcmd <pid> JDK.checkpoint`              | Trigger a checkpoint on a running process                       |
| Leyden, legacy (483) | `-XX:AOTMode=record\|create\|off\|auto`  | Phase of the three-step pipeline                                |
| Leyden, legacy (483) | `-XX:AOTConfiguration=<file>`            | Configuration captured in the `record` phase                    |
| Leyden, consume      | `-XX:AOTCache=<file>`                    | **Use** an existing cache — the production flag                 |
| Leyden, train (514)  | `-XX:AOTCacheOutput=<file>`              | Train and rewrite the cache; does this on **every** invocation  |
| Leyden, train (514)  | `JDK_AOT_VM_OPTIONS`                     | Pass options to the internal training phases                    |
| Leyden, diagnostic   | `-Xlog:aot*`                             | Cache creation and use; confirm the exact tag with `-Xlog:help` |

¹ Fails with `Unrecognized VM option` on a standard JDK 25.

## The AppCDS flow worth using

```bash
java -XX:+AutoCreateSharedArchive -XX:SharedArchiveFile=app.jsa -jar app.jar
```

One command, in every environment — dev, CI and production. When the file is missing the JVM
runs normally and writes a dynamic archive at exit, on top of the JDK's default base archive.
When the file exists, the JVM regenerates it only if the **header** is rejected — a different
JDK build, or a different `UseCompressedOops` / `UseCompactObjectHeaders` setting (source:
`FileMapInfo::initialize` in `filemap.cpp` and `CDSConfig` in JDK 25; the compact-headers case
was executed and rewrote the file). A classpath change or a rebuilt JAR is detected _later_, by
classpath validation, and that path does not regenerate: the launch logs `shared class paths
mismatch` and `Unable to use shared archive. The top archive failed to load`, application
classes come from the JARs, and the stale file survives — every launch, indefinitely. So the
flag removes the "forgot to create it" failure, not the "forgot to recreate it" one. Either
delete the file as part of the build that changes the JARs, or name it after the build id.

`-XX:+AutoCreateSharedArchive` is ignored with a warning if `SharedArchiveFile` points at a
static archive (`-Xshare:dump` output), and refuses to combine with `-XX:ArchiveClassesAtExit`.

The payoff concentrates where many JVMs start: an integration suite that boots a Spring context
per test class, across parallel runners, multiplies one small per-boot saving by hundreds of
boots. The stage's end-to-end gain tracks the slowest runner's saving, not the sum across
runners.

## The Leyden flow, and the flag that trips people

```bash
# Training and creation — one command (JEP 514). Exercise the real endpoints here.
java -XX:AOTCacheOutput=app.aot -jar app.jar

# Production — a DIFFERENT flag. This one consumes without retraining.
java -XX:AOTCache=app.aot -jar app.jar
```

Running the `AOTCacheOutput` command repeatedly rewrites `app.aot` every time: the mtime changes
on each call and the log prints the configuration-recorded and cache-creation lines on every
run, not only the first. JEP 514 collapses _training and creation_ from three commands to one;
it does not change the consumption side, which still needs `-XX:AOTCache`.

What the one-command flow actually does (Temurin 25.0.3, `-Xlog:aot=info`): the JVM selects
`AOTMode=record` because `AOTCacheOutput` is set, writes a temporary `app.aot.config` at exit,
then launches a **child JVM** with `-XX:AOTMode=create` — its options arrive through
`JAVA_TOOL_OPTIONS`, so `Picked up JAVA_TOOL_OPTIONS: … -XX:AOTMode=create` in the output is
expected, not a stray environment variable. Options meant only for the child go in
`JDK_AOT_VM_OPTIONS` (JEP 514). Two consequences for CI:

- A bad option in `JDK_AOT_VM_OPTIONS` (executed with `-XX:NotAFlag`) makes the child fail,
  no `.aot` is written, **and the parent still exits 0**. Assert the file exists.
- The training run is the parent; the child only assembles. Memory limits, agents and
  `-Xlog` settings on the parent do not apply to the child unless repeated in
  `JDK_AOT_VM_OPTIONS`.

The legacy three-step flow remains supported and ends at the same consumption flag:

```bash
java -XX:AOTMode=record -XX:AOTConfiguration=app.aotconf -jar app.jar
java -XX:AOTMode=create -XX:AOTConfiguration=app.aotconf -XX:AOTCache=app.aot -jar app.jar
java -XX:AOTCache=app.aot -jar app.jar
```

## Training run for a Spring application

Spring Framework's CDS documentation gives the training-run switch: `-Dspring.context.exit=onRefresh`
starts the application, refreshes the `ApplicationContext` and exits before serving traffic —
usable with `-XX:ArchiveClassesAtExit`, `-XX:AOTCacheOutput` and the three-step flow alike.
Spring Boot's "efficient deployments" page pairs it with `java -Djarmode=tools -jar app.jar extract`,
whose default layout (application JAR plus `lib/`) is what the archive's JAR checks expect; an
unexploded fat JAR loads classes through a nested-JAR loader that CDS cannot cover.

The switch decides what the artefact contains. For a `.jsa`, refresh-and-exit loads every
class the context needs, which is most of the win. For JEP 515 profiles, refresh-and-exit
records the profile of _startup_, not of request handling — the endpoints the cache is
supposed to warm were never executed. Drive representative traffic before exit when the target
is time-to-first-good-response rather than time-to-context-refresh.

## Verifying the archive or cache is actually in use

```bash
# Is the archive being rejected, and why? (.jsa: cds tag; .aot: aot tag)
java -Xlog:cds,class+path=info -XX:SharedArchiveFile=app.jsa -jar app.jar 2>&1 \
  | grep -iE "mismatch|not the one|validation: failed|failed to load"
java -Xlog:aot,class+path=info -XX:AOTCache=app.aot -jar app.jar 2>&1 \
  | grep -iE "Unable to use|mismatch|does not equal|Using AOT-linked classes"

# Did the application classes come from the archive? "(top)" marks the dynamic archive.
java -Xlog:class+load -XX:SharedArchiveFile=app.jsa -jar app.jar 2>&1 \
  | grep "com.example" | grep -c "source: shared objects file"

# What the archive recorded, without running the application
java -XX:+PrintSharedArchiveAndExit -XX:AOTCache=app.aot -cp app.jar

# Is this build CRaC-capable at all? An empty result is a definitive no.
java -XX:+PrintFlagsFinal -version | grep -i crac
```

Effectiveness is confirmed, never assumed — a stale archive costs nothing and gains nothing, and
looks identical to a working one from the outside. Count application classes specifically: the
JDK's own classes come from the default base archive whether or not yours loaded, so a bare
`grep -c "source: shared"` is high even when the application archive was rejected.

## A CRaC `Resource`

```java
@Component
public class DatabaseConnectionCRaC implements Resource {
    public DatabaseConnectionCRaC(DataSource dataSource) {
        this.dataSource = dataSource;
        Core.getGlobalContext().register(this);
    }

    @Override
    public void beforeCheckpoint(Context<? extends Resource> context) throws Exception {
        if (dataSource instanceof HikariDataSource hikari) {
            hikari.getHikariPoolMXBean().suspendPool();
        }
    }

    @Override
    public void afterRestore(Context<? extends Resource> context) throws Exception {
        if (dataSource instanceof HikariDataSource hikari) {
            hikari.getHikariPoolMXBean().resumePool();
        }
    }
}
```

CRIU works at the OS layer: it reconstructs memory, threads and file descriptors from `/proc`
and knows nothing about application semantics — a socket is a file descriptor, not a database
connection. `org.crac` is the portable dependency that delegates to `jdk.crac` when the JVM has
it and behaves as a harmless shim otherwise, which is why Spring (6.1 / Boot 3.2 onward) and AWS
Lambda SnapStart both target it.

## Kubernetes checkpoint and restore

Requires a CRaC-enabled JDK image; this does not run on a standard JDK 25.

```yaml
spec:
  initContainers:
    - name: warmup-and-checkpoint
      image: my-java-app:crac-enabled
      command:
        - /bin/sh
        - -c
        - |
          java -XX:CRaCCheckpointTo=/checkpoint app.jar &
          APP_PID=$!
          sleep 10                       # wait until ready and warm
          jcmd $APP_PID JDK.checkpoint
          wait $APP_PID
      volumeMounts: [{ name: checkpoint-volume, mountPath: /checkpoint }]
  containers:
    - name: app
      image: my-java-app:crac-enabled
      command: ['java', '-XX:CRaCRestoreFrom=/checkpoint']
      volumeMounts: [{ name: checkpoint-volume, mountPath: /checkpoint }]
  volumes:
    - name: checkpoint-volume
      emptyDir: {}
```
