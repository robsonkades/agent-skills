# Three meanings of "factory method", and what replaces the pattern

## Separating the three

| Name                         | Shape                                                                                      | Problem it solves                                         | Judge it by                             |
| ---------------------------- | ------------------------------------------------------------------------------------------ | --------------------------------------------------------- | --------------------------------------- |
| **GoF Factory Method**       | `protected abstract Product create()` overridden by a subclass, called from inherited code | An inherited algorithm must not know the concrete product | Is there an inherited algorithm at all? |
| **Static factory method**    | `public static Money of(...)` on the product type                                          | Naming, instance control, returning a subtype, caching    | Naming conventions and instance control |
| **"a method named createX"** | Anything                                                                                   | Nothing in particular                                     | Rename it and move on                   |

Effective Java's Item 1 is the middle row. It is not this pattern, and treating them as one is
how a two-line `static of` becomes an abstract class with two subclasses.

Static factories earn their place for reasons the GoF pattern never claims: `Optional.of` versus
`Optional.ofNullable` are two names for one signature; `List.of` may return a specialised
implementation per arity; `Integer.valueOf` caches. None of that involves a subclass.

## The hook against its replacements

| Alternative                         | Resolves                                                  | Fails to resolve                                  |
| ----------------------------------- | --------------------------------------------------------- | ------------------------------------------------- |
| Injected `Supplier<Product>`        | Per-instance variation, testing, no hierarchy             | Frameworks that instantiate your class themselves |
| `Function<Input, Product>`          | Product depends on an argument                            | Same                                              |
| `Map<Kind, Supplier<Product>>`      | Data-driven selection, the whole set visible in one place | Third-party contribution                          |
| Sealed `Kind` + exhaustive `switch` | Compile-time proof that every kind is handled             | Kinds contributed by code you do not compile      |
| Dependency injection                | Deployment-time selection and lifecycle                   | Selection that varies per call                    |
| `ServiceLoader<ProductProvider>`    | Open extension by unknown modules                         | Any compile-time guarantee; ordering              |
| Abstract Factory                    | Several products that must agree with each other          | A single product (that is over-application)       |

The rule of thumb: **the abstract hook survives only where the framework, not your code,
constructs the creator.** `HttpServlet` subclasses, `AbstractProcessor`, JUnit extension points
and Spring's `AbstractRoutingDataSource` all instantiate the subclass and then call into it, so
there is no moment at which a `Supplier` could have been passed in. Application classes you
construct yourself do not have that constraint.

## The constructor trap

```java
abstract class Importer {
    private final Parser parser;
    Importer() {
        this.parser = createParser();   // overridable, called during construction
    }
    protected abstract Parser createParser();
}

final class CsvImporter extends Importer {
    private final char delimiter = ';';
    @Override protected Parser createParser() {
        return new CsvParser(delimiter);   // delimiter is '�' here
    }
}
```

`createParser()` runs before `CsvImporter`'s field initialisers, so `delimiter` is still the
default value. The bug is silent — a parser configured with a NUL delimiter — and survives code
review because both halves look correct in isolation.

Three fixes, in order of preference:

1. **Pass the parser in.** `Importer(Parser parser)`; no hook, no ordering question.
2. **Make it lazy.** `parser()` computes on first use, after construction has completed, with a
   correctly published cache.
3. **Two-phase init.** A separate `initialise()` the caller must invoke — the weakest option,
   because "must invoke" is not enforced.

The general rule: a constructor may not call an overridable method, ever. This pattern invites
the violation more than any other, because the hook exists precisely to be called from inherited
code.

## Selection keys from outside the process

When the product kind comes from a message header, a content type or a database column, the
factory becomes a mapping from untrusted data to a Java type. Two rules:

```java
// wrong: any class name on the wire becomes an instantiation
Class.forName(header.get("type")).getDeclaredConstructor().newInstance();

// right: a closed, explicit map; unknown keys fail loudly
private static final Map<String, Supplier<Command>> KINDS = Map.of(
    "payment.submitted", PaymentSubmitted::new,
    "payment.settled",   PaymentSettled::new);

Supplier<Command> factory = KINDS.get(type);
if (factory == null) throw new UnknownCommandType(type, KINDS.keySet());
```

Reflective instantiation from an unvalidated name is a deserialisation gadget, not a factory —
and the closed map also gives you a readable error and a place to see every supported kind.

## Naming that keeps the distinction visible

- `create*` / `new*` — returns a fresh instance every call.
- `of` / `from` / `valueOf` — a static factory; may return a cached or shared instance.
- `get*` — implies an existing instance is being fetched; do not use it for construction.
- `newInstance` on an injected object — you have a `Supplier`; name the field for what it
  produces (`parsers`, not `parserFactory`).

A `*Factory` class with exactly one method and no state should be a `Supplier` field with a
descriptive name. The class name is the last thing to remove, and removing it is usually the
change that makes the code shorter to read.

## Relationship to the neighbouring patterns

- **Template Method.** Factory Method is Template Method whose varying step happens to be
  construction. If the base class has other hooks too, do not describe the design as Factory
  Method — it is a template with several steps, one of which creates (`gof-template-method`).
- **Abstract Factory.** An Abstract Factory's methods are usually factory methods. The
  difference is the invariant: Abstract Factory exists because the products must agree with each
  other. One product, no invariant, no Abstract Factory (`gof-abstract-factory`).
- **Prototype.** Where the product's configuration is elaborate and comes from an existing
  instance, copying may beat creating — with the caveats in `gof-prototype`.
