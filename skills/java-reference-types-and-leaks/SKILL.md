---
name: java-reference-types-and-leaks
description: >
  Reachability-driven memory in Java: strong/soft/weak/phantom contracts and notification
  limits, WeakHashMap and its value-holds-key trap, explicit Cleaner cleanup versus
  automatic fallback, finalization deprecation, and the leak
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
`SoftReference` cache or automatic `Cleaner` fallback is trusted to provide a capacity or
release deadline it does not guarantee. Retain an existing design when its ownership and
memory budget are already satisfied.

## Workflow

Inspect the exact JDK/vendor/build, collector, JVM flags, recording settings and workload
before version-sensitive claims. References use JDK 25; the Cleaner sketch needs Java 9+,
and `--finalization=disabled` Java 18+. Preserve the project's target. Virtual threads and
ScopedValue require their own target-release checks; do not upgrade or enable preview.
If retaining paths or comparable reclamation points are missing, report a hypothesis and
the evidence needed rather than declaring a leak or verified fix. Reuse available captures
and ownership requirements; ask only for missing information that changes the diagnosis or fix.

1. **Confirm a retention hypothesis, not merely occupancy.** Compare equivalent
   post-reclamation points under normalized load/cache/topology. A rising floor means more
   remains reachable; it does not by itself say “defect.” Avoid forced Full GC on a serving
   instance unless its pause and side effects are explicitly accepted.
2. **Get the retaining path, not the biggest object.** A heap dump's dominator tree and
   _path to GC root_ answers "who is holding this"; the class histogram only says what is
   there. heap-dump-analysis owns the tool workflow. JFR's `jdk.OldObjectSample` gives the
   complementary sampled evidence from a running process. Its stacks/path settings,
   overhead and collector-specific behavior must be verified before continuous use.
3. **Match the path against the catalogue** in `references/leak-patterns.md`. These are
   starting hypotheses; investigate an unlisted owner when the evidence points elsewhere.
4. **Fix a demonstrated ownership mismatch.** Bound a disposable cache, deregister the
   listener, remove or restore the owned ThreadLocal binding, or clear an obsolete array
   slot. Weaker references are appropriate only when collection matches the value's contract;
   a larger heap does not repair an unwanted retaining path.
5. **Verify against the ownership and capacity contract.** Under equivalent conditions,
   the former retaining path/count should stop unbounded growth and the service must still
   meet relevant latency/throughput budgets. Report the owner/path, violated contract,
   correction and check results, or the supported no-change/conditional conclusion and
   bounded next evidence step. “Heap looks better” is not a result.

## Rules

- Follow an actual strong path from a GC root through live stack references, reachable
  static fields or thread-local values. A cycle within an otherwise unreachable application
  loader is not itself a root; lexical local-variable scope is not a guaranteed lifetime.
- Nulling references is for classes that _manage their own memory_ — an array-backed stack,
  ring buffer or pool, where the container knows an element is obsolete but the array still
  refers to it. Do not routinely null ordinary locals: inspect actual liveness if a
  long-running method retains a large obsolete value.
- Default to a bounded cache with an eviction policy, not to reference types. Size or time
  bounds help make retention predictable; expiry alone cannot bound memory under unlimited
  arrivals/value sizes. Set entry/weight limits and account for payload size. `SoftReference`
  delegates eviction to the collector; clustered clearing can raise refill demand. The
  hit-rate and origin impact depend on access distribution, GC policy and refill capacity.
- `WeakHashMap` is for mappings whose key reachability elsewhere controls entry lifetime,
  with stable `equals`/`hashCode` semantics. It is not an identity map: an equal lookup can
  find an entry, while the particular stored key can still disappear when no strong owner
  retains it. It retains entries whenever the _value_ references
  its own key, directly or transitively, because that makes the key strongly reachable.
- Never use `finalize()`. It is deprecated for removal (JEP 421), can already be turned off
  at runtime with `--finalization=disabled`, runs on an unspecified thread with no ordering
  or timeliness guarantee, can resurrect objects and delay reclamation. Do not infer a portable
  fixed number of collection cycles from this mechanism.
- `Cleaner` can implement explicit release via `Cleanable.clean()` plus best-effort automatic
  cleanup/reporting where useful. Keep `close()` as the owned release path; automatic
  execution has no deadline. The cleaning action must not capture the registered
  object — a lambda that touches any instance field keeps it strongly reachable and the
  automatic action cannot run while that capture remains. At-most-once invocation is not
  a use-versus-close protocol or a guarantee that another caller's cleanup has completed.
- A `ThreadLocal` on a thread that outlives the request — a servlet-container pool, a shared
  executor, a `ForkJoinPool` — can retain its value beyond the request. Remove an owned
  top-level binding in `finally`; nested/reentrant scopes must restore the outer binding.
  Stale-entry cleanup by the map itself happens only opportunistically on later operations
  and cannot be relied on.
- Thread termination releases its ThreadLocal map, including on virtual threads; still-live
  or blocked tasks can retain values, and per-task caches may multiply retention. Consider
  supported `ScopedValue` for dynamically scoped context; retain ThreadLocal where the actual
  per-thread or framework contract requires it. Binding/inheritance choices belong to scoped-values.
- A non-static nested class, and an anonymous class or lambda that touches an instance
  member, can hold a reference to the enclosing instance. When such an object outlives its
  creator — stored in a registry, a cache, a scheduled task, or a long-lived callback — the
  enclosing graph can go with it. If that ownership is unwanted, narrow the capture, shorten
  registration lifetime, or make the nested class `static` and pass only what it needs.
- Metaspace growth and old application classes after redeploy suggest loader retention;
  confirm an unwanted root path and class-unloading/GC opportunity before declaring a leak.
  The usual holders are static registries, `ThreadLocal` values on container threads,
  JDBC drivers, shutdown hooks and unremoved listeners.
- Restarts can mask per-replica retention until traffic concentrates or deploy cadence
  changes. “It recovers after restart” is evidence of process-lifetime state, not proof of a
  leak; bounded caches, fragmentation and load reset can look similar. Preserve evidence
  and test the ownership/capacity hypothesis before institutionalizing restarts.

## References

- [Reachability, reference types and Cleaner](references/reachability-and-cleaners.md) —
  read when choosing between strong, soft, weak and phantom references, when reviewing a
  `WeakHashMap` or reference-based cache, or when writing or reviewing a `Cleaner`.
- [The leak catalogue and how to prove one](references/leak-patterns.md) — read when the
  heap floor is rising, when Metaspace grows across redeploys, or when a suspected leak needs
  to be turned into a named retaining path and a verified fix.
