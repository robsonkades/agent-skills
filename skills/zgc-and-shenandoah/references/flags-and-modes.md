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

Apply these release distinctions:

- There is no ZGC "generational mode" to enable on JDK 24+. There is only ZGC.
- There _is_ a Shenandoah generational mode to enable on JDK 25, and it is off unless asked
  for.
- Verified 2026-09-05: [JEP 535](https://openjdk.org/jeps/535), issue JDK-8379682, is
  **Targeted for release 28**. This is not the JDK 25 default and does not establish that a
  deployed binary contains it. Recheck status and startup logs before applying future defaults.
- [JEP 523](https://openjdk.org/jeps/523) is **Closed/Delivered for release 27**. It concerns
  default collector selection (G1), not Shenandoah's selected mode. Delivered status is not
  proof of GA availability, vendor inclusion or the collector running in an installed build.

## ZGC

```bash
# Correct on the JDK 25 baseline:
java -XX:+UseZGC -jar app.jar

# Obsolete since JDK 24 — ignored with warning on tested Temurin 25.0.3+9:
java -XX:+UseZGC -XX:+ZGenerational -jar app.jar
```

Diagnostic/tuning surface to verify on the target build, not a sequence to apply:

```bash
-Xmx / -Xms                        # size the heap first; this is the real lever
-XX:ConcGCThreads=N                # concurrent GC threads (default: auto)
-XX:ZCollectionInterval=N          # JDK 25 fixed interval trigger; alias of ZCollectionIntervalMajor
-XX:ZAllocationSpikeTolerance=N    # allocation spike tolerance (default 2.0)
-XX:ZFragmentationLimit=N          # max fragmentation % before compacting; large heaps
```

`ZCollectionInterval` and friends are sensitive to change between releases — confirm the
default in your build with `-XX:+PrintFlagsFinal` rather than quoting a remembered value.
Start with ergonomics and change a knob only for a measured failure mode. `SoftMaxHeapSize`,
hard `-Xmx`, available CPU and `ConcGCThreads` can trade memory headroom, mutator CPU and
stall risk; interval/spike/fragmentation options are advanced, release-sensitive controls.
The interval is not a minimum spacing guarantee: other triggers may start cycles sooner.
The JDK 25 source also has minor/major intervals and a separate `ZCollectionIntervalOnly`
policy; do not disable adaptive triggers merely to force a benchmark schedule.

## Shenandoah

```bash
-XX:+UseShenandoahGC                    # single-generation — this is the default mode
-XX:ShenandoahGCMode=generational       # product in JDK 25 (JEP 521), opt-in

-XX:ShenandoahGCHeuristics=adaptive     # default: adapts to allocation rate
-XX:ShenandoahGCHeuristics=static       # fixed threshold
-XX:ShenandoahGCHeuristics=compact      # aggressive; more GC, less throughput
-XX:ShenandoahGCHeuristics=aggressive   # near-continuous concurrent GC

-XX:+UnlockExperimentalVMOptions        # required before the following implementation knobs
-XX:ShenandoahMinFreeThreshold=10       # min free % before triggering GC
-XX:ShenandoahInitFreeThreshold=70      # initial threshold %
-XX:ShenandoahSATBBufferSize=1024       # SATB buffer
```

On the JDK 25 baseline, generational mode supports the adaptive heuristic; do not combine its
mode with the single-generation compact/aggressive/static examples without verifying startup.
The heuristic list is diagnostic context, not a recommendation to bypass ergonomics.

On JDK 24 the generational mode additionally required
`-XX:+UnlockExperimentalVMOptions`. On JDK 25 it does not.

`-XX:ShenandoahMaxSATBBufferSize` is not a valid flag on the tested Temurin 25.0.3+9 Windows
build. The JVM refuses to start and suggests the existing flag:

```
Unrecognized VM option 'ShenandoahMaxSATBBufferSize=1024'
Did you mean 'ShenandoahSATBBufferSize=<value>'?
Error: Could not create the Java Virtual Machine.
```

The JDK 25 flags `ShenandoahSATBBufferSize` and `ShenandoahMaxSATBBufferFlushes` are distinct
experimental controls. Verify their defaults and unlock requirements on the target binary,
rather than extending one tested build's behavior to every supported release.

On the same Temurin build, both ZGC and Shenandoah start successfully; Shenandoah defaults
to `satb`, and explicit `generational` needs no unlock. Combining generational mode with
`ShenandoahGCHeuristics=compact` still exits successfully but warns that compact is ignored
because only adaptive is supported. Exit status alone therefore does not validate effective policy.

## Verifying the mode that is actually running

Never infer the mode from the command line you believe was used.

```bash
jcmd <pid> VM.flags -all | grep -i -E "zgc|shenandoah"
jcmd <pid> GC.heap_info
java <same flags> -Xlog:gc+init=info -version
```

A test intended to exercise generational Shenandoah that cannot show
`ShenandoahGCMode=generational` in this output tested the wrong collector, and its numbers
say nothing about the mode it claimed to measure.

## Flags that are dead after the migration

G1-specific options such as `G1HeapRegionSize` can remain syntactically accepted while not
governing ZGC/Shenandoah; global options such as heap sizing may still apply. Inventory each
flag with its type/origin and startup logs, then remove inert options with a launch regression
test. “Accepted” is not evidence that the selected collector consumed it.

## Collector/mode selection criteria

No p99 or core-count threshold selects a collector portably. Build a representative matrix:

| Constraint/evidence                                                | Comparison to run                                                                                           |
| ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------- |
| Tight pause SLO with heap/live set that makes STW evacuation risky | ZGC and generational Shenandoah against a tuned G1 baseline                                                 |
| CPU quota/throttling or memory bandwidth already saturated         | Measure concurrent-GC interference and achieved throughput; include G1/Parallel where pauses are acceptable |
| High young allocation with stable old live set                     | Compare generational modes; confirm generation-specific logs and old-cycle behavior                         |
| Large objects, fragmentation or allocation spikes                  | Exercise that distribution and inspect stalls, relocation/evacuation failure and fallback                   |
| Small heap/short-lived batch process                               | Include startup/footprint/throughput; concurrent collectors may not repay their machinery                   |

Declare numeric SLO, achieved load, build, mode, heap/live set, allocation rate, quota and
failure behavior. “Faster” and a collector name alone are not reproducible inputs.

Source for interval semantics: [OpenJDK 25 ZGC flags](https://github.com/openjdk/jdk/blob/jdk-25-ga/src/hotspot/share/gc/z/z_globals.hpp).
