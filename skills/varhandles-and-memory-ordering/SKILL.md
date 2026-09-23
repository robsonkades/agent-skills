---
name: varhandles-and-memory-ordering
description: >
  Designing and proving low-level Java variable access with VarHandle plain, opaque,
  acquire/release and volatile modes; compare-and-set/exchange, weak CAS, read-modify-write,
  fences, coordinates, signature-polymorphic typing, supported modes, and mixed-access hazards.
  Connects modes to synchronization edges and allowed outcomes, with model, generated-code and
  performance evidence when relevant. Use when selecting or reviewing low-level access modes,
  adapting existing handles or dynamic coordinates, resolving invocation mismatches, or assessing
  a proposed ordering optimization.
---

# VarHandles and memory ordering

## Purpose

Use VarHandle as a low-level, dynamically typed-by-call-site variable-access mechanism with explicit
atomicity and ordering. Select a sufficient protocol for the actual objective. Retain an adequate
volatile mode or higher-level API; weaker ordering needs a proof, and a performance justification
needs measurement. Existing-handle compatibility and dynamic coordinates can justify VarHandle
without a proposed optimization.

VarHandle does not replace the JMM. Start with `java-memory-model`; route ABA, progress and
reclamation to `lock-free-patterns`.

Inspect the project's compiler release, runtime and target architectures before choosing APIs.
Ordinary-field examples target Java 17+ (VarHandle itself arrived in 9); foreign-memory
layout coordinates here refer to the final Java 22+ API, checked against Java 25. Earlier
incubator/preview layouts differ. This skill does not authorize a JDK upgrade or preview use.

## Entry gate

Consider a volatile field, `Atomic*`, lock, immutable snapshot or concurrent collection alongside
the required variable, coordinates and ordering. An existing adequate handle need not be replaced.

- For an API or adapter question, resolve types, supported modes and invocation behavior.
- For a changed shared-state protocol, state outcomes and writer assumptions, review every access
  path, and select model, stress and integration checks proportionate to the changed claim.
- For optimization, compare equivalent semantics and measure the decision-relevant benefit.
- A narrow explanation or adequate no-change review can close with its reasoning and evidence
  limits; do not invent executed tests or require an unrelated performance campaign.

## Protocol contract

Use the relevant fields for the protocol under review. Reuse, ABA and reclamation obligations
depend on actual state reuse and ownership; an invocation-descriptor explanation needs no new
reclamation design.

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
| plain `get/set`              | ordinary ordering; atomicity depends on type, platform and factory contract (see below)         | confined or already ordered access                                       |
| opaque                       | bitwise atomic and coherently ordered for the same variable; no general cross-variable ordering | state polling/version observation where coherence alone is proven enough |
| acquire read / release write | opaque properties plus one-way ordering around matching publication/consumption                 | one-direction handoff                                                    |
| volatile                     | volatile semantics and total order among volatile operations                                    | protocols requiring stronger global volatile order                       |

Opaque is not merely “atomic with no ordering”: coherent ordering of accesses to the same variable
is part of its contract. Acquire/release is not a total order over all synchronization variables.

Java 25's general plain-mode guarantee covers references and primitives of at most 32 bits.
Its stronger factory default, unless a factory specifies otherwise, covers all primitive types
except `long` and `double` on 32-bit platforms. Check the actual factory contract. This is distinct
from JLS 17.7's permission to split ordinary non-volatile `long`/`double` accesses, which is not
limited to 32-bit platforms. A local run cannot establish atomicity on every supported target.

Access modes override ordering from the declaration. A VarHandle plain `get` of a field declared
`volatile` has plain mode semantics. Mixing direct volatile and weaker VarHandle accesses may be
intentional in a proven algorithm, but is a high-risk review point—not categorically illegal.

## Release/acquire publication

Partial one-shot protocol: `State` is immutable, the holder is safely shared, exactly one
designated writer publishes once, and no path resets or overwrites data afterward. The lookup
initializer must resolve this holder's `ready` field as `int`.

```java
private State data;
private int ready; // 0 until the sole publication
private static final VarHandle READY = /* findVarHandle */;

// Sole writer only; no concurrent callers. Reject accidental sequential reuse.
void publish(State next) {
    if (ready != 0) throw new IllegalStateException("already published");
    data = java.util.Objects.requireNonNull(next);
    READY.setRelease(this, 1);
}

State readIfPublished() {
    int observed = (int) READY.getAcquire(this);
    return observed == 1 ? data : null;
}
```

The acquire that reads 1 matches the sole release, so prior initialization precedes subsequent
data reads. It does not freeze the data: in a reusable version/data pair, the writer could
overwrite data for version 2 after the reader observes version 1. A single writer and unique
versions do not prevent that race. Use an atomically published immutable version+data snapshot
when readers need a consistent pair, or prove an acknowledgement/ownership protocol before reuse.
The plain guard is confined to the sole writer; it does not enforce multiwriter exclusion.

## Atomic updates

- `compareAndSet` returns boolean and has volatile read/write semantics in the API contract.
- `compareAndExchange*` returns the witnessed value; success is witness equal to expected according
  to the factory's comparison semantics. Float/double field and array handles compare raw bits:
  primitive `==` can misclassify success for signed zero or NaN; see the access-mode reference.
- weak CAS can fail spuriously and has plain/acquire/release/volatile variants. A retry loop handles
  spurious failure but does not add missing ordering.
- acquire update variants have acquire semantics for the read and plain semantics for the write;
  release variants have plain read and release write semantics. Confirm exact method docs.
- A failed conditional update performs no successful write/release publication. In particular,
  a failed release-only compare-and-exchange supplies only a plain witness read; consuming
  dependent data from it needs a proven acquire edge. Weak false can also be spurious.
- `getAndAdd`, bitwise and exchange variants are only supported for applicable variable types/modes.

VarHandle access-mode methods are signature-polymorphic. Default invocation permits documented
asType-style casts, boxing/unboxing and widening; `withInvokeExactBehavior()` requires the exact
access-mode descriptor. Coordinates, variable type and return type must satisfy the chosen
invocation behavior; failures can be `WrongMethodTypeException`, `ClassCastException`,
or `UnsupportedOperationException`. Check `isAccessModeSupported` when building generic adapters.
Support does not validate actual coordinates: backing storage, alignment, bounds and access rights
can still reject an invocation. In particular, JDK 23 changed byte-array and heap-buffer view
support; consult the access-mode reference before reusing an older protocol. Do not fall back to
plain access when the protocol requires acquire/release or volatile ordering.
Write access to read-only/final variables is unsupported for relevant handles.

## CAS-loop correctness

```text
read witness
derive candidate without irreversible side effects
attempt update with sufficient success/failure ordering
on mismatch/spurious failure: refresh, backoff/help/retry or fail
on success: publish/observe dependent state as proven
```

Candidate computation may repeat and its result may be discarded. Pure callbacks, or callbacks
whose actual contract tolerates repetition, are valid; charging on every attempt is not a safe
way to charge once per logical update. Distinguish attempt effects from logical-operation effects.
Moving an effect after successful CAS does not by itself provide durable exactly-once execution.
Bound or instrument retry where required; lock-free system progress can coexist with starvation
of one thread. Handle interruption/shutdown if the loop can run indefinitely.

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

For a generated-code claim, validate the compiled method/version, tier, inlining, surrounding
barriers and target architecture. For a contention or topology claim, measure that pattern;
a single-thread access loop cannot establish it.

## Proof and validation

Apply the steps needed for the actual claim. A source explanation, descriptor fix or adequate
existing protocol does not require every campaign below. An unaccounted access path is a proof
gap to resolve, not by itself an observed unsafe execution.

1. For a shared-state protocol, draw the JMM/VarHandle edges and enumerate outcomes before changes.
2. When exercising a model, use minimal jcstress actors and results; avoid synchronization from
   test infrastructure.
3. Where useful, weaken one edge as a negative control and check opportunity/sensitivity,
   without requiring an allowed bad outcome to appear on every machine.
4. Inspect compiled code when the claimed optimization depends on it.
5. For a performance decision, use JMH or appropriate measurements of the claimed access pattern,
   target environment and relevant contention/retry/false-sharing effects.
6. Test the semantic and lifecycle risks the change introduces, including wraparound, writer
   violations, cancellation or shutdown when those are part of the protocol.

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

- [ ] The answer addresses the actual API, correctness or performance objective; an adequate
      existing choice can remain.
- [ ] Relevant coordinates/types/supported modes and protocol access paths are accounted for.
- [ ] Shared-state claims explain writer count, publication and CAS success/failure; actual
      reuse/lifetime risks are addressed, with unresolved proof obligations explicit.
- [ ] Executed checks and outcomes are distinguished from source reasoning and proposed tests.
- [ ] Any codegen or performance claim is scoped to its JDK/JIT/architecture and workload.
- [ ] Validation covers the changed claim and relevant retry/progress/lifecycle risks.

## References

- [Access-mode selection and API matrix](references/access-mode-selection.md) — when choosing update modes or adapting coordinates/types.
- [Proving ordering and measuring cost](references/proving-ordering.md) — when defining litmus outcomes or validating a codegen/performance claim.
- [Java 25 `VarHandle`](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/lang/invoke/VarHandle.html)
- [JLS 17.4](https://docs.oracle.com/javase/specs/jls/se25/html/jls-17.html#jls-17.4)
- [JLS 17.7 non-atomic treatment of `double` and `long`](https://docs.oracle.com/javase/specs/jls/se25/html/jls-17.html#jls-17.7)
- [OpenJDK jcstress](https://github.com/openjdk/jcstress)
