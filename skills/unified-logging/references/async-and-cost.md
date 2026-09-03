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

Drop bounds log-site blocking but loses evidence when the bounded buffer fills. Stall
preserves messages by applying backpressure to application/JVM threads and can worsen the
incident. Buffer enlargement delays but does not solve a sustained sink deficit and consumes
native/process memory.

Choose from evidence value and failure coupling. For critical forensic evidence, consider
a lower-volume selection or separate durable mechanism rather than assuming stall is safe.

## Validation

- saturate the selected log rate and slow/block the sink;
- verify drop/stall behavior and how loss is reported;
- confirm loss reporting itself reaches a monitored channel;
- test graceful and forced termination;
- measure recovery backlog after sink restoration;
- prove other JVM/application logs are not starved.
