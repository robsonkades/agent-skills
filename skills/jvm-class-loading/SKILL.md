---
name: jvm-class-loading
description: >
  Class loading, class identity and classloader leaks: parent-first delegation,
  {defining loader, binary name} identity, loading versus linking versus initialisation, Metaspace retention,
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

Inspect the Java toolchain, JVM vendor/build, launch/module paths and loader implementation
before applying commands or version-sensitive advice. Examples use Java 17-compatible partial
snippets; diagnostic output is scoped to Temurin 25.0.3 and AOT features state their own minimum
release. This does not authorize an upgrade or a global access override.

## Workflow

Choose the branch that answers the request and reuse adequate source, launch, stack or heap
evidence already supplied. A narrow explanation needs the relevant contract and counterexample;
it does not require a production capture or a plugin test matrix. When evidence cannot separate
the hypotheses, state the gap and the smallest useful next check. Keep a sound existing design
when the evidence does not justify a change.

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
   "does not export" points to ordinary access; `InaccessibleObjectException` mentioning
   `does not "opens"` points to deep reflection. Prefer fixing the API, dependency or owned
   module descriptor; use narrow `--add-exports`/`--add-opens` only when justified.
   An export alone does not permit access to private members. See `references/module-access.md`.
4. **For suspected leaks, establish a cohort and unloading opportunity:** capture
   `jcmd <pid> VM.classloader_stats`, exercise N equivalent reload/redeploy cycles, allow the
   configured collector to perform class unloading, then capture again. Persistent growth in
   obsolete loader cohorts is evidence of retention; raw loaded-class growth alone is not proof.
5. **For retention that still needs attribution, find the strong path to a GC root.** Reuse
   an adequate dump and _Path to GC Roots_ in Eclipse MAT, excluding weak references; capture
   with `jcmd <pid> GC.heap_dump <file>` only if the missing evidence warrants its pause, disk
   and data exposure. See `references/classloader-leaks.md` before capture.
6. **Validate a change against the failure it addresses.** Repeat comparable lifecycle
   measurements for a leak fix; use a focused reproduction for identity, access or initialization.
7. **For loader-constraint or duplicate-definition failures, reconstruct the graph:** the
   initiating loader at each symbolic reference, the eventual defining loader, delegation order,
   duplicate class/resources and the shared method descriptor. `LinkageError: loader constraint
violation` means two namespaces were forced to agree on a descriptor type and did not; adding
   casts or changing load order is not a fix.

## Rules

- `close()` on a `URLClassLoader` releases the JARs, **not** Metaspace. A reachable instance of an ordinary class
  defined by that loader retains its class/loader; a parent-defined value created by plugin
  code does not necessarily retain the plugin. Weak hidden-class exceptions still apply. Confusing these two is the most common cause of "I close the loader and
  Metaspace keeps growing".
- Parent-first delegation preserves namespace consistency and helps prevent child artifacts from
  shadowing platform/shared API classes. Child-first isolation requires an explicit boundary:
  always delegate platform namespaces and shared contract types, define package/resource order,
  and test split-package, service-provider and sealing behavior. A `null` parent selects bootstrap
  visibility, not all platform classes. On Java 17+, use `ClassLoader.getPlatformClassLoader()`
  when the boundary requires platform APIs but not application classes; use the shared API's
  defining loader when that contract must cross the boundary. Check custom runtime images for
  missing modules before attributing every platform lookup failure to parent selection. See the
  [ClassLoader parent contract](https://docs.oracle.com/en/java/javase/17/docs/api/java.base/java/lang/ClassLoader.html).
- Custom loaders are not parallel-capable by default. For the standard
  `loadClass` implementation, absent successful `registerAsParallelCapable()` registration,
  `getClassLoadingLock` uses the whole loader rather than a per-name lock. Overrides can
  change synchronization and must establish their own correctness. Registration also depends on the superclass chain;
  check the boolean result/`isRegisteredAsParallelCapable()` and keep `loadClass` idempotent under
  concurrent requests for the same name.
- `Class.forName(name)` initializes through the caller's defining loader. Use that for
  library-owned types; use a loader explicitly supplied by the plugin/container contract for
  isolated code. Use the thread context class loader only for APIs whose provider-discovery
  contract requires it, scope any temporary change with `try/finally`, and avoid retaining it on
  long-lived pooled threads.
- Keep `<clinit>` trivial. The initializing thread marks initialization in progress and releases
  the protocol lock before executing initializers. Other threads whose active use requires
  completion still wait for that initialization—and this enables initialization deadlock. If two threads each begin one of two mutually dependent initializers,
  they can wait for each other permanently; the tell in `jcmd <pid>
Thread.print` is `- waiting on the Class initialization monitor for X` under a thread
  reported as `RUNNABLE`, so a deadlock detector that looks only at monitors and locks
  reports nothing. See `references/class-initialisation.md`.
- `<clinit>` re-entered by the **same** thread does not block: JVMS 5.5 returns at once and
  the code can observe default values of non-constant `static` fields not yet assigned —
  `null`, `0`. Constant variables are initialized before ordinary initializers; source-level
  inlining is a separate reason their reads can avoid a field access. A static singleton whose
  constructor reads a later non-constant static field is the usual hazard.
- A `public static final` compile-time constant is copied into clients' class files. Changing it
  without recompiling consumers can leave old values in the same process, and ordinary compiled
  reads do not initialize the declaring class. Reflective field access has its own initialization
  trigger. Do not use mutable operational values as constant variables.
- Loading is not initializing. CDS/AOT can reuse selected metadata, linked state and constrained
  runtime objects; do not infer that arbitrary application `<clinit>` ran or was skipped. Measure
  class loading separately from initialization and framework/application work.
- A custom classloader is the wrong tool for reloading _configuration_. It brings type
  isolation you did not ask for and leak risk you do not need — reload a config object
  instead, and reserve loaders for isolated **code**.
- Every reloadable component needs a symmetric stop protocol: cancel/join its threads, close
  executors/resources, deregister JDBC drivers/MBeans/listeners/providers, clear TCCLs and remove
  parent-owned cache entries keyed by its `Class` objects. Stop admission and drain in-flight plugin
  calls before closing a `URLClassLoader`; concurrent class loading during `close()` is undefined.
  Moving an implementation to a shared loader trades unloadability for process-wide version
  coupling; share stable contracts, not all self-registering implementations by default.
- Class loaders and module layers are namespace/access mechanisms, not a sandbox for hostile code.
  Code defined into the process can consume CPU/memory, call available native/process APIs and
  exploit granted capabilities; isolate untrusted plugins at an OS/process boundary.
- A native library is associated with a class loader namespace and may refuse a second load from
  another loader. Plugin reload designs that use JNI must own `JNI_OnUnload`, native threads and
  callbacks explicitly; Java reachability alone cannot prove native state was released.
- `Unsafe::defineAnonymousClass` was removed in JDK 17. Code generators can use ordinary named
  classes or hidden classes (JEP 371); generated bytecode is not automatically weak or hidden.
  A default weak hidden class may unload independently when its
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

For an unresolved production incident, preserve relevant evidence before restarting or changing
the class path. Select the commands needed for the symptom and check support on the target JVM:

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

For a custom-loader or plugin-lifecycle change, select the affected checks: concurrent first-load,
duplicate artifacts, optional-provider failure, reload/unload, shutdown and module boundaries on
supported JDKs. Assert parent-owned contracts for objects crossing a shared API boundary; for
reload changes, assert that plugin-owned workers terminate and stale TCCLs/registrations are
removed. An explanation or isolated access fix does not require every plugin scenario.

Return the relevant loader/module/initialization facts, the supported diagnosis or remaining
hypothesis, the justified change or no-change decision, and what validation actually established.
Name unresolved evidence only where it changes the conclusion; scale the answer to the request.

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
  scope), resource encapsulation, and how the module system changes loader delegation. Read when
  an `IllegalAccessError` or `InaccessibleObjectException` names a module, or a packaged resource
  is missing even though its class loads.
- [Startup: CDS and the AOT cache](references/startup-and-aot-cache.md) — what JEP
  483/514/515 actually cache, how the cache is invalidated, and how to verify it is being
  used. Read when reducing cold start.
