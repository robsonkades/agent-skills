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

| Form            | Reflection                                                  | Deserialisation                            | Lazy                                       | Substitutable in a test    |
| --------------- | ----------------------------------------------------------- | ------------------------------------------ | ------------------------------------------ | -------------------------- |
| 1. public field | deep reflection may bypass, subject to access/module policy | needs `readResolve` for canonical identity | eager when enclosing class initializes     | no                         |
| 2. factory      | same                                                        | same                                       | eager when enclosing class initializes     | only by changing the class |
| 3. holder       | same                                                        | same                                       | deferred until holder class initialization | no                         |
| 4. enum         | standard reflective construction rejects enum types         | enum deserialization preserves constants   | eager when enum class initializes          | no                         |

Serializable forms 1–3 need this to preserve canonical identity, and it is routinely forgotten:

```java
private Object readResolve() { return INSTANCE; }
```

`transient` is a separate state/attack-surface decision: `readResolve` discards the deserialized
replacement object's identity, but its non-transient graph was still read and could be costly or
unsafe.

The holder is a strong choice for parameterless, class-loader-lifetime lazy initialization: the
JVM's class-initialization protocol safely publishes it without a per-access volatile read.
Correct double-checked locking requires `volatile` and may be justified when initialization must
live outside class initialization or support another lifecycle; it carries more state-machine
surface. java-memory-model has the proof. Laziness helps only when deferred/unused work outweighs
the first-use latency and sticky class-initialization failure risk.

Class initialization also has a sticky failure mode: an exception becomes
`ExceptionInInitializerError`, and later active uses in that class loader can fail with
`NoClassDefFoundError` rather than retrying initialization. Do not hide recoverable network or
configuration discovery inside a holder; make retry/backoff/lifecycle an explicit service policy.

## What none of the forms defend against

**Testability.** When used as a collaborator, every form above hard-codes its retrieval into
callers. Substitution then requires the singleton itself to expose a seam or tests to use static
mocking. Prefer injecting an interface or concrete class and let the composition root decide
there is exactly one. "Singleton" then
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
- Static initialization timing depends on the deployment technology. Native Image may initialize
  selected classes at build time; CRaC captures state at checkpoint; ordinary CDS primarily
  archives class metadata and does not imply that arbitrary application statics were evaluated at
  training time. Audit configuration, clock, randomness, credentials and open resources against
  the actual image/checkpoint policy; startup-cds-crac-leyden and graalvm-native-image own details.

**Concurrency.** `INSTANCE` being final and safely published says nothing about the object's
methods. A shared instance is by definition reached from every request thread at once, so
either it is deeply immutable, or every piece of mutable state inside it is guarded — and
that contract has to be written down where a caller will read it.

## Static mutable state, specifically

The failure is not the `static` keyword; it is _mutable_ plus _static_. These are safe and
normal:

```java
private static final Logger LOG = LoggerFactory.getLogger(Ledger.class);
private static final Pattern ACCOUNT = Pattern.compile("[A-Z]{2}\\d{8}");
private static final Set<String> RETRYABLE = Set.of("503", "504");
```

The set/pattern are deeply immutable constants; the conventional logger is process-scoped
infrastructure whose initialization/lifecycle belongs to the logging system. These are not:

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

- [ ] A singleton's required scope, lifecycle, substitution seam and concurrency contract are
      explicit; enum/container/holder selection follows those requirements.
- [ ] Any `Serializable` hand-rolled singleton uses `readResolve`; serialized fields are reviewed
      independently for state, compatibility and security.
- [ ] Static mutable objects are justified as process/class-loader scoped, concurrency-safe and
      lifecycle-bounded—not assumed global merely because the reference is `final`.
- [ ] No static collection that grows with request volume; anything cached is bounded.
- [ ] Static initialization that reads configuration, clock, randomness, environment or network
      is audited for class-init failure, test isolation, image/checkpoint timing and refresh needs.
- [ ] Anything the code treats as globally unique (a lock, a scheduler that "must run once",
      a sequence) is checked against the replica count; if it must be cluster-unique, it is
      backed by a lease or an election, not by `static`.
- [ ] Utility classes have a private constructor that throws, and are `final`.

## Authoritative references

- [JLS §12.4.2: Detailed Initialization Procedure](https://docs.oracle.com/javase/specs/jls/se25/html/jls-12.html#jls-12.4.2)
- [Java Object Serialization: enum constants](https://docs.oracle.com/en/java/javase/25/docs/specs/serialization/serial-arch.html#serialization-of-enum-constants)
- [ObjectInputStream readResolve model](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/io/ObjectStreamClass.html)
