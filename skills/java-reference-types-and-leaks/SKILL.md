---
name: java-reference-types-and-leaks
description: >
  Reachability-driven memory in Java: the strong/soft/weak/phantom levels and exactly when
  each is cleared, WeakHashMap and its value-holds-key trap, Cleaner as a leak-reporting
  safety net rather than a release mechanism, why finalizers are gone, and the leak
  catalogue — obsolete references in self-managed structures, listener registries,
  ThreadLocal on pooled threads, class-loader retention, non-static nested classes holding
  their enclosing instance, and caches that only grow. Use when heap grows with traffic and
  never returns after a full GC, when a redeploy raises Metaspace, when someone proposes a
  WeakReference or SoftReference cache, when a Cleaner or finalize() appears, when a
  ThreadLocal has no remove(), or when "restarting fixes it" is the operating procedure.
  Does not cover deterministic release of open resources (java-resource-management), reading
  a heap dump (heap-dump-analysis), finding allocation sites (allocation-profiling), or
  off-heap and native memory (off-heap-memory).
---

# Java Reference Types and Leaks

## Purpose

Decide what keeps an object alive, and find the reference that should not. Two failure
modes: memory that grows with traffic because something the code no longer uses is still
reachable — which no GC tuning can fix — and reference types used as a design tool, where a
`SoftReference` cache or a `Cleaner` is trusted to bound memory or release a resource and
does neither predictably.

## Workflow

1. **Confirm it is retention, not throughput.** Compare live-set size after successive full
   collections. If the post-collection floor rises monotonically with traffic, it is
   retention. A high allocation rate with a flat floor is allocation-profiling's problem, not
   this skill's.
2. **Get the retaining path, not the biggest object.** A heap dump's dominator tree and
   _path to GC root_ answers "who is holding this"; the class histogram only says what is
   there. heap-dump-analysis owns the tool workflow. JFR's `jdk.OldObjectSample` gives the
   same answer with allocation stacks, from a running process, at a cost you can leave on.
3. **Match the path against the catalogue** in `references/leak-patterns.md`. Nearly every
   real leak is one of eight shapes, and each has a specific fix.
4. **Fix the ownership, not the symptom.** Bound the cache, remove the listener, `remove()`
   the ThreadLocal, null the slot in a self-managed array. Adding `-Xmx` or a weaker
   reference type moves the failure later.
5. **Verify against the floor.** Re-run the same load and compare the post-full-GC live set
   over time. "Heap looks better" is not a result.

## Rules

- Reachability, not usage, keeps objects alive. There is no "unused" state — an object
  referenced by a static field, a live thread's stack, a `ThreadLocal` value, or a class
  loader is live no matter how long since it was touched.
- Nulling references is for classes that _manage their own memory_ — an array-backed stack,
  ring buffer or pool, where the container knows an element is obsolete but the array still
  refers to it. Nulling ordinary local variables to "help GC" is noise: the scope ends and
  liveness analysis already handled it.
- Default to a bounded cache with an eviction policy, not to reference types. Size or time
  bounds are the thing that makes memory predictable; `SoftReference` delegates the decision
  to the collector, which clears under pressure — after already having done the collection
  work, and typically all at once, so the cache's hit rate falls off a cliff exactly when the
  system is busiest.
- `WeakHashMap` is for canonicalising maps whose keys have an independent lifetime, and only
  when key identity is what matters — it compares with `equals`, but a key nobody else holds
  disappears whether or not an equal key exists. It leaks whenever the _value_ references
  its own key, directly or transitively, because that makes the key strongly reachable.
- Never use `finalize()`. It is deprecated for removal (JEP 421), can already be turned off
  at runtime with `--finalization=disabled`, runs on an unspecified thread with no ordering
  or timeliness guarantee, resurrects objects, and delays reclamation by at least one extra
  collection cycle.
- `Cleaner` is a _safety net that reports a bug_, not a release mechanism. Register one only
  for native or OS resources whose leak is otherwise invisible, have the action log loudly,
  and keep `close()` as the real path. The cleaning action must not capture the registered
  object — a lambda that touches any instance field keeps it strongly reachable and the
  cleaner can never run.
- A `ThreadLocal` on a thread that outlives the request — a servlet-container pool, a shared
  executor, a `ForkJoinPool` — retains its value until the thread dies or the entry is
  overwritten. `remove()` in a `finally` at the end of the request scope is the contract;
  stale-entry cleanup by the map itself happens only opportunistically on later operations
  and cannot be relied on.
- On virtual threads the retention profile inverts: each virtual thread has its own map that
  dies with it, so the pooled-thread leak disappears, but a per-thread value now exists once
  per _task_, and there may be millions of tasks. Request context there wants `ScopedValue`,
  which is immutable, lexically bounded and inherited by structured forks — see
  scoped-values.
- A non-static nested class, and an anonymous class or lambda that touches an instance
  member, can hold a reference to the enclosing instance. When such an object outlives its
  creator — stored in a registry, a cache, a scheduled task, or a long-lived callback — the
  whole enclosing object graph goes with it. Make the nested class `static` and pass what it
  needs explicitly.
- Metaspace that grows across redeploys, and old application classes surviving a redeploy,
  is a class-loader leak: something in a longer-lived loader still references an application
  class. The usual holders are static registries, `ThreadLocal` values on container threads,
  JDBC drivers, shutdown hooks and unremoved listeners.
- A distributed system hides leaks and then reveals them all at once. Per-replica heap growth
  looks like a healthy rolling restart until traffic shifts to fewer replicas or a deploy
  freezes; "it recovers after a restart" is a leak diagnosis, not a mitigation.

## References

- [Reachability, reference types and Cleaner](references/reachability-and-cleaners.md) —
  read when choosing between strong, soft, weak and phantom references, when reviewing a
  `WeakHashMap` or reference-based cache, or when writing or reviewing a `Cleaner`.
- [The leak catalogue and how to prove one](references/leak-patterns.md) — read when the
  heap floor is rising, when Metaspace grows across redeploys, or when a suspected leak needs
  to be turned into a named retaining path and a verified fix.
