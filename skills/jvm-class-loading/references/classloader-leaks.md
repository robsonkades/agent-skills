# Classloader leaks

## Why this is invisible

Only whole loaders are unloaded. One forgotten strong reference retains the entire class
graph of that loader — and the retaining object is usually tiny, while the damage lands in
Metaspace, which no heap dump renders as a size.

The consequence: memory dashboards look healthy right up to
`OutOfMemoryError: Metaspace`, or to an OOMKill if `MaxMetaspaceSize` was never set.

## Confirm before hunting

```bash
jcmd <pid> VM.classloader_stats     # before N reload cycles
# ... N cycles ...
jcmd <pid> VM.classloader_stats     # after
```

A monotonically growing count of loaders with the same `Type` confirms the leak. Without
this step you are looking for a retainer that may not exist.

Also expose, for continuous monitoring:

- `LoadedClassCount` (`java.lang:type=ClassLoading`), alerting on sustained growth
- Metaspace usage, alerting **before** `MaxMetaspaceSize`
- `jdk.ClassLoaderStatistics` in the continuous JFR recording

## Find the retainer

```bash
jcmd <pid> GC.heap_dump /tmp/heap.hprof
```

In Eclipse MAT: _Path to GC Roots_, **excluding weak references**. The usual suspects, in
the order they are usually found:

- a `ThreadLocal` on a pooled thread
- a JDBC driver registered in `DriverManager` from inside the reloadable artefact
- a shutdown hook
- a listener registered on a singleton that outlives the loader
- a reflection cache keyed by `Class`

## The two-part `close()` trap

```java
// ❌ JARs stay open, and the loader is never released
URLClassLoader cl = new URLClassLoader(urls, parent);

// ✅ Closes the JARs...
try (URLClassLoader cl = new URLClassLoader(urls, parent)) { /* ... */ }
```

`close()` releases file handles. It does **not** release Metaspace. If any object created
by the loader remains reachable, the loader remains alive and no class is unloaded. Both
halves are required: close it _and_ leave nothing reachable behind.

## Validate

Repeat the **same** `VM.classloader_stats` measurement over the same number of cycles.
The absence of the symptom is not evidence; a flat loader count is.

## Instrumentation agents

An agent without a package filter transforms and retains far more than intended. Configure
the filter explicitly — this is a frequent, and frequently unsuspected, contributor to
loader retention.
