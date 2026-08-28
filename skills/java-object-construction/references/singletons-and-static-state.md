# Singletons and static state

## The four forms and what each actually defends

```java
// 1. public static final field
public final class Auditor {
    public static final Auditor INSTANCE = new Auditor();
    private Auditor() { }
}

// 2. static factory over a private field
public final class Auditor {
    private static final Auditor INSTANCE = new Auditor();
    private Auditor() { }
    public static Auditor instance() { return INSTANCE; }
}

// 3. lazy-initialisation holder
public final class Auditor {
    private Auditor() { }
    private static class Holder { static final Auditor INSTANCE = new Auditor(); }
    public static Auditor instance() { return Holder.INSTANCE; }
}

// 4. single-element enum
public enum Auditor {
    INSTANCE;
}
```

| Form            | Reflection                                   | Deserialisation                                | Lazy                                              | Substitutable in a test    |
| --------------- | -------------------------------------------- | ---------------------------------------------- | ------------------------------------------------- | -------------------------- |
| 1. public field | broken by `setAccessible(true)`              | needs `readResolve` + all fields `transient`   | no                                                | no                         |
| 2. factory      | same                                         | same                                           | no                                                | only by changing the class |
| 3. holder       | same                                         | same                                           | yes, correctly — class init is the JVM's own lock | no                         |
| 4. enum         | `Constructor.newInstance` refuses enum types | handled by the deserialisation of enums itself | no                                                | no                         |

Forms 1–3 need this to survive deserialisation, and it is routinely forgotten:

```java
private Object readResolve() { return INSTANCE; }   // and every field declared transient
```

Form 3 is the correct answer to "make it lazy" — the JVM's class-initialisation lock gives
publication for free, with no volatile read on the hot path. Double-checked locking with a
`volatile` field is correct too but has no advantage here and one more way to be written
wrong; java-memory-model has the analysis. Lazy initialisation is worth it only when the
object is expensive _and_ often unused: it turns a startup cost into a first-request
latency spike, which is a worse trade for a service with an SLO than for a CLI.

## What none of the forms defend against

**Testability.** Every form above hard-codes the identity of the collaborator into every
caller. Nothing can substitute it, so tests either run against the real thing or reach for
static mocking. The alternative costs one line: declare an interface (or just the class),
inject it, and let the composition root decide there is exactly one. "Singleton" then
describes the _lifecycle a container gives the bean_, not a construction pattern welded into
the type. This is the same argument as java-dependency-inversion's seam test — apply that
skill's rule about not inventing an interface with no second implementation.

**Scope.** A singleton is one instance per class loader, per JVM. Three consequences that
reach production:

- In a service with `replicas: 3`, a static counter, a static rate limiter, and a
  "run-once" static flag exist three times and each sees a third of the traffic. Cluster-wide
  uniqueness is leader-election or distributed-locks-and-leases; the local object is at most a
  handle to it.
- In an application-server or plugin deployment, an application redeploy leaves the old class
  loader alive if anything in a _shared_ loader still references an instance of an
  application class — a static registry, a `ThreadLocal` on a pooled container thread, a JDBC
  driver, a shutdown hook. Metaspace grows on every redeploy; java-reference-types-and-leaks
  has the diagnosis path.
- Static state in a class initialised during an AOT/CDS training run or a native-image build
  is captured at build time, not at start time. Anything that reads configuration, the clock,
  or the environment in a static initialiser therefore freezes the _builder's_ environment
  into the image; startup-cds-crac-leyden and graalvm-native-image cover the mechanics.

**Concurrency.** `INSTANCE` being final and safely published says nothing about the object's
methods. A shared instance is by definition reached from every request thread at once, so
either it is deeply immutable, or every piece of mutable state inside it is guarded — and
that contract has to be written down where a caller will read it.

## Static mutable state, specifically

The failure is not the `static` keyword; it is _mutable_ plus _static_. These are safe and
normal:

```java
private static final Logger LOG = LoggerFactory.getLogger(Ledger.class);
private static final Pattern ACCOUNT = Pattern.compile("[A-Z]{2}\d{8}");
private static final Set<String> RETRYABLE = Set.of("503", "504");
```

Deeply immutable, built from constants, no environment read. These are not:

```java
private static final Map<String, Session> SESSIONS = new ConcurrentHashMap<>();  // unbounded, per-JVM
private static int inFlight;                                                     // racy and per-replica
public static Clock clock = Clock.systemUTC();                                   // test-order-dependent
```

The `Map` grows with traffic and dies with the process (so it also silently loses everything
on a rolling deploy — session-state-strategies is the skill for that). The counter is both a
data race and an accidental per-replica metric. The mutable static clock is the pattern where
one test's mutation leaks into another's assertions; inject `Clock` instead, which is exactly
the port the JDK already ships.

## Review checks

- [ ] Every singleton is either an enum, or is container-managed with an interface at the
      call sites — not a hand-rolled static that no test can replace.
- [ ] Any `Serializable` hand-rolled singleton has `readResolve` and transient fields.
- [ ] No `static` non-final field, and no `static final` field holding a mutable object,
      other than the immutable-constant shapes above.
- [ ] No static collection that grows with request volume; anything cached is bounded.
- [ ] No static initialiser that reads configuration, the clock, the environment or the
      network — including transitively.
- [ ] Anything the code treats as globally unique (a lock, a scheduler that "must run once",
      a sequence) is checked against the replica count; if it must be cluster-unique, it is
      backed by a lease or an election, not by `static`.
- [ ] Utility classes have a private constructor that throws, and are `final`.
