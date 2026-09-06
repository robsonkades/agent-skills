# Flags and workflows

## Flag reference

| Technique            | Flag                                     | Effect                                                          |
| -------------------- | ---------------------------------------- | --------------------------------------------------------------- |
| CDS                  | `-Xshare:dump` / `-Xshare:on\|auto\|off` | Dump mode / archive usage mode (`auto` is already the default)  |
| CDS                  | `-XX:SharedArchiveFile=<file>`           | Point at a custom archive instead of the embedded default       |
| AppCDS               | `-XX:DumpLoadedClassList=<file>`         | Capture the class list from a training run                      |
| AppCDS               | `-XX:SharedClassListFile=<file>`         | Use that list when dumping the archive                          |
| Dynamic CDS          | `-XX:ArchiveClassesAtExit=<file>`        | Dump at process exit, no manual class-list step                 |
| Dynamic CDS          | `-XX:+AutoCreateSharedArchive`           | Reuse/create a dynamic archive at normal VM exit                |
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
| Leyden, train (514)  | `-XX:AOTCacheOutput=<file>`              | Record then assemble an output cache for that invocation        |
| Leyden, assembly     | `JDK_AOT_VM_OPTIONS`                     | Pass JVM options to the assembly child process                  |
| Leyden, diagnostic   | `-Xlog:aot*`                             | Cache creation and use; confirm the exact tag with `-Xlog:help` |

¹ Requires a CRaC-enabled build; standard Temurin 25 does not supply these flags.

Shell fragments assume Bash and a finite training workload or an application-owned clean-stop
mechanism. Adapt quoting and exit-status handling for the actual shell. Do not wait for a server
command to terminate unless the training lifecycle defines how it stops.

## Choosing an AppCDS creation flow

```bash
java -XX:+AutoCreateSharedArchive -XX:SharedArchiveFile=app.jsa -jar app.jar
```

This is convenient for a repeated command with a persistent writable directory: when no usable
same-version archive exists, the JVM can create/replace the dynamic archive at normal exit for a
later launch. A killed process may produce nothing, the first launch gets no application-archive
benefit, concurrent writers need an ownership policy, and immutable/read-only production images
cannot rely on shutdown mutation. For services, prefer a training/build step such as
`ArchiveClassesAtExit` against final JARs and ship the result under a build-id name.

Exact replacement behavior after header/classpath mismatches has changed across updates. Do not
encode `filemap.cpp` behavior from one build as a contract: negative-test a changed JAR, changed
flags and truncated archive on the deployed vendor build. Use logs to prove whether it reused,
replaced or skipped the archive.

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

`AOTCacheOutput` requests a training/assembly flow; do not leave it in the service ENTRYPOINT.
JEP 514 collapses training and creation from three commands to one; consumption still uses
`-XX:AOTCache`. Create to a temporary path, validate it, then publish atomically so a failed
training run cannot replace the last known-good artifact.

The one-command flow records configuration, then launches an assembly child JVM. Options meant
for that child go in `JDK_AOT_VM_OPTIONS`. The implementation can expose internal child-launch
details in logs; do not parse incidental `JAVA_TOOL_OPTIONS` text as a stable protocol. For CI:

- Treat parent exit status as necessary but not sufficient: assert a newly created non-empty
  cache and consume it once with `AOTMode=on`.
- The training run is the parent; the child assembles. Do not assume every parent flag is
  discarded or every flag is forwarded. JEP 514 documents a same-sized assembly heap while the
  training heap still exists. In a Temurin 25.0.3+9 Windows probe, parent `-Xms16m -Xmx32m`
  produced child InitialHeapSize=16777216 and MaxHeapSize=33554432 without repeating them in
  `JDK_AOT_VM_OPTIONS`. Budget simultaneous heaps and native overhead; inherited environment
  options and container limits can also affect both. Inspect child logs and use separate
  record/create processes when their overlapping resource demand does not fit.

The legacy three-step flow remains supported and ends at the same consumption flag:

```bash
java -XX:AOTMode=record -XX:AOTConfiguration=app.aotconf -jar app.jar
java -XX:AOTMode=create -XX:AOTConfiguration=app.aotconf -XX:AOTCache=app.aot -jar app.jar
java -XX:AOTCache=app.aot -jar app.jar
```

## Training run for a Spring application

Spring Framework's startup documentation provides the training-run switch: `-Dspring.context.exit=onRefresh`
starts the application, refreshes the `ApplicationContext` and exits before serving traffic —
usable with `-XX:ArchiveClassesAtExit`, `-XX:AOTCacheOutput` and the three-step flow alike.
Spring Boot documentation pairs CDS/AOT workflows with extraction so classes use archive-compatible
loaders/layout. Follow the documentation for the exact Boot/buildpack version; do not assume a
fat-JAR layout or loader remains compatible across releases.

The switch changes coverage. Refresh-and-exit loads what context refresh actually reaches;
lazy beans and request-specific paths may be absent. It can profile startup and code shared with
requests, but does not establish representative request-path profiles. Drive realistic traffic
before a controlled exit when those paths dominate the measured first-response target. Training
must isolate or safely redirect side effects and use representative non-production credentials/data.

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

# First capability hint; confirm against the vendor's CRaC build/release documentation.
java -XX:+PrintFlagsFinal -version | grep -i crac
```

Effectiveness is confirmed, never assumed. Count application classes specifically: the
JDK's own classes come from the default base archive whether or not yours loaded, so a bare
`grep -c "source: shared"` is high even when the application archive was rejected.
These pipelines are diagnostic filters, not CI exit gates: preserve the complete Java log and
Java exit status before filtering (Bash pipelines otherwise normally return the final command's
status). A class loaded from a JAR can be untrained/unshareable while other application classes
use the archive. Correlate per-class coverage with explicit cache mapping/linking messages.

## A CRaC resource lifecycle

Partial Java 17-compatible shape: supply `org.crac.Core`, `Context`, `Resource`, the matching
CRaC library/runtime, and application `RemoteClient`/connection factory. Request use must be
quiesced/drained by the surrounding lifecycle; synchronization below serializes resource close
and restore callbacks, not in-flight request use.

```java
public final class RemoteClientResource implements Resource, AutoCloseable {
    private volatile RemoteClient client;

    public RemoteClientResource() {
        this.client = connectFromCurrentEnvironment();
        Core.getGlobalContext().register(this); // retain this object strongly elsewhere
    }

    @Override
    public void beforeCheckpoint(Context<? extends Resource> context) {
        close();                 // drain first at the service lifecycle boundary
    }

    @Override
    public synchronized void afterRestore(Context<? extends Resource> context) {
        if (client == null) {
            client = connectFromCurrentEnvironment(); // re-resolve DNS/credentials/identity
        }
    }

    @Override
    public synchronized void close() {
        RemoteClient old = client;
        client = null;
        if (old != null) old.close();
    }
}
```

The engine knows OS resources, not application validity. Suspending a pool is insufficient when
its sockets/credentials are stale; close and reconstruct unless the engine/provider explicitly
supports preservation. Hooks must be idempotent, ordered, strongly reachable, bounded and
failure-visible. Quiesce request admission before `beforeCheckpoint`; publish readiness only after
all `afterRestore` work succeeds. Test DNS/IP/hostname changes, expired credentials/TLS sessions,
wall-clock jumps, TTL caches, scheduled-task catch-up, random/unique ID state and partial hook
failure. Multiple restores from one image duplicate captured PRNG/sequence/lease state, so renew
uniqueness and ownership after restore. AWS SnapStart supplies a customized CRaC context, not the
CRIU engine.

## Container deployment gate for CRaC

Do not copy a generic init-container YAML: engine, runtime and platform permissions differ. The
deployment must prove the checkpoint and restore use the same immutable application/JDK image,
compatible CPU/kernel/filesystem paths, supported security context/capabilities, protected image
storage, explicit warm-up completion (never `sleep N`), drained external resources, and a
post-restore readiness probe. Run restore tests after node/hostname/IP/DNS/credential changes and
after the maximum planned snapshot age.

## Primary references

- [Java 25 launcher: CDS and AOT cache](https://docs.oracle.com/en/java/javase/25/docs/specs/man/java.html)
- [JEP 514 assembly process and memory requirements](https://openjdk.org/jeps/514)
- [Spring Framework checkpoint/restore](https://docs.spring.io/spring-framework/reference/integration/checkpoint-restore.html)
- [Spring Boot checkpoint/restore](https://docs.spring.io/spring-boot/reference/packaging/checkpoint-restore.html)
- [AWS Lambda SnapStart Java runtime hooks](https://docs.aws.amazon.com/lambda/latest/dg/snapstart-runtime-hooks-java.html)
- [Azul CRaC runtime requirements](https://docs.azul.com/crac/usage/running-crac)
