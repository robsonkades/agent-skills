# Flags, modes and version corrections

## The JEP timeline that decides what you may write

| Milestone                                     | JEP | Status                         | JDK |
| --------------------------------------------- | --- | ------------------------------ | --- |
| ZGC experimental                              | 333 | Experimental                   | 11  |
| ZGC product                                   | 377 | Product                        | 15  |
| Generational ZGC, behind `-XX:+ZGenerational` | 439 | Opt-in, default was off        | 21  |
| Generational ZGC becomes the default          | 474 | Default flipped                | 23  |
| Non-generational ZGC **removed**              | 490 | Code deleted                   | 24  |
| Shenandoah experimental                       | 189 | Experimental                   | 12  |
| Shenandoah product                            | 379 | Product                        | 15  |
| Generational Shenandoah                       | 404 | Experimental (needs unlock)    | 24  |
| Generational Shenandoah                       | 521 | **Product, still not default** | 25  |

Two corrections follow, and they are the two most commonly repeated errors about these
collectors:

- There is no ZGC "generational mode" to enable on JDK 24+. There is only ZGC.
- There _is_ a Shenandoah generational mode to enable on JDK 25, and it is off unless asked
  for.

## ZGC

```bash
# Correct on the JDK 25 baseline:
java -XX:+UseZGC -jar app.jar

# Obsolete since JDK 24 — accepted, possibly warned about, no effect:
java -XX:+UseZGC -XX:+ZGenerational -jar app.jar
```

Tuning surface, in the order you should reach for it:

```bash
-Xmx / -Xms                        # size the heap first; this is the real lever
-XX:ConcGCThreads=N                # concurrent GC threads (default: auto)
-XX:ZCollectionInterval=N          # minimum seconds between cycles
-XX:ZAllocationSpikeTolerance=N    # allocation spike tolerance (default 2.0)
-XX:ZFragmentationLimit=N          # max fragmentation % before compacting; large heaps
```

`ZCollectionInterval` and friends are sensitive to change between releases — confirm the
default in your build with `-XX:+PrintFlagsFinal` rather than quoting a remembered value.
ZGC self-calibrates from the observed allocation rate; in practice nothing beyond heap size
and `ConcGCThreads` is needed or advisable.

## Shenandoah

```bash
-XX:+UseShenandoahGC                    # single-generation — this is the default mode
-XX:ShenandoahGCMode=generational       # product in JDK 25 (JEP 521), opt-in

-XX:ShenandoahGCHeuristics=adaptive     # default: adapts to allocation rate
-XX:ShenandoahGCHeuristics=static       # fixed threshold
-XX:ShenandoahGCHeuristics=compact      # aggressive; more GC, less throughput
-XX:ShenandoahGCHeuristics=aggressive   # near-continuous concurrent GC

-XX:ShenandoahMinFreeThreshold=10       # min free % before triggering GC
-XX:ShenandoahInitFreeThreshold=70      # initial threshold %
-XX:ShenandoahSATBBufferSize=1024       # SATB buffer (experimental; needs -XX:+UnlockExperimentalVMOptions)
```

On JDK 24 the generational mode additionally required
`-XX:+UnlockExperimentalVMOptions`. On JDK 25 it does not.

`-XX:ShenandoahMaxSATBBufferSize` does **not** exist, and has not on any supported release. The
JVM refuses to start on it and names the real flag itself — executed on Temurin 11, 17, 18, 19,
20, 21, 24 and 25, identical on every one:

```
Unrecognized VM option 'ShenandoahMaxSATBBufferSize=1024'
Did you mean 'ShenandoahSATBBufferSize=<value>'?
Error: Could not create the Java Virtual Machine.
```

The flag that exists is `ShenandoahSATBBufferSize` (experimental, default `1024`), accepted on
every one of those releases. `ShenandoahMaxSATBBufferFlushes` (experimental, default `5`) is a
different knob and not a longer spelling of the same one.

## Verifying the mode that is actually running

Never infer the mode from the command line you believe was used.

```bash
jcmd <pid> VM.flags -all | grep -i -E "zgc|shenandoah"
jcmd <pid> GC.heap_info
```

A test intended to exercise generational Shenandoah that cannot show
`ShenandoahGCMode=generational` in this output tested the wrong collector, and its numbers
say nothing about the mode it claimed to measure.

## Flags that are dead after the migration

G1's tuning surface — `-XX:MaxGCPauseMillis`, `-XX:G1HeapRegionSize`, and the rest of that
family — is largely ignored by ZGC and Shenandoah, which each carry their own flag set.
Carrying the G1 configuration across a collector migration retains dead flags and creates
the impression that the new collector was tuned.

## Collector selection, once the SLO is numeric

| Situation                                                | Choice                                                                |
| -------------------------------------------------------- | --------------------------------------------------------------------- |
| p99 ≤ 10 ms, comfortable CPU (8+ cores)                  | ZGC                                                                   |
| p99 ≤ 50 ms, throughput matters as much as latency       | Shenandoah; evaluate generational if young allocation is high         |
| p99 ≤ 200 ms, maximum throughput                         | G1                                                                    |
| Batch, latency is not a criterion                        | Parallel, or G1 with a high pause target                              |
| Very constrained CPU (1-2 cores)                         | G1 — concurrent phases compete directly with the application          |
| High young-allocation rate and Shenandoah already chosen | `-XX:ShenandoahGCMode=generational` before rejecting it on throughput |

This table is only usable once the latency SLO is stated as a number. "Faster" is not an
input to it.
