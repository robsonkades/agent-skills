# Proving ordering and measuring cost

## Outcome-first proof

Scope evidence to the question. A source-level explanation can establish what the API/JMM permits
without claiming an executed harness; a changed concurrent protocol needs its actual assumptions
and proof obligations addressed. Preserve adequate existing evidence where it answers the claim.

For a handoff litmus:

Partial jcstress test: annotations/result imports and VarHandle lookup initialization are omitted.
Use the project's pinned jcstress harness; this block is not a standalone executable class.

```java
@JCStressTest
@Outcome(id = "-1", expect = Expect.ACCEPTABLE, desc = "publication not observed")
@Outcome(id = "42", expect = Expect.ACCEPTABLE, desc = "publication and data observed")
@Outcome(id = "0", expect = Expect.FORBIDDEN, desc = "publication observed without prior data")
@State
public class Publication {
    int data;
    int version;
    static final VarHandle VERSION = /* lookup */;

    @Actor
    public void writer() {
        data = 42;
        VERSION.setRelease(this, 1);
    }

    @Actor
    public void reader(I_Result r) {
        int v = (int) VERSION.getAcquire(this);
        r.r1 = v == 1 ? data : -1;
    }
}
```

Confirm annotation imports/API against the pinned jcstress version. The model assumes one writer,
no reuse/wrap and one-shot initialization. Expand actors/state for the production algorithm.

Negative control: weaken the anchor access and verify the harness executes the intended paths.
Reclassify outcomes for that weakened protocol: observing data 0 after the flag can be allowed
there even though forbidden in the release/acquire original. That result may remain rare or absent
on finite hardware; absence does not prove the weakened program correct. Do not introduce a latch,
join or another volatile edge between the actors that accidentally repairs the missing handoff.
The API/JMM argument determines allowed outcomes; a finite run can expose a defect, not prove
absence across all legal executions.

## Store-buffering shape

```text
T1: release X=1; acquire-read Y -> r1
T2: release Y=1; acquire-read X -> r2
```

If neither acquire observes the other release, no cross-thread synchronizes-with relation carries
the desired total order; `(0,0)` can remain allowed. Volatile access provides stronger total-order
semantics. Confirm against the exact JMM/VarHandle API; use matching jcstress outcomes when
exercising the model. A processor barrier diagram alone is not the language-level argument.

## Compiled-code inspection

When optimization depends on instruction selection:

1. Capture JDK vendor/build, architecture/CPU features, JIT/tier and flags.
2. Ensure the relevant method and compiled version are hot and selected.
3. Account for inlining and barriers coalesced with surrounding operations.
4. Use supported assembly tooling and retain mapping/sample coverage.
5. Compare semantics first; treat instruction shape as implementation evidence.

Do not force `-XX:-TieredCompilation` merely to obtain one desired shape; that changes compilation
context. Capture representative code or explicitly label a mechanism experiment.

## JMH experiment

A single-thread `get`/`set` microbenchmark can reveal codegen cost but not cache-line transfer,
contention, CAS failure or production topology. Select the layer that answers the question; use
both when connecting isolated access cost to a concurrent workload claim:

```text
Layer 1: isolated access mode, generated code and operation denominator
Layer 2: representative publisher/consumer or CAS topology, success/failure/retry counters
```

Record the operation denominator, environment and raw runs needed to interpret the comparison.
For relevant topology claims, include allocation, false sharing/padding, core/socket/NUMA placement,
SMT, thread count and CPU quota/frequency. A confined adapter question does not require a
multi-socket experiment. Verify applicable semantic invariants when running experiments.

Choose metrics relevant to the objective:

- successful updates and attempts/retries per success;
- latency/throughput distribution under contention;
- CPU and work-normalized cycles/instructions if counters are adequate;
- cache/coherence events as supporting, not self-proving, evidence;
- fairness/starvation and shutdown progress.

## Stress modes

Use target JDKs, interpreter/tier/JIT variants, architectures and relevant stress flags when that
integration diversity addresses the changed claim. Every stress flag has a scoped mechanism and may change compilation/timing;
none simulates all legal JMM executions. Preserve exact command and do not make “failed to reproduce”
a correctness claim.

## Review checklist

Apply relevant items and state unexecuted checks or unresolved limits:

- [ ] Allowed/forbidden outcomes and JMM/VarHandle edges are written.
- [ ] Every path/mode including reset/error/close is in the access ledger.
- [ ] CAS witness, failure ordering, spurious retry, ABA/wrap and side effects are covered.
- [ ] Any executed jcstress model matches writer count/reuse and has meaningful controls.
- [ ] compiled-code claim identifies exact nmethod/JIT/JDK/architecture.
- [ ] Any JMH claim stays within its measured topology, operation denominator and relevant metrics.
- [ ] An optimization compares an adequate equivalent implementation, including a higher-level
      alternative where it answers the decision.

## Authoritative references

- [OpenJDK jcstress](https://github.com/openjdk/jcstress)
- [OpenJDK JMH](https://github.com/openjdk/jmh)
- [Java 25 `VarHandle`](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/lang/invoke/VarHandle.html)
- [JLS memory model](https://docs.oracle.com/javase/specs/jls/se25/html/jls-17.html#jls-17.4)
