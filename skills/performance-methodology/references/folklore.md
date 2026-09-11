# Performance folklore versus the JDK 25 baseline

Each row is a claim still repeated in reviews and blog posts, and what is actually true
on the stated JDK. Some claims outlive an implementation detail; others were always conditional.
Check the mechanism and target workload before accepting either the claim or its opposite.

| Claim                                                             | Reality on JDK 25                                                                                                                                                                                                                                                                      |
| ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| "Avoid creating objects — allocation is expensive"                | Many HotSpot allocations use a TLAB bump-pointer fast path and some objects can be scalar-replaced, but zeroing, slow paths, retained live data and aggregate allocation/GC pressure still matter. Measure allocation rate, lifetime and pause/CPU effects on the target JDK.          |
| "Bigger thread pools mean more throughput"                        | Throughput depends on service demand, blocking, queueing, quotas, CPU topology and downstream limits. Platform-thread sizing and virtual-thread admission are different decisions; neither is derived from one `N_cpus` slogan.                                                        |
| "`synchronized` is always slow"                                   | Cost depends on JDK, lock state, contention, critical-section duration, scheduling and cache coherence. Measure wait/hold behaviour; an uncontended microbenchmark does not predict a production convoy.                                                                               |
| "`synchronized` pins virtual threads — switch to `ReentrantLock`" | **Obsolete since JDK 24 (JEP 491).** Choose by semantics, not pinning. Residual pinning (native frames, class initialisers) can emit `jdk.VirtualThreadPinned` on instrumented blocking paths; `jdk.tracePinnedThreads` was removed.                                                   |
| "G1 is always better than Parallel"                               | Parallel may be competitive for throughput-oriented workloads; compare it with G1 under the actual heap, live set and load. The choice belongs to `jvm-gc-tuning`.                                                                                                                     |
| "Use `jstack` to inspect threads"                                 | `jstack` **does not list virtual threads**. For a supporting target, use `jcmd <pid> Thread.dump_to_file -format=json <output-file>`; check target help, tracking/coverage and collection cost.                                                                                        |
| "`StringBuilder` is faster than `String` concatenation"           | `javac` normally uses `invokedynamic`/`StringConcatFactory` for nonconstant concatenation targeting Java 9+; constant folding and older targets differ. A reused builder can avoid repeated copying during incremental loop accumulation; measure the workload before claiming a gain. |

Version claims above are baselines, not substitutes for checking the deployed runtime. See
[JEP 280](https://openjdk.org/jeps/280), [JEP 444](https://openjdk.org/jeps/444),
[JEP 491](https://openjdk.org/jeps/491), and the deployed JDK's
[`Thread` diagnostics documentation](https://docs.oracle.com/en/java/javase/25/docs/specs/man/jcmd.html).

For pinning diagnostics, check event settings, thresholds and target coverage. Absence of events
does not exclude native carrier blocking: a direct native call need not pass through the
instrumented Java/VM blocking paths. See the JDK 25
[`VirtualThread` parking implementation](https://github.com/openjdk/jdk/blob/jdk-25%2B36/src/java.base/share/classes/java/lang/VirtualThread.java).

## The shape of the error

Rewriting on a general rule can create broad changes and regression risk without a
measured SLO benefit. A rule alone establishes neither a gain nor zero effect. The rule is not that
these claims are always false — several are true under a stated condition. The rule is
that the condition is what makes them actionable, and a measurement is what establishes
the condition.

## Confirmation bias

You suspect the database. You open the database dashboard, find slow queries, stop
looking, and add indexes. What you did not see: the slow queries are 5% of total time and
the other 95% is lock contention in the application.

The protocol against this is one question, asked before the diagnosis is accepted:

```
"What evidence would convince me this hypothesis is WRONG?"

Then go looking for that evidence.

If you cannot imagine what would change your mind, the hypothesis is not
falsifiable — and it is not an engineering diagnosis.
```
