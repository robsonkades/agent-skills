---
name: varhandles-and-memory-ordering
description: >
  Designing and proving low-level Java variable access with VarHandle plain, opaque,
  acquire/release and volatile modes; compare-and-set/exchange, weak CAS, read-modify-write,
  fences, coordinates, signature-polymorphic typing, supported modes, and mixed-access hazards.
  Connects each mode to an algorithmic synchronization edge, allowed outcomes, jcstress model,
  generated-code evidence and target-specific performance measurement. Use only when ordinary
  volatile, atomics, locks or concurrent utilities do not express the required protocol.
---

# VarHandles and memory ordering

## Purpose

Use VarHandle as a low-level, dynamically typed-by-call-site variable-access mechanism with explicit
atomicity and ordering. The goal is the weakest **proven sufficient** protocol only when its measured
benefit justifies a more fragile correctness argument.

VarHandle does not replace the JMM. Start with `java-memory-model`; route ABA, progress and
reclamation to `lock-free-patterns`.

## Entry gate

Prefer a volatile field, `Atomic*`, lock, immutable snapshot or concurrent collection unless all
hold:

- the required variable/coordinate or access mode is not expressed cleanly by a higher-level API;
- allowed outcomes and single/multiple-writer assumptions are written;
- every access path can follow one reviewed protocol;
- jcstress/model tests and target-JDK integration exist;
- assembly/performance evidence shows a decision-relevant benefit where optimization is the reason.

## Protocol contract

```text
variable type and coordinates (field/array/segment/layout):
supported read/write/update modes:
writer count and ownership:
data/invariant carried by the synchronization variable:
read and write mode on every path, including initialization/reset/error:
CAS success and failure ordering requirements:
wraparound/version/ABA and reclamation:
legal/interesting/forbidden outcomes:
progress and contention/backoff policy:
JDK/JIT/architecture measurement scope:
```

## Access-mode lattice

Use the target JDK API specification as authoritative:

| Mode                         | Atomicity/order provided                                                                        | Typical use                                                              |
| ---------------------------- | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| plain `get/set`              | ordinary access; limited bitwise atomicity caveat for 64-bit primitives on 32-bit platforms     | confined or already ordered access                                       |
| opaque                       | bitwise atomic and coherently ordered for the same variable; no general cross-variable ordering | state polling/version observation where coherence alone is proven enough |
| acquire read / release write | opaque properties plus one-way ordering around matching publication/consumption                 | one-direction handoff                                                    |
| volatile                     | volatile semantics and total order among volatile operations                                    | protocols requiring stronger global volatile order                       |

Opaque is not merely “atomic with no ordering”: coherent ordering of accesses to the same variable
is part of its contract. Acquire/release is not a total order over all synchronization variables.

Access modes override ordering from the declaration. A VarHandle plain `get` of a field declared
`volatile` has plain mode semantics. Mixing direct volatile and weaker VarHandle accesses may be
intentional in a proven algorithm, but is a high-risk review point—not categorically illegal.

## Release/acquire publication

```java
private State data;
private int version;
private static final VarHandle VERSION = /* findVarHandle */;

// single writer
void publish(State next, int nextVersion) {
    data = next;
    VERSION.setRelease(this, nextVersion);
}

State readAfterVersion(int expected) {
    int observed = (int) VERSION.getAcquire(this);
    return observed == expected ? data : null;
}
```

The proof requires the consumer's acquire to observe/match the relevant release relationship and
dependent reads to follow it. Version wrap, skipped versions, reuse, multiple writers, object
mutation after publication and initial sentinel collisions need separate treatment. A plain write
on another publisher path does not carry the data.

## Atomic updates

- `compareAndSet` returns boolean and has volatile read/write semantics in the API contract.
- `compareAndExchange*` returns the witnessed value; success is witness equal to expected according
  to the API's comparison semantics.
- weak CAS can fail spuriously and has plain/acquire/release/volatile variants. A retry loop handles
  spurious failure but does not add missing ordering.
- acquire update variants have acquire semantics for the read and plain semantics for the write;
  release variants have plain read and release write semantics. Confirm exact method docs.
- `getAndAdd`, bitwise and exchange variants are only supported for applicable variable types/modes.

Every VarHandle is signature-polymorphic. The symbolic call-site descriptor, coordinates, variable
type and return type must match; failures can be `WrongMethodTypeException`, `ClassCastException`,
or `UnsupportedOperationException`. Check `isAccessModeSupported` when building generic adapters.
Write access to read-only/final variables is unsupported for relevant handles.

## CAS-loop correctness

```text
read witness
derive candidate without irreversible side effects
attempt update with sufficient success/failure ordering
on mismatch/spurious failure: refresh, backoff/help/retry or fail
on success: publish/observe dependent state as proven
```

The update function may execute repeatedly. Do not put billing, I/O, callbacks or non-idempotent
mutation in it. Bound or instrument retry; lock-free system progress can coexist with starvation of
one thread. Handle interruption/shutdown if the loop can run indefinitely.

## Fences

VarHandle provides acquire, release, full, load-load and store-store fences with precise API
reordering guarantees. A fence is not a magic inter-thread handoff: the algorithm still needs a
communication variable and a proof connecting writer and reader. Prefer access modes because the
ordering is attached to the variable operation. Use standalone fences only for established
algorithms whose proof and platform mapping are reviewed.

## Architecture and generated code

Do not hard-code `mov`, `mfence`, `lock add`, `ldar`, or `stlr` as contracts. HotSpot C1/C2/Graal,
JDK version, CPU features, surrounding operations and compiler optimization can coalesce or select
different instructions. x86 TSO often needs fewer explicit instructions for acquire/release than
weaker architectures, but compiler ordering still matters and measured cost can be dominated by
cache-line ownership/contention.

Validate the compiled method/version, tier, inlining, surrounding barriers and target architecture.
Then benchmark representative contention/topology, not only a single-thread access loop.

## Proof and validation

1. Draw the JMM/VarHandle edges and enumerate outcomes before code.
2. Write minimal jcstress actors and results; avoid synchronization from test infrastructure.
3. Add negative controls by weakening one edge and confirm the test has opportunity/sensitivity,
   without requiring a forbidden outcome to appear on every machine.
4. Inspect compiled code when the claimed optimization depends on it.
5. JMH the real access pattern across target JDKs/architectures, including contention/retry/
   false-sharing counters.
6. Run semantic, wraparound, multiwriter violation, cancellation and shutdown tests.

`-XX:+StressGCM` can perturb compiler scheduling and help stress compiler behavior; it does not
simulate all hardware/inter-thread executions or prove a protocol. Treat it as one stress mode.

## Troubleshooting

```text
stale/partial data after version observed
  -> wrong mode/order, acquire did not observe intended release, plain alternate path, mutation
CAS loop CPU high
  -> contention, false sharing, spurious/mismatch rate, no backoff/help, stalled owner
works on one architecture/JIT
  -> missing language proof or codegen assumption; jcstress and exact compiled method
WrongMethodType/ClassCast
  -> coordinate/variable/call-site descriptor mismatch
UnsupportedOperationException
  -> factory/type/read-only handle does not support selected mode
rare corruption after wrap/reuse
  -> ABA/version overflow/reclamation/lifetime protocol
```

## Anti-patterns

| Anti-pattern                                        | Failure                           | Better approach                              | Narrow exception                          |
| --------------------------------------------------- | --------------------------------- | -------------------------------------------- | ----------------------------------------- |
| Weaker mode because x86 instruction is cheaper      | nonportable/unproven              | derive mode from outcomes, then measure      | architecture-specific internal with proof |
| Opaque described as plain atomic                    | coherence contract missed         | quote exact VarHandle API                    |
| Retry loop makes weak CAS ordered                   | spurious retry != fence           | choose sufficient CAS variant                |
| Volatile declaration plus plain VH assumed volatile | access mode overrides declaration | audit each path                              |
| Fence without carrier protocol                      | no communication edge             | release/acquire variable or proven algorithm |
| Single-writer protocol undocumented                 | future writer corrupts silently   | enforce/document owner or serialize writers  |

## Definition of done

- [ ] Higher-level alternatives were rejected for stated reasons.
- [ ] Coordinates/types/supported modes and every access path are inventoried.
- [ ] Writer count, publication data, CAS success/failure, ABA/wrap/reclamation are proven.
- [ ] Outcomes plus jcstress positive/negative controls exist.
- [ ] Codegen and JMH claims are scoped to exact JDK/JIT/architecture/topology.
- [ ] Retry/progress/contention and lifecycle failure modes are observable and tested.

## References

- [Access-mode selection and API matrix](references/access-mode-selection.md)
- [Proving ordering and measuring cost](references/proving-ordering.md)
- [Java 25 `VarHandle`](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/lang/invoke/VarHandle.html)
- [JLS 17.4](https://docs.oracle.com/javase/specs/jls/se25/html/jls-17.html#jls-17.4)
- [OpenJDK jcstress](https://github.com/openjdk/jcstress)
