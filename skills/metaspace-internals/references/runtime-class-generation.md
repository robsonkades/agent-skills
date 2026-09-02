# Runtime class generation and metaspace

Read when metaspace grows in a process that does not redeploy, when `VM.classloader_stats`
shows many `+ hidden classes` rows or hundreds of loaders with one class each, or when
proxies, lambdas, mocks, scripts or templates are suspected of minting classes.

## What a generated class costs

Every class occupies metaspace for as long as its `ClassLoaderData` lives, and every
`ClassLoaderData` (CLD) owns at least one chunk in each of the two spaces. Measured on
25.0.3 with `jcmd <pid> VM.metaspace show-loaders`:

```
1: CLD 0x…: <hidden class>, loaded by "<bootstrap>", 1 class
  Non-Class:    1 chunk,  2.00 KB capacity, 2.00 KB committed, 1.94 KB used
      Class:    1 chunk,  1.00 KB capacity, 1.00 KB committed,  528 bytes used
```

A **non-strong hidden class gets its own CLD**, so the smallest possible generated class
costs 3 KB of committed chunks, of which roughly 1 KB is used (measured: 20,000 trivial
hidden interfaces raised `Metaspace` used by 1044 B each and `Compressed Class Space` by
520 B each). Real generated classes — a proxy with a dozen methods, a compiled script — are
larger, and their constant pools and bytecode all land in the non-class space. Growth is
therefore `classes × per-class bytes`, and only the first factor is controllable.

## Which generator is bounded and which is not

| Source                                                                                                                     | One class per …                                                      | Bounded by                                               | Unbounded when                                                                                                                |
| -------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- | -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Lambdas and method references (`InnerClassLambdaMetafactory`)                                                              | call site — 2,000 evaluations of one lambda produced no extra class  | number of lambda expressions in the code                 | Never by evaluation count; only by code size                                                                                  |
| `java.lang.reflect.Proxy`                                                                                                  | (loader, interface list) — 200 instances of one interface, one class | the set of interface combinations                        | Interface lists are built dynamically per request, or per-request loaders                                                     |
| `MethodHandle` combinators (`LambdaForm$MH`, `Holder` classes)                                                             | new combinator _shape_, as a hidden class in the boot loader         | the shapes the code uses; warms up and stops             | Reflection or `MethodHandles` are driven by user input — an expression engine that builds a fresh handle chain per expression |
| ByteBuddy / CGLIB / Spring AOP / Hibernate proxies                                                                         | proxied type (and advisor set)                                       | the number of beans and entities                         | Proxies are created per instance instead of per type — `Enhancer` called inside a request, a bean scope that rebuilds proxies |
| Mockito and other mock libraries                                                                                           | mocked type, sometimes per mock with the inline maker                | the test suite's types                                   | Thousands of tests each creating mocks in a single forked JVM — the classic CI `OutOfMemoryError: Metaspace`                  |
| Scripting engines (Groovy, JavaScript engines, JRuby)                                                                      | **evaluation**, unless the engine caches compiled scripts            | nothing, by default                                      | `GroovyShell.evaluate(text)` or `ScriptEngine.eval(String)` on a request path — each call defines a new class in a new loader |
| Expression and template engines (SpEL compiled mode, JSP, Thymeleaf-like precompilers, JAXB/Jackson bytecode accelerators) | expression or template                                               | the distinct expressions, if the compiled form is cached | Expressions are interpolated with data (`"price > " + threshold`), so every value is a new expression                         |
| `Lookup.defineHiddenClass` / `defineClass` in application code                                                             | call                                                                 | whatever the caller caches                               | The caller does not cache — the same bytes defined again are a new class, never a lookup                                      |
| Serialisation libraries with generated (de)serialisers                                                                     | (type, configuration)                                                | the type set                                             | A new `ObjectMapper` per request, so the per-type cache is rebuilt every time                                                 |

The two questions that classify any of these: **is the key of the generator's cache derived
from code or from data**, and **does the loader that defines the class die**? Code-keyed
generation plateaus once the application is warm; data-keyed generation grows with traffic.
A class in a loader that is later collected is released as that loader's chunks
(`num_arena_deaths` in `VM.metaspace basic` counts them); a class in a loader that lives
forever is permanent.

## Attribution

```bash
jcmd <pid> VM.classloader_stats            # loaders, classes per loader, "+ hidden classes" sub-rows
jcmd <pid> VM.metaspace show-loaders       # per-CLD chunk usage; hidden classes appear as their own CLD
jcmd <pid> VM.metaspace show-loaders show-classes   # names the classes — grep the generator's naming pattern
```

Generated classes name their origin: `Foo$$Lambda/0x…` for lambdas, `jdk.proxy2.$Proxy12`
for JDK proxies, `Foo$$SpringCGLIB$$0` / `Foo$ByteBuddy$…` / `Foo$HibernateProxy$…` for the
frameworks, `Script1`, `Script2`, … for Groovy, `java.lang.invoke.LambdaForm$MH/0x…` for
method-handle spinning. Count by pattern over two captures ten minutes apart; the pattern
whose count grew is the generator.

From a recording, `jdk.ClassDefine` (one event per defined class, with the defining loader
and a stack trace when enabled) names the code path that mints them, and
`jdk.ClassLoadingStatistics` gives the loaded-versus-unloaded trend. At the failure itself,
`jdk.MetaspaceAllocationFailure` carries the stack of the allocation that could not be
satisfied. `-Xlog:class+load` prints every definition with its `source:` and is the
zero-tooling fallback; keep it short-lived, it is one line per class.

## Remediation, by finding

| Finding                                         | Fix                                                                                                                                     | Verified by                                                                     |
| ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Script or expression compiled per evaluation    | Cache the compiled form keyed by source text; bound the cache; parametrise instead of interpolating data into the source                | `VM.classloader_stats` class count flat across N evaluations of the same script |
| Proxy per instance                              | Create the proxy class once per type; reuse; check the framework's own class cache is not bypassed by a fresh `ClassLoader` per request | Loader count flat under load                                                    |
| Mock-driven CI failure                          | Fork the test JVM per module or per N classes; `MaxMetaspaceSize` sized from a measured run — a smaller value only fails sooner         | The build passes at the measured ceiling twice in a row                         |
| Handle chains built from user input             | Precompute the finite set of shapes; reject or interpret unbounded input                                                                | `LambdaForm$MH` count plateaus after warm-up                                    |
| Everything bounded but the ceiling is still hit | It is sizing: `MaxMetaspaceSize` and `CompressedClassSpaceSize` from the measured plateau (`sizing-and-flags.md`)                       | Plateau reproduced under the same load                                          |

Raising a ceiling against data-keyed generation moves the incident, and the ticket should
say so. The structural fix is always the cache key.
