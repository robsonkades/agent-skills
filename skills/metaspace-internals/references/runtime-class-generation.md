# Runtime class generation and metaspace

Read when metaspace grows in a process that does not redeploy, when `VM.classloader_stats`
shows many `+ hidden classes` rows or hundreds of loaders with one class each, or when
proxies, lambdas, mocks, scripts or templates are suspected of minting classes.

## What a generated class costs

Every class occupies metadata for as long as its `ClassLoaderData` (CLD) lives. The following
smallest-observed chunks are a historical measurement from one compressed-class-pointer
JDK 25.0.3 build whose vendor/architecture was not recorded here, not an ABI or a sizing constant:

```
1: CLD 0x…: <hidden class>, loaded by "<bootstrap>", 1 class
  Non-Class:    1 chunk,  2.00 KB capacity, 2.00 KB committed, 1.94 KB used
      Class:    1 chunk,  1.00 KB capacity, 1.00 KB committed,  528 bytes used
```

A **non-strong hidden class gets its own CLD** on this implementation, so the measured
illustrated class occupies 3 KB of committed chunk capacity, with about 2.46 KB used in
this row. Chunk-accounted capacity is not a private OS commitment granule per hidden class;
classes can share commitment granules. Do not combine this row with unrelated per-class
averages or treat it as a general footprint constant. Real generated classes — a proxy with a dozen methods, a compiled script — are
larger, and their constant pools and bytecode all land in the non-class space. Growth is
approximately `class count × metadata shape` plus arena/chunk overhead. Both factors can
change: method count, constant-pool/debug metadata and generator strategy affect per-class
cost, although cardinality and loader lifetime usually dominate.

## Which generator is bounded and which is not

| Source                                                                                                                     | One class per …                                                      | Bounded by                                               | Unbounded when                                                                                                              |
| -------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- | -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Lambdas and method references (`InnerClassLambdaMetafactory`)                                                              | normally a linked call site                                          | linked call sites and defining-loader lifetime           | new loaders/call sites are continually introduced; verify the JDK/framework implementation                                  |
| `java.lang.reflect.Proxy`                                                                                                  | (loader, interface list) — 200 instances of one interface, one class | the set of interface combinations                        | Interface lists are built dynamically per request, or per-request loaders                                                   |
| `MethodHandle` combinators (`LambdaForm$MH`, `Holder` classes)                                                             | implementation-specific form/shape                                   | cached shapes in that JDK build                          | user-driven composition keeps introducing shapes; do not assume warm-up is finite                                           |
| ByteBuddy / CGLIB / Spring AOP / Hibernate proxies                                                                         | proxied type (and advisor set)                                       | the number of beans and entities                         | Class cache is bypassed/disabled, or keys/loaders change; proxy instance creation alone does not prove new class definition |
| Mockito and other mock libraries                                                                                           | maker/version/fork-specific generated form                           | framework caches and fork lifecycle                      | cache keys/loaders grow across a long-lived test JVM; measure rather than infer from mock count                             |
| Scripting engines (Groovy, JavaScript engines, JRuby)                                                                      | engine- and compilation-mode-specific unit                           | engine cache and loader lifecycle                        | distinct source or fresh engines/loaders continually define classes                                                         |
| Expression and template engines (SpEL compiled mode, JSP, Thymeleaf-like precompilers, JAXB/Jackson bytecode accelerators) | expression or template                                               | the distinct expressions, if the compiled form is cached | Expressions are interpolated with data (`"price > " + threshold`), so every value is a new expression                       |
| `Lookup.defineHiddenClass` / `defineClass` in application code                                                             | call                                                                 | whatever the caller caches                               | Hidden-class calls define distinct classes; named defineClass with the same name/loader fails with LinkageError             |
| Serialisation libraries with generated (de)serialisers                                                                     | module/generator-specific `(type, configuration)`                    | enabled generator and its caches                         | generator modules/loaders are recreated or the type/configuration key space is unbounded                                    |

The two questions that classify any of these: **is the key of the generator's cache derived
from code or from data**, and **does the loader that defines the class die**? Code-keyed
generation often plateaus once the observed code paths are linked; data-keyed generation can
grow with distinct input cardinality rather than request count alone. New deployments,
loaders, tenants and call sites invalidate a simple code-versus-data binary classification.
Ordinary named classes normally share their defining loader lifetime. Non-strong hidden
classes can unload while that loader remains alive; their own CLD reachability matters.
`num_arena_deaths` counts arenas, not loaders, and reclaiming them does not require all freed
capacity to be returned to the OS.

## Attribution

```bash
jcmd <pid> VM.classloader_stats            # loaders, classes per loader, "+ hidden classes" sub-rows
jcmd <pid> VM.metaspace show-loaders       # per-CLD chunk usage; hidden classes appear as their own CLD
jcmd <pid> VM.metaspace show-loaders show-classes   # names the classes — grep the generator's naming pattern
```

Generated class names often suggest their origin: `Foo$$Lambda/0x…` for lambdas, `jdk.proxy2.$Proxy12`
for JDK proxies, `Foo$$SpringCGLIB$$0` / `Foo$ByteBuddy$…` / `Foo$HibernateProxy$…` for the
frameworks, `Script1`, `Script2`, … for Groovy, `java.lang.invoke.LambdaForm$MH/0x…` for
method-handle spinning. Count by pattern over comparable captures separated by the workload's
generation interval; ten minutes is not a universal observation window. The pattern
whose count grew is a hypothesis for the generator; confirm it with defining loader and stack.

From a recording, `jdk.ClassDefine` (one event per defined class, with the defining loader
and a stack trace when enabled) names the code path that mints them, and
`jdk.ClassLoadingStatistics` gives the loaded-versus-unloaded trend. At the failure itself,
`jdk.MetaspaceAllocationFailure` can carry the stack when enabled; a failed allocation can
recover after collection/expansion and does not alone prove terminal exhaustion. `-Xlog:class+load` prints every definition with its `source:` and is the
zero-tooling fallback; keep it short-lived, it is one line per class.

## Remediation, by finding

| Finding                                         | Fix                                                                                                                                 | Verified by                                                                                                                |
| ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Script or expression compiled per evaluation    | Cache the compiled form keyed by source text; bound the cache; parametrise instead of interpolating data into the source            | `VM.classloader_stats` class count flat across N evaluations of the same script                                            |
| Proxy per instance                              | Reuse the generated class for the actual bounded cache key; inspect cache bypass and changing keys/loaders                          | Class count per loader and metadata plateau for the tested key population; flat loader count alone is insufficient         |
| Mock-driven CI failure                          | Bound fork lifetime/cardinality and size from representative evidence; retained generator state needs lifecycle/cache investigation | Complete the bounded workload within the budget; repeated passes alone do not prove unloading or bounded long-lived growth |
| Handle chains built from user input             | Precompute the finite set of shapes; reject or interpret unbounded input                                                            | `LambdaForm$MH` count plateaus after warm-up                                                                               |
| Everything bounded but the ceiling is still hit | It is sizing: `MaxMetaspaceSize` and `CompressedClassSpaceSize` from the measured plateau (`sizing-and-flags.md`)                   | Plateau reproduced under the same load                                                                                     |

Raising a ceiling against unbounded generation moves the incident, and the ticket should say
so. The structural fix depends on ownership: bound and validate input cardinality, cache with
an eviction/lifetime model, reuse or retire loaders, interpret instead of compile, isolate a
tenant, or reject work under pressure. User-controlled scripts/expressions are a resource-
exhaustion boundary: cap source size, compilation rate, distinct keys and per-tenant budget;
do not use an unbounded cache as the remedy.

A fixed loader count can coexist with growing named classes in one long-lived loader. Compare
class counts and metadata by defining loader as well as total loader/CLD counts. For a lifecycle
fix, observe the relevant class/CLD reclamation under available collection opportunities; successful
builds or a larger ceiling establish only the tested capacity window. Use `jvm-class-loading` for
the reachability and retainer investigation.

[Lookup API](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/lang/invoke/MethodHandles.Lookup.html)
distinguishes named definition, hidden-class identity and strong versus weak lifetime.
