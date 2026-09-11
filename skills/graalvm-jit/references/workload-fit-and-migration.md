# Workload fit and the migration decision

## Which shapes trend which way

Treat these workload tendencies as hypotheses for choosing what to benchmark, not measured
comparisons or guarantees for every release. "All lines" identifies conceptual applicability,
not evidence that Graal wins on every version. Never substitute the table for benchmarking,
and read the last column: several rows changed with the GraalVM 25.x line, and a prior formed
on an older compiler is a prior about a different compiler.

| Workload                                                    | Trend              | Why                                                                                    | Holds on                                          |
| ----------------------------------------------------------- | ------------------ | -------------------------------------------------------------------------------------- | ------------------------------------------------- |
| Many temporary allocations that rarely escape               | Favours Graal      | PEA removes the allocation on the paths where it does not escape                       | All lines                                         |
| Many interface or polymorphic calls at hot call sites       | Favours Graal      | Graph-based inlining budget and more aggressive speculation                            | All lines; 25.3 replaced the inliner — remeasure  |
| High-level frameworks with heavy boxing (Spring, Hibernate) | Favours Graal      | Combines both effects above                                                            | All lines                                         |
| Numeric code with simple loops over arrays                  | Favours C2         | CE had no auto-vectorisation; `Vectorization` was Oracle GraalVM only                  | CE through 25.2. CE 25.3 enables `VectorizeLoops` |
| Vector API (`jdk.incubator.vector`) kernels                 | Unknown, measure   | Graal lowers Vector API operations only since 25.0, coverage "initial", experimental   | 25.0+; C2's coverage is older and broader         |
| Start-up critical (function, CLI, short job)                | Measure break-even | Compilation may not repay before exit; AOT/CRaC/native image change other constraints  | All lines                                         |
| Severely CPU-limited (containers with a low quota)          | Often favours C2   | Graal compilation can consume more CPU; queueing and time-to-tier-4 decide the result  | Verify on the selected line                       |
| Memory-limited containers                                   | Often favours C2   | libgraal has a separate isolate heap and compiler threads outside the Java heap budget | Verify RSS and native accounting                  |

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
| Where it ships            | HotSpot server builds with C2                      | Bundled GraalVM distributions; compatible external JVMCI builds are also possible  |
| Production maturity       | Very high, decades of hardening                    | High, GA since 2019; product line now detached from the Java SE train              |

## What partial escape analysis buys, concretely

Partial Java snippet, with application-specific `Event`, `Result` and `publish` omitted.
`publish` receives a primitive; the static field deliberately retains the result only on
the error path. The field is an illustration of escape, not a recommended logging design.

```java
static volatile Result lastError;

void processEvent(Event e) {
    Result r = new Result();          // PEA candidate

    if (e.isError()) {
        lastError = r;                 // the object itself escapes here
        return;                        // rare path
    }

    r.compute(e.getData());
    publish(r.getValue());            // common path: only the primitive leaves
}
```

If both branches remain in C2's compilation graph, its flow-insensitive escape analysis
cannot scalar-replace `r` only on the common path. Graal PEA can keep it virtual on that
path and materialise it for the static store. These are optimisation candidates, not
guaranteed outputs: inlining, profiling (including uncommon traps), field use and heuristics
can change the result. Exercise both paths with representative frequency and inspect each
compiler's output. Merely passing `r.getMessage()` to a logger would not establish escape
of `r` itself.

Two limits the paper and the option defaults impose: an array longer than
`MaximumEscapeAnalysisArrayLength` (128) is never virtualised, and virtualisation needs the
allocation and all of its uses in one compilation unit — an object passed to a call Graal
did not inline is materialised at the call, exactly as `ArgEscape` is in C2. Inlining is
therefore the precondition here too, which is why the inliner change in 25.3 can move a PEA
result in either direction.

This is also why the shape of your code, not the compiler's reputation, decides the outcome:
a method without an eligible allocation may gain nothing from PEA. Compare allocated bytes
per operation with equivalent inputs and compiled hot paths; inspect compiler graphs when
attributing the mechanism. Missing samples in async-profiler allocation mode or JFR do not
prove zero allocation. `jdk.ObjectAllocationInNewTLAB` records the allocation that triggers
a new TLAB, not every object allocated within one; sampling and recording settings affect
visibility.

Source: Lukas Stadler, Thomas Würthinger, Hanspeter Mössenböck, "Partial Escape Analysis and
Scalar Replacement for Java", CGO 2014, doi:10.1145/2544137.2544157; PDF at
`ssw.jku.at/Research/Papers/Stadler14/Stadler2014-CGO-PEA.pdf`.

## Gate checklist

### Before measuring

- [ ] The runtime has an actual compatible compiler, bundled or externally supplied, and
      `-Djdk.graal.ShowConfiguration=info` prints a configuration line
- [ ] Existing representative workload evidence is sufficient, or a focused comparison is planned;
      use JMH for unresolved hot-path questions rather than requiring a new microbenchmark
- [ ] Compiler-only comparison uses one compatible binary with `-XX:-UseJVMCICompiler` on
      the C2 side and the same GC; differing images are identified as a broader runtime comparison
- [ ] The supported selected mode (libgraal or jargraal) is confirmed before interpreting warm-up
- [ ] Warm-up convergence was inspected across iterations and independent forks; raw results
      and uncertainty were retained for both compilers
- [ ] The GraalVM line is recorded with the result (25.0, 25.1, 25.3 ...), because the
      inliner and vectoriser changed inside the 25.x series

### Before deciding to migrate

- [ ] Measured savings repay compilation costs over the actual instance lifetime, including
      cold starts, reuse and restart/scale-out frequency
- [ ] Any isolated benchmark methods are actual hot paths; application outcomes and lifetime
      costs are covered by representative evidence
- [ ] Results favour Graal consistently across runs, not in a single run
- [ ] Native image was considered as the alternative if the critical metric is start-up rather
      than peak throughput
- [ ] The applicable licence (Oracle GraalVM under GFTC, or GraalVM CE under GPLv2 with
      Classpath Exception) has been checked against the organisation's requirements, at the
      current official source
- [ ] A support horizon exists: which GraalVM line the fleet will track, who ships its CPUs,
      and what happens when the JDK base moves off 25
- [ ] Container CPU and memory limits remain adequate for measured compiler activity and the
      selected mode, including the libgraal isolate where used

### After migrating

- [ ] Production monitoring confirms the laboratory gain under real load
- [ ] JFR `jdk.Compilation` in production shows `compiler = "jvmci"` for tier 4 — the
      deployment did not silently land on C2 through a flags-file or image mix-up
- [ ] The chosen rollback is tested: C2 in the same GraalVM image where supported, or the
      previous production JDK image; benchmark and validate whichever route will be used

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
  (September 2025), then 25.1, 25.2 and 25.3 as monthly innovation releases on a JDK 25 base.
  Oracle's support roadmap distinguishes 25.0 LTS quarterly CPUs from 25.1+ innovation releases,
  whose users must track the latest monthly line for fixes; do not transfer one support horizon
  to the other. The blog text itself was not fetched directly for this
  revision; the openjdk.org Galahad page and the Oracle JDK 25 release notes corroborate it.
- **OpenJDK Project Galahad was dissolved in March 2026** after losing its sponsoring group.
  Stock JDK 25 builds tested here contain JVMCI and a placeholder module but no Graal
  compiler. Treat future OpenJDK contents as a release fact to verify, not as either an
  integration promise or an impossibility claim.
- **Licence per line, not per product:** the GraalVM downloads page states that CPU
  releases of GraalVM for JDK 17.0.13 and later are under the GraalVM OTN licence, while
  updates for Oracle GraalVM for JDK 21 and Oracle GraalVM 25.0 and 25.3 remain under the
  GFTC. Which line the fleet tracks decides which licence applies to its patches.

GFTC removed the historical cost reason to prefer CE; the different base, the different
governance and now the different patch-licence history remain legitimate corporate criteria.
Licensing and support terms are the category of information here most likely to have
changed since this was written; confirm at `graalvm.org/downloads` and
`oracle.com/downloads/licenses/graal-free-license.html` before a corporate decision.

## Authoritative sources

- [GraalVM release calendar](https://www.graalvm.org/release-calendar/)
- [Oracle GraalVM support roadmap](https://docs.oracle.com/en/graalvm/support-roadmap.html)
- [Oracle GraalVM 25 support and licensing](https://docs.oracle.com/en/graalvm/jdk/25/docs/support/)
- [Partial Escape Analysis and Scalar Replacement for Java (CGO 2014)](https://ssw.jku.at/Research/Papers/Stadler14/Stadler2014-CGO-PEA.pdf)
- [JDK 25 JFR event definitions](https://github.com/openjdk/jdk/blob/jdk-25-ga/src/hotspot/share/jfr/metadata/metadata.xml) — allocation event coverage and compilation fields.
- [JEP 410: Remove the Experimental AOT and JIT Compiler](https://openjdk.org/jeps/410)
