# Appenders, encoders and the cost of an event

## Choosing the emission stack

Four stacks produce JSON events from SLF4J calls. They differ in field names, in what
they do with MDC and SLF4J 2 key-value pairs, and in whether masking and renaming exist at
all. Pick by what the collector expects, not by which one is already on the classpath.

| Stack                                                                                  | Field names it emits                                                                                                                                                              | MDC / key-value pairs                                                                                                                                                                    | Masking, renaming, stack-trace control                                                                                                                                                                                                                                                                                                                                                                                        |
| -------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Logback `ch.qos.logback.classic.encoder.JsonEncoder` (1.3.8 / 1.4.8+)                  | Logback's own: `sequenceNumber`, `timestamp` (epoch ms), `nanoseconds`, `level`, `threadName`, `loggerName`, `context`, `mdc`, `kvpList`, `message`, `throwable`                  | `mdc` and `kvpList` as nested members, not top-level fields                                                                                                                              | Members can be switched on or off since 1.5.0 (`<withFormattedMessage>` …); no renaming, no masking, no ECS. The collector must map the names                                                                                                                                                                                                                                                                                 |
| logstash-logback-encoder `LogstashEncoder` / `LoggingEventCompositeJsonEncoder`        | `@timestamp`, `@version`, `message`, `logger_name`, `thread_name`, `level`, `level_value`, `stack_trace`, `tags`; every name overridable via `<fieldNames>`, `[ignore]` drops one | MDC entries and SLF4J 2 key-value pairs as **top-level fields** by default (`KeyValuePairsJsonProvider`, `<includeKeyValuePairs>`); `StructuredArguments.kv/v/entries`, `Markers.append` | `MaskingJsonGeneratorDecorator` (path and value masks), `ShortenedThrowableConverter` (`maxDepthPerThrowable`, `maxLength`, `rootCauseFirst`, `exclude`, `inlineHash`, `omitCommonFrames` on by default). 9.x needs Java 17, Logback 1.5.0+, Jackson 3                                                                                                                                                                        |
| Log4j2 `JsonTemplateLayout`                                                            | Whatever the template says; bundled `EcsLayout.json` (the default `eventTemplateUri`), `LogstashJsonEventLayoutV1.json`, `GelfLayout.json`, `GcpLayout.json`, `JsonLayout.json`   | `mdc`, `map`, `marker`, `message`, `exception`, `exceptionRootCause`, `logger`, `level`, `thread`, `timestamp`, `source` resolvers                                                       | `maxStringLength` (default 16384, suffix `…`) truncates every string; `stackTraceEnabled`; `eventTemplateAdditionalField`; garbage-free, no Jackson. `%enc{}{JSON}` in a PatternLayout is the wrong tool — the manual says so                                                                                                                                                                                                 |
| Spring Boot 3.4+ `logging.structured.format.console=ecs\|gelf\|logstash` (and `.file`) | ECS: `@timestamp`, `log.level`, `log.logger`, `process.pid`, `process.thread.name`, `service.name`, `message`, `ecs.version`; logstash and GELF shapes as above                   | "adds every key value pair contained in the MDC to the JSON object", plus fluent `addKeyValue` pairs — for all three formats                                                             | `logging.structured.json.include/exclude/rename/add`, `logging.structured.json.customizer` (`StructuredLoggingJsonMembersCustomizer`), `logging.structured.json.stacktrace.root=first`, `.max-length`, `.max-throwable-depth`, `.include-common-frames`, `.include-hashes`, `.printer`; `logging.structured.ecs.service.name/version/environment/node-name`; a custom `StructuredLogFormatter<ILoggingEvent>` or `<LogEvent>` |

Boot's support needs no logstash-logback-encoder and works on Logback (`StructuredLogEncoder`)
and Log4j2 (`StructuredLogLayout`). Its `include-hashes` and logstash's `inlineHash` add a
stable hash of the stack trace — the grouping key for "how many distinct failures", which
the message alone cannot give.

Whatever the stack, two things are true of every one of them: key-value pairs become fields
only because the encoder renders them (a pattern encoder needs `%kvp` and then they are text
inside the line), and every one of them escapes newlines and quotes inside values, which is
what makes JSON the fix for log injection — see `references/java-logging-mechanics.md`.

## Synchronous or asynchronous

A synchronous appender does the encoding and the write on the request thread. An
asynchronous one hands the event to a queue and a worker does the rest. The choice is not
"async is faster"; it is which failure you accept when the sink cannot keep up.

**Synchronous.** Cost per event is serialisation plus a write, and with the default
`immediateFlush=true` the write is a flush. Setting it to `false` "is likely to quadruple
(your mileage may vary) logging throughput", and any buffered event is lost if the appender
is not closed properly. The failure mode is a blocked sink: a full stdout pipe because the
container runtime's log reader is slow, a full disk, a network appender waiting on a peer.
The thread that is logging blocks under the appender's write lock, and every other thread
that reaches a log call queues behind it — a latency cliff that tracks log volume, visible
in a thread dump as N threads inside the appender.

**Logback `AsyncAppender`**, with its defaults, because they decide what you lose:

| Property              | Default          | What it means in production                                                                                                           |
| --------------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `queueSize`           | 256              | 256 events of headroom; one stack trace burst fills it                                                                                |
| `discardingThreshold` | 20% of queueSize | Once 80% full it **drops TRACE, DEBUG and INFO** and keeps WARN and ERROR. `0` keeps everything. This is why INFO vanishes under load |
| `neverBlock`          | `false`          | A full queue blocks the caller. `true` drops instead — and drops silently                                                             |
| `includeCallerData`   | `false`          | `%line`, `%method`, `%class` print `?` unless enabled, because caller data must be captured on the logging thread                     |
| `maxFlushTime`        | 1000 ms          | On `stop()` the worker gets this long to drain; what remains is discarded. `0` waits for the whole queue                              |

The context must actually be stopped for the drain to happen: `<shutdownHook/>`
(`DefaultShutdownHook`) or, in a servlet container, `LogbackServletContextListener`
(automatic since 1.1.10). A JVM that "terminates outside of the typical control flow" strands
the queue. On SIGKILL the queue, and with `immediateFlush=false` the output buffer too, are
gone — the last seconds before a crash are precisely the events an incident wants.

**Log4j2 async loggers** use the LMAX Disruptor rather than a `BlockingQueue`:
`log4j2.contextSelector=org.apache.logging.log4j.core.async.AsyncLoggerContextSelector` (or
`BasicAsyncLoggerContextSelector`) makes every logger async and needs `com.lmax:disruptor` at
runtime; `<AsyncLogger>` / `<AsyncRoot>` mix per logger. `log4j2.asyncLoggerRingBufferSize` is
256 × 1024 slots (4 × 1024 in garbage-free mode). When the buffer is full
`log4j2.asyncQueueFullPolicy=Default` blocks the caller, `Discard` drops events at or below
`log4j2.discardThreshold` (default `INFO`). `includeLocation` is off for async loggers.
`log4j2.asyncLoggerWaitStrategy` defaults to `Timeout`; `Yield` costs a core. The manual's
own trade-off: under sustained demand above the appender's rate the application degrades to
the appender's throughput, so async in front of a slow appender buys a burst buffer, not
capacity.

```text
Synchronous when:
- the sink is a local file or stdout with a reader that keeps up, and volume is budgeted
- the events are the ones a crash must not lose (audit, the ERROR before the exit)
Asynchronous when:
- the sink has variable latency (network appender, slow log driver) and a request thread
  must never wait on it
- bursts are the shape of the traffic and the steady state fits the appender
When asynchronous, decide explicitly, per appender:
- block or drop when full (`neverBlock`, `asyncQueueFullPolicy`), and if drop, which
  levels (`discardingThreshold`, `discardThreshold`) — the defaults drop INFO
- who stops the context on shutdown, and how long the drain may take
- whether caller data is worth paying for on the request thread
```

## The per-event cost model

- **A parameterised message costs nothing when the level is off** — `log.debug("x {}", y)`
  formats only if DEBUG is enabled. What still costs is evaluating the arguments:
  `log.debug("cart {}", cart.summarise())` runs `summarise()` regardless. Guard with
  `isDebugEnabled()` only around an argument that is expensive to compute; guarding a
  cheap one is noise. The fluent builder has `Supplier` overloads (`addArgument(Supplier)`,
  `addKeyValue(String, Supplier)`) for the same purpose, and a disabled level returns a
  no-op builder.
- **Caller data is a stack walk per event.** `%line`, `%method`, `%class`, `%file`,
  `%caller` in Logback, `%L`/`%M`/`%C`/`%F`/`%l` and the `source` resolver in Log4j2: both
  manuals call it expensive and Log4j2 adds "not garbage-free". `logger` names the class
  already; the line number is worth it only in DEBUG output nobody ships.
- **The stack trace is the dominant byte.** A chained exception through a servlet
  container, a framework and a client library runs to a hundred-plus frames; encoded as JSON
  it is tens of kilobytes on an event whose other fields total a few hundred bytes. Bound
  it at the encoder: `ShortenedThrowableConverter`'s `maxDepthPerThrowable` and `maxLength`,
  Boot's `logging.structured.json.stacktrace.max-length` and `.max-throwable-depth`,
  Log4j2's `%ex{filters(...)}` and `JsonTemplateLayout`'s `maxStringLength`. Put the root
  cause first (`rootCauseFirst`, `stacktrace.root=first`) so a truncated trace keeps the
  frame that matters. Every layer that logs-and-rethrows multiplies this cost by the layer
  count, which is the byte-level argument for logging a failure once.
- **MDC is copied per event.** An async appender copies the MDC map into each queued event;
  a wide MDC on a hot path is allocation per event, and every field in it is serialised
  per event. Keep MDC to the correlation set and put per-event detail in key-value pairs.
- **JSON is larger than the pattern line** for the same event — every field carries its
  name. The volume formula in `references/fields-and-levels.md` must use the JSON size.
- **`java.util.logging` through the bridge.** With `jul-to-slf4j`, a JUL statement builds a
  `LogRecord` before SLF4J can reject it. Logback's
  `<contextListener class="ch.qos.logback.classic.jul.LevelChangePropagator"/>` pushes
  Logback levels onto JUL so disabled statements stop at JUL — the manual says this is what
  makes the bridge "reasonable for real-world applications". `System.Logger` defaults to a
  JUL backend; route it the same way or it lands in a second, unstructured stream.

## Backpressure from the sink

The appender is the head of a pipeline; the rest of it can push back.

- **stdout in a container** is a pipe to the runtime's log driver. A pipe has a small
  kernel buffer; when the reader stalls, a synchronous write blocks the request thread, and
  an async appender fills and then blocks or drops per the policy above. A burst of stack
  traces is the usual trigger, and the symptom lands on request latency, not on the log.
- **A file tailed by an agent** absorbs bursts on disk, but rotation is the ceiling: a burst
  that rotates the file faster than the agent reads it loses the middle of the burst with
  no marker, and a full disk turns every write into an error the appender reports to its
  own status listener and nowhere else.
- **A TCP appender** owns its own queue. logstash-logback-encoder's `LogstashTcpSocketAppender`
  buffers `ringBufferSize` (8192) events and, when full, drops by default unless
  `appendTimeout` makes it wait; `writeTimeout` detects a peer that stops reading without
  closing (detection can take up to twice the timeout), `reconnectionDelay` is 30 s. A
  collector restart therefore costs every event over 8192 that arrives during the delay.
- **OTLP export** via `io.opentelemetry.instrumentation.logback.appender.v1_0.OpenTelemetryAppender`
  (`OpenTelemetryAppender.install(openTelemetrySdk)`) hands events to the OpenTelemetry log
  SDK, whose batch processor has its own queue and drop policy — `opentelemetry-performance`
  owns that cost. Two of its defaults matter here: MDC attributes are captured **only** when
  `mdcAttributesIncluded` (glob patterns) is set, and SLF4J key-value pairs only when
  `keyValuePairAttributesIncluded` is; otherwise the exported record carries the message
  and trace context and none of the fields the call site added.

Whichever sink, a drop must be observable: a counter, a status-listener warning that is
itself shipped, or a gap detector on `sequenceNumber`. A pipeline that drops silently is
indistinguishable from an application that stopped logging, which is how an outage is first
reported as "the service is fine, it just went quiet".

## Symptom → cause → how to distinguish → fix

| Symptom                                                                     | Likely cause                                                                                                                                              | How to distinguish                                                                                                | Fix                                                                                                                           |
| --------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| INFO events missing in bursts; WARN and ERROR from the same seconds present | Logback `AsyncAppender` `discardingThreshold` (default 20%) or Log4j2 `Discard` policy at `discardThreshold=INFO`                                         | Gaps coincide with load or a stack-trace burst; the missing levels are exactly TRACE/DEBUG/INFO                   | `discardingThreshold=0` plus a larger `queueSize`, or keep the drop and document it; count the drops                          |
| Key-value pairs appear inside `message` as text, not as fields              | Pattern encoder with `%kvp`, or a JSON encoder that nests them (`kvpList`) while the collector expects top-level                                          | Read one raw line from the sink                                                                                   | Choose an encoder from the table above; assert the shape in the boundary test                                                 |
| `trace_id` absent on every event                                            | No MDC bridge active (agent `logback-mdc` / `log4j-context-data` disabled, or no tracing), or the pattern references a key nobody sets                    | Dump `MDC.getCopyOfContextMap()` inside a request: empty means no bridge; a `traceId` key means a naming mismatch | Install the bridge; align names — `references/java-logging-mechanics.md`                                                      |
| `trace_id` present on most events, absent on some                           | Emitted outside a span: executor hand-off, `@Async`, scheduler, startup, or a filter that runs before the tracing filter                                  | The `thread` field: a pool or scheduler thread name rather than the request thread; timing at startup             | Propagate the trace context across the hand-off (capture and restore, as for MDC); fix filter order                           |
| Every event appears twice                                                   | Additivity: an appender on a named logger and on root; two console appenders (a default configuration plus a custom one); a JUL handler beside the bridge | `<configuration debug="true">` lists the appenders attached per logger                                            | `additivity="false"` on the named logger, or remove the duplicate appender                                                    |
| `line` / `method` print `?`                                                 | Async appender or logger without `includeCallerData` / `includeLocation`                                                                                  | Only async paths show `?`                                                                                         | Enable it and pay the stack walk, or drop the fields                                                                          |
| The last seconds before a restart are missing                               | Async queue never drained: no shutdown hook, `maxFlushTime` too short, or SIGKILL                                                                         | Compare the last event's timestamp with the exit; a clean exit with a gap is the hook, a kill is the kill         | `<shutdownHook/>`, `maxFlushTime=0`; for SIGKILL, shrink the window (sync for ERROR, smaller queue) — it cannot be eliminated |
| Latency spikes correlated with log bursts; threads parked in the appender   | Synchronous appender blocked on the sink (stdout pipe, disk, network), or an async queue full with `neverBlock=false`                                     | Thread dump: many threads inside the appender's write; the pipe reader or disk is the resource                    | Async with an explicit drop policy, or fix the reader; never a bigger queue alone                                             |
| Stack traces end in `…`; events rejected by the ingester as too large       | `maxStringLength` (16384) in `JsonTemplateLayout`, `maxLength` in logstash, or the collector's own event limit                                            | The suffix identifies the truncator                                                                               | Bound the trace deliberately, root cause first; keep the hash                                                                 |
| An event carries another request's `request_id`                             | MDC not cleared on a pooled thread, or an inherited snapshot from the thread that created this one                                                        | `thread` is a pool thread; the stale id belongs to the previous task on that thread                               | `MDC.clear()` in `finally`; do not rely on inheritance                                                                        |
| One log call shows as several events, or a "line" nobody wrote              | Pattern layout writing user-controlled text with embedded newlines                                                                                        | The extra lines have no timestamp or level                                                                        | JSON encoder, or `%replace(%msg){'[\r\n]', ''}` / Log4j2 `%enc{%m}{CRLF}`                                                     |
| The backend rejects events, or a field is unsearchable, after a deploy      | The same field name emitted with a different type (`order_id` as number here, string there), or a renamed field                                           | The mapping error names the field; the query that went empty names the rename                                     | One type per name across services; rename by emitting both for a retention period                                             |
