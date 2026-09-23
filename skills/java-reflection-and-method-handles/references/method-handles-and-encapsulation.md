# Method handles, VarHandles and module encapsulation

## Choosing the mechanism

| Mechanism                             | Checked when                   | Cost per call                         | Use for                                            |
| ------------------------------------- | ------------------------------ | ------------------------------------- | -------------------------------------------------- |
| Direct call through an interface      | compile/link time              | Normal virtual-dispatch/JIT policy    | statically expressible substitution                |
| Stable typed `MethodHandle`           | lookup + invocation type check | Can expose target to JIT              | repeated genuinely dynamic invocation              |
| `LambdaMetafactory` functional object | linkage/bootstrap              | Ordinary interface call after linkage | compatible direct target bound once                |
| `Method.invoke`                       | lookup + each invocation       | Varargs/boxing/check/wrapping costs   | startup wiring, tooling, infrequent calls          |
| Generated source/class                | build or runtime definition    | Ordinary bytecode after generation    | high-volume known schema with justified complexity |

The two rules that follow:

- **Resolve once per owned lifecycle.** Repeated lookup adds work; whether it dominates
  invocation or target execution is a measurement question, not a universal cost ordering.
- **Make stable targets compiler-visible where lifecycle permits.** A `private static final`
  handle is a useful shape for application-lifetime members. Per-plugin handles need scoped
  caches so they do not retain loaders. Inlining remains a measured compiler decision.

The accessor sketch needs `java.lang.invoke` imports and accessible `Order`/`Money` types.
It assumes `Order.total()` declares no checked failures; adapt the catch policy if it does.

```java
public final class Accessors {
    private static final MethodHandle TOTAL;
    static {
        try {
            MethodHandles.Lookup lookup = MethodHandles.lookup();
            TOTAL = lookup.findVirtual(Order.class, "total", MethodType.methodType(Money.class));
        } catch (ReflectiveOperationException e) {
            throw new ExceptionInInitializerError(e);   // only appropriate for a mandatory member
        }
    }

    static Money totalOf(Order order) {
        try {
            return (Money) TOTAL.invokeExact(order);    // exact signature match required
        } catch (RuntimeException | Error e) {
            throw e;
        } catch (Throwable t) {                          // translate expected checked failures
            throw new IllegalStateException("accessor failed", t);
        }
    }
}
```

Details that matter:

- `invokeExact` requires the call site's symbolic/static types to match the handle's
  `MethodType`, including the return-context cast. Plain `invoke` accepts conversions as if via
  `asType`; if types already match it follows the exact path. Cost is not specified.
- Handle methods declare `throws Throwable`. Preserve `Error`, cancellation/interruption and
  domain-declared failures according to the target contract; do not blindly wrap everything.
- Resolve mandatory application-lifetime members during explicit startup or a static initializer.
  Resolve optional/reloadable plugins in their owned lifecycle so one failure does not poison an
  unrelated class for the lifetime of its loader.
- For fields, use `VarHandle` (`lookup.findVarHandle`), which additionally offers the access
  modes — plain, opaque, acquire/release, volatile — see varhandles-and-memory-ordering.
  `VarHandle` is the supported replacement for `sun.misc.Unsafe` field access.

`LambdaMetafactory` can link a compatible direct implementation handle to a functional-interface
call site. Its caller lookup must have full privilege access (`PRIVATE` and `MODULE` in the
Java 17 baseline); being able to invoke the target is not sufficient. Check
`hasFullPrivilegeAccess()` as well as the erased/instantiated method types, capture and bridge
rules. Keep the implementation handle direct: `bindTo` creates an indirect handle, so capture a
receiver through the factory's parameter type and invoke the linked factory with that receiver
instead. Use the metafactory only when profiling justifies a reusable adapter and test any
serialization/marker/bridge requirements; generated code may be clearer for build-time schemas.

## Adapt once; choose target mutability explicitly

Build handle graphs during configuration, not per element/request. Combinators such as `bindTo`,
`insertArguments`, `asType`, `filterArguments`, `foldArguments`, `catchException` and
`guardWithTest` preserve strong typing but can create large adapter graphs and compilation cost.
Record the final `MethodType`, unit-test every branch/exception, and inspect compilation if a deep
graph is hot.

| Target lifecycle                          | Mechanism                              | Decision constraint                                                      |
| ----------------------------------------- | -------------------------------------- | ------------------------------------------------------------------------ |
| Immutable for process/schema lifetime     | Stable handle or `ConstantCallSite`    | Best optimization opportunity; replacement requires new owner/lifecycle  |
| Rarely replaced with explicit publication | `MutableCallSite` + `syncAll` protocol | Ordinary writes are not immediately visible to other threads             |
| Every update must be immediately visible  | `VolatileCallSite`                     | Volatile-like visibility can inhibit optimization/add per-call cost      |
| One-way invalidation                      | `SwitchPoint` guarding old/new path    | Invalidated permanently; allocate a new switch point for next generation |

Often the simplest reloadable design is an ordinary volatile reference to a parent-owned typed
strategy, keeping MethodHandles inside the generation being replaced. Do not adopt mutable call
sites merely to avoid an interface call.

## Lookups and access

A `MethodHandles.Lookup` carries the access rights of the class that created it. Three forms:

- `MethodHandles.lookup()` — full access to what the _calling class_ can see, including its own
  private members.
- `MethodHandles.publicLookup()` — public members of public types in unconditionally exported
  packages; it does not inherit a caller's qualified exports or private rights.
- `MethodHandles.privateLookupIn(Target.class, MethodHandles.lookup())` — private access into
  another class when the caller lookup has required modes. Across modules, its module must read
  the target module and the target package must be open to it; within the same module no
  `opens` directive is required. The returned lookup is a transferable capability.

`privateLookupIn` respects module encapsulation; it does not bypass it. If a required cross-module
opening is absent, it throws `IllegalAccessException` — the point at which
the application must decide whether to open the package deliberately.

A successful cross-module `privateLookupIn` retains `PRIVATE` but drops `MODULE`. That lookup
can resolve and invoke an authorized private member while still being unsuitable as the caller
of `LambdaMetafactory`; adding more `opens` does not restore full privilege access. Use an ordinary
typed adapter around the authorized handle, or a narrow factory supplied by the target's owner,
when appropriate. Do not export a full-power lookup merely to make linkage succeed.

Access is checked when a method handle is created, not on every later invocation. Never return a
private lookup/handle to code that should not exercise that authority. Conversely, accepting a
caller-provided lookup is a capability-oriented alternative to demanding blanket `--add-opens`:
document exactly which lookup modes/member set the library consumes.

## Module encapsulation, `opens` and `--add-opens`

Under JPMS, suppressing private access checks across modules requires the target package to
be open to the caller. Same-module access suppression does not require `opens`. The following
separate module descriptor is illustrative; verify the actual Jackson artifact's module name:

```java
module com.acme.app {
    requires com.fasterxml.jackson.databind;
    opens com.acme.app.dto to com.fasterxml.jackson.databind;   // targeted, not blanket
}
```

- `exports` allows compile-time and public reflective access; `opens` allows deep reflection.
  They are different; for an inaccessible private member first consider supported public
  access/constructor binding, then a targeted opening if that access is required.
- `open module` opens everything — convenient, and it discards the guarantee the module system
  exists to provide. Prefer targeted `opens … to`.
- `--add-opens java.base/java.lang=ALL-UNNAMED` on the command line is the classpath-era escape
  hatch. Every use is a dependency on a JDK internal that may change; record why it is there,
  and treat its removal as part of upgrade work. The JDK has been progressively restricting
  these paths, and code that reflects into `java.base` internals should be considered on
  borrowed time.
- Reflection into JDK internals is not a contract. `sun.misc.Unsafe`'s memory-access methods are
  deprecated for removal, and the supported replacements are `VarHandle` (on-heap) and the FFM
  API (off-heap) — off-heap-memory covers the latter.

## Ahead-of-time and native image

Closed-world analysis cannot reliably discover runtime-computed reflective use. Some constant or
framework-mediated edges are inferred automatically; the rest need reachability metadata:

- Native image: reachability metadata such as `reflect-config.json`, framework annotations, or the
  tracing agent (`-agentlib:native-image-agent`) run over a representative workload —
  representative being the operative word, since anything a run does not exercise is not
  registered.
- Resources loaded by name (`getResourceAsStream`) need their own configuration, and are missed
  even more often than classes.
- Failure modes vary by what was omitted and build policy; they may be build-time errors or
  missing-class/member/unsupported-feature behavior in the native binary. Test the native artifact
  over negative and optional paths, not only the training happy path.

For startup/footprint requirements, compare generation or explicit registration when build-time
inputs and deployment semantics permit them. `ServiceLoader` performs service discovery; it is
not itself a build-time generator. Its descriptors and framework-generated metadata can help a
native-image toolchain, but support and discovered paths still need verification. Constructor
injection can make dependencies explicit without proving native reachability. See graalvm-native-image.

## Review checks

- [ ] Dynamic access is confined to an owned boundary with a typed contract and failure policy.
- [ ] Resolution follows an owned schema/provider policy. External tokens select approved
      operations; configurable classes are type-checked and authorized independently. Code-owned
      member names need signature/access validation, not an inapplicable `asSubclass` check.
- [ ] External tokens map to allow-listed operations; no direct class/member-name concatenation.
- [ ] Lookups are cached at the correct application/plugin/schema lifecycle, not per call.
- [ ] Repeated handles are stable where possible and do not pin reloadable class loaders.
- [ ] `InvocationTargetException` unwrapped; reflective exceptions translated at the boundary.
- [ ] Any `--add-opens`/`--add-exports` is scoped and justified by the supported access contract;
      unsupported internals or temporary exceptions have an owner and migration/review condition.
- [ ] Where native deployment is supported, reachability metadata is owned and the native
      artifact is tested; otherwise this is not a required deployment mode.
- [ ] Privileged lookups/handles are not exposed beyond their intended trust boundary.

## Troubleshooting map

| Symptom                                       | Distinguish                                                                                      | Likely remediation                                                                              |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------- |
| `WrongMethodTypeException`                    | Print `handle.type()` and the call site's static argument/return types; include defining loaders | Fix exact descriptor/casts or adapt once with `asType`                                          |
| `LambdaConversionException`                   | Check caller full privilege, direct implementation handle, factory capture and SAM types         | Fix linkage inputs or use a typed adapter/owner factory; do not widen access blindly            |
| `IllegalAccessException` from lookup          | Record lookup class/modes, source/target modules, readability and `opens`/`exports`              | Use caller-provided/narrow lookup or targeted module directive; do not blanket-open first       |
| `InaccessibleObjectException` from reflection | `setAccessible` module denial; `trySetAccessible` normally returns false for that denial         | Supported API or targeted `opens`; treat JDK-internal access as migration debt                  |
| `ServiceConfigurationError`                   | Inspect provider descriptor/module, provider factory/constructor and original cause              | Reject only the bad optional provider if contract permits; fail startup for mandatory ambiguity |
| Metaspace/loaders grow after plugin reload    | Find parent-root path through member/handle/lambda/`ServiceLoader` cache                         | Lifecycle eviction or `ClassValue`; close provider resources and clear TCCL                     |

## Primary references

- [Java 17 LambdaMetafactory linkage requirements](https://docs.oracle.com/en/java/javase/17/docs/api/java.base/java/lang/invoke/LambdaMetafactory.html)
- [Java 17 MethodHandles lookup rules](https://docs.oracle.com/en/java/javase/17/docs/api/java.base/java/lang/invoke/MethodHandles.html)
- [Java 17 AccessibleObject](https://docs.oracle.com/en/java/javase/17/docs/api/java.base/java/lang/reflect/AccessibleObject.html)
  distinguishes `setAccessible` throwing on module denial from `trySetAccessible` returning
  false for that denial; neither bypasses other access/security restrictions.
- [Java 25 `MethodHandles.Lookup`](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/lang/invoke/MethodHandles.Lookup.html)
- [Java 25 `MethodHandle`](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/lang/invoke/MethodHandle.html)
- [Java 25 `VarHandle`](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/lang/invoke/VarHandle.html)
- [Java 25 `CallSite`](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/lang/invoke/CallSite.html)
- [JEP 403: Strongly Encapsulate JDK Internals](https://openjdk.org/jeps/403)
- [JEP 416: Reimplement Core Reflection with Method Handles](https://openjdk.org/jeps/416)
