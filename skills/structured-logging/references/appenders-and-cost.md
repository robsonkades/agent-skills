# Appenders, Delivery and Cost

## End-to-end path

```text
call site -> event creation -> optional async handoff + formatting/encoding
  -> appender/transport -> node collector -> network
  -> ingestion/parser/index -> storage/retention/query
```

Each stage can block, drop, duplicate, reorder, truncate or expose data.
Locate the queue in the actual implementation: it may retain events for later encoding,
rather than encoded bytes. Capture bounded immutable field values at the occurrence boundary;
do not assume an asynchronous logger deep-copies mutable arguments or nested objects.
In Logback 1.4.11, deferred preparation materializes message/thread/MDC data, but does not
deep-copy key-value objects. Test delayed encoding after the caller mutates an input.

## Synchronous versus buffered

Synchronous output offers simpler ordering and failure visibility but can place I/O and
sink backpressure on application threads. Async output moves work and absorbs bursts but
uses memory, can reorder across appenders, and must choose block/drop at capacity and flush
at shutdown.

Logback AsyncAppender has a bounded queue and can discard TRACE/DEBUG/INFO near capacity
under its default policy. Other libraries/versions differ. Inspect
the effective configuration and expose queue/drop counters.

## Cost model

Estimate:

\[
bytes/s=events/s\times mean(bytes/event)
\]

Then include peak distribution, compression, replication, index amplification, retention,
egress and query scans. Application overhead also depends on enabled checks, argument
construction, caller location, stack traces, JSON serialization, locks, allocations and
transport.

For a logging-cost claim, measure representative event mixes, including relevant failures
and disabled levels; reuse adequate measurements for unchanged paths. Avoid
constructing expensive arguments before the level decision; parameterization does not avoid
work already performed by application code.

## Queue-full policy

Choose per event class:

- block with bounded timeout;
- discard lowest-priority events;
- sample/coalesce repetitive diagnostics;
- spill to bounded local durable storage;
- route audit/security to a separate durable channel;
- reject/fail at the defined boundary when the business, security or compliance contract
  requires an observable durable record as a condition of accepting the operation.

These are design alternatives, not options every appender implements. Verify the selected
implementation supports the required timeout/spill behavior; a bounded queue does not itself
bound how long producers block.

Keep best-effort diagnostic logging separate from a required business-event protocol. If a
record must be atomic with business state, use the actual transactional mechanism; synchronous
appender completion alone does not establish that invariant. A failure after an ambiguous
commit/acknowledgement is not proof that the operation did not happen; reconcile outcome and
replay semantics before retrying.

Make every loss/block/fallback observable without recursively logging the failure into the
same broken path.

## Shutdown and crash

Graceful shutdown can flush within a deadline; SIGKILL, OOM or host loss can lose in-memory
events. For shutdown/delivery changes, verify relevant orchestrator grace periods and appender
lifecycle. Do not claim crash-safe
delivery without a durable acknowledgement design.

## Container output

Stdout/stderr are appropriate when the platform owns framing, rotation and collection, but
pipe/collector backpressure can block and multiline stack traces can break line-based
parsers. Structured single-record framing and bounded event size reduce risk. File output
needs volume, rotation, ownership and crash/restart semantics.

## Troubleshooting

| Symptom                   | Evidence                                                      |
| ------------------------- | ------------------------------------------------------------- |
| missing low-level events  | queue occupancy/discard policy/filter/level                   |
| missing all recent events | appender lifecycle, sink/collector, disk/pipe                 |
| duplicates                | multiple appenders/additivity/retries                         |
| out-of-order              | multiple async queues/shards and clock error                  |
| latency spikes            | blocked app threads, sink latency, stack/caller serialization |
| memory growth             | queue backlog, retained Throwable/arguments, sink outage      |
| ingestion rejects         | schema/type/size/rate and authentication                      |

## References

- [Logback AsyncAppender](https://logback.qos.ch/manual/appenders-async-sift.html)
- [Logback 1.4.11 event preparation](https://github.com/qos-ch/logback/blob/v_1.4.11/logback-classic/src/main/java/ch/qos/logback/classic/spi/LoggingEvent.java)
- [Transactional outbox](https://microservices.io/patterns/data/transactional-outbox.html) for atomic business-state/event intent; delivery can still repeat.
- [Log4j asynchronous loggers](https://logging.apache.org/log4j/2.x/manual/async.html)
- [OWASP Logging Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html)
