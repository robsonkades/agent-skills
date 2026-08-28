# When reflection is justified, and what to use instead

## The decision table

| Requirement                                             | Reach for                                                      | Reflection needed?        |
| ------------------------------------------------------- | -------------------------------------------------------------- | ------------------------- |
| Several known implementations, chosen at runtime        | interface + `Map<String, Supplier<T>>` in the composition root | no                        |
| Closed set, exhaustively handled                        | sealed interface + pattern matching                            | no                        |
| Implementations provided by other modules/jars          | `ServiceLoader`                                                | inside the JDK only       |
| Class named in configuration                            | allow-list → `Class.forName` → `asSubclass` → interface        | for construction only     |
| Mapping between types (DTO ↔ domain)                    | hand-written mapper, or an annotation processor                | no                        |
| Framework binding (DI, ORM, serialisation)              | the framework's own mechanism                                  | it is the framework's job |
| Test needs to see private state                         | test through the public API; make the seam explicit            | no                        |
| Tooling: agents, profilers, coverage, migration scripts | reflection, or bytecode tooling                                | yes — this is its home    |

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

The second form also gets dependency injection for free, fails at startup when a handler is
missing, and can be verified by a test that asserts every `EventType` has an entry.

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

Why prefer it to scanning: the JDK owns the lookup, the contract is declarative, the module
system understands it (`uses`/`provides`), native-image tooling can process it, and the
consumer never names an implementation class. `ServiceLoader.Provider` also lets you inspect
`type()` before instantiating, which matters when construction is expensive or when a provider
must be filtered.

Its limits: no ordering guarantee, no constructor arguments (providers need a no-arg
constructor or a static `provider()` method), and no lifecycle. When providers need
dependencies, load the provider _factories_ and let the composition root wire them.

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
- `asSubclass(Codec.class)` is the equivalent when the class genuinely must be named by string
  (`Class.forName(n).asSubclass(Codec.class)`), and it fails at the boundary with a clear
  message instead of producing a `ClassCastException` later.
- Never accept a class name from an HTTP body, a message header, a query parameter or a
  filename. The consequences range from instantiating an unexpected type to full remote code
  execution through a gadget chain (java-serialization-hardening).

## What reflection costs, in full

**Correctness and maintainability**

- Renaming a method breaks reflective callers silently; the IDE reports no usages.
- A missing method or a changed signature fails at the moment of use, often deep in a request,
  not at startup — unless the code deliberately resolves everything eagerly at startup, which is
  a cheap and underused mitigation.
- Static analysis, dead-code elimination and dependency analysis all lose the edge; unused-looking
  code cannot be deleted safely, and used code appears unused.

**Runtime and packaging**

- `Method.invoke` boxes arguments into an `Object[]` and returns `Object`, so a primitive call
  allocates. The dispatch itself is fast after warm-up but does not inline like a direct call.
- Module encapsulation blocks access to non-open packages; `--add-opens` in a production launch
  command is a maintenance liability tied to a specific JDK's internals.
- Native image requires explicit reflection metadata; anything missing fails only there.
- Classpath scanning at startup costs time proportional to the number of classes — a real term
  in cold-start latency for serverless and short-lived processes.

**Security**

- Reflective access defeats the encapsulation that other reviewers rely on.
- Any path from external input to `Class.forName`, `MethodHandles.Lookup.findVirtual`, or a
  deserialiser's type resolution is an execution primitive.

## Testing without reflection

Reaching into private state with reflection makes a test pass while telling you nothing about
the behaviour a caller can observe, and it fails on the next refactor. The alternatives, in
order:

1. **Assert through the public API.** If the state is not observable, ask whether it needs to
   exist.
2. **Make the seam explicit.** A package-private constructor, factory or accessor used by a test
   in the same package is honest — it appears in the source and the compiler checks it.
3. **Inject the collaborator.** Most "must reflect to test" cases are really "the class
   constructs its own dependency" — see java-dependency-inversion.

java-test-design covers what a test should assert; the point here is only that reflection in a
test is a design signal, not a tool.
