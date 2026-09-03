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

The stack frame is evidence for this build, not a supported internal API. JDK 18 moved core
reflection to MethodHandle/VarHandle machinery; implementations may add hidden adapters/stubs and
change thresholds. JDK 22 removed the old implementation. What that changes:

| Belief from the old implementation                                                 | Status on JDK 25                                                                                                              |
| ---------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| "Native accessor then generated accessor" and inflation flags are the tuning model | Obsolete for current JDKs; do not tune undocumented `sun.reflect.*` flags                                                     |
| `-Djdk.reflect.useDirectMethodHandle=false` restores the old path                  | It was a JDK 18 transition switch; the old implementation was removed in JDK 22, so it is a no-op there and later             |
| “Reflection never generates adapters anymore”                                      | False; MethodHandle-based implementations may spin internal hidden stubs/adapters. Their shape is not an application contract |
| `Method.invoke` is always slow and handles are always fast                         | False; member/handle constancy, signature adaptation, boxing, target inlining, tier and call-site profile matter              |

JEP 416's measurements improved constant reflected members but showed regressions for some
non-constant `Field`/member storage shapes. That is the decision rule: startup discovery count and
steady-state invocation are separate hypotheses; measure both on the supported update.

## Where the cost actually is

| Operation                                 | Cost                                                                                                                    | Consequence                                                              |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `Class.forName(name)`                     | Name-based loading through the selected loader and, by default, separate class initialization                           | Use explicit loader/initialization policy; resolve outside request loops |
| `getDeclaredMethods()` / `getMethod(...)` | Enumeration/lookup and reflected-object/array creation are implementation costs; object identity is not an API contract | Resolve once per schema/lifecycle, but do not pin plugin loaders         |
| `Method.invoke`                           | Varargs call-site array/boxing, access and argument checks, target exception wrapping; EA may remove some allocations   | Fine when infrequent; measure if repeated                                |
| Stable `MethodHandle.invokeExact`         | Exact dynamic type check; compiler may expose adapters/target and inline                                                | Best candidate for typed repeated invocation, not an inlining guarantee  |
| `MethodHandle.invoke`                     | Exact path when types match; otherwise behaves as `asType`, which need not materialize an adapter                       | Prefer a stable call-site descriptor; test conversion failures           |
| `MethodHandle.invokeWithArguments`        | Generic `Object`-typed spreading, conversion and boxing; varargs invocation can create arrays                           | Boundary/tooling convenience, not default inner-loop API                 |
| Handle from field/local/array             | Constancy depends on data flow and compiler proof, not Java syntax alone                                                | Compare actual storage shapes in JMH/compiler logs                       |

Inlining requires a compiler-visible stable target plus normal size/profile/policy conditions.
`static final` and a stable `ConstantCallSite` are useful shapes, not sufficient conditions;
mutable call sites require their documented publication protocol and may prevent target folding.

## Turning one resolution into ordinary calls

- `LambdaMetafactory` can link a compatible direct method handle to a functional-interface call
  site; it is a low-level linker with strict type/capture rules, not a generic wrapper function.
- `MethodHandleProxies.asInterfaceInstance` is a reflective adapter with interface/module and
  wrapper semantics; measure it rather than assuming equivalence to metafactory output.
- Generated accessors may use source generation or `Lookup.defineHiddenClass`; weak versus
  `STRONG` hidden-class lifetime and cached handles affect class unloading.

## Verifying rather than believing

- **Which implementation is running:** `Thread.dumpStack()` inside a reflectively invoked
  method; `DirectMethodHandleAccessor` in the trace means JEP 416 is in effect.
- **Whether a handle inlined:** `-XX:+UnlockDiagnosticVMOptions -XX:+PrintInlining` shows the
  `invokeBasic`/`linkTo` chain inlined into the caller, or the refusal
  (compilation-and-inlining-logs).
- **Whether it costs anything:** a JMH comparison of direct call, `static final` handle,
  instance-field handle and `Method.invoke` for the same target, with `-prof gc` —
  `gc.alloc.rate.norm` exposes the boxing that a timing number hides (jmh-microbenchmarks).

Keep benchmark signatures identical, consume results, include cold lookup separately, use enough
forks/warm-up to observe compilation and inspect `PrintInlining`/assembly only after the benchmark
shows a material difference. Validate the chosen design in the real throughput/tail-latency path.

## Primary references

- [JEP 416: Reimplement Core Reflection with Method Handles](https://openjdk.org/jeps/416)
- [JDK 22 release note: old core-reflection implementation removed](https://www.oracle.com/java/technologies/javase/22-relnote-issues.html)
- [Java 25 `Method`](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/lang/reflect/Method.html)
- [Java 25 `MethodHandle`](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/lang/invoke/MethodHandle.html)
