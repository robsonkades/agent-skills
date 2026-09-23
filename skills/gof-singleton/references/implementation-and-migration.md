# Implementing a singleton, and getting rid of one

## The four idioms, with their exact guarantees

Separate Java 17 examples; import `java.time.Clock` for the enum example. Inspect the actual
identity, failure and lifecycle contract before selecting an idiom; these snippets own no
closeable external resource. Publication does not make later mutation thread-safe.

```java
// 1. Enum — Effective Java's recommendation when a singleton is genuinely required
public enum Clocks {
    INSTANCE;
    private final Clock clock = Clock.systemUTC();
    public Clock clock() { return clock; }
}
```

Guarantees: initialization on active use of the enum class, not independently on first use of
each constant; safe publication from class initialization. Resistant to standard
reflective instantiation (`Constructor.newInstance` on an enum throws); serialisation preserves
identity in the receiving defining class without `readResolve`. Costs: cannot extend a class;
the enum API may not fit an existing class contract, and mutable global state still needs ownership.
Enum instance fields are not persisted by [standard enum serialization](https://docs.oracle.com/en/java/javase/17/docs/specs/serialization/serial-arch.html#serialization-of-enum-constants);
canonical identity is not state capture or restoration.

```java
// 2. Holder idiom — lazy creation governed by class initialization
public final class Registry {
    private Registry() {}
    private static final class Holder { static final Registry INSTANCE = new Registry(); }
    public static Registry getInstance() { return Holder.INSTANCE; }
}
```

Guarantees: the instance is initialized on active use of `Holder`, normally the first
`getInstance()` call, not merely loading `Registry`. Correctness comes from class-initialisation
semantics; callers need no explicit synchronization after initialization.
Costs: accessible reflection can create another instance; serialization matters only if the
type participates in Serializable. The shown class does not.

```java
// 3. Classic double-checked locking — volatile publication is required here
public final class Registry {
    private static volatile Registry instance;     // volatile is not optional
    private Registry() {}
    public static Registry getInstance() {
        Registry local = instance;                 // one volatile read
        if (local == null) {
            synchronized (Registry.class) {
                local = instance;
                if (local == null) instance = local = new Registry();
            }
        }
        return local;
    }
}
```

Without volatile (or another proven publication protocol), this DCL idiom lacks a safe-publication
guarantee; a particular run need not manifest the failure. Runtime-dependent initialization still
needs an explicit first-writer/configuration-conflict policy. DCL retries after a constructor
failure unless designed otherwise; a failed holder initialization is not automatically retried.

```java
// 4. Eager static final — simplest, when creation is cheap and always needed
public final class Registry {
    private Registry() {}
    public static final Registry INSTANCE = new Registry();
}
```

Guarantees: safe publication when `Registry` is initialized. "Eager" is relative to that class's
initialization, not JVM startup: merely loading the class does not create the instance. Another
static method declared by `Registry` can trigger initialization even without reading `INSTANCE`;
the holder idiom instead defers creation until `Holder` is actively used. Inspect the actual
[initialization triggers](https://docs.oracle.com/javase/specs/jls/se17/html/jls-12.html#jls-12.4.1)
before changing timing. Both idioms remain subject to the initialization dependencies below.

## The class-initialisation deadlock

Class initialization coordinates per Class object. Two initializing threads can deadlock when
each waits for the other's class. Mere cross-class references do not guarantee this interleaving;
same-thread recursive initialization can instead expose default field values.

```java
class A { static final A INSTANCE = new A(); static { B.touch(); } static void touch() {} }
class B { static final B INSTANCE = new B(); static { A.touch(); } static void touch() {} }
```

Rules that prevent it:

- Avoid cyclic dependencies and waiting for threads that themselves need class initialization.
- Keep fallible I/O outside static initialization so the owner can control retry, failure and
  cleanup. A class whose initialization fails remains erroneous for that defining loader.
- A holder defers initialization but does not remove dependencies introduced by its constructor.
  After initialization fails, later active uses of that same class fail with NoClassDefFoundError;
  the first failure is wrapped in ExceptionInInitializerError only when it is not already an Error.
  See [JLS 17 initialization](https://docs.oracle.com/javase/specs/jls/se17/html/jls-12.html#jls-12.4.2).

## Attacks on the invariant

- **Reflection.** Access override depends on module openness/permissions. A private constructor
  protects normal callers, not privileged reflection. An instance-exists flag is not a complete
  defense (early/reflected creation and races); standard reflective enum construction is rejected.
- **Serialisation.** Deserialising a `Serializable` singleton creates a second instance unless
  it resolves to a canonical instance. readResolve runs after deserialization, so review object
  graph exposure and hooks; transient fields are a state policy, not a universal identity rule.
  Prefer an explicit serial proxy/format or avoid serialization. Enum serialization uses the name
  to resolve the constant in the receiving class-loader universe.
- **Class loaders.** Two defining loaders can define distinct types/instances; loaders delegating
  to the same parent definition share that class. Class/loader identity can distinguish them.

Match the actual threat/compatibility boundary: an enum can satisfy standard reflective-construction
and serialization identity requirements within its defining class. Privileged mechanisms, other
construction paths or independent defining loaders require separate analysis; do not infer JVM or
cluster uniqueness. Place a broader authority requirement on the ladder in
[uniqueness-and-scope.md](uniqueness-and-scope.md).

## Migrating off an entrenched singleton

A large removal can benefit from the sequence below; a small cohesive change need not be split.
First establish what the migration improves, the supported static/canonical-identity contract,
existing test seams and lifecycle owner. Retaining the accessor is valid when its contract is needed.

1. **Make collaborators visible.** Route construction through explicit collaborators when useful,
   preserving access restrictions, canonical creation, initialization timing and failure behavior.
   Do not expose another construction path merely to enable injection.
2. **Reuse the smallest suitable caller contract.** Inject the concrete type or existing interface
   when adequate. Extract an interface only for an actual consumer boundary, substitution or
   failure/ownership contract; injection alone does not require one.
3. **Convert callers leaf-first.** A caller that already receives its collaborators takes one
   more parameter; the singleton is passed at the call site. Each converted caller becomes
   easier to isolate only where its actual collaborators/lifecycle now support that test seam;
   verify behavior rather than equating a new parameter with testability.
4. **Move ownership to the composition root without creating two live owners.** Initially inject
   the existing canonical instance; coordinate cutover of both legacy and injected call paths,
   including shutdown, before constructing a replacement. Do not close a shared instance twice.
5. **Remove getInstance last when compatibility permits.** Local compilation proves only local
   source coverage; inspect plugins, reflection and published binaries. Deprecate/bridge an external
   API until its supported migration window ends.

Two things to watch during the migration:

- **Do not add a `setInstance()` for tests.** It makes tests order-dependent and creates a
  production API for mutating global state. If tests cannot be written without it, do step 3 for
  those callers first.
- **Preserve intended initialization timing.** First-use construction may be a valid contract;
  an eager bean can violate it. Configure an appropriate owned lifecycle or justify a change with
  dependency/failure evidence rather than treating laziness itself as a hidden bug.

## Test hazards, and what they indicate

| Symptom                                     | Candidate cause                                  | Discriminating check / correction                                                     |
| ------------------------------------------- | ------------------------------------------------ | ------------------------------------------------------------------------------------- |
| Test passes alone, fails in the suite       | Earlier state survived, static or external       | Reproduce order and identify the state owner before isolating it                      |
| Test order changes the result               | Shared state or initialization timing            | Compare actual setup/cleanup and defining-class lifetime                              |
| Parallel tests interfere                    | Competing access to shared mutable state         | Identify overlapping users; isolate fixtures or enforce the required protocol         |
| A `reset()` exists only for tests           | Tests are compensating for a shared lifetime     | Inspect reset scope and isolation; do not reset resources used by other tests         |
| A test needs a bytecode agent to substitute | Required static call or a missing practical seam | Reuse concrete/existing interfaces, adapters or process isolation as contracts permit |

These are diagnostic signals, not proof of one cause or a mandate for one abstraction. Verify the
specific failure and the retained production/parallel-test contract after a correction.
