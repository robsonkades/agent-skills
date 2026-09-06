# Asynchronous Logging and Cost

## Cost decomposition

Measure:

- enabled call sites and messages/s;
- bytes/s and formatting cost;
- application CPU/allocation/latency/useful throughput;
- log buffer occupancy/drop/stall evidence;
- output-thread CPU and sink latency;
- disk/network/collector ingestion;
- shutdown/crash loss.

Compare no extra selection, synchronous selection, async drop and async stall under the
same representative workload. Randomize/repeat and report uncertainty.

## Drop versus stall

Drop avoids waiting for buffer space but loses evidence when the bounded buffer fills. It
does not bound total call-site latency: formatting, allocation, lock contention and synchronous
fallback still matter. Stall waits for space by applying backpressure to application/JVM threads and can worsen the
incident. Buffer enlargement delays but does not solve a sustained sink deficit and consumes
native/process memory.

In [OpenJDK jdk-25-ga AsyncLogWriter](https://github.com/openjdk/jdk/blob/jdk-25-ga/src/hotspot/share/logging/logAsyncWriter.cpp),
enqueue takes producer/consumer locks; unattached or recursive logging and initialization
failure can fall back to synchronous output. A failed stalled-message allocation silently
loses that message. Drop notices use the affected output, so a blocked sink can also hide
the notice. Successful enqueue or flush is not proof of durable storage or remote ingestion.
These are implementation findings for that source baseline, not universal JVM guarantees.

Choose from evidence value and failure coupling. For critical forensic evidence, consider
a lower-volume selection or separate durable mechanism rather than assuming stall is safe.

## Validation

Run sink saturation/forced termination only against an isolated test JVM and sink, or an
explicitly authorized fault experiment. Do not block shared production stdout to test logging.

- saturate the selected log rate and slow/block the sink;
- verify drop/stall behavior and how loss is reported;
- confirm loss reporting itself reaches a monitored channel;
- test graceful and forced termination;
- measure recovery backlog after sink restoration;
- prove other JVM/application logs are not starved.
