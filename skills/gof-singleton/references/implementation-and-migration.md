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

Guarantees: thread-safe lazy initialisation from class-initialisation semantics; immune to
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
Costs: reflection and serialisation can still create second instances unless defended.

```java
// 3. Double-checked locking — correct only exactly like this
public final class Registry {
    private static volatile Registry instance;     // volatile is not optional
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

Without `volatile` this is broken on every JVM: another thread can observe a non-null reference
to an object whose constructor has not finished. It exists for cases the holder idiom cannot
serve — an instance whose creation depends on a runtime argument — and should otherwise be
avoided.

```java
// 4. Eager static final — simplest, when creation is cheap and always needed
public final class Registry {
    public static final Registry INSTANCE = new Registry();
}
```

Guarantees: safe publication, no lazy-init question. Costs: runs at class initialisation, which
is the trigger for the deadlock below.

## The class-initialisation deadlock

Class initialisation takes a per-class lock. Two classes whose static initialisers reference
each other, initialised concurrently by two threads, deadlock — and the thread dump shows both
threads in `<clinit>` with no application lock in sight.

```java
class A { static final A INSTANCE = new A(); static { B.touch(); } }
class B { static final B INSTANCE = new B(); static { A.touch(); } }
```

Rules that prevent it:

- A static initialiser must not touch another class's static state, start threads, or block.
- A static initialiser must never do I/O — reading a file or opening a connection during class
  init makes the failure mode a `ExceptionInInitializerError` that is thrown once and then
  becomes `NoClassDefFoundError` for every subsequent access, which is one of the most confusing
  errors in Java.
- Prefer the holder idiom, which narrows the window to a class nothing else references.

## Attacks on the invariant

- **Reflection.** `Constructor.setAccessible(true)` defeats a private constructor. Defend by
  throwing from the constructor when the instance already exists, or use an enum.
- **Serialisation.** Deserialising a `Serializable` singleton creates a second instance unless
  it declares `readResolve()` returning the canonical one — and every field must be `transient`
  or the copy's state is restored into a discarded object. Enums are immune.
- **Class loaders.** Nothing defends against this; two loaders means two instances, and no
  language mechanism can tell them apart.

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
4. **Move creation to the composition root.** Once the majority of callers accept the
   dependency, construct it once in the container/`main` and inject it.
5. **Delete `getInstance()` last**, when the compiler proves no caller remains. Keeping it "for
   compatibility" preserves exactly what you set out to remove, and new code will use it.

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
