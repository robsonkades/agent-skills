# Verifying escape analysis

## Confirm the optimisations are on

```bash
java -XX:+PrintFlagsFinal -version | grep -E 'DoEscapeAnalysis|EliminateAllocations|EliminateLocks'
```

All three must be `true`. The realistic risk is not that they were turned off deliberately
but that a startup script inherited from an older JVM still disables one of them.

## The measurement that answers the question

```bash
java -jar target/benchmarks.jar -prof gc MyBenchmark
```

`gc.alloc.rate.norm` is bytes allocated per operation. It is deterministic given the same
code, which makes it far more reliable than a timing number, and it is effectively binary
for this question:

| Expected | Observed                | Reading                                    |
| -------- | ----------------------- | ------------------------------------------ |
| 0 B/op   | 0 B/op                  | scalar replacement happened                |
| 0 B/op   | the object's exact size | something made it escape — find the path   |
| 0 B/op   | a multiple of that size | it escapes and is allocated more than once |

To quantify what the analysis is actually delivering, run the same benchmark with
`-XX:-DoEscapeAnalysis` and compare. "The JIT resolves it" is exactly as unverified as
"allocation is expensive" until this comparison exists.

## In production

```bash
jfr print --events jdk.ObjectAllocationSample recording.jfr
```

For each of the top allocated types, ask in order:

1. Should this object be local at all?
2. Is it returned, stored in a field, or handed to another thread?
3. **Does a rare path make it escape?** — the flow-insensitivity trap
4. Is it captured by a lambda? Capturing the object creates the escape; capturing
   primitives does not.
5. Does it reach `Method.invoke`? Reflection is opaque, so it escapes by construction.

## Reading the inlining chain

```bash
java -XX:+UnlockDiagnosticVMOptions -XX:+PrintInlining -jar app.jar
```

Two messages matter on a hot path:

- `too big` — the callee exceeds the inlining size budget. Everything downstream of that
  frontier loses escape analysis, constant propagation and dead-code elimination. Splitting
  the method usually fixes it.
- `megamorphic` — three or more receiver types at the call site. Inlining stops, and with
  it every optimisation in that stretch. The cost appears far from the call site, in what
  stopped being optimised.

## Before optimising an allocation

- [ ] The allocation was **measured**, not inferred from reading the code
- [ ] The object is large or expensive to construct — otherwise manual reuse probably makes
      it worse
- [ ] A baseline exists from before the change, under the same load
- [ ] After the change, the **same** metric was measured again

The last one is not ceremony. Manual object reuse routinely regresses
`gc.alloc.rate.norm` by turning a scalar-replaced object into a pooled, escaping one.
