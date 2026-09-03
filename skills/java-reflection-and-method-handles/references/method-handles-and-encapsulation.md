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

- **Resolve once, invoke many.** Looking up a `Method` or `MethodHandle` per invocation is the
  expensive part; the invocation itself is comparatively cheap.
- **Make stable targets compiler-visible where lifecycle permits.** A `private static final`
  handle is a useful shape for application-lifetime members. Per-plugin handles need scoped
  caches so they do not retain loaders. Inlining remains a measured compiler decision.

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
call site. It has strict erased/instantiated method-type, capture and bridge rules. Use it only
when profiling justifies a reusable adapter and test serialization/marker/bridge requirements;
generated code may be clearer for schemas known at build time.

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
- `MethodHandles.publicLookup()` — public members of public types in exported packages only.
- `MethodHandles.privateLookupIn(Target.class, MethodHandles.lookup())` — private access into
  another class when the caller lookup has required modes, its module reads the target module,
  and the target package is open to it. The returned lookup is a transferable capability.

`privateLookupIn` respects module encapsulation; it does not bypass it. If the package is not
open, it throws `IllegalAccessException` — which is the correct behaviour and the point at which
the application must decide whether to open the package deliberately.

Access is checked when a method handle is created, not on every later invocation. Never return a
private lookup/handle to code that should not exercise that authority. Conversely, accepting a
caller-provided lookup is a capability-oriented alternative to demanding blanket `--add-opens`:
document exactly which lookup modes/member set the library consumes.

## Module encapsulation, `opens` and `--add-opens`

Under JPMS, reflective access to non-public members requires the package to be _open_:

```java
module com.acme.app {
    requires com.fasterxml.jackson.databind;
    opens com.acme.app.dto to com.fasterxml.jackson.databind;   // targeted, not blanket
}
```

- `exports` allows compile-time and public reflective access; `opens` allows deep reflection.
  They are different, and a framework failing with `InaccessibleObjectException` needs the
  second.
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

The corollary for design: on a runtime where startup and footprint matter, prefer the
build-time mechanisms — generated code, `ServiceLoader`, constructor injection over field
injection — because they are the ones the analyser can follow. See graalvm-native-image.

## Review checks

- [ ] Dynamic access is confined to an owned boundary with a typed contract and failure policy.
- [ ] Every dynamically resolved name is checked against an allow-list, and narrowed with
      `asSubclass` or an interface.
- [ ] External tokens map to allow-listed operations; no direct class/member-name concatenation.
- [ ] Lookups are cached at the correct application/plugin/schema lifecycle, not per call.
- [ ] Repeated handles are stable where possible and do not pin reloadable class loaders.
- [ ] `InvocationTargetException` unwrapped; reflective exceptions translated at the boundary.
- [ ] Any `--add-opens`/`--add-exports` in the launch configuration is documented with the
      reason and the plan to remove it.
- [ ] Native-image reachability metadata is owned and the native artifact is tested.
- [ ] Privileged lookups/handles are not exposed beyond their intended trust boundary.

## Troubleshooting map

| Symptom                                       | Distinguish                                                                                      | Likely remediation                                                                              |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------- |
| `WrongMethodTypeException`                    | Print `handle.type()` and the call site's static argument/return types; include defining loaders | Fix exact descriptor/casts or adapt once with `asType`                                          |
| `IllegalAccessException` from lookup          | Record lookup class/modes, source/target modules, readability and `opens`/`exports`              | Use caller-provided/narrow lookup or targeted module directive; do not blanket-open first       |
| `InaccessibleObjectException` from reflection | Deep reflection attempted after `trySetAccessible()`/`setAccessible`                             | Supported API or targeted `opens`; treat JDK-internal access as migration debt                  |
| `ServiceConfigurationError`                   | Inspect provider descriptor/module, provider factory/constructor and original cause              | Reject only the bad optional provider if contract permits; fail startup for mandatory ambiguity |
| Metaspace/loaders grow after plugin reload    | Find parent-root path through member/handle/lambda/`ServiceLoader` cache                         | Lifecycle eviction or `ClassValue`; close provider resources and clear TCCL                     |

## Primary references

- [Java 25 `MethodHandles.Lookup`](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/lang/invoke/MethodHandles.Lookup.html)
- [Java 25 `MethodHandle`](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/lang/invoke/MethodHandle.html)
- [Java 25 `VarHandle`](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/lang/invoke/VarHandle.html)
- [Java 25 `CallSite`](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/lang/invoke/CallSite.html)
- [JEP 403: Strongly Encapsulate JDK Internals](https://openjdk.org/jeps/403)
- [JEP 416: Reimplement Core Reflection with Method Handles](https://openjdk.org/jeps/416)
