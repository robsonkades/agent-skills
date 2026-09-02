# Class initialisation

Reproductions below were executed on Temurin 25.0.3; the thread-dump text is what
`jcmd <pid> Thread.print` printed.

## The procedure that matters (JVMS 5.5, abridged)

Initialisation runs once per class, under a per-class initialisation lock, triggered by the
first `new`, static method call, static field access (other than a compile-time constant),
`Class.forName(name, true, …)`, subclass initialisation or reflective use. The steps that
produce production incidents:

1. If another thread is initialising the class, **wait** on the initialisation lock.
2. If the **current** thread is initialising the class, **return immediately** — the
   recursive request is treated as complete, so the caller sees whatever statics have been
   assigned so far.
3. If initialisation previously failed, throw `NoClassDefFoundError` — every time, for the
   life of the loader.
4. Initialise the superclass chain first (interfaces only if they declare default methods),
   then run `<clinit>`: static field initialisers and `static {}` blocks in **textual order**.

Steps 1 and 2 are the two traps; step 3 is the confusing error.

## Deadlock: two classes, two threads

```java
static class A { static final Object X; static { sleep(200); X = B.Y; } }
static class B { static final Object Y; static { sleep(200); Y = A.X; } }
// thread 1 touches A.X, thread 2 touches B.Y at the same time
```

Each thread holds its own class's initialisation lock and waits for the other's — step 1 —
forever. No exception, no timeout, no `DEADLOCK` section in the thread dump, because the
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
runs.

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
is declared _above_ `INSTANCE`; `NAME` reads correctly only because `javac` inlined the
constant into the constructor — it never touched the field. Reordering declarations "fixes"
the symptom and leaves the hazard. Anything a static initialiser constructs must not read
statics declared below it, and must not call into code that does; a `static` singleton whose
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

The first touch throws `ExceptionInInitializerError` with the real cause; every later touch
— from any thread, for the life of the loader — throws `NoClassDefFoundError: Could not
initialize class X` (step 3). Since JDK 17 the second error's `cause` restates the original
exception and the thread it happened in, so a log that only captured the second one still
names the culprit. A `NoClassDefFoundError` whose `cause` is a `ClassNotFoundException`
instead is the other kind: the class file itself is absent at run time.

The operational consequence: a static initialiser that fails on a transient condition (a
DNS lookup, a file that appears later) poisons the class until restart. Retry logic around
the first call cannot help; the initialiser must not do the fallible work.

## Observing it

```bash
java -Xlog:class+init=info ...     # "Initializing 'X' by thread ..." and verification per class
java -Xlog:class+load ...          # order of loading, and the source (jar, jrt, shared archive)
jcmd <pid> Thread.print            # the deadlock signature above
```

`class+init` shows which thread initialised which class and in what order — enough to see a
cycle forming before it deadlocks, and to confirm that an initialiser suspected of doing I/O
is the one that took the time.
