# What a restart destroys

## The survival matrix

| Evidence                               | Survives a JVM restart?  | Survives pod replacement?    |
| -------------------------------------- | ------------------------ | ---------------------------- |
| Thread state, stacks, lock ownership   | **no**                   | no                           |
| Heap contents                          | **no**                   | no                           |
| Compiled code, JIT profile, tier state | **no**                   | no                           |
| Native memory state, NMT baselines     | **no**                   | no                           |
| In-flight requests                     | **no**                   | no                           |
| JVM counters, JFR in-memory buffer     | **no**                   | no                           |
| JFR repository chunks (`disk=true`)    | **no** — deleted on exit | no                           |
| GC log on disk                         | yes                      | **only on a mounted volume** |
| `hs_err_pid*.log`                      | yes                      | **only on a mounted volume** |
| JFR files already written              | yes                      | **only on a mounted volume** |
| Heap dump already written              | yes                      | **only on a mounted volume** |
| Metrics and traces already exported    | yes                      | yes — they left the process  |
| Application logs already shipped       | yes                      | yes                          |

The middle column is the one people reason about. **The right-hand column is the one that
actually bites**: an artefact written correctly, to the container's own filesystem, is destroyed
by the pod replacement it was collected to survive.

The JFR row surprises people. A continuous recording with `disk=true` writes ~12 MB chunks
(`maxchunksize`) into a repository under the temp directory, prunes them by `maxage`/`maxsize`,
and **deletes the directory on normal exit** — SIGTERM included. Verified on JDK 25.0.3:

- `jcmd <pid> JFR.dump filename=…` turns the retained window into a file at any time; it is
  the incident command.
- `-XX:StartFlightRecording:…,dumponexit=true,filename=<volume>/exit.jfr` writes on orderly
  shutdown; it does nothing on SIGKILL or a kernel OOM kill.
- `-XX:FlightRecorderOptions:repository=<volume>,preserve-repository=true` keeps the chunks
  after exit; `jfr assemble <repository>/<dated-dir> out.jfr` rebuilds a recording from
  completed chunks after a kill. The chunk being written at the moment of the kill was not
  readable in that test — only chunks that had rotated survived.

## Everything volatile, in one sentence

A restart takes with it every fact about _what the JVM was doing_, and leaves every fact that had
already been written down or sent somewhere. That is the whole decision: if the evidence is not
already a file on durable storage or a metric in a backend, restarting deletes it.

## Preserving from a container about to be replaced

Least to most invasive:

```bash
# 1. copy out while it still exists
kubectl cp <ns>/<pod>:/tmp/heap.hprof ./heap.hprof

# 2. keep the pod alive but stop it serving — the highest-value move
kubectl label pod <pod> app-  # remove the Service selector label

# 3. give the artefacts a durable home before the incident
#    a volume mounted at a path the JVM is configured to write to
```

Option 2 deserves the emphasis. Removing the label that matches the Service selector takes the
pod out of the endpoints while leaving the process running and untouched. The Deployment
observes a missing replica and creates a new one, so service is restored — and the evidence is
preserved in full, with no time pressure at all. Where the deployment allows it, this converts
the entire incident-capture problem into an ordinary investigation.

Two things to remember afterwards: the pod is still consuming its resource request, and a
ReplicaSet-owned pod that stays labelled off will persist until deleted. Put a reminder on it.

## What to configure before the incident

Every item here costs close to nothing in steady state and converts a capture into a copy.

```
# a heap dump on OOM, on durable storage
-XX:+HeapDumpOnOutOfMemoryError
-XX:HeapDumpPath=/mnt/diagnostics

# a GC log that rotates and does not become the incident
-Xlog:gc*:file=/mnt/diagnostics/gc.log:time,uptime,level,tags:filecount=5,filesize=20m

# safepoint accounting, without which a class of pause is invisible
-Xlog:safepoint:file=/mnt/diagnostics/safepoint.log:time,uptime

# native memory, which cannot be enabled later
-XX:NativeMemoryTracking=summary

# where the JVM writes its fatal error log
-XX:ErrorFile=/mnt/diagnostics/hs_err_%p.log
```

Constructing and _verifying_ the `-Xlog` selections is `unified-logging` — it matters here
because an `-Xlog` line that produces an empty file fails silently, and the incident is when you
find out.

A continuous JFR recording belongs on this list too, with its repository on the same volume
(above); `jfr-and-async-profiler` owns the settings and the overhead budget.

## The cost of not having done it

The recurring incident with no evidence is not an unlucky one. It is the compounding result of a
configuration decision: nothing was on, so nothing was captured, so nothing was explained, so it
happened again. Each occurrence costs a restart and an unanswered question, and the fix is
half a dozen flags and a mounted volume.

If an incident ends without a cause, the deliverable is not only the timeline — it is the change
that makes the next one diagnosable. `slo-and-alerting` covers whether it should have paged;
this is whether it could have been answered.
