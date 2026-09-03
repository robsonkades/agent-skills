# When reflection is justified, and what to use instead

## The decision table

| Requirement                                             | Reach for                                                      | Reflection needed?                 |
| ------------------------------------------------------- | -------------------------------------------------------------- | ---------------------------------- |
| Several known implementations, chosen at runtime        | interface + `Map<String, Supplier<T>>` in the composition root | no                                 |
| Closed set, exhaustively handled                        | sealed interface + pattern matching                            | no                                 |
| Implementations provided by other modules/JARs          | `ServiceLoader` + parent-owned service contract                | no explicit reflection in consumer |
| Class named in configuration                            | allow-list → `Class.forName` → `asSubclass` → interface        | for construction only              |
| Mapping between types (DTO ↔ domain)                    | hand-written mapper, or an annotation processor                | no                                 |
| Framework binding (DI, ORM, serialisation)              | the framework's own mechanism                                  | it is the framework's job          |
| Test needs to see private state                         | test through the public API; make the seam explicit            | no                                 |
| Tooling: agents, profilers, coverage, migration scripts | reflection, or bytecode tooling                                | yes — this is its home             |

The recurring anti-pattern is the middle of the table: application code using reflection for a
variability that is fully known at build time. The tell is a `getDeclaredMethod("handle" + type)`
or a `Class.forName(prefix + name)` where the set of possibilities is enumerable.

```java
// Reflective dispatch: nothing checks that a handler exists, or that its signature matches
Object handler = Class.forName("com.acme.handlers." + type + "Handler").getDeclaredConstructor().newInstance();
handler.getClass().getMethod("handle", Event.class).invoke(handler, event);

// Same behaviour, checked at compile time, and greppable
Map<EventType, EventHandler> handlers = Map.of(
    EventType.ORDER_PLACED, new OrderPlacedHandler(repo),
    EventType.ORDER_SHIPPED, new OrderShippedHandler(tracker));
handlers.getOrDefault(event.type(), EventHandler.NOOP).handle(event);
```

The second form makes dependency injection explicit, can fail during composition rather than a
request, and can be verified by a test that asserts every `EventType` has exactly one policy.

## ServiceLoader, for genuinely open sets

```java
// In the provider module
module com.acme.plugin.pdf { provides com.acme.Exporter with com.acme.plugin.pdf.PdfExporter; }

// Or on the classpath: META-INF/services/com.acme.Exporter containing the implementation class

// In the consumer
List<Exporter> exporters = ServiceLoader.load(Exporter.class).stream()
        .map(ServiceLoader.Provider::get)
        .toList();
```

Why prefer it to scanning: the JDK owns lookup, the contract is declarative, the module system
understands it (`uses`/`provides`), and the consumer never names an implementation class.
Native-image/tooling support still depends on reachability metadata and the exact toolchain.
`ServiceLoader.Provider` lets you inspect
`type()` before instantiating, which matters when construction is expensive or when a provider
must be filtered.

Its limits: do not depend on one global provider order; discovery/instantiation can throw
`ServiceConfigurationError`; there is no lifecycle or failure isolation. Named-module providers
may use a public static `provider()` method; classpath/automatic-module rules differ and commonly
require a public no-arg constructor. When providers need dependencies, load parent-owned provider
factories and let the composition root wire them. Scope `ServiceLoader` and TCCL so its provider
cache does not pin a discarded plugin layer.

## Resolving a class name from configuration, safely

Configuration is trusted more than a payload and less than code. The safe shape:

```java
private static final Map<String, Class<? extends Codec>> ALLOWED = Map.of(
    "json", JsonCodec.class,
    "avro", AvroCodec.class);

static Codec codecFor(String name) {
    Class<? extends Codec> type = ALLOWED.get(name);
    if (type == null) throw new ConfigurationException("unknown codec: " + name);
    try {
        return type.getDeclaredConstructor().newInstance();
    } catch (ReflectiveOperationException e) {
        throw new ConfigurationException("codec " + name + " is not constructible", e);
    }
}
```

- The allow-list, not the input, decides which classes can exist.
- `asSubclass(Codec.class)` is a type check when a trusted plugin descriptor genuinely names a
  class. Use `Class.forName(name, false, contractLoader)` to avoid initialization during identity
  validation, then verify module/code source/signature policy before constructing it.
- Never map an HTTP/message/file token directly to a class name. Resolution with initialization,
  construction or later invocation can execute unintended code/gadgets. A code-owned token map,
  authenticated plugin catalog and process isolation for untrusted code are distinct controls.

## What reflection costs, in full

**Correctness and maintainability**

- Renaming a method breaks reflective callers silently; the IDE reports no usages.
- A missing method or a changed signature fails at the moment of use, often deep in a request,
  not at startup — unless the code deliberately resolves everything eagerly at startup, which is
  a cheap and underused mitigation.
- Static analysis, dead-code elimination and dependency analysis all lose the edge; unused-looking
  code cannot be deleted safely, and used code appears unused.

**Runtime and packaging**

- `Method.invoke` is a varargs API: ordinary primitive arguments require boxing and a call-site
  argument array, although escape analysis may remove some allocations. Target returns are boxed.
  Optimization depends on whether the reflected member is a compiler constant and on JDK policy.
- Module encapsulation blocks access to non-open packages; `--add-opens` in a production launch
  command is a maintenance liability tied to a specific JDK's internals.
- Native-image closed-world analysis needs discoverable reachability metadata for dynamic edges;
  omissions can fail during image build or on a native-only runtime path.
- Classpath/module scanning performs archive/resource I/O and metadata parsing proportional to
  the scanned scope; generated indexes or explicit service descriptors bound that work.

**Security**

- Reflective access defeats the encapsulation that other reviewers rely on.
- Any path from external input to initialization, construction, invocation, privileged lookup or
  deserializer type selection needs an explicit authorization boundary. Lookup alone is not the
  same event as execution, but a leaked handle carries the creator's resolved authority.

## Testing without reflection

Reaching into private state can couple a test to representation while bypassing caller-visible
contracts. Before accepting it for legacy characterization/tooling, compare these alternatives:

1. **Assert through the public API.** If the state is not observable, ask whether it needs to
   exist.
2. **Make the seam explicit.** A package-private constructor, factory or accessor used by a test
   in the same package is honest — it appears in the source and the compiler checks it.
3. **Inject the collaborator.** Most "must reflect to test" cases are really "the class
   constructs its own dependency" — see java-dependency-inversion.

java-test-design covers what a test should assert; the point here is only that reflection in a
test is a design signal, not a tool.

## Primary references

- [Java 25 `ServiceLoader`](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/util/ServiceLoader.html)
- [Java 25 `Class.forName`](<https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/lang/Class.html#forName(java.lang.String,boolean,java.lang.ClassLoader)>)
- [Java 25 core reflection](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/lang/reflect/package-summary.html)
- [JEP 416: Reimplement Core Reflection with Method Handles](https://openjdk.org/jeps/416)
