---
name: gof-singleton
description: >
  Singleton in modern Java, treated as a high-risk pattern: it conflates "one instance" with
  "reachable from anywhere", and only the second is usually wanted. Covers why dependency
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

Treat this pattern as a request to justify global state. Singleton bundles two separate
decisions — _there is one instance_ and _anyone can reach it without being given it_ — and the
second is what causes the damage. It hides dependencies from constructors, so a type's real
collaborators are invisible; it fixes initialisation order in ways nobody chose; it makes tests
order-dependent; and it silently promises a uniqueness that stops at the class loader.

Almost always the requirement is "one instance", and dependency injection delivers exactly that
by constructing one and wiring it. The instance is then unique because nothing else makes one —
without any type having to enforce it, and without any caller reaching around its constructor.

## The uniqueness ladder

```text
Thread          ThreadLocal / ScopedValue
Class loader    a static field — THIS is what a Java singleton gives you
Process (JVM)   a static field, if one class loader; a DI container's
                singleton scope, if one container
Container/pod   the process, restated — one JVM per pod by convention
Node            a file lock, a unix socket, a pid file
Cluster         leader election or a distributed lock with a lease
Region          the above, plus a consensus system that spans zones
System          does not exist as a primitive; it is designed, not declared
```

A `getInstance()` gives you row two. Every requirement expressed as "there must be only one" in
a horizontally scaled service — one scheduler, one cache warmer, one sequence generator, one
outbox relay — needs row six or seven, and no amount of `static` will produce it. This is the
single most expensive misunderstanding in this pattern (`leader-election`,
`distributed-locks-and-leases`).

Spring's `@Scope("singleton")` is row three at most: one instance _per application context_.
Two contexts in one JVM — common in tests — give two instances. It is a lifecycle scope, not
this pattern, and it carries none of the global-access problems because nothing calls a static.

## When it is the answer

```text
The type is a stateless, immutable value or function, and passing it
around is genuinely noise
        → an enum constant or a static final field. Not getInstance().

The JVM itself requires singularity: a java.lang.instrument agent, a
shutdown hook, a ServiceLoader provider, a JNI/FFM library binding
        → Singleton, because there is no injection point.

A framework or legacy call site cannot be given a dependency and must
reach one
        → Singleton as a bridge, marked as such, with a plan to remove it.
```

## When it is not

- **"Configuration should exist once."** It does — the container creates one and injects it. The
  requirement was access, not uniqueness.
- **"Creating it is expensive."** That argues for creating it once, which is what a bean or a
  field already does. It does not argue for reaching it statically.
- **"Everything needs it."** A dependency that everything needs is still a dependency; making it
  invisible does not reduce coupling, it only stops the compiler from showing it.
- **A cache or registry.** Global mutable state under concurrency, with no eviction policy and
  no owner. Give it an owner and inject it (`caching-strategies`).
- **Anything that must be unique across replicas.** See the ladder above.
- **Counters, sequence numbers, id generators.** Process-local uniqueness produces colliding ids
  the day a second replica starts.

## Decision rules

```text
IF the requirement is stated as "only one X"
THEN ask "one per what?" and place it on the ladder before designing.

IF the answer is cluster or system
THEN this pattern is irrelevant. Use leader election, a lease, or make
     the operation idempotent so multiplicity stops mattering (idempotency).

IF the type has mutable state and is reached statically
THEN it is global mutable state. Every thread-safety argument must be
     made explicitly, and every test must undo it.

IF a singleton is being added so that code can reach a collaborator
THEN pass the collaborator. The singleton is solving a plumbing problem
     by removing the plumbing from view.

IF lazy initialisation is required
THEN use the holder idiom or an enum. Double-checked locking is correct
     only with a volatile field and is rarely worth the risk.

IF the singleton's initialiser touches another class's static initialiser
THEN two threads can deadlock on class initialisation locks. Keep static
     initialisers free of cross-class work and of I/O.

IF tests need a reset() method on it
THEN the design has already failed; the reset is a confession, not a fix.

IF an enum is used purely as a namespace for one instance holding
mutable state
THEN the serialisation and reflection safety it buys is irrelevant, and
     the global-state cost remains.
```

## Cross-cutting checks

- **Concurrency.** Uniqueness and thread safety are unrelated: a singleton is one instance
  shared by every thread, which makes any mutable field in it a contended, visibility-sensitive
  variable. Publication of the instance itself must be safe — the holder idiom and `enum` get
  this from class-initialisation semantics; a plain `if (instance == null)` does not, and
  double-checked locking without `volatile` is broken on every JVM
  (`java-memory-model`).
- **Distribution.** Process-local, always. A singleton connection pool, rate limiter or
  scheduler becomes N of them under horizontal scaling, and the resulting limit is N times what
  was configured — a common cause of exhausting a database's connection limit after a scale-up
  (`connection-pool-sizing`, `rate-limiting-and-load-shedding`).
- **Performance.** A `synchronized getInstance()` on a hot path is real contention; the holder
  idiom removes it at zero cost. The larger effect is indirect: a single shared mutable
  structure becomes the contention point for the whole application, and no amount of lock
  tuning fixes a design that funnels every thread through one object
  (`false-sharing-and-contended`, `lock-inflation`).
- **Testing.** Static state survives between tests in the same JVM, so tests pass alone and fail
  in a suite, or pass in one order and fail in another. Parallel test execution makes it worse.
  The absence of a constructor parameter also means a test cannot substitute the collaborator at
  all without a bytecode-level tool (`java-test-design`).

## Review checklist

- [ ] "One per what?" is answered explicitly and matches the mechanism used
- [ ] Nothing that must be unique across replicas relies on a static field
- [ ] The instance holds no mutable state, or every mutation is documented as thread-safe
- [ ] Lazy initialisation uses the holder idiom or an enum, not unguarded or non-volatile checks
- [ ] No static initialiser performs I/O, blocking work, or triggers another class's init
- [ ] No test requires a `reset()` on it
- [ ] Dependency injection was considered and rejected for a stated reason
- [ ] Spring's singleton scope is not described as this pattern in review comments

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
