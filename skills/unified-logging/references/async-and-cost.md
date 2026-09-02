# Asynchronous logging and cost

Read when logging sits on a hot path, when message volume is high, or when asked whether
`-Xlog` is expensive.

## There is no JEP for asynchronous unified logging

The complete JEP index contains exactly two logging JEPs: 158 (Unified JVM Logging,
JDK 9) and 271 (Unified GC Logging, JDK 9). Asynchronous UL shipped as plain RFEs. Cite
these, and do not attribute a JEP number to it:

| Issue                                                      | What                                                                                                        | Fix version |
| ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | ----------- |
| [JDK-8229517](https://bugs.openjdk.org/browse/JDK-8229517) | optional asynchronous/buffered logging                                                                      | **JDK 17**  |
| [JDK-8323807](https://bugs.openjdk.org/browse/JDK-8323807) | a stalling mode for async UL — [PR 22770](https://github.com/openjdk/jdk/pull/22770), integrated 2025-02-26 | **JDK 25**  |
| [JDK-8377827](https://bugs.openjdk.org/browse/JDK-8377827) | release note for `-Xlog:async:stall`                                                                        | **JDK 25**  |

## Spelling by JDK version

| JDK       | Valid forms                                            |
| --------- | ------------------------------------------------------ |
| 17 to 24  | bare `-Xlog:async` only; behaviour is drop-only        |
| 25 and up | `-Xlog:async`, `-Xlog:async:drop`, `-Xlog:async:stall` |

`logConfiguration.cpp` documents only `-Xlog:async` and contains no occurrence of "stall"
at `jdk-17+35`, `jdk-21+35`, `jdk-22+36`, `jdk-23+37` and `jdk-24+36`; `jdk-25+36`
documents `-Xlog:async[:[mode]]` with both modes.

Whether a JDK 21 JVM _rejects_ `-Xlog:async:drop` or silently ignores the suffix is
untested. Do not write the mode suffix into a flag targeting JDK 21 — write bare
`-Xlog:async`.

## Modes

From the JDK 25 man page: in synchronous mode, the log site writes to the output at the
moment of the call. In asynchronous mode, log sites enqueue into a bounded intermediate
buffer and a dedicated thread flushes it. On buffer exhaustion, either the message is
discarded (`async:drop`, the default) or the logging thread is stalled until the flusher
catches up (`async:stall`). Write operations are guaranteed non-blocking only in the
`drop` case.

The trade is bounded-data-lost versus bounded-latency-lost. Neither is free:

- `drop` keeps the application thread off the I/O path but produces a log that is missing
  content while looking complete.
- `stall` reintroduces application blocking by design.

## `AsyncLogBufferSize`

A `{product}` flag. Default **2097152 (2 MiB)**, allowed range **102400 to 52428800**
(100 KiB to 50 MiB) — confirmed by `-XX:+PrintFlagsFinal` and by the range error on a
below-minimum value, on Temurin 25.0.3.

The budget is **split in half between two alternating buffers** — `size_t size =
AsyncLogBufferSize / 2;` feeding `_buffer` and `_buffer_staging` in `logAsyncWriter.cpp`
at `jdk-25+36` — so effective in-flight capacity is half the number set. The whole budget
is malloc'ed up front: with `-XX:NativeMemoryTracking=summary` the `Logging` category
reads `reserved=2048KB, committed=2048KB` at the default, and does not appear at all
without `-Xlog:async` (executed). The flusher is the thread named `AsyncLog Thread`
(executed, `-Xlog:os+thread`).

## Dropped messages are reported in band

On overflow in `drop` mode the writer counts per output (`_stats`, one `uint32_t` per
output) and emits, into the affected output, at `warning` level with the format
`"%6u messages dropped due to async logging"`:

```
[0.053s][warning][                     ]     76 messages dropped due to async logging
```

Note the empty tags decoration (`__NO_TAG` in the source): a parser keying on the tag
field will not attribute the line to anything, but `grep "messages dropped"` finds it.
The notice is emitted at each flush that found drops, so the total is the sum over every
occurrence — 77 notices in one 2-second run at the minimum buffer (executed). **Always
check for this string before deriving any count from an async log, and before handing
that log to an analysis skill.** A log missing a third of its content while looking
complete is worse than no log.

`stall` mode has no notice to check: the same run wrote every message and zero notices,
at the cost of blocking the logging thread each time the buffer was full.

## One measurement, and how to read it

**This is a single-machine, single-JDK observation, not a benchmark.** No citable
published measurement of UL overhead exists in primary sources — the mailing-list numbers
referenced from JDK-8229517 are for prototype patches on pre-JDK-17 builds and are not
usable. Do not generalise the figures below into "`-Xlog` costs N%".

Environment: Temurin OpenJDK 25.0.3+9-LTS, Windows 11 Pro 26200, x86-64, `-Xmx512m`, local
NTFS disk. Workload: 40,000,000 × `new byte[64]` in a loop, driving roughly 46 young
collections. Selection `gc*=trace`, producing about 40,800 lines over the run — roughly
50,000 messages per second, chosen deliberately as a pathological rate. Three runs per
configuration; wall-clock milliseconds self-reported by the program.

| Configuration                          | Run 1 | Run 2 | Run 3 | vs baseline |
| -------------------------------------- | ----- | ----- | ----- | ----------- |
| no logging                             | 788   | 795   | 787   | —           |
| `-Xlog:gc*=trace:file=…` (synchronous) | 1005  | 992   | 1013  | +26%        |
| `-Xlog:async -Xlog:gc*=trace:file=…`   | 823   | 824   | 831   | +5%         |

Both logged configurations produced essentially identical content (40,869 vs 40,856 lines)
with zero drops at the default 2 MB buffer.

What this establishes: at ~50k messages/second on this machine, synchronous file logging
cost about a quarter of wall time and async recovered most of it. What it does not
establish: anything about a production selection. `-Xlog:gc` at info produced 22 lines for
the entire run — a rate at which this method cannot measure anything.

Overflow behaviour, same environment, buffer squeezed to the legal minimum
`-XX:AsyncLogBufferSize=102400`:

| Mode                | Wall ms | Lines written     | "messages dropped" notices |
| ------------------- | ------- | ----------------- | -------------------------- |
| `-Xlog:async:drop`  | 811     | 27,772 of ~40,860 | 21                         |
| `-Xlog:async:stall` | 893     | 40,867 (complete) | 0                          |

That is 32% of messages silently lost in `drop` mode, reported only by those 21 in-band
lines.

## Cost by level, same caveats

Same machine and JDK, a second workload: 3 seconds of 64 KB allocations with an exception
every thousandth iteration, driving about 80 young pauses; iterations completed in the 3
seconds, three runs each, synchronous file output unless stated.

| Configuration                 | Run 1   | Run 2   | Run 3   | vs no logging | Written in 3 s |
| ----------------------------- | ------- | ------- | ------- | ------------- | -------------- |
| no logging                    | 789,652 | 792,376 | 780,154 | —             | —              |
| `-Xlog:gc*`                   | 760,464 | 773,221 | 802,413 | noise         | 95 KB          |
| `-Xlog:gc*=debug`             | 773,203 | 765,939 | 766,357 | −2%           | 1.3 MB         |
| `-Xlog:exceptions`            | 798,453 | 796,169 | 762,443 | noise         | 43 KB          |
| `-Xlog:all=info`              | 729,667 | 728,351 | 732,833 | −7%           | 1.0 MB         |
| `-Xlog:gc*=trace`             | 599,947 | 591,630 | 587,366 | −25%          | 10.3 MB        |
| `-Xlog:async -Xlog:gc*=trace` | 748,544 | 757,141 | 754,266 | −4%           | 10.3 MB        |

What it establishes: at production selections the cost is inside run-to-run noise on this
method, `all=info` is measurable because it turns on per-class, per-compilation and
per-thread lines, and `trace` on a hot subsystem is a quarter of throughput before it is a
disk problem. The volume column is the number that scales: 10 MB per 3 seconds is 300 GB
a day, and the default rotation keeps 120 MB of it.

## Mechanism, not measured

Stated separately because none of it was executed:

- Synchronous output serialises across threads. JEP 158's goal of no interleaving within a
  line implies a lock per output, held by whichever thread is on the hot path.
- Synchronous file output can block on the filesystem. A stalled NFS or overlay mount
  blocks the _application_ thread; in async mode only the flushing thread blocks. This is
  the argument for async on a latency-sensitive service, independent of throughput.
- `trace`/`debug` in production is a volume problem before it is a CPU problem. The rate
  above extrapolates to multiple gigabytes per day, which interacts with rotation
  destroying the interesting window and with log-shipping cost.
- `-Xlog:async` costs a thread and up to `AsyncLogBufferSize` of native memory, accounted
  under `mtLogging` and visible in NMT.

## Choosing

| Situation                                                        | Choice                                                                         |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Low-rate production selection (`gc`, `gc*` at info, `safepoint`) | synchronous is fine; async adds a thread and a failure mode                    |
| Latency-sensitive service, or file on network/overlay storage    | `-Xlog:async` (JDK 17+) — the disk stall no longer hits the application thread |
| High-rate capture where completeness matters more than latency   | JDK 25+ `-Xlog:async:stall`, or synchronous                                    |
| High-rate capture where latency matters more than completeness   | `-Xlog:async` (`drop`), and grep for `messages dropped`                        |

In every async case, remember it cannot be turned on later: it is a restart-only decision.
