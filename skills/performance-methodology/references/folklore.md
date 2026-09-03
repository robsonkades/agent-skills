# Performance folklore versus the JDK 25 baseline

Each row is a claim still repeated in reviews and blog posts, and what is actually true
on a current JDK. The pattern is the same in every case: the claim was once a measured
fact about a JVM that no longer exists, and it survives because nobody re-measures.

| Claim                                                             | Reality on JDK 25                                                                                                                                                                                                                                                             |
| ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| "Avoid creating objects — allocation is expensive"                | Many HotSpot allocations use a TLAB bump-pointer fast path and some objects can be scalar-replaced, but zeroing, slow paths, retained live data and aggregate allocation/GC pressure still matter. Measure allocation rate, lifetime and pause/CPU effects on the target JDK. |
| "Bigger thread pools mean more throughput"                        | Throughput depends on service demand, blocking, queueing, quotas, CPU topology and downstream limits. Platform-thread sizing and virtual-thread admission are different decisions; neither is derived from one `N_cpus` slogan.                                               |
| "`synchronized` is always slow"                                   | Cost depends on JDK, lock state, contention, critical-section duration, scheduling and cache coherence. Measure wait/hold behaviour; an uncontended microbenchmark does not predict a production convoy.                                                                      |
| "`synchronized` pins virtual threads — switch to `ReentrantLock`" | **Obsolete since JDK 24 (JEP 491).** Choose by semantics, not pinning. Residual pinning (native frames, class initialisers) shows up as the JFR event `jdk.VirtualThreadPinned`; `jdk.tracePinnedThreads` was removed.                                                        |
| "G1 is always better than Parallel"                               | Parallel delivers higher throughput for batch workloads with no latency SLO. The choice belongs to `jvm-gc-tuning`.                                                                                                                                                           |
| "Use `jstack` to inspect threads"                                 | `jstack` **does not list virtual threads**. Use `jcmd <pid> Thread.dump_to_file -format=json`.                                                                                                                                                                                |
| "`StringBuilder` is faster than `String` concatenation"           | Since JDK 9 (JEP 280) concatenation compiles to `invokedynamic` against `StringConcatFactory`. The rewrite still pays for **incremental accumulation inside a loop** — a condition, not a general rule.                                                                       |

Version claims above are baselines, not substitutes for checking the deployed runtime. See
[JEP 280](https://openjdk.org/jeps/280), [JEP 444](https://openjdk.org/jeps/444),
[JEP 491](https://openjdk.org/jeps/491), and the deployed JDK's
[`Thread` diagnostics documentation](https://docs.oracle.com/en/java/javase/25/docs/specs/man/jcmd.html).

## The shape of the error

Rewriting on a general rule produces the same outcome every time: a pull request touching
dozens of files, real regression risk, and 0% movement on the SLO. The rule is not that
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
