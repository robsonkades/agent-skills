# When reflection is justified, and what to use instead

Java blocks are partial Java 17-compatible sketches: imports, enclosing classes and domain
types (`Event`, handlers, codecs and `ConfigurationException`) are omitted. The named-module
provider sketch also needs `requires` on the service API module; its consumer needs `uses`.

## The decision table

| Requirement                                             | Reach for                                                      | Reflection needed?                 |
| ------------------------------------------------------- | -------------------------------------------------------------- | ---------------------------------- |
| Several known implementations, chosen at runtime        | interface + `Map<String, Supplier<T>>` in the composition root | no                                 |
| Closed set, exhaustively handled                        | sealed interface + pattern matching                            | no                                 |
| Implementations provided by other modules/JARs          | `ServiceLoader` + parent-owned service contract                | no explicit reflection in consumer |
| Class named in configuration                            | allow-list → `Class.forName` → `asSubclass` → interface        | for construction only              |
| Mapping between types (DTO ↔ domain)                    | hand-written mapper, or an annotation processor                | no                                 |
| Framework binding (DI, ORM, serialisation)              | the framework's own mechanism                                  | it is the framework's job          |
| Test needs to see private state                         | public API or explicit seam; bounded legacy/tooling exception  | only for a justified seam          |
| Tooling: agents, profilers, coverage, migration scripts | reflection, or bytecode tooling                                | yes — this is its home             |

For variability fully known at build time, compare the reflective boundary with direct typed
dispatch. A `getDeclaredMethod("handle" + type)` or `Class.forName(prefix + name)` is an investigation
lead, not a defect by itself: existing framework contracts, validated startup discovery and
compatibility can justify it. Post-build providers and runtime schemas need their actual inputs
and lifecycle preserved before proposing generation.

```java
// Reflective dispatch: nothing checks that a handler exists, or that its signature matches
Object handler = Class.forName("com.acme.handlers." + type + "Handler").getDeclaredConstructor().newInstance();
handler.getClass().getMethod("handle", Event.class).invoke(handler, event);

// Typed dispatch; preserve the declared unknown-event failure rather than silently ignoring it
Map<EventType, EventHandler> handlers = Map.of(
    EventType.ORDER_PLACED, new OrderPlacedHandler(repo),
    EventType.ORDER_SHIPPED, new OrderShippedHandler(tracker));
EventHandler selected = handlers.get(event.type());
if (selected == null) throw new IllegalArgumentException("unsupported event type");
selected.handle(event);
```

The second form makes dependency injection explicit, can fail during composition rather than a
request, and can be verified by a test that asserts every `EventType` has exactly one policy.
This changes construction from per-call to shared handlers: confirm thread safety, state and
resource lifecycle. Use suppliers for per-event handlers when sharing is not the old contract.
Translate the old reflective failure into the agreed public error rather than promising identical
exception types automatically.

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
`type()` before instantiating, which can help filter candidates. With a module provider factory,
it returns the factory method's declared return type, not necessarily the provider class or actual
implementation; it is not sufficient provenance/authorization evidence.

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
    } catch (InvocationTargetException e) {
        Throwable cause = e.getCause();
        if (cause instanceof Error error) throw error;
        if (cause instanceof InterruptedException) Thread.currentThread().interrupt();
        if (cause instanceof java.util.concurrent.CancellationException cancelled) throw cancelled;
        throw new ConfigurationException("codec construction failed", cause);
    } catch (ReflectiveOperationException e) {
        throw new ConfigurationException("codec " + name + " is not constructible", e);
    }
}
```

Here constructor checked/runtime failures become configuration failures with the original cause;
errors and cancellation propagate, and a wrapped interruption restores interrupt status. If the
factory API supports propagating `InterruptedException` directly, prefer that contract instead.
Initialization/linkage failures can also propagate as errors outside `InvocationTargetException`.

- The allow-list, not the input, decides which classes can exist.
- `asSubclass(Codec.class)` is a type check when a trusted plugin descriptor genuinely names a
  class. Use `Class.forName(name, false, contractLoader)` to avoid initialization during identity
  validation, then verify module/code source/signature policy before constructing it.
- Never map an HTTP/message/file token directly to a class name. Resolution with initialization,
  construction or later invocation can execute unintended code/gadgets. A code-owned token map,
  authenticated plugin catalog and process isolation for untrusted code are distinct controls.

## What reflection costs, in full

**Correctness and maintainability**

- Renaming a method can break string-based callers without an ordinary compiler error;
  specialized IDE/framework metadata support may track some edges. Verify the actual tooling.
- A missing method or a changed signature fails at the moment of use, often deep in a request,
  not at startup — unless the code deliberately resolves everything eagerly at startup, which is
  a cheap and underused mitigation.
- Ordinary static/dead-code analysis can miss dynamic edges; specialized analysis or declared
  metadata may recover them. Absence of reported uses alone does not justify deleting the member.

**Runtime and packaging**

- `Method.invoke` is a varargs API: ordinary primitive arguments require boxing and a call-site
  argument array, although escape analysis may remove some allocations. Target returns are boxed.
  Optimization depends on whether the reflected member is a compiler constant and on JDK policy.
- Public reflection can use public members of public types in exported packages without `opens`.
  Obtaining cross-module private reflective access requires an opening; an already-authorized
  handle instead carries its resolved authority. Distinguish supported application/framework
  access from reliance on unsupported JDK internals before proposing launch changes.
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

java-test-design covers what a test should assert. Reflection is a design signal, not an automatic
defect: a bounded legacy/tooling seam may be appropriate while a compatible alternative is unavailable.

## Primary references

- [Java 17 ServiceLoader.Provider.type](<https://docs.oracle.com/en/java/javase/17/docs/api/java.base/java/util/ServiceLoader.Provider.html#type()>)
- [Java 25 `ServiceLoader`](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/util/ServiceLoader.html)
- [Java 25 `Class.forName`](<https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/lang/Class.html#forName(java.lang.String,boolean,java.lang.ClassLoader)>)
- [Java 25 core reflection](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/lang/reflect/package-summary.html)
- [JEP 416: Reimplement Core Reflection with Method Handles](https://openjdk.org/jeps/416)
