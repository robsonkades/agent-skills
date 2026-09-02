# Workload fit and the migration decision

## Which shapes trend which way

Treat this as a prior for choosing what to benchmark, never as a substitute for benchmarking,
and read the last column: several rows changed with the GraalVM 25.x line, and a prior formed
on an older compiler is a prior about a different compiler.

| Workload                                                    | Trend                       | Why                                                                                              | Holds on                                          |
| ----------------------------------------------------------- | --------------------------- | ------------------------------------------------------------------------------------------------ | ------------------------------------------------- |
| Many temporary allocations that rarely escape               | Favours Graal               | PEA removes the allocation on the paths where it does not escape                                 | All lines                                         |
| Many interface or polymorphic calls at hot call sites       | Favours Graal               | Graph-based inlining budget and more aggressive speculation                                      | All lines; 25.3 replaced the inliner — remeasure  |
| High-level frameworks with heavy boxing (Spring, Hibernate) | Favours Graal               | Combines both effects above                                                                      | All lines                                         |
| Numeric code with simple loops over arrays                  | Favours C2                  | CE had no auto-vectorisation; `Vectorization` was Oracle GraalVM only                            | CE through 25.2. CE 25.3 enables `VectorizeLoops` |
| Vector API (`jdk.incubator.vector`) kernels                 | Unknown, measure            | Graal lowers Vector API operations only since 25.0, coverage "initial", experimental             | 25.0+; C2's coverage is older and broader         |
| Start-up critical (Lambda, CLI, short jobs)                 | Favours C2, or native image | The compilation investment has no time to repay                                                  | All lines                                         |
| Severely CPU-limited (containers with a low quota)          | Favours C2                  | Graal compilations cost more CPU each, and 0.66 of `CICompilerCount` goes to JVMCI since 24      | All lines                                         |
| Memory-limited containers                                   | Favours C2                  | libgraal's isolate heap and threads are outside `-Xmx`; more JVMCI threads raised peak RSS in 24 | All lines                                         |

The Vector API row is `simd-and-vector-api`'s subject — proving that vector instructions
were emitted is the same exercise under either compiler. The start-up row is where Oracle now
points Java SE customers: Project Leyden and the JVM-preserving strategies in
`startup-cds-crac-leyden`, not a Graal JIT.

**Strong candidates to evaluate:** allocation-heavy applications; heavy use of streams,
lambdas, `Optional` and boxing; Spring, Quarkus or Micronaut; long-running data processing
(Flink, Spark jobs); services with uptime measured in hours or days; anything that embeds a
Truffle language, which needs Graal for a different reason (see
`troubleshooting-and-timeline.md`).

**Do not migrate without a strong justification** when start-up latency is critical, CPU or
memory is tightly constrained, the numeric code is already specialised for C2 and the target
is a CE line before 25.3, or native image is plainly the better fit.

## C2 and Graal side by side

The time, throughput and warm-up rows below are direction, not measurement. There is no
audited published methodology behind them; reproduce them for your own workload.

| Characteristic            | C2 (HotSpot)                                       | GraalVM JIT                                                                        |
| ------------------------- | -------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Implementation language   | C++                                                | Java, shipped as a native library (libgraal)                                       |
| IR                        | Sea-of-nodes (Click), one graph to the Matcher     | One graph IR lowered through high, mid and low tiers, then LIR                     |
| Written since             | 1990s                                              | 2012 onwards                                                                       |
| Partial escape analysis   | No — all-or-nothing EA                             | Yes (Stadler et al., CGO 2014)                                                     |
| Inlining budget           | Bytecode bytes (`MaxInlineSize`, `FreqInlineSize`) | Graph nodes (`TrivialInliningSize`, `MaximumInliningSize`); priority inliner 25.3+ |
| Speculative optimisations | Present, more conservative                         | More extensive                                                                     |
| Auto-vectorisation        | SuperWord, mature                                  | Oracle GraalVM; CE from 25.3 (`VectorizeLoops`)                                    |
| Compilation time          | Baseline                                           | Typically slower per compilation                                                   |
| Peak throughput           | Baseline                                           | May exceed on allocation-heavy or polymorphic workloads                            |
| Warm-up latency           | Baseline                                           | Typically higher; jargraal is a different regime, not a longer warm-up             |
| Where it ships            | Every OpenJDK build                                | GraalVM distributions only (Oracle JDK 23–24 bundled it; 25 removed it)            |
| Production maturity       | Very high, decades of hardening                    | High, GA since 2019; product line now detached from the Java SE train              |

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

Two limits the paper and the option defaults impose: an array longer than
`MaximumEscapeAnalysisArrayLength` (128) is never virtualised, and virtualisation needs the
allocation and all of its uses in one compilation unit — an object passed to a call Graal
did not inline is materialised at the call, exactly as `ArgEscape` is in C2. Inlining is
therefore the precondition here too, which is why the inliner change in 25.3 can move a PEA
result in either direction.

This is also why the shape of your code, not the compiler's reputation, decides the outcome:
a method with no such branch-asymmetric allocation gains nothing from PEA. Confirm a removed
allocation the same way as under C2 — it disappears from allocation profiling
(async-profiler `-e alloc`, JFR `jdk.ObjectAllocationInNewTLAB`) — rather than from a claim.

Source: Lukas Stadler, Thomas Würthinger, Hanspeter Mössenböck, "Partial Escape Analysis and
Scalar Replacement for Java", CGO 2014, doi:10.1145/2544137.2544157; PDF at
`ssw.jku.at/Research/Papers/Stadler14/Stadler2014-CGO-PEA.pdf`.

## Gate checklist

### Before measuring

- [ ] The distribution actually ships the compiler — GraalVM CE or Oracle GraalVM — and
      `-Djdk.graal.ShowConfiguration=info` prints a configuration line
- [ ] A JMH benchmark exists that represents the real workload — not a synthetic
      microbenchmark detached from the application's actual allocation pattern
- [ ] The comparison is one binary with `-XX:-UseJVMCICompiler` on the C2 side, the same GC
      pinned explicitly on both
- [ ] The mode has been confirmed as libgraal before any warm-up number is interpreted
- [ ] Warm-up ran until the score stabilised (variation under roughly 5% between iterations),
      not for a fixed iteration count assumed in advance
- [ ] The GraalVM line is recorded with the result (25.0, 25.1, 25.3 ...), because the
      inliner and vectoriser changed inside the 25.x series

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
- [ ] A support horizon exists: which GraalVM line the fleet will track, who ships its CPUs,
      and what happens when the JDK base moves off 25
- [ ] Container CPU and memory limits were re-derived with JVMCI compiler threads and the
      libgraal isolate included

### After migrating

- [ ] Production monitoring confirms the laboratory gain under real load
- [ ] JFR `jdk.Compilation` in production shows `compiler = "jvmci"` for tier 4 — the
      deployment did not silently land on C2 through a flags-file or image mix-up
- [ ] A rollback plan exists and has been tested, in case production diverges from the
      benchmark; the rollback binary is the OpenJDK build the C2 side was also measured on

## Licensing and the product line, as of September 2026

|             | Oracle GraalVM                                                                                  | GraalVM Community Edition                         |
| ----------- | ----------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| Base        | Oracle JDK (25.3.4.1 on Oracle JDK 25.0.4.1)                                                    | OpenJDK (25.3.4.1 on OpenJDK 25.0.4.1)            |
| Licence     | GFTC — free for internal business operations and redistribution without fees                    | GPLv2 with Classpath Exception                    |
| Distributor | Oracle; also bundled with Oracle Database products at no additional cost                        | Oracle-led open source, `github.com/oracle/graal` |
| JIT extras  | `enterprise` configuration: Oracle-only inlining tuning, duplication, vectorisation before 25.3 | `community` and `economy` configurations          |

What changed in 2025–2026 and why it is now a gate rather than a footnote:

- **Oracle JDK bundled Graal as an optional JIT in 23 and 24** ("Oracle JDK includes GraalVM
  JIT as an optional compiler. OpenJDK does not." — Oracle JDK 24 release notes) and
  **removed it in 25** ("Removal of Experimental Feature - Graal JIT" — Oracle JDK 25 release
  notes). A deployment that relied on that flag on Oracle JDK has no in-place upgrade; it
  moves to a GraalVM distribution or back to C2.
- **September 2025, "Detaching GraalVM from the Java Ecosystem Train"** (Oracle Java
  platform blog): GraalVM for JDK 24 was the last version licensed and supported as part of
  Oracle Java SE products; Oracle points Java SE customers wanting start-up and footprint
  improvements at Project Leyden instead. The GraalVM team continued shipping: GraalVM 25
  (September 2025), then 25.1, 25.2 and 25.3 as monthly innovation releases with quarterly
  CPUs, all on a JDK 25 base. The blog text itself was not fetched directly for this
  revision; the openjdk.org Galahad page and the Oracle JDK 25 release notes corroborate it.
- **OpenJDK Project Galahad was dissolved in March 2026** ("This Project became unnecessary
  in light of the September 2025 announcement to detach GraalVM from the Java ecosystem" —
  openjdk.org/projects/galahad). No OpenJDK build will carry Graal; the placeholder module
  and `-XX:+UseGraalJIT` in JDK 22+ are the residue.
- **Licence per line, not per product:** the GraalVM downloads page states that CPU
  releases of GraalVM for JDK 17.0.13 and later are under the GraalVM OTN licence, while
  updates for Oracle GraalVM for JDK 21 and Oracle GraalVM 25.0 and 25.3 remain under the
  GFTC. Which line the fleet tracks decides which licence applies to its patches.

GFTC removed the historical cost reason to prefer CE; the different base, the different
governance and now the different patch-licence history remain legitimate corporate criteria.
Licensing and support terms are the category of information here most likely to have
changed since this was written; confirm at `graalvm.org/downloads` and
`oracle.com/downloads/licenses/graal-free-license.html` before a corporate decision.
