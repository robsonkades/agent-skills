# Documenting thread safety

## Public contract example

This is a proposed contract sketch, not an implemented registry. A point-in-time immutable view
requires one coherent capture and immutable/copied element state, not merely an unmodifiable map.

```java
/**
 * Thread-safe session registry.
 *
 * <p>{@code put}, {@code remove}, and {@code find} are individually atomic. {@code snapshot}
 * returns one immutable point-in-time view. Listener callbacks run synchronously on the mutating
 * caller after the mutation is visible and after the internal lock is released. Callback failure
 * is aggregated and does not roll back the registry mutation. Concurrent callers' callbacks may
 * overlap or arrive out of mutation order; callback reentry is allowed and sees current state.
 * No fairness guarantee is made.
 */
public final class SessionRegistry { }
```

This says more than “thread-safe”: atomic boundary, consistency, callback thread/order/lock state,
failure semantics, and progress.

## Contract checklist

Document where relevant:

- which operations can overlap and which are linearizable/atomic;
- compound methods supplied versus unsupported external sequences;
- snapshots, weakly consistent iteration, live views and staleness;
- ownership of returned/accepted mutable values;
- blocking, fairness, starvation and interruptibility;
- callbacks: executor/thread, ordering, lock state, reentrancy, exception handling;
- close/shutdown behavior and calls racing with close;
- safe publication and framework singleton/request/task scope;
- external synchronization lock identity and duration, if part of API.

Do not promise “any method in any order.” APIs retain preconditions and lifecycle rules even when
thread-safe.

## Publication and mutable payload ownership

Follow the object's lifetime through constructors/setters, retained aliases, accessors, task
submission and any pool return. A concurrent container's protocol protects its documented
operations; it does not automatically govern later reads/writes through references to its values.
For a `BlockingQueue`, writes before insertion are published to the receiving thread through the
documented happens-before edge. Mutation after insertion needs its own ownership or synchronization
protocol. A queue does not create an immutable snapshot of the element.

For example, a producer fills a `byte[]`, enqueues it, then refills the same array for the next
record. A delayed consumer can read the replacement bytes even though every queue operation is
thread-safe. Establish the required observation: the accepted record's bytes, a later shared view,
or explicitly approximate data. For the accepted-record contract, choose among:

- copy while the source is stable, then publish and protect ownership of the copy;
- transfer exclusive use of the original; the producer and its aliases stop using it;
- a shared protocol that preserves the required version and coordinates every relevant access.

Copying while another thread mutates the source is not a coherent-snapshot guarantee. Adding a
volatile reference, using a concurrent map, or locking only the producer does not fix an unprotected
payload. Conversely, proven exclusive transfer need not acquire a new lock or make a defensive copy.

If pooled storage is reused, define who releases it and the completion signal ordering reuse after
the **last** consumer access, including retained callbacks. Successful enqueue or removal from the
queue is not proof that processing has finished. Specify ownership when insertion is rejected or
interrupted using the selected API's contract; do not recycle a successfully handed-off value early.

Where this lifetime is uncertain, inspect the concrete producer/consumer and recycling paths before
classifying the abstraction. A focused negative check delays the consumer while the producer follows
its documented reuse policy and checks the consumer's record content. An exclusive-transfer or
stable-copy control should preserve that content. Such a schedule exposes a lifetime counterexample;
it is not a general memory-model proof or an executed test merely because it is described here.

## Guard documentation

`@GuardedBy` can make a lock policy mechanically reviewable when the chosen annotation/analyzer is
configured. Record exact semantics (`this`, field name, class lock) and tool support; annotations
are not enforced by Java itself. A field can also be confined, immutable, volatile/atomic or owned by
a state machine—do not annotate everything as if a monitor were the only protocol.

## Views and iteration

For each returned collection/iterator/stream:

```text
snapshot or live?
point-in-time, weakly consistent or fail-fast?
mutable by caller?
does traversal require external lock, and which one?
can callbacks/lazy stream evaluation occur after lock release?
```

Fail-fast exceptions are bug detection, not a concurrency guarantee. Copying a snapshot costs time
and allocation and changes freshness; choose deliberately.

## Framework scope

Singleton services/handlers are normally shared, but verify framework scope/proxy lifecycle.
Request-scoped objects can still be used concurrently by fan-out. Thread-local confinement can be
broken by callbacks and executor handoff. Document logical owner rather than relying on annotation
names.

## Review record

```text
contract classification:
state and owner:
atomic operations/invariants:
publication/access protocol:
consistency/views:
progress/fairness:
callbacks/errors:
lifecycle/close:
tests/analyzers and limitations:
```

## Authoritative references

- [Java concurrency API](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/util/concurrent/package-summary.html)
- [BlockingQueue memory consistency and insertion results](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/util/concurrent/BlockingQueue.html) — publication applies to actions before insertion; acceptance and element processing are separate operations.
- [JLS 17](https://docs.oracle.com/javase/specs/jls/se25/html/jls-17.html)
