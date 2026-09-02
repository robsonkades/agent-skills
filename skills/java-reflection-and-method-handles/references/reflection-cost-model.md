# What reflection and handles cost on the current runtime

## Core reflection is method handles now (JEP 416, JDK 18)

`Method.invoke`, `Constructor.newInstance` and `Field.get`/`set` have been implemented on top
of `java.lang.invoke` since JDK 18. On Temurin 25.0.3 a stack trace through a reflective call
reads:

```
ReflectTest.target(ReflectTest.java:5)
java.base/jdk.internal.reflect.DirectMethodHandleAccessor.invoke(DirectMethodHandleAccessor.java:104)
java.base/java.lang.reflect.Method.invoke(Method.java:565)
```

What that changes:

| Belief from the old implementation                                                     | Status on JDK 25                                                                                                                                                                                        |
| -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| "The first calls go through a native accessor, then bytecode is generated" (inflation) | Gone. `jdk.internal.reflect.ReflectionFactory` reads only `jdk.reflect.useNativeAccessorOnly`; `NativeMethodAccessorImpl` and `MethodAccessorGenerator` are no longer in `src.zip`.                     |
| `-Dsun.reflect.inflationThreshold` / `-Dsun.reflect.noInflation` tune reflection       | Ignored. A runbook that sets them documents a JVM that no longer exists.                                                                                                                                |
| `-Djdk.reflect.useDirectMethodHandle=false` restores the old path                      | Ignored; the old implementation was removed along with the switch.                                                                                                                                      |
| `Method.invoke` is "slow reflection", handles are "fast"                               | Same machinery underneath. The remaining gap is `Object[]` boxing, the per-call access and argument checks, and that the JIT cannot inline through a `Method` the way it can through a constant handle. |

JEP 416 states the trade explicitly: comparable performance once warm, a slower first call
per member while the accessor's handle is spun. A startup path that reflects over thousands
of members pays that once; a request path pays boxing and checks on every call.

## Where the cost actually is

| Operation                                      | Cost                                                                                                            | Consequence                                                                                 |
| ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `Class.forName(name)`                          | Class loading and, by default, initialisation, under the loader's lock                                          | Resolve once; never per request                                                             |
| `getDeclaredMethods()` / `getMethod(...)`      | Scans and **copies**: every call returns a fresh `Method` (`getMethod("x") == getMethod("x")` is `false` on 25) | Cache the `Method`; `setAccessible(true)` applies to the copy you hold, not to the next one |
| `Method.invoke`                                | Access check, argument boxing into `Object[]`, return boxing, `InvocationTargetException` wrapping              | Fine at startup; on a hot path prefer a constant handle or generated code                   |
| `MethodHandle.invokeExact` on a `static final` | Constant-folded by C2 and inlinable                                                                             | The only form that approaches a direct call                                                 |
| `MethodHandle.invoke`                          | Adds an `asType` adaptation when the call-site signature differs                                                | Slightly slower; still inlinable when the handle is constant                                |
| `MethodHandle.invokeWithArguments`             | Builds an argument array and adapts on every call                                                               | The slow path — no better than `Method.invoke`; never on a hot path                         |
| Handle in an instance field or a local         | Not a JIT constant                                                                                              | An ordinary indirect call; the "handles are fast" claim does not apply                      |

The condition for inlining is that the handle is a constant from the JIT's point of view: a
`static final` field, or a call site bound through `invokedynamic` (`ConstantCallSite`), which
is how frameworks get the same effect for handles they build at run time.

## Turning one resolution into ordinary calls

- `LambdaMetafactory` binds a handle into an instance of a functional interface once; every
  call afterwards is an interface call the JIT treats normally.
- `MethodHandleProxies.asInterfaceInstance` does the same thing reflectively and is slower —
  tooling, not a per-element path.
- Generated accessors — the pattern behind serialisers and mappers — are defined with
  `Lookup.defineHiddenClass` (JDK 15), the supported replacement for
  `Unsafe.defineAnonymousClass` and the reason code generation no longer needs internal APIs.

## Verifying rather than believing

- **Which implementation is running:** `Thread.dumpStack()` inside a reflectively invoked
  method; `DirectMethodHandleAccessor` in the trace means JEP 416 is in effect.
- **Whether a handle inlined:** `-XX:+UnlockDiagnosticVMOptions -XX:+PrintInlining` shows the
  `invokeBasic`/`linkTo` chain inlined into the caller, or the refusal
  (compilation-and-inlining-logs).
- **Whether it costs anything:** a JMH comparison of direct call, `static final` handle,
  instance-field handle and `Method.invoke` for the same target, with `-prof gc` —
  `gc.alloc.rate.norm` exposes the boxing that a timing number hides (jmh-microbenchmarks).
