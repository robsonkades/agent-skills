# Version-scoped monitor lifecycle

## Stable semantic layer

Java monitors provide mutual exclusion, reentrancy, monitor happens-before, and wait/notify
semantics. These are language/API contracts. Fast-lock encodings, mark words, lock stacks,
`ObjectMonitor` queues, table ownership, spin policy and deflation are HotSpot implementation.

## Source-reading protocol

For an internals explanation:

```text
exact JDK vendor/build/architecture and flags
matching OpenJDK/vendor tag and commit
mark-word/locking mode representation
fast enter/exit implementation and generated code
inflation triggers and owner-transfer protocol
ObjectMonitor entry/wait structures and park/unpark path
async/safepoint deflation and observability
virtual-thread mount/unmount integration
```

Do not combine one release's `LockStack`, another release's `ANONYMOUS_OWNER`, and a third release's
monitor-table behavior into a single timeless state machine.

## Conceptual lifecycle

```text
unlocked object
  -> uncontended/reentrant fast ownership
  -> contention/wait/identity/diagnostic condition may require heavyweight monitor
  -> inflated monitor owns entry/wait/recursion state
  -> idle eligible monitor may later be deflated/reclaimed by runtime policy
```

Exact arrows and triggers are release-specific. Inflation races require ownership transfer/helping
that preserves exclusion; explaining them requires the matching source and logs/debugger evidence.

## Wait set versus entry contention

`Object.wait` requires ownership, releases the monitor while waiting, and reacquires before return.
Waiters and threads trying to enter are logically distinct populations even if implementation
queues interact. Notification does not transfer the lock or guarantee which waiter runs first.
Spurious wakeups require a predicate loop.

## Identity hash and headers

Identity hash, compressed/compact object headers, collector forwarding, and monitor representation
interact differently across HotSpot releases. Avoid statements such as “inflated monitor pointer is
always stored in the mark word.” Inspect effective compact-header/collector/locking features and
the matching JEP/source.

## Diagnostics limitations

- an object may remain inflated after active contention stops;
- event stacks often identify waiter/acquisition site better than owner hold duration;
- object addresses/identities in artifacts can be reused or represented differently over time;
- thread dumps are snapshots and may omit short waits or require virtual-thread-specific commands;
- thresholded events censor the distribution;
- implementation counters/flags can be diagnostic, unstable or removed.

## Authoritative references

- [OpenJDK synchronization source](https://github.com/openjdk/jdk/tree/master/src/hotspot/share/runtime)
- [OpenJDK object monitor implementation](https://github.com/openjdk/jdk/blob/master/src/hotspot/share/runtime/objectMonitor.cpp)
- [JEP 491](https://openjdk.org/jeps/491)
- [JLS 17.1–17.2 monitors/wait sets](https://docs.oracle.com/javase/specs/jls/se25/html/jls-17.html)
