# Flags and workflows

## Flag reference

| Technique            | Flag                                     | Effect                                                          |
| -------------------- | ---------------------------------------- | --------------------------------------------------------------- |
| CDS                  | `-Xshare:dump` / `-Xshare:on\|auto\|off` | Dump mode / archive usage mode (`auto` is already the default)  |
| CDS                  | `-XX:SharedArchiveFile=<file>`           | Point at a custom archive instead of the embedded default       |
| AppCDS               | `-XX:DumpLoadedClassList=<file>`         | Capture the class list from a training run                      |
| AppCDS               | `-XX:SharedClassListFile=<file>`         | Use that list when dumping the archive                          |
| Dynamic CDS          | `-XX:ArchiveClassesAtExit=<file>`        | Dump at process exit, no manual class-list step                 |
| CDS, recommended     | `-XX:+AutoCreateSharedArchive`           | Create when absent, **regenerate when stale**                   |
| CDS, diagnostic      | `-Xlog:class+load` / `-Xlog:cds`         | Show, class by class, whether it came from the archive          |
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
runs normally and writes the archive at exit. When the file exists but its classpath checksum no
longer matches, the JVM regenerates it instead of silently disabling it, which is exactly the
failure the manual flow produces. No separate pipeline stage, nothing to remember on a
dependency bump.

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

The legacy three-step flow remains supported and ends at the same consumption flag:

```bash
java -XX:AOTMode=record -XX:AOTConfiguration=app.aotconf -jar app.jar
java -XX:AOTMode=create -XX:AOTConfiguration=app.aotconf -XX:AOTCache=app.aot -jar app.jar
java -XX:AOTCache=app.aot -jar app.jar
```

## Verifying the archive or cache is actually in use

```bash
# Is the archive being rejected?
java -Xlog:cds -XX:SharedArchiveFile=app.jsa -jar app.jar 2>&1 | grep -i "disabled\|invalid"

# What proportion of classes came from the archive?
java -Xlog:class+load -XX:SharedArchiveFile=app.jsa -jar app.jar 2>&1 | grep -c "source: shared"

# Is this build CRaC-capable at all? An empty result is a definitive no.
java -XX:+PrintFlagsFinal -version | grep -i crac
```

Effectiveness is confirmed, never assumed — a stale archive costs nothing and gains nothing, and
looks identical to a working one from the outside.

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
