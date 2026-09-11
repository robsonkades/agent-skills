# Version-scoped monitor lifecycle

## Stable semantic layer

Java monitors provide mutual exclusion, reentrancy, monitor happens-before, and wait/notify
semantics. These are language/API contracts. Fast-lock encodings, mark words, lock stacks,
`ObjectMonitor` queues, table ownership, spin policy and deflation are HotSpot implementation.

## Source-reading protocol

Identify the release/implementation first, then inspect the paths needed for the explanation:

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
monitor-table behavior into a single timeless state machine. The linked 25 GA sources are examples;
they do not establish which path a different vendor/update took. A source-scoped explanation can
finish from the relevant code. Logs, debugger state or other runtime evidence are needed only when
claiming that a particular execution followed that path or when the source alone cannot resolve it.

## Conceptual lifecycle

```text
unlocked object
  -> uncontended/reentrant fast ownership
  -> contention/wait/identity/diagnostic condition may require heavyweight monitor
  -> inflated monitor owns entry/wait/recursion state
  -> idle eligible monitor may later be deflated/reclaimed by runtime policy
```

Exact arrows and triggers are release-specific. Inflation races require ownership transfer/helping
that preserves exclusion; explain the relevant matching source protocol and distinguish it from
an observed runtime transition.

## Wait set versus entry contention

`Object.wait` requires ownership, releases the monitor while waiting, and reacquires before return.
Waiters and threads trying to enter are logically distinct populations even if implementation
queues interact. Notification does not transfer the lock or guarantee which waiter runs first.
Spurious wakeups require a predicate loop.

Only the waited-on object's monitor is released, including its recursive acquisitions;
other monitors held by the thread remain locked. This can deadlock a notifier that needs
one of those other locks to make the predicate true. Timeout, notification or interruption
does not remove the need to reacquire the waited-on monitor before the wait completes.
The timeout therefore does not bound total method-return latency. Preserve a predicate
loop and a remaining-time budget rather than restarting the full timeout on every wakeup.

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
- duration events for operations still in progress at capture end may not yet be committed;
  use thread/queue state for unresolved long waits rather than treating completed events
  as the entire contender population;
- implementation counters/flags can be diagnostic, unstable or removed.

## Authoritative references

- [OpenJDK 25 GA synchronization source example](https://github.com/openjdk/jdk/blob/jdk-25-ga/src/hotspot/share/runtime/synchronizer.cpp)
- [OpenJDK 25 GA object monitor implementation example](https://github.com/openjdk/jdk/blob/jdk-25-ga/src/hotspot/share/runtime/objectMonitor.cpp)
- [JEP 491](https://openjdk.org/jeps/491)
- [JLS 17.1–17.2 monitors/wait sets](https://docs.oracle.com/javase/specs/jls/se25/html/jls-17.html)
- [Java 25 Object.wait](<https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/lang/Object.html#wait(long)>) — release, reacquisition and timeout semantics.
