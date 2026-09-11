# Asynchronous Logging and Cost

## Cost decomposition

For an overhead or mode-selection claim, inspect the relevant measurements:

- enabled call sites and messages/s;
- bytes/s and formatting cost;
- application CPU/allocation/latency/useful throughput;
- log buffer occupancy/drop/stall evidence;
- output-thread CPU and sink latency;
- disk/network/collector ingestion;
- shutdown/crash loss.

Compare the alternatives material to the decision under an equivalent representative workload:
no extra selection, synchronous selection, async drop and/or async stall. Reuse adequate
measurements when their assumptions still hold. For a new comparison, randomize/repeat and
report uncertainty. A source/API explanation can state implementation limits without a
benchmark or an implied measured benefit.

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
Select controls for the changed loss, latency, collection or termination claim; an adequate
existing design or source-only answer need not execute this whole list. State accepted loss
and interference budgets before judging the outcome.

- saturate the selected log rate and slow/block the sink;
- verify drop/stall behavior and how loss is reported;
- confirm loss reporting itself reaches a monitored channel;
- test graceful and forced termination;
- measure recovery backlog after sink restoration;
- check delivery/interference for other JVM/application logs whose contract must be preserved.
