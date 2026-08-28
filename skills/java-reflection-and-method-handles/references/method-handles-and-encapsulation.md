# Method handles, VarHandles and module encapsulation

## Choosing the mechanism

| Mechanism                                       | Checked when | Cost per call                     | Use for                                                    |
| ----------------------------------------------- | ------------ | --------------------------------- | ---------------------------------------------------------- |
| Direct call through an interface                | compile time | inlinable                         | everything that can be expressed statically                |
| `MethodHandle` in a `static final`              | at lookup    | close to direct once JIT-compiled | repeated dynamic invocation on a hot path                  |
| `LambdaMetafactory`-generated functional object | at bootstrap | direct call through the interface | binding a dynamic method once into a `Function`/`Supplier` |
| `Method.invoke`                                 | at lookup    | boxing + reflective dispatch      | startup wiring, tooling, one-off calls                     |
| Generated source (annotation processor)         | compile time | inlinable                         | mapping, serialisation, DI metadata                        |

The two rules that follow:

- **Resolve once, invoke many.** Looking up a `Method` or `MethodHandle` per invocation is the
  expensive part; the invocation itself is comparatively cheap.
- **Store handles in `private static final` fields.** The JIT treats a static-final
  `MethodHandle` as a constant and can inline through it; the same handle in an instance field
  or a local gets none of that. This is the single largest factor in whether handles perform
  like direct calls.

```java
public final class Accessors {
    private static final MethodHandle TOTAL;
    static {
        try {
            MethodHandles.Lookup lookup = MethodHandles.lookup();
            TOTAL = lookup.findVirtual(Order.class, "total", MethodType.methodType(Money.class));
        } catch (ReflectiveOperationException e) {
            throw new ExceptionInInitializerError(e);   // fail at class init, not at first use
        }
    }

    static Money totalOf(Order order) {
        try {
            return (Money) TOTAL.invokeExact(order);    // exact signature match required
        } catch (Throwable t) {                          // invokeExact declares Throwable
            throw new IllegalStateException("accessor failed", t);
        }
    }
}
```

Details that matter:

- `invokeExact` requires the call site's static types to match the handle's `MethodType`
  exactly — including the cast on the return value. It is the fast path; `invoke` performs
  asType conversions and is slower.
- Handle methods declare `throws Throwable`, which forces a catch. Translate at that boundary
  rather than propagating `Throwable`.
- Resolve in a static initialiser so a missing or changed member fails at class initialisation
  with a clear cause, instead of at the first request.
- For fields, use `VarHandle` (`lookup.findVarHandle`), which additionally offers the access
  modes — plain, opaque, acquire/release, volatile — see varhandles-and-memory-ordering.
  `VarHandle` is the supported replacement for `sun.misc.Unsafe` field access.

`LambdaMetafactory` is the third option worth knowing: it turns a resolved handle into an
instance of a functional interface once, after which every call is an ordinary interface call.
It is how frameworks make reflective property access cost nothing per element, and it is
appropriate when one dynamic resolution serves millions of invocations.

## Lookups and access

A `MethodHandles.Lookup` carries the access rights of the class that created it. Three forms:

- `MethodHandles.lookup()` — full access to what the _calling class_ can see, including its own
  private members.
- `MethodHandles.publicLookup()` — public members of public types in exported packages only.
- `MethodHandles.privateLookupIn(Target.class, MethodHandles.lookup())` — private access into
  another class, **only if** that class's module opens the package to yours. This is the
  supported way frameworks reach into application classes.

`privateLookupIn` respects module encapsulation; it does not bypass it. If the package is not
open, it throws `IllegalAccessException` — which is the correct behaviour and the point at which
the application must decide whether to open the package deliberately.

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

Static analysis cannot see reflective use, so every reflectively accessed class, constructor,
method and field must be declared:

- Native image: `reflect-config.json` / `@RegisterForReflection`-style annotations, or the
  tracing agent (`-agentlib:native-image-agent`) run over a representative workload —
  representative being the operative word, since anything a run does not exercise is not
  registered.
- Resources loaded by name (`getResourceAsStream`) need their own configuration, and are missed
  even more often than classes.
- The failure mode is `ClassNotFoundException`/`NoSuchMethodException` in the native binary only,
  on a code path the JVM tests cover perfectly. Test the native artefact, or do not claim it
  works.

The corollary for design: on a runtime where startup and footprint matter, prefer the
build-time mechanisms — generated code, `ServiceLoader`, constructor injection over field
injection — because they are the ones the analyser can follow. See graalvm-native-image.

## Review checks

- [ ] No reflection in business logic; it is confined to a factory, a registry, or an adapter.
- [ ] Every dynamically resolved name is checked against an allow-list, and narrowed with
      `asSubclass` or an interface.
- [ ] No class, method or field name derived from external input.
- [ ] Reflective lookups happen once (static initialiser or startup), not per call.
- [ ] `MethodHandle`/`VarHandle` in `static final` fields where invocation is repeated.
- [ ] `InvocationTargetException` unwrapped; reflective exceptions translated at the boundary.
- [ ] Any `--add-opens`/`--add-exports` in the launch configuration is documented with the
      reason and the plan to remove it.
- [ ] If a native image or AOT cache is produced, the reflective surface is registered and the
      artefact is tested.
