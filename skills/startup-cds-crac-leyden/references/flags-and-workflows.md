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
| Leyden, consume      | `-XX:AOTCache=<file>`                    | **Use** an existing cache in the consuming run                  |
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
encode `filemap.cpp` behavior from one build as a contract. When qualifying changed archive
compatibility or release inputs, select the relevant changed-JAR/flag/truncation controls on
the actual vendor build, reusing adequate existing evidence. Use logs to establish reuse,
replacement or rejection; a narrow explanation does not require all negative controls.

`-XX:+AutoCreateSharedArchive` is ignored with a warning if `SharedArchiveFile` points at a
static archive (`-Xshare:dump` output), and refuses to combine with `-XX:ArchiveClassesAtExit`.

The payoff concentrates where many JVMs start: an integration suite that boots a Spring context
per test class, across parallel runners, multiplies one small per-boot saving by hundreds of
boots. The stage's end-to-end gain tracks the slowest runner's saving, not the sum across
runners.

## The Leyden flow, and the flag that trips people

```bash
# Training and creation — one command (JEP 514). Exercise the relevant finite workload.
java -XX:AOTCacheOutput=app.aot -jar app.jar

# Production — a DIFFERENT flag. This one consumes without retraining.
java -XX:AOTCache=app.aot -jar app.jar
```

`AOTCacheOutput` requests a training/assembly flow; an ordinary long-lived serving command
should consume instead. A deliberately owned finite deployment-time training phase may precede
the consuming launch when its stop condition, side effects, resources and failure handling are
explicit and supported.
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
  training heap still exists. In the historical Temurin 25.0.3+9 Windows probe, parent `-Xms16m -Xmx32m`
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

Spring Framework 6.2.0 documents `-Dspring.context.exit=onRefresh`. In that version it exits
during `LifecycleProcessor.onRefresh`, after non-lazy singleton initialization but before
lifecycle start and `ContextRefreshedEvent`. The implementation calls `Runtime.halt(0)`;
do not infer normal shutdown-hook completion or a fully started context. Use the exact
Framework/Boot version's documented CDS/AOT training recipe and verify output; the exit switch
is not a general proof of archive creation, graceful cleanup or request-path coverage.
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
if java -XX:+PrintFlagsFinal -version >crac-capability.log 2>&1; then
  java_status=0
else
  java_status=$?
fi
if grep -i crac crac-capability.log; then
  filter_status=0
else
  filter_status=$?
fi
printf 'java_exit=%s filter_exit=%s; full log: crac-capability.log\n' "$java_status" "$filter_status"
# Only java_exit=0 with filter_exit=1 establishes a successful no-match hint.
# A failed Java launch or grep error needs its own diagnosis, regardless of matches.
```

Effectiveness is confirmed, never assumed. Count application classes specifically: the
JDK's own classes come from the default base archive whether or not yours loaded, so a bare
`grep -c "source: shared"` is high even when the application archive was rejected.
These pipelines are diagnostic filters, not CI exit gates: preserve the complete Java log and
Java exit status before filtering (Bash pipelines otherwise normally return the final command's
status). For a capability check, for example, capture first and distinguish Java failure from a
successful empty search; do not interpret a failed producer as absence of CRaC. A class loaded from a JAR can be untrained/unshareable while other application classes
use the archive. Correlate per-class coverage with explicit cache mapping/linking messages.

## A CRaC resource lifecycle

Partial Java 17-compatible shape: supply `org.crac.Core`, `Context`, `Resource`, the matching
CRaC library/runtime, and application `RemoteClient`/connection factory. Request use must be
quiesced/drained by the surrounding lifecycle; synchronization below serializes resource close
and restore callbacks, not in-flight request use. This shape assumes a failed `RemoteClient.close()`
leaves identifiable ownership that the caller may safely retry; adapt failure/reconciliation
to the real client's contract. Do not retry an ambiguously released native handle blindly.

```java
public final class RemoteClientResource implements Resource, AutoCloseable {
    private volatile RemoteClient client;
    private boolean permanentlyClosed;
    private boolean checkpointClosed;
    private boolean closeFailed;

    public RemoteClientResource() {
        this.client = connectFromCurrentEnvironment();
        Core.getGlobalContext().register(this); // retain this object strongly elsewhere
    }

    @Override
    public synchronized void beforeCheckpoint(Context<? extends Resource> context) throws Exception {
        if (permanentlyClosed) {
            if (closeFailed) throw new IllegalStateException("Shutdown cleanup is unresolved");
            return;
        }
        closeClient();           // drain first at the service lifecycle boundary
        checkpointClosed = true;
    }

    @Override
    public synchronized void afterRestore(Context<? extends Resource> context) throws Exception {
        if (closeFailed) throw new IllegalStateException("Checkpoint cleanup is unresolved");
        if (!permanentlyClosed && checkpointClosed) {
            client = connectFromCurrentEnvironment(); // re-resolve DNS/credentials/identity
            checkpointClosed = false; // failed connection leaves restore pending
        }
    }

    @Override
    public synchronized void close() throws Exception {
        permanentlyClosed = true; // final disposal must not reopen on a late restore
        checkpointClosed = false;
        closeClient();
    }

    private void closeClient() throws Exception {
        try {
            if (client != null) client.close();
        } catch (Exception failure) {
            closeFailed = true;  // retain ownership; propagate before claiming completion
            throw failure;
        }
        client = null;           // clear only after successful cleanup
        closeFailed = false;
    }
}
```

The engine knows OS resources, not application validity. Suspending a pool is insufficient when
its sockets/credentials are stale; close and reconstruct unless the engine/provider explicitly
supports preservation. Hooks must be idempotent, ordered, strongly reachable, bounded and
failure-visible. The `org.crac` global context orders checkpoint callbacks in reverse registration
order and restore callbacks in registration order; custom contexts define their own contract.
Keep a strong application owner because registration alone can be weak. Do not invoke competing
framework and application lifecycle ownership for the same connection. The 1.4.0 global-context
contract also sends restore notifications after a failed checkpoint without creating an image;
`afterRestore` alone does not prove execution in a restored process. Quiesce request admission before `beforeCheckpoint`; publish readiness only after
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
- [Spring Framework 6.2.0 lifecycle implementation](https://github.com/spring-projects/spring-framework/blob/v6.2.0/spring-context/src/main/java/org/springframework/context/support/DefaultLifecycleProcessor.java)
- [CRaC 1.4.0 API](https://javadoc.io/doc/org.crac/crac/1.4.0/org/crac/package-summary.html)
- [Spring Boot checkpoint/restore](https://docs.spring.io/spring-boot/reference/packaging/checkpoint-restore.html)
- [AWS Lambda SnapStart Java runtime hooks](https://docs.aws.amazon.com/lambda/latest/dg/snapstart-runtime-hooks-java.html)
- [Azul CRaC runtime requirements](https://docs.azul.com/crac/usage/running-crac)
