---
name: java-reflection-and-method-handles
description: >
  Runtime access to code the compiler cannot check: what reflection costs beyond speed — no
  compile-time checking, invisible to refactoring and dead-code analysis, blocked by module
  encapsulation, and constrained by closed-world native-image analysis — the
  alternatives that keep the checking (interfaces, ServiceLoader, annotation processing,
  code generation), MethodHandles and VarHandles for genuinely dynamic access, and the
  security boundary around resolving a name that came from outside. Use when reflection
  appears in application code, when setAccessible needs --add-opens, when a framework works
  on the JVM and fails under native image, when a class name arrives from configuration or a
  payload, when Method.invoke or invokeWithArguments sits on a hot path, or when a runbook
  still sets sun.reflect.inflationThreshold or noInflation. FFM and JNI mechanics are
  jni-and-ffm, the annotations reflection reads are java-annotations, and deserialisation
  attack surface is java-serialization-hardening.
---

# Java Reflection and Method Handles

## Purpose

Keep dynamic access deliberate, narrow and described by metadata/contracts. Compilers and basic
refactoring tools cannot prove a string-computed edge; specialized analyzers may approximate it,
but correctness still depends on runtime inputs, loader/module identity and configuration.
Two failure modes: application code using reflection where an interface would do, so a rename
compiles and fails at runtime; and reflection over a name that came from outside the process,
which becomes an execution primitive once initialization, construction or invocation is reachable.

## Workflow

1. **Ask what varies.** If the set of implementations is known at build time, an interface, a
   sealed hierarchy, a map of suppliers, or `ServiceLoader` covers it — with compile-time
   checking. Reflection is for genuinely open sets: plugins, frameworks, tooling.
2. **If it must be dynamic, decide where the openness stops.** One factory, one registry, one
   adapter — never scattered `getDeclaredMethod` calls through business code.
3. **Validate tokens before resolution.** Map external tokens to code-owned types/operations.
   `asSubclass` narrows a genuinely configurable class to an expected supertype, but does not
   authorize its constructor, static initializer, loader, code source or later methods.
4. **Choose the mechanism by frequency.** A one-off at startup: `Class`/`Method` reflection is
   fine—but resolve/validate once and cache with a lifecycle-safe key. Repeated on a measured hot
   path: compare a stable typed `MethodHandle`, a bound functional adapter and generated code.
5. **Register what the runtime cannot see** — module `opens`, native-image reflection
   configuration, AOT metadata — and test on the target runtime, because a JVM run proves
   nothing about a native image.

## Rules

- Prefer an interface to reflection. The common shape — "instantiate the class named in
  configuration, then call it through an interface" — needs reflection only for the
  construction; every call afterwards goes through the interface, checked by the compiler.
- Prefer `ServiceLoader` to hand-rolled classpath scanning for plugin discovery: it is
  declarative (`META-INF/services` or `provides … with` in a module), the JDK's own mechanism,
  and visible to the module system. It does not provide ordering, dependency injection, failure
  isolation or unload lifecycle, and native-image support must still be verified for the toolchain.
- Prefer build-time to run-time. An annotation processor or code generator produces code you
  can read, debug, and that the compiler checks; runtime reflection produces behaviour nobody
  can grep for. This is why modern frameworks moved mapping, validation and injection metadata
  towards build time — see java-annotations.
- Reflection loses more than performance: no ordinary compile-time type checking, incomplete
  rename/find-usage/dead-code results unless specialized tooling understands the metadata, and
  less direct stack traces. Those costs apply even when invocation happens once at startup.
- `setAccessible(true)` on another module's private member fails under strong encapsulation
  unless the package is opened (`opens`, `--add-opens`). Requiring `--add-opens` in production
  is a design decision, not a workaround — record it and revisit it, because the JDK's direction
  is towards restricting it further. Reflecting into JDK internals is not a supported contract.
- Never let a payload, header or message field directly select a class/member. `Class.forName`
  with initialization can execute static initialization; construction/invocation and polymorphic
  deserialization can reach powerful gadget behavior. Map known tokens to known operations and
  validate code source/loader where plugins are allowed; a deny-list is not a security boundary—
  java-serialization-hardening covers the deserialisation side.
- Wrap reflective failures at the boundary. `NoSuchMethodException`, `IllegalAccessException`
  and `InvocationTargetException` are implementation detail; propagate a domain or configuration
  error, and always unwrap `InvocationTargetException.getCause()` — losing the cause hides the
  real exception under a generic wrapper (java-exception-design).
- For repeated dynamic invocation, resolve a typed `MethodHandle` (or `VarHandle`) once. A stable
  handle visible as a compiler constant often enables adapter/target inlining, but this is a JIT
  decision, not a `static final` guarantee. `invokeWithArguments` intentionally performs generic
  array/spreader adaptation; `Method.invoke` has varargs/boxing/wrapping/access costs. Measure the
  actual target and storage shape. Core reflection is MethodHandle/VarHandle-based since JDK 18;
  the old implementation was removed in JDK 22, making old inflation/direct-handle switches no-ops.
- Use `VarHandle` rather than `sun.misc.Unsafe` or reflection for low-level field access with
  explicit memory-ordering semantics. Query `isAccessModeSupported`; final fields support reads,
  not arbitrary writes. `varhandles-and-memory-ordering` covers the access modes.
- Do not use reflection to bypass a design you control. Reaching into a private field to test a
  class, to mutate an immutable object, or to "just get this working" makes the private surface
  a de facto API that the next refactor breaks. In tests, prefer constructing the object
  through its real API — java-test-design.
- Treat native code (JNI, and the Foreign Function & Memory API) as the last option: it forfeits
  the JVM's safety properties, crashes the process rather than throwing, and complicates GC,
  debugging and deployment. When it is genuinely required, the FFM API is the modern path — it
  is safer, statically typed, and requires explicit enabling of restricted operations — and
  jni-and-ffm and off-heap-memory own the mechanics.
- Closed-world native-image analysis may infer constant reflective edges and framework metadata,
  but runtime-computed access needs owned reachability metadata. Missing edges may fail at build
  time or only on an untrained runtime path. Test the native artifact itself; this constraint can
  justify build-time alternatives—see `graalvm-native-image`.
- Treat `Lookup`, `MethodHandle` and `VarHandle` as capabilities. Access checks happen when a
  handle is created; code receiving the handle can invoke it without re-proving the creator's
  private access. Never expose a full-power lookup or non-public handle across an untrusted plugin
  boundary; expose a narrow parent-owned interface instead.
- Cache without pinning reloadable code. A `Class`, reflected member, method handle, lambda/proxy
  class or cache value can retain its defining loader. Parent-loaded framework caches should use
  lifecycle eviction, `ClassValue` where appropriate, or rigorously tested weak-key designs.

## Acceptance gate

- Resolve all required members/providers at startup and report missing/ambiguous signatures with
  class loader, module and code source.
- Test named modules, classpath/unnamed modules, duplicate plugin loaders, reload/unload and the
  exact JDK/native-image artifact.
- Exercise primitive/reference/null/varargs signatures and verify `WrongMethodTypeException`,
  target exceptions and access failures are translated without losing causes.
- Benchmark only after proving the reflective path is material; include direct/interface,
  `Method.invoke`, stable/unstable handles and generated alternatives with allocation profiling.

## References

- [When reflection is justified, and what to use instead](references/when-reflection-is-justified.md)
  — read when deciding whether a requirement genuinely needs reflection, when replacing
  reflective code with an interface, `ServiceLoader` or generated code, or when reviewing
  reflection found in application code.
- [Method handles, VarHandles and module encapsulation](references/method-handles-and-encapsulation.md)
  — read when dynamic access is unavoidable: choosing between `Method`, `MethodHandle` and
  generated accessors, resolving handles correctly, and dealing with `opens`, `--add-opens` and
  native-image configuration.
- [What reflection and handles cost on the current runtime](references/reflection-cost-model.md)
  — JEP 416's method-handle implementation of core reflection, the per-operation cost table
  from `Class.forName` to `invokeWithArguments`, and how to verify inlining and boxing rather
  than assume them; read when a hot path invokes reflectively, when a runbook still tunes the
  `sun.reflect.*` inflation flags, or when choosing between `Method.invoke`, `invoke`,
  `invokeExact` and `invokeWithArguments`.
