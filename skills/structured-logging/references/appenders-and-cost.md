# Appenders, Delivery and Cost

## End-to-end path

```text
call site -> event creation -> formatter/encoder -> queue
  -> appender/transport -> node collector -> network
  -> ingestion/parser/index -> storage/retention/query
```

Each stage can block, drop, duplicate, reorder, truncate or expose data.

## Synchronous versus buffered

Synchronous output offers simpler ordering and failure visibility but can place I/O and
sink backpressure on application threads. Async output moves work and absorbs bursts but
uses memory, can reorder across appenders, and must choose block/drop at capacity and flush
at shutdown.

Current Logback AsyncAppender defaults include a bounded queue and discarding of lower
levels near capacity unless configured otherwise. Other libraries/versions differ. Inspect
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

Benchmark representative event mixes, including failures and disabled levels. Avoid
constructing expensive arguments before the level decision; parameterization does not avoid
work already performed by application code.

## Queue-full policy

Choose per event class:

- block with bounded timeout;
- discard lowest-priority events;
- sample/coalesce repetitive diagnostics;
- spill to bounded local durable storage;
- route audit/security to a separate durable channel;
- fail the operation only when compliance/integrity contract requires it.

Make every loss/block/fallback observable without recursively logging the failure into the
same broken path.

## Shutdown and crash

Graceful shutdown can flush within a deadline; SIGKILL, OOM or host loss can lose in-memory
events. Test orchestrator grace periods and appender lifecycle. Do not claim crash-safe
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
- [Log4j asynchronous loggers](https://logging.apache.org/log4j/2.x/manual/async.html)
- [OWASP Logging Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html)
