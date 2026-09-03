# Documenting thread safety

## Public contract example

```java
/**
 * Thread-safe session registry.
 *
 * <p>{@code put}, {@code remove}, and {@code find} are individually atomic. {@code snapshot}
 * returns one immutable point-in-time view. Listener callbacks run synchronously on the mutating
 * caller after the mutation is visible and after the internal lock is released. Callback failure
 * is aggregated and does not roll back the registry mutation. No fairness guarantee is made.
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
- [JLS 17](https://docs.oracle.com/javase/specs/jls/se25/html/jls-17.html)
