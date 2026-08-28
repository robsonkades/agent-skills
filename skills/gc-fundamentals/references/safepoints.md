# Safepoints and Time-To-SafePoint

## What the log does not tell you

A stop-the-world pause has two parts:

```
[ Time-To-SafePoint ][ safepoint operation ]
  ^ NOT in the GC log   ^ this is what "Pause Young 16ms" reports
```

TTSP is the time between the VM requesting a safepoint and the **last** thread reaching
one. Every thread must arrive; one slow thread stalls all the others, and none of that
time appears in the GC log.

So: if the GC log says 12 ms and the client felt 200 ms, the collector is not the problem.

```bash
-Xlog:safepoint:file=safepoint.log:time,uptime
```

Enable it alongside `-Xlog:gc*`. It costs almost nothing and separates two investigations
that otherwise look identical.

## Current causes of high TTSP

The classic answer — a counted loop with no safepoint poll — is largely obsolete: loop
strip mining made `UseCountedLoopSafepoints` the default in JDK 10. On a current baseline
the real causes are:

- **CPU starvation in a container.** A throttled thread cannot reach a safepoint. Check
  `nr_throttled / nr_periods` on the cgroup.
- **Native critical sections.** A thread inside JNI or a blocking FFM downcall does not
  poll.
- **Page faults.** A thread waiting on major faults is not running, and cannot arrive.
- **`long` trip counts.** Loops counted by `long` are not strip-mined the same way.

## Safepoint operations other than GC

A safepoint is not only for garbage collection. Thread dumps, biased-locking revocation
(historical), deoptimisation, class redefinition and several `jcmd` operations all request
one.

This is why `jstack` in a loop is a latency generator: each invocation stops **every**
thread while the dump is produced. For profiling, use a sampling profiler that does not
require a safepoint; for a point-in-time dump on an application with virtual threads, use
`jcmd <pid> Thread.dump_to_file -format=json`.

## Reconciling the numbers

| Log pause | Client-observed pause  | Reading                                      |
| --------- | ---------------------- | -------------------------------------------- |
| 16 ms     | ~16 ms                 | the collector is the cost                    |
| 16 ms     | 200 ms                 | TTSP or something outside the JVM            |
| 16 ms     | 16 ms but too frequent | allocation rate, not collector configuration |

Do this reconciliation before touching a collector flag. It is a two-minute check that
routinely redirects the entire investigation.
