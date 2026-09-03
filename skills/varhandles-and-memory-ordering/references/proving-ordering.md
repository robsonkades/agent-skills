# Proving ordering and measuring cost

## Outcome-first proof

For a handoff litmus:

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

Negative control: weaken the anchor access and verify the harness executes the intended paths. A
forbidden result may remain rare or absent on finite hardware; absence does not prove the weakened
program correct. The formal proof defines forbidden outcomes.

## Store-buffering shape

```text
T1: release X=1; acquire-read Y -> r1
T2: release Y=1; acquire-read X -> r2
```

If neither acquire observes the other release, no cross-thread synchronizes-with relation carries
the desired total order; `(0,0)` can remain allowed. Volatile access provides stronger total-order
semantics. Confirm against the exact JMM/VarHandle API and jcstress outcomes rather than a processor
barrier diagram alone.

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
contention, CAS failure or production topology. Use at least two layers:

```text
Layer 1: isolated access mode, generated code and operation denominator
Layer 2: representative publisher/consumer or CAS topology, success/failure/retry counters
```

Record allocation, operations-per-invocation, false sharing/padding, core/socket/NUMA placement,
SMT, thread count, CPU quota/frequency and raw forks. Verify semantic invariants after each run.

Metrics:

- successful updates and attempts/retries per success;
- latency/throughput distribution under contention;
- CPU and work-normalized cycles/instructions if counters are adequate;
- cache/coherence events as supporting, not self-proving, evidence;
- fairness/starvation and shutdown progress.

## Stress modes

Run target JDKs, interpreter/tier/JIT variants, architectures and relevant stress flags as
integration diversity. Every stress flag has a scoped mechanism and may change compilation/timing;
none simulates all legal JMM executions. Preserve exact command and do not make “failed to reproduce”
a correctness claim.

## Review checklist

- [ ] Allowed/forbidden outcomes and JMM/VarHandle edges are written.
- [ ] Every path/mode including reset/error/close is in the access ledger.
- [ ] CAS witness, failure ordering, spurious retry, ABA/wrap and side effects are covered.
- [ ] jcstress model matches writer count/reuse and has meaningful controls.
- [ ] compiled-code claim identifies exact nmethod/JIT/JDK/architecture.
- [ ] JMH represents production topology and measures attempts, success, retry and progress.
- [ ] higher-level implementation remains the comparison baseline.

## Authoritative references

- [OpenJDK jcstress](https://github.com/openjdk/jcstress)
- [OpenJDK JMH](https://github.com/openjdk/jmh)
- [Java 25 `VarHandle`](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/lang/invoke/VarHandle.html)
- [JLS memory model](https://docs.oracle.com/javase/specs/jls/se25/html/jls-17.html#jls-17.4)
