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

| Alternative                         | Resolves                                                  | Fails to resolve                                   |
| ----------------------------------- | --------------------------------------------------------- | -------------------------------------------------- |
| Injected `Supplier<Product>`        | Per-instance variation, testing, no hierarchy             | Framework APIs with no supported injection seam    |
| `Function<Input, Product>`          | Product depends on an argument                            | Same                                               |
| `Map<Kind, Supplier<Product>>`      | Data-driven selection, the whole set visible in one place | Discovery/registration must be supplied separately |
| Sealed `Kind` + exhaustive `switch` | Compile-time proof that every kind is handled             | Kinds contributed by code you do not compile       |
| Dependency injection                | Deployment-time selection and lifecycle                   | Per-call selection needs a provider or registry    |
| `ServiceLoader<ProductProvider>`    | Open extension by unknown modules                         | Discovery failures and provider-selection policy   |
| Abstract Factory                    | Several products that must agree with each other          | No family invariant to protect                     |

Inspect who constructs the creator and which injection/registration seams that exact framework
version supports. Framework ownership does not itself prevent constructor injection or explicit
registration. Retain a required creation hook, a public extension contract or useful covariance;
prefer composition when application-controlled subclasses only select products. Maps can collect
third-party registrations too, with duplicate-key validation; DI can supply a provider/registry
for per-call selection. A named single-product SPI may convey more than a generic Supplier.

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
    private final char delimiter;
    CsvImporter(char delimiter) { this.delimiter = delimiter; }
    @Override protected Parser createParser() {
        return new CsvParser(delimiter);   // reads NUL during super()
    }
}
```

`new CsvImporter(';')` calls the superclass constructor before assigning `delimiter`, so the
hook reads NUL. Do not demonstrate this with `final char delimiter = ';'`: that constant
variable can be inlined and masks the defect. See [JLS 17 initialization order](https://docs.oracle.com/javase/specs/jls/se17/html/jls-12.html#jls-12.5).

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

- `create*` / `new*` — often suggests freshness; verify the actual API contract.
- `of` / `from` / `valueOf` — a static factory; may return a cached or shared instance.
- `get*` — may construct: `Supplier.get()` does not guarantee freshness or reuse.
- `newInstance` on an injected object — you have a `Supplier`; name the field for what it
  produces (`parsers`, not `parserFactory`).

A one-method factory can become a Supplier when its domain contract, checked exceptions and
public compatibility permit. Specify nullability, freshness, thread safety and resource ownership;
the [Java 17 Supplier contract](https://docs.oracle.com/en/java/javase/17/docs/api/java.base/java/util/function/Supplier.html)
does not promise a distinct result for each invocation.

## Relationship to the neighbouring patterns

- **Template Method.** An algorithm skeleton may contain a Factory Method creation step plus
  other hooks; both patterns can coexist (`gof-template-method`).
- **Abstract Factory.** An Abstract Factory's methods are usually factory methods. The
  difference is the invariant: Abstract Factory exists because the products must agree with each
  other. One product, no invariant, no Abstract Factory (`gof-abstract-factory`).
- **Prototype.** Where the product's configuration is elaborate and comes from an existing
  instance, copying may beat creating — with the caveats in `gof-prototype`.
