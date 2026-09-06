# Implementing a singleton, and getting rid of one

## The four idioms, with their exact guarantees

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
identity without `readResolve`. Costs: cannot extend a class; the type is an enum, which is
misleading if it models no enumeration; still global state.

```java
// 2. Holder idiom (initialisation-on-demand) — the best plain-class option
public final class Registry {
    private Registry() {}
    private static final class Holder { static final Registry INSTANCE = new Registry(); }
    public static Registry getInstance() { return Holder.INSTANCE; }
}
```

Guarantees: initialised on first call to `getInstance()`, not on class load; correctness comes
from the JVM's class-initialisation lock, so no synchronisation appears in the fast path.
Costs: accessible reflection can create another instance; serialization matters only if the
type participates in Serializable. The shown class does not.

```java
// 3. Double-checked locking — correct only exactly like this
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

Guarantees: safe publication, no lazy-init question. Costs: runs at class initialisation, which
is the trigger for the deadlock below.

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

If any of the three matter to correctness, the requirement is stronger than a Java singleton can
express, and belongs on the ladder in
[uniqueness-and-scope.md](uniqueness-and-scope.md).

## Migrating off an entrenched singleton

A big-bang removal of a `getInstance()` called from two hundred places is not reviewable. The
sequence below keeps every step small and independently mergeable.

1. **Make the state visible.** Add a constructor taking the collaborators the singleton
   currently reaches statically. The static instance now calls it. Nothing else changes.
2. **Introduce an interface** for what callers actually use — usually two or three of its
   methods, not all fifteen. The narrower interface is the real API and often reveals that
   callers wanted different things.
3. **Convert callers leaf-first.** A caller that already receives its collaborators takes one
   more parameter; the singleton is passed at the call site. Each converted caller becomes
   testable immediately, which is the incentive that keeps the migration moving.
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
- **Watch for initialisation order that the static holder was accidentally providing.** Code
  that worked because the singleton was created on first use may break when it becomes an eager
  bean — usually because something reads configuration that is not ready. That is a real
  ordering bug the singleton was hiding, and it should be fixed rather than re-hidden.

## Test hazards, and what they indicate

| Symptom                                     | Cause                                             | Fix                                                     |
| ------------------------------------------- | ------------------------------------------------- | ------------------------------------------------------- |
| Test passes alone, fails in the suite       | State from an earlier test survived in the static | Inject the collaborator; stop sharing                   |
| Test order changes the result               | Same                                              | Same                                                    |
| Parallel tests interfere                    | One instance, many threads, mutable state         | Same, or make the instance immutable                    |
| A `reset()` exists only for tests           | Production API added to undo global state         | Treat as a migration marker; convert those callers      |
| A test needs a bytecode agent to substitute | Static call with no seam                          | Introduce the interface (step 2) before testing further |

The pattern across the table: every one of these is fixed by the same move, and none is fixed by
a better singleton.
