# Startup: CDS and the AOT cache

## What is actually cached

Loading a class is three distinct steps, and the caches cover different subsets:

| Step           | What happens                          | CDS | AOT cache (JEP 483) | AOT profiles (JEP 515) |
| -------------- | ------------------------------------- | --- | ------------------- | ---------------------- |
| Loading        | bytes located and parsed              | ✅  | ✅                  | ✅                     |
| Linking        | verification, preparation, resolution | ✅  | ✅                  | ✅                     |
| Initialisation | `<clinit>` runs — arbitrary Java code | ❌  | ❌                  | ❌                     |
| JIT profiling  | C2 starts with profile data           | ❌  | ❌                  | ✅                     |

**Loading is not initialising.** A class can be loaded and linked with `<clinit>` still
pending. This is why a cache that halves class-loading time may barely move a startup
dominated by static initialisers doing I/O.

## The JDK 25 baseline

- **JEP 483** (JDK 24) — AOT cache storing loaded and linked classes.
- **JEP 514** (JDK 25) — creation reduced to a single command via `-XX:AOTCacheOutput`.
- **JEP 515** (JDK 25) — method profiles added, so C2 can start with information instead
  of collecting it. This is the only warm-up strategy that attacks the _profiling_ phase;
  everything else attacks class loading.

## Verify it is being used

The cache is rejected **silently** by a JDK change, a flag change or a classpath change. A
build that quietly stopped using it looks exactly like a build that never had it. The
opposite failure also exists on JDK 25: a rebuilt JAR at the same path is _accepted_ and
old classes run from the cache (JDK-8377932) — the validation rules per artefact are in
startup-cds-crac-leyden.

```bash
java -Xlog:aot,class+path=info -XX:AOTCache=app.aot -jar app.jar   # rejection reason per entry
java -Xlog:class+load -XX:AOTCache=app.aot -jar app.jar | grep "com.example" | grep -c "shared objects file"
```

Make this a startup assertion, not a one-off check: the failure mode is a deploy that
changes one JAR and loses the whole benefit with no signal.

The training run must be representative. A cache trained on a run that never touched the
hot endpoints caches the wrong classes and the wrong profiles.

## Related startup costs that caches do not address

- `<clinit>` doing database or file I/O — move it to explicit initialisation at a
  lifecycle point you choose.
- Non-parallel-capable custom loaders serialising all loading in their subsystem.
- Lambda and proxy generation: hidden classes are collected with their `Lookup`, but each
  distinct lambda still costs Metaspace at first use.
