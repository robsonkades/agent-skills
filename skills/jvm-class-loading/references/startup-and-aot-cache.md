# Startup: CDS and the AOT cache

## What is actually cached

Loading, linking, initialization and compilation are distinct, and each feature archives a
selected subset rather than promising that every class/reference is complete:

| Work                                          | Traditional CDS         | JEP 483 AOT class loading/linking                      | JEP 515 profiles (JDK 25)             |
| --------------------------------------------- | ----------------------- | ------------------------------------------------------ | ------------------------------------- |
| Parsed class metadata / selected heap objects | Yes                     | Yes, expanded from CDS                                 | Uses the same AOT container           |
| Verification/preparation/selected resolution  | Some work can be reused | Trained classes can be loaded and linked ahead of time | Same class/link artifacts             |
| Arbitrary application `<clinit>` side effects | Do not assume cached    | Do not assume cached or skipped                        | Not the profile feature's job         |
| Execution profiles for optimizing compilers   | No                      | No                                                     | Trained profiles can seed compilation |
| Native compiled application methods           | No                      | No                                                     | No in JDK 25                          |

**Loading/linking is not application initialization.** A class may be linked while its
`<clinit>` remains pending. The cache can archive constrained JDK heap/runtime state, but that is
not permission to expect arbitrary application static initialization to have run. Profile before
assuming class loading dominates startup; I/O, framework graph construction and external service
readiness may dominate instead.

## The JDK 25 baseline

- **JEP 483** (JDK 24) — AOT cache storing loaded and linked classes.
- **JEP 514** (JDK 25) — creation reduced to a single command via `-XX:AOTCacheOutput`.
- **JEP 515** (JDK 25) — training profiles are stored so optimizing compilation can consume
  prior execution information. It improves warm-up but does not guarantee the production path,
  receiver distribution or branch frequencies match training.

## Verify it is being used

An AOT cache is specific to the application launch shape, JDK release, OS and CPU architecture;
recreate it when any changes. In default `AOTMode=auto`, incompatibility falls back to execution
without the application cache, so an unobserved deployment can lose the benefit. `AOTMode=on`
fails fast and is useful as a build/deployment compatibility check, while production commonly
uses `auto` plus an explicit startup assertion. Treat the cache as a versioned, integrity-checked
artifact paired with the exact application image; compatibility checks are not a substitute for
supply-chain provenance.

```bash
java -XX:AOTMode=on -Xlog:aot=info -XX:AOTCache=app.aot -jar app.jar
java -Xlog:class+load=info -XX:AOTCache=app.aot -jar app.jar
```

In CI, assert `AOTMode=on` accepts the assembled image. In production `auto`, extract a stable
log/metric showing whether the application cache loaded, then compare cold-start distributions
with and without it. Do not use a grep count as the sole SLO: class selection changes legitimately.

The training run must be representative, bounded and free of irreversible production side
effects. Cover startup and important early endpoints with stable data; retrain when code, flags,
classpath/module path, deployment CPU/OS or workload shape changes. Validate both correctness and
startup/warm-up percentiles on a fresh process cohort.

## Related startup costs that caches do not address

- `<clinit>` doing database or file I/O — move it to explicit initialisation at a
  lifecycle point you choose.
- Non-parallel-capable custom loaders serialising all loading in their subsystem.
- Lambda and proxy generation: weak hidden classes may unload independently, while strong hidden
  classes follow loader lifetime; either way, live generated classes consume metadata.

## Primary references

- [Java 25 launcher: Ahead-of-Time Cache](https://docs.oracle.com/en/java/javase/25/docs/specs/man/java.html#ahead-of-time-cache)
- [JEP 483: Ahead-of-Time Class Loading & Linking](https://openjdk.org/jeps/483)
- [JEP 514: Ahead-of-Time Command-Line Ergonomics](https://openjdk.org/jeps/514)
- [JEP 515: Ahead-of-Time Method Profiling](https://openjdk.org/jeps/515)
