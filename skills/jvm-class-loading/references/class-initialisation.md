# Class initialisation

Reproductions below were executed on Temurin 25.0.3; the thread-dump text is what
`jcmd <pid> Thread.print` printed.

## The procedure that matters (JVMS 5.5, abridged)

Initialization is attempted under the JVMS initialization protocol. Active-use triggers include
`new`, invocation of a class's static method, and access/assignment of a non-constant static field
**declared by that class**, plus specified reflective/method-handle API uses and initialization
of a subclass. Merely loading, linking, taking a class literal, or referring through a subclass
does not necessarily initialize the named class. The incident-producing steps are:

1. If another thread is initialising the class, **wait** on the initialisation lock.
2. If the **current** thread is initialising the class, **return immediately** — the
   recursive request is treated as complete, so the caller sees whatever statics have been
   assigned so far.
3. If initialisation previously failed, throw `NoClassDefFoundError` — every time, for the
   life of the loader.
4. Mark initialization in progress, release the protocol lock, and initialize constant-variable
   static fields. Then initialize required superclasses and (for a class) recursively required
   superinterfaces declaring default methods before running `<clinit>`. Initializing an interface itself does not automatically
   initialize its superinterfaces. Record success/failure under the protocol lock.

Steps 1 and 2 are the two traps; step 3 is the confusing error.

## Deadlock: two classes, two threads

```java
static class A { static final Object X; static { sleep(200); X = B.Y; } }
static class B { static final Object Y; static { sleep(200); Y = A.X; } }
// Partial timing-sensitive sketch: sleep helper omitted; not a deterministic test.
// A reproducible isolated test must coordinate both initializers with an external barrier.
// Run in a disposable process with a timeout; do not leave deadlocked workers in a test suite.
```

Each thread is responsible for completing its own class's initialization and waits for the
other's completion — step 1 — forever. It does not hold the protocol lock throughout `<clinit>`. No exception, no timeout, no `DEADLOCK` section in the thread dump, because the
initialisation lock is not a monitor or a `java.util.concurrent` lock:

```text
"init-A" #35 prio=5 ... in Object.wait()
   java.lang.Thread.State: RUNNABLE
	at Init$A.<clinit>(Init.java:2)
	- waiting on the Class initialization monitor for Init$B
"init-B" #36 prio=5 ... in Object.wait()
   java.lang.Thread.State: RUNNABLE
	at Init$B.<clinit>(Init.java:3)
	- waiting on the Class initialization monitor for Init$A
```

The signature is `- waiting on the Class initialization monitor for <class>` directly under
a `<clinit>` frame, with the state reported as `RUNNABLE`. Grep a hung startup's dump for
that line before anything else; a monitor-based deadlock detector never reports it.

Typical real shapes: two enums or two registries that reference each other's constants; a
Spring `@Configuration` static initialiser that triggers a class whose static block calls
back into the container; a JDBC driver's static registration touching a logging class whose
static initialiser loads the driver. Fix by breaking the static cycle — move one side to
explicit initialisation at a lifecycle point you choose, or initialise both classes eagerly
from one thread at startup (`Class.forName(name, true, loader)`) before any worker thread
runs. This can avoid the two-thread cycle but does not make fallible work safe, remove recursive
partial-state reads, or define recovery; use eager touching only after proving those preconditions.

## Recursion: one class, one thread

```java
static class R {
    static final Map<String,String> MAP = new HashMap<>();
    static final R INSTANCE = new R();          // constructor runs inside <clinit>
    static final String NAME = "r";              // compile-time constant
    R() { System.out.println(NAME + " " + MAP + " " + INSTANCE); }
}
// prints: r {} null
```

The constructor executes while `R`'s `<clinit>` is still running on the same thread, so
step 2 lets it through and it observes `INSTANCE == null`. `MAP` is non-null only because it
is declared _above_ `INSTANCE`. The direct `NAME` read is inlined, but this is not the only
reason its value is available: the initialization protocol assigns constant variables before
ordinary field initializers, regardless of textual order (JLS 12.4.2 step 6; JVMS 4.7.2/5.5).
As a counterexample, `R.class.getDeclaredField("NAME").get(null)` executed inside this constructor
also returns `"r"`, without an inlined field read. That reflective access requests initialization;
same-thread recursion returns immediately and the constant field already has its value. A later
`static final String LATE = new String("r")` is not a constant variable and would still be `null`
at that point. These are Java 17-compatible partial snippets; the reflective read requires
handling `ReflectiveOperationException`.

Reordering non-constant declarations can hide a partial-state read while leaving an initialization
cycle. Anything a static initialiser constructs must not depend on non-constant statics whose
initializers have not run, including through calls into other code; a `static` singleton whose
constructor consults configuration held in another static field of the same class is the
recurring case. The holder idiom (`static class Holder { static final R INSTANCE = … }`)
separates the singleton's initialisation from the class that carries the other statics.

## `NoClassDefFoundError` after a failed initialiser

```text
1st: java.lang.ExceptionInInitializerError  cause=IllegalStateException: boom in <clinit>
2nd: java.lang.NoClassDefFoundError: Could not initialize class Init$F
     cause=java.lang.ExceptionInInitializerError: Exception java.lang.IllegalStateException:
           boom in <clinit> [in thread "main"]
```

For the shown non-Error exception, the first touch throws `ExceptionInInitializerError`.
If the initializer throws an `Error` (for example AssertionError), that Error propagates
without this wrapper; wrapping can itself fail with OutOfMemoryError. Later initialization attempts
— from any thread, for the life of that definition — throw `NoClassDefFoundError: Could not
initialize class X` (step 3). Modern HotSpot commonly preserves useful original-initialization
detail in the later cause, but do not depend on that across vendors/releases or logging wrappers.
The first failure remains authoritative. A `NoClassDefFoundError` caused by
`ClassNotFoundException` usually means JVM-initiated loading could not locate a required
definition; classify other linkage causes from the complete chain.

The operational consequence: a static initialiser that fails on a transient condition (a
DNS lookup, a file that appears later) marks that definition erroneous. Retrying the same definition cannot rerun its initializer;
a fresh defining loader can create a new definition where a safe reload lifecycle exists.
Prefer explicit fallible initialization with a recovery policy.

## Observing it

```bash
java -Xlog:class+init=info ...     # "Initializing 'X' by thread ..." and verification per class
java -Xlog:class+load ...          # order of loading, and the source (jar, jrt, shared archive)
jcmd <pid> Thread.print            # the deadlock signature above
```

`class+init` provides initialization chronology, not complete duration or I/O attribution.
Correlate timestamps with stacks/JFR or application markers; adjacent log lines alone do not
prove where initialization time was spent.

## Acceptance tests for initialization changes

- Run first touch concurrently behind a barrier; assert one successful publication and no hang.
- Inject each fallible dependency failure on first touch; verify a controlled startup/readiness
  failure rather than poisoning a class needed for recovery.
- Exercise shutdown/restart in the same JVM when a plugin/container supports reload.
- Test constant/non-constant field access and subclass/superinterface triggers explicitly rather
  than inferring them from source order.

## Primary references

- [JVMS 25 §5.5, initialization](https://docs.oracle.com/javase/specs/jvms/se25/html/jvms-5.html#jvms-5.5)
- [JVMS 25 §4.7.2, ConstantValue](https://docs.oracle.com/javase/specs/jvms/se25/html/jvms-4.html#jvms-4.7.2)
- [JLS 17 §12.4.2, initialization order including constant variables](https://docs.oracle.com/javase/specs/jls/se17/html/jls-12.html#jls-12.4.2)
- [JLS 25 §12.4, initialization](https://docs.oracle.com/javase/specs/jls/se25/html/jls-12.html#jls-12.4)
- [Java 25 `Class.forName`](<https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/lang/Class.html#forName(java.lang.String,boolean,java.lang.ClassLoader)>)
