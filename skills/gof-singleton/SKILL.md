---
name: gof-singleton
description: >
  Singleton in modern Java, treated as a high-risk pattern: it conflates "one instance" with
  "reachable from anywhere", which must be justified separately. Covers why dependency
  injection gives uniqueness as a consequence of wiring, the scale ladder showing a Java
  singleton is unique per class loader and never per cluster, the safe lazy-initialisation
  idioms and the class-initialisation deadlock they invite, the static-state leakage that makes
  tests order-dependent, and the distributed mechanisms that give system-wide singularity. Use
  when getInstance() appears, when a scheduled job must run once across replicas, when someone
  says "singleton" meaning Spring's singleton scope, when tests pass alone and fail together, or
  when a cache or registry is being made global. Does not cover shared immutable instances for
  memory (gof-flyweight), wiring in general (java-dependency-inversion), cluster-wide leadership
  (leader-election), or once-only scheduling across replicas (distributed-locks-and-leases).
---

# Singleton

## Purpose

Justify instance uniqueness and global access separately. Static access can hide collaborators,
couple initialization and test lifetimes, and imply a scope the implementation does not enforce.
It can also preserve a deliberate canonical token or supported API. Inspect ordinary callers,
external consumers and failure/test behavior before prescribing removal.

Compare an owned instance passed directly or through DI with the existing accessor. Injection
does not require a new interface and does not itself prevent other construction. Reuse known
scope and wiring; ask only for unresolved creation, identity or lifecycle requirements that could
change the choice. Retain an adequate mechanism and state what would justify changing it.

Inspect compiler/toolchain, container definitions and deployment topology first. Implementation
examples use Java 17 without preview; ScopedValue is final in Java 25 and represents dynamic
context binding, not instance uniqueness. Do not upgrade a project to adopt an idiom.

## The uniqueness ladder

```text
Thread binding  ThreadLocal (not a uniqueness guarantee)
Dynamic scope   ScopedValue (may share the same value across structured forks)
Defining class loader    a static field — the same class may exist in several loaders
Process (JVM)   a static field, if one class loader; a DI container's
                singleton scope, if one relevant bean definition/container
Container/pod   inspect actual processes/containers; pod membership adds no uniqueness
Node            an OS-coordinated lock/socket, with stale-owner and namespace handling
Cluster         leader election or a distributed lock with a lease
Region          the above, plus a consensus system that spans zones
System          a protocol and authority boundary, not a language primitive
```

A conventional static `getInstance()` is bounded by the defining class loader. A requirement for
a horizontally scaled service — one scheduler, one cache warmer, one sequence generator, one
outbox relay — needs an explicit coordination/effect contract, and no amount of `static` will produce it
(`leader-election`,
`distributed-locks-and-leases`).

Spring singleton scope is one instance per bean definition per container, not per type/JVM.
Two definitions of the same class can produce two instances in one context; child contexts may
inherit a parent's bean or define their own. DI avoids global access only when callers actually
receive dependencies rather than consulting a static service locator.

## When it is the answer

```text
The type is a stateless, immutable value or function, and passing it
around is genuinely noise
        → an enum constant or static final field may suffice; preserve a supported
          accessor and required canonical identity rather than changing syntax alone.

The hosting API owns creation and offers no injection point, while one
process-wide adapter must coordinate access to a JVM/native facility
        → a singleton bridge may be justified; hosting does not itself prove
          uniqueness (ServiceLoader, for example, can return many providers).

A framework or legacy call site cannot be given a dependency and must
reach one
        → an explicit compatibility bridge; retain it for its supported lifetime,
          or plan removal when actual consumers and ownership permit it.
```

## When it is not

- **"Configuration should exist once."** Inspect required scope, reload/snapshot policy and
  actual definitions. An owned injected instance may meet the need without global access.
- **"Creating it is expensive."** That argues for creating it once, which is what a bean or a
  field already does. It does not argue for reaching it statically.
- **"Everything needs it."** A dependency that everything needs is still a dependency; making it
  invisible does not reduce coupling, it only stops the compiler from showing it.
- **A cache or registry with no state/lifetime owner.** Inspect retention, consistency and
  concurrent access; define ownership and pass the existing instance where appropriate
  (`caching-strategies`). The name alone does not prove those policies are missing.
- **Anything that must be unique across replicas.** See the ladder above.
- **An uncoordinated per-process counter used as a global id.** Replicas/restarts can reuse values;
  inspect the actual allocation/collision protocol before replacing a valid id generator.

## Decision rules

```text
IF the requirement is stated as "only one X"
THEN establish "one per what?" from available evidence and place it on the ladder.

IF the answer is cluster or system
THEN a local singleton cannot provide that authority. Compare actual coordination
     and effect contracts; idempotency handles repeated logical effects, not
     conflicting distinct operations or leadership (idempotency).

IF the type has mutable state and is reached statically
THEN it is global mutable state. Every thread-safety argument must be
     made explicitly. Tests must isolate or restore the state they own without
     resetting a live shared instance under other users.

IF a singleton is being added so that code can reach a collaborator
THEN compare passing the collaborator with any required static compatibility or
     canonical-identity contract. A concrete type or existing interface may suffice.

IF lazy initialisation is required
THEN compare holder/enum initialization with an adequate synchronized accessor
     and the required failure/lifetime policy. The shown classic DCL idiom needs
     volatile publication; do not replace a correct simple accessor without cause.

IF the singleton's initialiser touches another class's static initialiser
THEN inspect cycles and blocking: cross-class initialization alone is normal,
     but circular waits between initializing threads can deadlock. Avoid cyclic
     initialization and keep fallible/blocking acquisition in an owned lifecycle.

IF tests need a reset() method on it
THEN treat that as evidence of hidden mutable lifetime. Prefer an owned instance;
     when legacy migration requires reset, synchronize it, constrain it to tests,
     and prevent parallel-test interference.

IF an enum is used purely as a namespace for one instance holding
mutable state
THEN its standard serialization/reflective-construction identity guarantees may
     still matter; they do not establish safe access to that mutable state.
```

## Cross-cutting checks

- **Concurrency.** Uniqueness does not imply thread safety. Determine which threads access each
  mutable field and the synchronization/ownership protocol; contention requires actual competing
  access. Publication of the instance itself must be safe — the holder idiom and `enum` get
  this from class-initialisation semantics; a plain `if (instance == null)` does not, and
  the shown classic DCL needs `volatile` or a separately proven publication protocol
  (`java-memory-model`).
- **Distribution.** Local state remains local. N independent pools or limiters with equal limits
  have an aggregate configured ceiling of N times that limit, not necessarily observed usage.
  Budget rollout overlap and other clients; inspect actual demand before attributing exhaustion
  (`connection-pool-sizing`, `rate-limiting-and-load-shedding`).
- **Performance.** A contended `synchronized getInstance()` on a hot path can add latency; modern
  JVMs can make uncontended locking cheap; the holder needs no application lock per access. The
  larger effect may be contention within shared state. Measure competing access and the actual
  bottleneck before choosing partitioning, less sharing or lock changes
  (`false-sharing-and-contended`, `lock-inflation`).
- **Testing.** Static state survives while the same defining class remains live. It can cause
  order/parallel interference, but these symptoms also have other causes; reproduce the failure.
  The absence of a constructor parameter also means a test cannot substitute the collaborator
  through constructor injection; legacy seams, wrappers or isolated processes may help during
  migration (`java-test-design`).

## Review checklist

Return the required scope, actual creation/call sites, owner and close/retry policy, chosen
mechanism and observed checks versus pending. Missing topology or external callers leaves
uniqueness and removal safety conditional.

- [ ] "One per what?" is answered explicitly and matches the mechanism used
- [ ] Nothing that must be unique across replicas relies on a static field
- [ ] Mutable state has an explicit ownership/synchronization contract
- [ ] Initialization has a valid publication protocol; no unguarded classic DCL or race
- [ ] Static initialization avoids cyclic/wait dependencies; owned acquisition has a failure policy
- [ ] Legacy resets are isolated from concurrent tests and tracked for removal
- [ ] Owned-instance/injection alternatives were compared with any required global-access contract
- [ ] Spring lifecycle scope is distinguished from global access and actual construction count

## References

- [Uniqueness and scope](references/uniqueness-and-scope.md) — the ladder in full: what mechanism
  provides uniqueness at each level, what defeats it (class loaders, multiple contexts, replicas,
  restarts), and the distributed alternatives with their failure modes — leases expiring,
  split-brain, and why idempotency often removes the requirement. Read whenever "there must be
  only one" is stated.
- [Implementation and migration](references/implementation-and-migration.md) — enum, holder
  idiom and double-checked locking compared with their exact guarantees, the class-initialisation
  deadlock, reflection and serialisation attacks on the invariant, and a step-by-step migration
  off an entrenched singleton without a big-bang change. Read when implementing or removing one.
