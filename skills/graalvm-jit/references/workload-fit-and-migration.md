# Workload fit and the migration decision

## Which shapes trend which way

Treat this as a prior for choosing what to benchmark, never as a substitute for benchmarking.

| Workload                                                    | Trend                       | Why                                                                     |
| ----------------------------------------------------------- | --------------------------- | ----------------------------------------------------------------------- |
| Many temporary allocations that rarely escape               | Favours Graal               | PEA removes most of the allocations                                     |
| Many interface or polymorphic calls at hot call sites       | Favours Graal               | More aggressive speculation                                             |
| High-level frameworks with heavy boxing (Spring, Hibernate) | Favours Graal               | Combines both effects above                                             |
| Numeric code with simple loops over arrays                  | Favours C2                  | C2's intrinsics and vectorisation are more mature and better calibrated |
| Start-up critical (Lambda, CLI, short jobs)                 | Favours C2, or native image | The compilation investment has no time to repay                         |
| Severely CPU-limited (containers with a low quota)          | Favours C2                  | Graal tends to consume more CPU per compilation                         |

**Strong candidates to evaluate:** allocation-heavy applications; heavy use of streams,
lambdas, `Optional` and boxing; Spring, Quarkus or Micronaut; long-running data processing
(Flink, Spark jobs); services with uptime measured in hours or days.

**Do not migrate without a strong justification** when start-up latency is critical, CPU is
tightly constrained, the numeric code is already specialised for C2, or native image is
plainly the better fit.

## C2 and Graal side by side

The time, throughput and warm-up rows below are direction, not measurement. There is no
audited published methodology behind them; reproduce them for your own workload.

| Characteristic            | C2 (HotSpot)                    | GraalVM JIT                                                  |
| ------------------------- | ------------------------------- | ------------------------------------------------------------ |
| Implementation language   | C++                             | Java                                                         |
| IR                        | Sea-of-nodes                    | HIR to MIR to LIR                                            |
| Written since             | 1990s                           | 2012 onwards                                                 |
| Partial escape analysis   | No — all-or-nothing EA          | Yes                                                          |
| Speculative optimisations | Present, more conservative      | More extensive                                               |
| Compilation time          | Baseline                        | Typically slower                                             |
| Peak throughput           | Baseline                        | May exceed on allocation-heavy or polymorphic workloads      |
| Warm-up latency           | Baseline                        | Typically higher, and confounded by libgraal versus jargraal |
| Native image support      | No, JIT only                    | Yes (a separate product decision)                            |
| Production maturity       | Very high, decades of hardening | High, in production since 2019                               |

## What partial escape analysis buys, concretely

```java
void processEvent(Event e) {
    Result r = new Result();          // PEA candidate

    if (e.isError()) {
        log.warn("Error: " + r.getMessage());  // r escapes here
        return;                        // rare path
    }

    r.compute(e.getData());
    publish(r.getValue());            // common path: only the primitive leaves
}
```

Under C2, `r` escapes inside the error branch, so escape analysis concludes it always escapes
and heap-allocates it on every execution — including the common path. Under PEA the two paths
are analysed separately: `r` is virtualised on the common path with no real allocation, and
materialised only on the rarely executed error path. The saving is proportional to how rare
the escaping branch is, for that object specifically.

This is also why the shape of your code, not the compiler's reputation, decides the outcome:
a method with no such branch-asymmetric allocation gains nothing from PEA.

## Gate checklist

### Before measuring

- [ ] A JMH benchmark exists that represents the real workload — not a synthetic
      microbenchmark detached from the application's actual allocation pattern
- [ ] The same GC is configured on both sides of the comparison
- [ ] The active mode has been confirmed, libgraal or jargraal, before any warm-up number is
      interpreted
- [ ] Warm-up ran until the score stabilised (variation under roughly 5% between iterations),
      not for a fixed iteration count assumed in advance

### Before deciding to migrate

- [ ] The workload is long-running — minutes to hours of uptime, not a short-lived function
- [ ] The benchmarked methods are the real hot paths, identified by profiling rather than
      assumed
- [ ] Results favour Graal consistently across runs, not in a single run
- [ ] Native image was considered as the alternative if the critical metric is start-up rather
      than peak throughput
- [ ] The applicable licence (Oracle GraalVM under GFTC, or GraalVM CE under GPLv2 with
      Classpath Exception) has been checked against the organisation's requirements, at the
      current official source

### After migrating

- [ ] Production monitoring confirms the laboratory gain under real load
- [ ] A rollback plan exists and has been tested, in case production diverges from the
      benchmark

## Licensing, as of the unified Enterprise and Community lines

|             | Oracle GraalVM                                                         | GraalVM Community Edition         |
| ----------- | ---------------------------------------------------------------------- | --------------------------------- |
| Base        | Oracle JDK                                                             | OpenJDK                           |
| Licence     | GFTC — GraalVM Free Terms and Conditions, free including in production | GPLv2 with Classpath Exception    |
| Distributor | Oracle                                                                 | Community and Oracle, open source |
| Cost        | Free under the GFTC terms                                              | Free, open source                 |

GFTC removed most of the historical reason to prefer CE, which was licence cost. The different
base (Oracle JDK versus OpenJDK) and the different governance remain legitimate corporate
criteria. Licensing is the category of information here most likely to have changed since this
was written; confirm current terms at the official source.
