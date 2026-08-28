---
name: java-reflection-and-method-handles
description: >
  Runtime access to code the compiler cannot check: what reflection costs beyond speed — no
  compile-time checking, invisible to refactoring and dead-code analysis, blocked by module
  encapsulation, unsupported without configuration under AOT and native image — the
  alternatives that keep the checking (interfaces, ServiceLoader, annotation processing,
  code generation), MethodHandles and VarHandles for genuinely dynamic access, and the
  security boundary around resolving a name that came from outside. Use when reflection
  appears in application code, when setAccessible needs --add-opens, when a framework works
  on the JVM and fails under native image, when a class name arrives from configuration or a
  payload, or when Method.invoke sits on a hot path. FFM and JNI mechanics are jni-and-ffm,
  the annotations reflection reads are java-annotations, and deserialisation attack surface
  is java-serialization-hardening.
---

# Java Reflection and Method Handles

## Purpose

Keep dynamic access to a boundary that is deliberate, narrow and configured, because
everything the compiler cannot see, no other tool can see either — the IDE's rename, the
linker's dead-code elimination, the native-image analyser and the reviewer all lose the edge.
Two failure modes: application code using reflection where an interface would do, so a rename
compiles and fails at runtime; and reflection over a name that came from outside the process,
which is a code-execution primitive rather than a lookup.

## Workflow

1. **Ask what varies.** If the set of implementations is known at build time, an interface, a
   sealed hierarchy, a map of suppliers, or `ServiceLoader` covers it — with compile-time
   checking. Reflection is for genuinely open sets: plugins, frameworks, tooling.
2. **If it must be dynamic, decide where the openness stops.** One factory, one registry, one
   adapter — never scattered `getDeclaredMethod` calls through business code.
3. **Validate the name before resolving it.** A class or method name from configuration or a
   payload is resolved only against an allow-list, and `asSubclass` narrows it to the expected
   supertype.
4. **Choose the mechanism by frequency.** A one-off at startup: `Class`/`Method` reflection is
   fine. Repeated on a hot path: a `MethodHandle` in a `static final` field, or generated code.
5. **Register what the runtime cannot see** — module `opens`, native-image reflection
   configuration, AOT metadata — and test on the target runtime, because a JVM run proves
   nothing about a native image.

## Rules

- Prefer an interface to reflection. The common shape — "instantiate the class named in
  configuration, then call it through an interface" — needs reflection only for the
  construction; every call afterwards goes through the interface, checked by the compiler.
- Prefer `ServiceLoader` to hand-rolled classpath scanning for plugin discovery: it is
  declarative (`META-INF/services` or `provides … with` in a module), the JDK's own mechanism,
  and visible to the module system and native-image tooling.
- Prefer build-time to run-time. An annotation processor or code generator produces code you
  can read, debug, and that the compiler checks; runtime reflection produces behaviour nobody
  can grep for. This is why modern frameworks moved mapping, validation and injection metadata
  towards build time — see java-annotations.
- Reflection loses more than performance: no compile-time type checking, no `Find Usages`, no
  safe rename, no dead-code elimination, no static analysis of what is called, and stack traces
  full of framework frames. Those costs apply even when the call happens once at startup.
- `setAccessible(true)` on another module's private member fails under strong encapsulation
  unless the package is opened (`opens`, `--add-opens`). Requiring `--add-opens` in production
  is a design decision, not a workaround — record it and revisit it, because the JDK's direction
  is towards restricting it further. Reflecting into JDK internals is not a supported contract.
- Never resolve a class or method name that came from a payload, a header, a message field or
  untrusted configuration. `Class.forName(userInput)` and polymorphic deserialisation keyed by
  a type field are remote-code-execution primitives; the mitigation is an allow-list mapping
  known tokens to known types, never a deny-list of dangerous ones —
  java-serialization-hardening covers the deserialisation side.
- Wrap reflective failures at the boundary. `NoSuchMethodException`, `IllegalAccessException`
  and `InvocationTargetException` are implementation detail; propagate a domain or configuration
  error, and always unwrap `InvocationTargetException.getCause()` — losing the cause hides the
  real exception under a generic wrapper (java-exception-design).
- For repeated dynamic invocation, use a `MethodHandle` (or `VarHandle` for fields) resolved
  once and stored in a `private static final` field. The JIT can constant-fold and inline
  through a static-final handle, giving performance close to a direct call; a handle looked up
  per call, or held in a non-final field, gets none of that. `Method.invoke` also boxes every
  argument into an `Object[]`.
- Use `VarHandle` rather than `sun.misc.Unsafe` or reflection for low-level field access with
  memory-ordering semantics; `varhandles-and-memory-ordering` covers the access modes.
- Do not use reflection to bypass a design you control. Reaching into a private field to test a
  class, to mutate an immutable object, or to "just get this working" makes the private surface
  a de facto API that the next refactor breaks. In tests, prefer constructing the object
  through its real API — java-test-design.
- Treat native code (JNI, and the Foreign Function & Memory API) as the last option: it forfeits
  the JVM's safety properties, crashes the process rather than throwing, and complicates GC,
  debugging and deployment. When it is genuinely required, the FFM API is the modern path — it
  is safer, statically typed, and requires explicit enabling of restricted operations — and
  jni-and-ffm and off-heap-memory own the mechanics.
- Assume reflection is invisible to ahead-of-time tooling. Native image needs every reflectively
  accessed type, method and field declared in its configuration; anything missed fails at
  runtime on a path the JVM tests never exercise. Where startup or footprint matters, that is
  itself an argument for build-time alternatives — graalvm-native-image and
  startup-cds-crac-leyden.

## References

- [When reflection is justified, and what to use instead](references/when-reflection-is-justified.md)
  — read when deciding whether a requirement genuinely needs reflection, when replacing
  reflective code with an interface, `ServiceLoader` or generated code, or when reviewing
  reflection found in application code.
- [Method handles, VarHandles and module encapsulation](references/method-handles-and-encapsulation.md)
  — read when dynamic access is unavoidable: choosing between `Method`, `MethodHandle` and
  generated accessors, resolving handles correctly, and dealing with `opens`, `--add-opens` and
  native-image configuration.
