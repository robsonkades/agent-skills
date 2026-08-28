---
name: varhandles-and-memory-ordering
description: >
  VarHandle access modes and explicit memory ordering: plain, opaque, acquire/release and
  volatile, choosing the weakest sufficient mode, compareAndSet versus weakCompareAndSet and
  compareAndExchange, the four hardware barrier kinds, and what each mode costs on x86
  versus aarch64. Use when replacing volatile with setRelease and getAcquire, when a field
  is both declared volatile and accessed through a VarHandle, when the same field is written
  plain on one path and release on another, when a concurrency bug appears only on Graviton
  or Apple Silicon and never on x86, when compareAndExchange is assigned to a boolean, or
  when someone proposes -XX:+StressGCM to expose an ordering race. Does not cover
  happens-before, safe publication and the correctness contract (java-memory-model), the
  algorithms built on these primitives (lock-free-patterns), or cache coherency and
  cache-line effects (cpu-cache-and-numa).
---

# VarHandles and Memory Ordering

## Purpose

Pick the weakest access mode that still makes the algorithm correct, and prove the choice
rather than assume it. The failure this skill prevents is the ordering downgrade that
compiles, passes every test on x86, and corrupts data on aarch64 — because x86's Total
Store Order masks exactly the reordering that `acquire`/`release` no longer forbids.

`VarHandle` introduces no new memory model. It exposes finer control over the same one, so
each mode buys a specific guarantee rather than generic speed: opaque buys atomicity
without ordering; acquire/release buys ordering between one write and one read of the same
variable; volatile buys that plus a total synchronisation order.

## Workflow

1. **Classify the access pattern before choosing a mode.** Single writer with a data
   handoff, single writer with a bare flag, multiple concurrent writers, a high-contention
   counter, or two variables each read by the thread that did not write it — the pattern
   selects the mode. See `references/access-mode-selection.md`.
2. **Ask whether the algorithm needs a total order across different variables.** If two
   threads each write one variable and read the other, acquire/release is not enough and
   never will be. That case needs volatile mode on both sides.
3. **Anchor the data on both sides.** The producer writes the data _before_ `setRelease`;
   the consumer reads the anchor with `getAcquire` _before_ the data. Inverting either side
   breaks the chain and both the JIT and the hardware are free to reorder again.
4. **Make the mode consistent per field.** Ordering is a property of the operation, not of
   the field. One plain write path defeats every release write path to the same field.
5. **Handle the CAS return value correctly.** `compareAndSet` reports success as a boolean;
   `compareAndExchange*` returns the witnessed value instead. Check which one the call site
   is using before treating the result as a success flag.
6. **Prove the ordering with jcstress**, enumerating the possible outcomes on paper before
   marking one `FORBIDDEN`. Confirm the emitted barrier with `-XX:+PrintAssembly`. See
   `references/proving-ordering.md`.
7. **Measure the gain on the target architecture** with JMH before keeping the weaker mode.
   On x86 the gain exists only on writes; on aarch64 it usually does not exist at all.

## Rules

- Never publish data with a plain `set` on the anchor. `data = 42; VH.set(this, true);`
  followed by a plain-read spin loop is unsafe; the pair is `setRelease` on the write and
  `getAcquire` on every read.
- Never declare a field `volatile` and also access it through `setRelease`/`getAcquire`/
  `setVolatile`/`getVolatile`. It is redundant, and it hides which guarantee is actually in
  force. Pick one mechanism per field.
- Every write path to an ordered field must use the ordered mode. A `setRelease` on path A
  guarantees nothing about path B's plain `set` to the same field.
- Do not substitute acquire/release for volatile in a store-buffering shape. With
  `setRelease`/`getAcquire` on both sides, the `(0, 0)` outcome remains legal — acquire and
  release create a pairwise happens-before chain, not a total order across variables.
- Under x86 TSO the only permitted reordering is **StoreLoad**: a _later load_ from a
  different address may be observed _before_ an earlier store, because the store sits in
  the store buffer while the load completes from cache. Stating it as "a store can move
  ahead of an earlier load" inverts the mechanism and predicts the barrier on the wrong
  side — the StoreLoad barrier is always emitted on the **write**.
- Consequently, on x86 an `acquire` or `volatile` read and a `release` write compile to a
  plain `mov`; only the `volatile` write pays `lock addl $0x0,(%rsp)` or `mfence`. On
  aarch64 the asymmetry vanishes — `ldar` and `stlr` carry the barrier, so acquire/release
  and volatile cost the same. Do not claim a win on aarch64 without measuring it.
- Treat the x86 "free release" as a HotSpot C2 implementation detail, not a specification
  guarantee. The JLS promises happens-before, not a cost. Another JDK build or another JIT
  may codegen differently and still be correct.
- Never quote third-party cycle counts for barriers as fact. They vary with CPU generation,
  cache-line temperature and inter-core contention. Measure on the target machine.
- `compareAndExchange*` returns the **witnessed value**, not a boolean — success is
  `witness == expected`. Only `compareAndSet` returns success directly. Assigning
  `compareAndExchangeAcquire` to a `boolean` does not compile.
- `weakCompareAndSetPlain` is not a cheaper `compareAndSet`. It may fail spuriously, which
  a retry loop handles, and its _success_ establishes no ordering at all, which a retry
  loop does not handle. A lock acquisition needs at least `weakCompareAndSetAcquire`.
- Document the single-writer assumption explicitly wherever a pattern depends on it
  (Seqlock, ring buffer). Concurrent writers there corrupt data silently — no exception, no
  log entry.
- `-XX:+StressGCM` randomises Global Code Motion inside one compiled method. It does not
  simulate inter-thread reordering and verifies nothing about the memory model. It is not
  evidence about an ordering bug either way; jcstress is.
- In an incident, remember JFR shows contention, not races. An ordering bug can produce no
  contention at all.

## References

- [Access mode selection](references/access-mode-selection.md) — the decision tree from
  access pattern to mode, the situation-to-mode matrix with the reason for each row, the
  correct API surface and return types, and the release/acquire publication template. Read
  when choosing or reviewing an access mode.
- [Proving ordering](references/proving-ordering.md) — the jcstress harness for a
  publication chain, the `-XX:+PrintAssembly` recipe and the exact instructions to look
  for per architecture, the JMH access-mode benchmark, and the code-review and incident
  checklists. Read before claiming an ordering change is safe or that a weaker mode is
  faster.
