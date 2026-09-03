---
name: jvm-class-loading
description: >
  Class loading, class identity and classloader leaks: parent-first delegation, {loader,
  defining loader and binary name} identity, loading versus linking versus initialisation, Metaspace retention,
  and CDS/AOT cache for startup. Use when a ClassCastException reports identical type names
  on both sides, when Metaspace grows monotonically across redeploys or plugin reloads, when
  ClassNotFoundException and NoClassDefFoundError need to be told apart, when
  IllegalAccessError mentions "does not export" or InaccessibleObjectException asks for
  --add-opens, when a startup hangs with "waiting on the Class initialization monitor" in a
  thread dump, when a static initialiser does I/O, or when reducing cold start. Does not cover
  the Metaspace budget itself (jvm-memory-regions), JIT warm-up (jit-compilation), or heap
  object-retention analysis (heap-dump-analysis). Metaspace internals are metaspace-internals and startup
  caching in depth is startup-cds-crac-leyden.
---

# JVM Class Loading

## Purpose

Reason about class identity and classloader lifetime. Two failures live here and both
look like something else: a `ClassCastException` where the two type names are identical,
and a Metaspace that grows forever while every heap dashboard looks healthy.

For ordinary named classes, runtime identity includes the binary name and defining loader;
an initiating loader may merely delegate to that definition. Ordinary classes normally become
unloadable with their defining loader. Weak hidden classes are the deliberate exception: unless
defined with `STRONG`, they may unload while their marked defining loader remains reachable.

## Workflow

1. **On a confusing `ClassCastException`, print the loaders of both sides first**, before
   any other hypothesis. Capture each `Class` object's defining loader, module, binary name and
   code source; identical names from different definitions are incompatible types.
2. **Classify lookup, linkage and initialization separately.** `ClassNotFoundException` is the
   checked result of name-based loading APIs that cannot find a definition. JVM loading or
   resolution may wrap an underlying loader failure as `NoClassDefFoundError`; the same error
   class also reports a definition whose `<clinit>` previously failed. Preserve the earliest
   exception, complete cause chain, failing instruction and loader identities—message text alone
   is not a complete taxonomy.
3. **Check whether it is a module problem instead.** `IllegalAccessError` mentioning
   "does not export" is a static reference that needs `--add-exports`;
   `InaccessibleObjectException` mentioning `does not "opens"` is `setAccessible` and
   needs `--add-opens` — `--add-exports` does not satisfy it. No JAR reorganisation fixes
   either. See `references/module-access.md`.
4. **For suspected leaks, establish a cohort and unloading opportunity:** capture
   `jcmd <pid> VM.classloader_stats`, exercise N equivalent reload/redeploy cycles, allow the
   configured collector to perform class unloading, then capture again. Persistent growth in
   obsolete loader cohorts is evidence of retention; raw loaded-class growth alone is not proof.
5. **Find the retainer** with `jcmd <pid> GC.heap_dump` and _Path to GC Roots_ in Eclipse
   MAT, excluding weak references. See `references/classloader-leaks.md`.
6. **Validate the fix by repeating the same first measurement**, not by absence of
   symptoms.
7. **For loader-constraint or duplicate-definition failures, reconstruct the graph:** the
   initiating loader at each symbolic reference, the eventual defining loader, delegation order,
   duplicate class/resources and the shared method descriptor. `LinkageError: loader constraint
violation` means two namespaces were forced to agree on a descriptor type and did not; adding
   casts or changing load order is not a fix.

## Rules

- `close()` on a `URLClassLoader` releases the JARs, **not** Metaspace. If any object
  created by that loader is still reachable, the loader stays alive and nothing is
  unloaded. Confusing these two is the most common cause of "I close the loader and
  Metaspace keeps growing".
- Parent-first delegation preserves namespace consistency and helps prevent child artifacts from
  shadowing platform/shared API classes. Child-first isolation requires an explicit boundary:
  always delegate platform namespaces and shared contract types, define package/resource order,
  and test split-package, service-provider and sealing behavior.
- Custom loaders are not parallel-capable by default. Without
  `registerAsParallelCapable()` in their `<clinit>`, the lock is the whole loader and all
  loading in that subsystem serialises. Registration also depends on the superclass chain;
  check the boolean result/`isRegisteredAsParallelCapable()` and keep `loadClass` idempotent under
  concurrent requests for the same name.
- `Class.forName(name)` initializes through the caller's defining loader. Use that for
  library-owned types; use a loader explicitly supplied by the plugin/container contract for
  isolated code. Use the thread context class loader only for APIs whose provider-discovery
  contract requires it, scope any temporary change with `try/finally`, and avoid retaining it on
  long-lived pooled threads.
- Keep `<clinit>` trivial. The first thread to touch the class pays the cost while holding
  the initialisation lock, blocking other threads whose active use requires initialization—and this is the
  ingredient of initialisation deadlock. Two classes whose initialisers touch each other,
  first touched from two threads, deadlock permanently; the tell in `jcmd <pid>
Thread.print` is `- waiting on the Class initialization monitor for X` under a thread
  reported as `RUNNABLE`, so a deadlock detector that looks only at monitors and locks
  reports nothing. See `references/class-initialisation.md`.
- `<clinit>` re-entered by the **same** thread does not block: JVMS 5.5 returns at once and
  the code observes `static` fields not yet assigned — `null`, `0` — while compile-time
  constants read as initialised because `javac` inlined them. A static singleton whose
  constructor reads a later static field is the usual shape.
- A `public static final` compile-time constant is copied into clients' class files. Changing it
  without recompiling consumers can leave old values in the same process, and reading it does not
  initialize the declaring class. Do not use mutable operational values as constant variables.
- Loading is not initializing. CDS/AOT can reuse selected metadata, linked state and constrained
  runtime objects; do not infer that arbitrary application `<clinit>` ran or was skipped. Measure
  class loading separately from initialization and framework/application work.
- A custom classloader is the wrong tool for reloading _configuration_. It brings type
  isolation you did not ask for and leak risk you do not need — reload a config object
  instead, and reserve loaders for isolated **code**.
- Every reloadable component needs a symmetric stop protocol: cancel/join its threads, close
  executors/resources, deregister JDBC drivers/MBeans/listeners/providers, clear TCCLs and remove
  parent-owned cache entries keyed by its `Class` objects. Moving an implementation to a shared
  loader trades unloadability for process-wide version coupling; share stable contracts, not all
  self-registering implementations by default.
- Class loaders and module layers are namespace/access mechanisms, not a sandbox for hostile code.
  Code defined into the process can consume CPU/memory, call available native/process APIs and
  exploit granted capabilities; isolate untrusted plugins at an OS/process boundary.
- A native library is associated with a class loader namespace and may refuse a second load from
  another loader. Plugin reload designs that use JNI must own `JNI_OnUnload`, native threads and
  callbacks explicitly; Java reachability alone cannot prove native state was released.
- `Unsafe::defineAnonymousClass` was removed in JDK 17. Lambdas and generated bytecode use
  hidden classes (JEP 371). A default weak hidden class may unload independently when its
  `Class` and instances are unreachable; `STRONG` ties unloading to the defining loader. Current
  lambda proxy implementation details must be measured for the deployed JDK, and every live
  generated class still consumes metadata.

## Selection framework

| Need                                             | Prefer                                                              | Avoid or constrain                     |
| ------------------------------------------------ | ------------------------------------------------------------------- | -------------------------------------- |
| Load an application/library-owned type           | Caller/defining loader                                              | Ambient TCCL guessing                  |
| Discover providers in a container                | Contract-selected loader or scoped TCCL                             | Leaving TCCL changed on pooled threads |
| Isolate reloadable code                          | Module layer or explicit child loader with parent-shared API        | Duplicating API types across loaders   |
| Reload configuration/data                        | Replace immutable state through an application lifecycle            | New loader per refresh                 |
| Generate many short-lived implementation classes | Weak hidden classes when name discovery/redefinition is unnecessary | `STRONG` without a lifetime reason     |

Before accepting a custom loading architecture, specify delegation for classes **and resources**,
shared API ownership, package sealing/signers, module readability/exports/opens, lifecycle cleanup,
parallel-capable locking, observability, and the security provenance of bytes passed to
`defineClass`.

## Production evidence packet

Collect before restarting or flattening the class path:

```bash
jcmd <pid> VM.classloaders verbose=true
jcmd <pid> VM.classloader_stats
jcmd <pid> Thread.print
```

Add a bounded `-Xlog:class+load=info,class+unload=info` reproduction when safe; add
`class+loader+constraints=info` for a loader-constraint failure. For both sides of an
identity/access failure record `type.getName()`, `type.getClassLoader()`, `type.getModule()` and
`type.getProtectionDomain().getCodeSource()` (the latter can be null). Redact paths if they
expose tenant/build information. Do not infer origin from a class name or JAR filename alone.

The remediation must pass concurrent first-load, duplicate artifact, missing optional provider,
reload/unload, shutdown, module-boundary and supported-JDK tests. Plugin tests must assert that
objects crossing the boundary implement parent-owned contracts and that no plugin thread/TCCL or
registration survives stop.

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
