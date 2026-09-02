---
name: jvm-class-loading
description: >
  Class loading, class identity and classloader leaks: parent-first delegation, {loader,
  binary name} identity, loading versus linking versus initialisation, Metaspace retention,
  and CDS/AOT cache for startup. Use when a ClassCastException reports identical type names
  on both sides, when Metaspace grows monotonically across redeploys or plugin reloads, when
  ClassNotFoundException and NoClassDefFoundError need to be told apart, when
  IllegalAccessError mentions "does not export" or InaccessibleObjectException asks for
  --add-opens, when a startup hangs with "waiting on the Class initialization monitor" in a
  thread dump, when a static initialiser does I/O, or when reducing cold start. Does not cover
  the Metaspace budget itself (jvm-memory-regions), JIT warm-up (jit-compilation), or heap
  leak analysis (jvm-gc-tuning). Metaspace internals are metaspace-internals and startup
  caching in depth is startup-cds-crac-leyden.
---

# JVM Class Loading

## Purpose

Reason about class identity and classloader lifetime. Two failures live here and both
look like something else: a `ClassCastException` where the two type names are identical,
and a Metaspace that grows forever while every heap dashboard looks healthy.

The single fact that explains both: a class is identified by `{ClassLoader, binary
name}`, and only a **whole loader** is ever unloaded — never an individual class.

## Workflow

1. **On a confusing `ClassCastException`, print the loaders of both sides first**, before
   any other hypothesis. Identical names from different loaders are incompatible types.
2. **Tell the lookup failures apart by the message.** `ClassNotFoundException` comes from
   an explicit lookup (`Class.forName`, `loadClass`) that found nothing.
   `NoClassDefFoundError` has two causes: a JVM-initiated resolution that failed (its
   `cause` is a `ClassNotFoundException` — a JAR present at compile time is missing at
   run time), or `Could not initialize class X` — a `<clinit>` that already threw once; on
   JDK 17+ its `cause` carries the original `ExceptionInInitializerError`, and the first
   failure is the one to fix.
3. **Check whether it is a module problem instead.** `IllegalAccessError` mentioning
   "does not export" is a static reference that needs `--add-exports`;
   `InaccessibleObjectException` mentioning `does not "opens"` is `setAccessible` and
   needs `--add-opens` — `--add-exports` does not satisfy it. No JAR reorganisation fixes
   either. See `references/module-access.md`.
4. **For suspected leaks, confirm before hunting:**
   `jcmd <pid> VM.classloader_stats` before and after N cycles. A monotonically growing
   count of loaders of the same `Type` confirms it.
5. **Find the retainer** with `jcmd <pid> GC.heap_dump` and _Path to GC Roots_ in Eclipse
   MAT, excluding weak references. See `references/classloader-leaks.md`.
6. **Validate the fix by repeating the same first measurement**, not by absence of
   symptoms.

## Rules

- `close()` on a `URLClassLoader` releases the JARs, **not** Metaspace. If any object
  created by that loader is still reachable, the loader stays alive and nothing is
  unloaded. Confusing these two is the most common cause of "I close the loader and
  Metaspace keeps growing".
- Parent-first delegation is a security mechanism, not an organisational one — it stops a
  classpath JAR from replacing a JDK class. Any child-first policy must reintroduce that
  protection by hand, with an always-delegated package list.
- Custom loaders are not parallel-capable by default. Without
  `registerAsParallelCapable()` in their `<clinit>`, the lock is the whole loader and all
  loading in that subsystem serialises.
- `Class.forName(name)` uses the _calling_ class's loader, which in a framework is rarely
  the right one. Pass the context loader explicitly:
  `Class.forName(name, true, Thread.currentThread().getContextClassLoader())`.
- Keep `<clinit>` trivial. The first thread to touch the class pays the cost while holding
  the initialisation lock, blocking every other thread that touches it — and this is the
  ingredient of initialisation deadlock. Two classes whose initialisers touch each other,
  first touched from two threads, deadlock permanently; the tell in `jcmd <pid>
Thread.print` is `- waiting on the Class initialization monitor for X` under a thread
  reported as `RUNNABLE`, so a deadlock detector that looks only at monitors and locks
  reports nothing. See `references/class-initialisation.md`.
- `<clinit>` re-entered by the **same** thread does not block: JVMS 5.5 returns at once and
  the code observes `static` fields not yet assigned — `null`, `0` — while compile-time
  constants read as initialised because `javac` inlined them. A static singleton whose
  constructor reads a later static field is the usual shape.
- Loading is not initialising. CDS and the AOT cache accelerate loading and linking; they
  do **not** run `<clinit>`, which is arbitrary Java code.
- A custom classloader is the wrong tool for reloading _configuration_. It brings type
  isolation you did not ask for and leak risk you do not need — reload a config object
  instead, and reserve loaders for isolated **code**.
- Keep self-registering libraries (JDBC drivers especially) on the shared classpath, not
  inside the reloadable artefact.
- `Unsafe::defineAnonymousClass` was removed in JDK 17. Lambdas and generated bytecode use
  hidden classes (JEP 371), collected together with the `Lookup` that created them — but
  each distinct lambda still occupies Metaspace.

## References

- [Classloader leaks](references/classloader-leaks.md) — the confirmation procedure, the
  usual retainers, and the validation step. Read when Metaspace or loader count grows
  across redeploys or plugin reloads.
- [Class initialisation](references/class-initialisation.md) — the JVMS 5.5 procedure as it
  matters in practice, the deadlock and recursion reproductions with the thread-dump
  signature, the `NoClassDefFoundError` cause chain, and `-Xlog:class+init`. Read when a
  startup hangs, when a static field is unexpectedly `null`, or when the same
  `NoClassDefFoundError` repeats after a first, different exception.
- [Module access](references/module-access.md) — static versus reflective access across
  module boundaries, `--add-exports` versus `--add-opens`, where the flags can be placed
  (command line, `JDK_JAVA_OPTIONS`, the `Add-Opens` manifest attribute and its `-jar`-only
  scope), and how the module system changes loader delegation. Read when an
  `IllegalAccessError` or `InaccessibleObjectException` names a module.
- [Startup: CDS and the AOT cache](references/startup-and-aot-cache.md) — what JEP
  483/514/515 actually cache, how the cache is invalidated, and how to verify it is being
  used. Read when reducing cold start.
