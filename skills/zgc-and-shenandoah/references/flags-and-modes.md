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
- Rechecked 2026-09-11: [JEP 535](https://openjdk.org/jeps/535), issue JDK-8379682, is
  **Targeted for release 28**. This is not the JDK 25 default and does not establish that a
  deployed binary contains it. Recheck status and startup logs before applying future defaults.
- On the same source check, [JEP 523](https://openjdk.org/jeps/523) is
  **Closed/Delivered for release 27**. It concerns
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
-Xmx / -Xms                        # heap policy when headroom/commitment is the constraint
-XX:ConcGCThreads=N                # concurrent GC threads (default: auto)
-XX:ZCollectionInterval=N          # JDK 25 fixed interval trigger; alias of ZCollectionIntervalMajor
-XX:ZAllocationSpikeTolerance=N    # allocation spike tolerance (default 2.0)
-XX:ZFragmentationLimit=N          # allowed fragmentation %; verify exact selection policy
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
-XX:ShenandoahGCHeuristics=compact      # more frequent collections with deeper targets

-XX:+UnlockDiagnosticVMOptions         # required before aggressive on JDK 25
-XX:ShenandoahGCHeuristics=aggressive   # diagnostic stress policy, not routine production tuning

-XX:+UnlockExperimentalVMOptions        # required before the following implementation knobs
-XX:ShenandoahMinFreeThreshold=10       # min free % before triggering GC
-XX:ShenandoahInitFreeThreshold=70      # initial threshold %
-XX:ShenandoahSATBBufferSize=1024       # SATB buffer
```

On the JDK 25 baseline, generational mode supports the adaptive heuristic; do not combine its
mode with the single-generation compact/aggressive/static examples without verifying startup.
The heuristic list is diagnostic context, not one combined command or a recommendation to bypass
ergonomics. Unlock only the option class required for an authorized diagnostic experiment;
the diagnostic aggressive policy and experimental thresholds have distinct prerequisites.

On JDK 24 the generational mode additionally required
`-XX:+UnlockExperimentalVMOptions`. On JDK 25 it does not.

The following are retained historical observations, not results of a newly run workload test.
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

```text
jcmd <pid> VM.flags -all
jcmd <pid> GC.heap_info
java <same flags> -Xlog:gc+init=info -version
```

These are templates for an identified authorized target or owned launch. Preserve each producer's
status, stdout and stderr before optional filtering; retain filter status as well. A failed attach,
rejected launch or empty filtered result does not establish a default mode or prove the wrong
collector ran. Confirm effective policy from sufficient actual startup/flag evidence, including
warnings: if the intended generational mode cannot be established, that comparison is unverified.
A local launch proves that binary/argument combination, not the configuration of another process.

## Flags that are dead after the migration

G1-specific options such as `G1HeapRegionSize` can remain syntactically accepted while not
governing ZGC/Shenandoah; global options such as heap sizing may still apply. Inventory each
flag with its type/origin and relevant matching source/startup evidence, then validate removal
proportionately. Reuse an adequate launch control for a proven inert flag; workload checks are
needed for affected behavior or performance claims. “Accepted” is not evidence that the selected
collector consumed it.

## Collector/mode selection criteria

No p99 or core-count threshold selects a collector portably. When comparison is justified, select
the relevant rows and include retaining an adequate current collector:

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
Forwarding layout: [OpenJDK 25 Shenandoah forwarding](https://github.com/openjdk/jdk/blob/jdk-25-ga/src/hotspot/share/gc/shenandoah/shenandoahForwarding.inline.hpp).
