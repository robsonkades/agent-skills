# Three meanings of "factory method", and what replaces the pattern

## Separating the three

| Name                         | Shape                                                                               | Problem it solves                                      | Judge it by                             |
| ---------------------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------ | --------------------------------------- |
| **GoF Factory Method**       | `Product create(...)` overridden by a subclass; called by inherited code or clients | Defer concrete product selection to subclasses         | What justifies subclass-based creation? |
| **Static factory method**    | `public static Money of(...)` on the product type                                   | Naming, instance control, returning a subtype, caching | Naming conventions and instance control |
| **"a method named createX"** | Shape alone does not identify a pattern                                             | May expose a meaningful provider/creation contract     | Consumer contract, not the name alone   |

Effective Java's Item 1 is the middle row. It is not this pattern, and treating them as one is
how a two-line `static of` becomes an abstract class with two subclasses.

The [GoF Factory Method participants](https://erp.metbhujbalknowledgecity.ac.in/StudyMaterial/01SG042017008670012.pdf)
allow the creator to call its factory method, but do not require an inherited workflow.
Distinguish recognizing the pattern from justifying it: a creation-only hierarchy can match
the pattern and still be replaceable when its extension contract permits composition.

Static factories earn their place for reasons the GoF pattern never claims: `Optional.of` versus
`Optional.ofNullable` are two names for one signature; `List.of` may return a specialised
implementation per arity; `Integer.valueOf` caches. None of that involves a subclass.

## The hook against its replacements

| Alternative                         | Resolves                                                  | Fails to resolve                                   |
| ----------------------------------- | --------------------------------------------------------- | -------------------------------------------------- |
| Injected `Supplier<Product>`        | Per-instance variation, testing, no hierarchy             | Framework APIs with no supported injection seam    |
| `Function<Input, Product>`          | Product depends on an argument                            | Same                                               |
| `Map<Kind, Supplier<Product>>`      | Data-driven selection, the whole set visible in one place | Discovery/registration must be supplied separately |
| Sealed `Kind` + exhaustive `switch` | Compile-time case coverage for the known type set         | Working branch behavior or open plugin extension   |
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

Compare fixes against creation frequency and ownership:

1. **Pass a fully constructed parser in** when it should live with the importer. For a fresh
   parser per run, pass a provider and invoke it in `run`, after construction.
2. **Defer the hook until actual use after construction.** Merely calling a lazy accessor or
   injected supplier from the constructor does not establish readiness. Cache only if reuse is
   intended, with a correct publication and failure policy.
3. **Two-phase init.** A separate `initialise()` the caller must invoke — the weakest option,
   unless a controlled factory/framework prevents use before initialization completes.

Avoid overridable calls during construction: the hook's implementation may depend on subclass
state that is not ready yet, regardless of who normally invokes it.

## Selection keys from outside the process

When the product kind comes from a message header, a content type or a database column, the
selection needs an explicit trust boundary. Use approved registry keys rather than arbitrary
class names; plugin registration can extend that registry under its own authorization policy.

```java
// wrong: any class name on the wire becomes an instantiation
Class.forName(header.get("type")).getDeclaredConstructor().newInstance();

// right: an explicit supported registry; unknown keys follow the declared failure policy
private static final Map<String, Supplier<Command>> KINDS = Map.of(
    "payment.submitted", PaymentSubmitted::new,
    "payment.settled",   PaymentSettled::new);

if (type == null) throw new IllegalArgumentException("command type is required");
Supplier<Command> factory = KINDS.get(type);
if (factory == null) throw new UnknownCommandType(type, KINDS.keySet());
```

Reject a missing required key before lookup. A map may reject null queries, so a null result
check after `get` does not handle absence reliably; see the [Java 17 Map contract](https://docs.oracle.com/en/java/javase/17/docs/api/java.base/java/util/Map.html).
Preserve the caller's declared failure policy; this sketch uses `IllegalArgumentException`
for a missing key and the domain exception for an unsupported one.

[`Class.forName(String)`](<https://docs.oracle.com/en/java/javase/17/docs/api/java.base/java/lang/Class.html#forName(java.lang.String)>)
initializes the selected class; a cast after loading/instantiation is too late to prevent its
initialization or constructor effects. This risk does not require Java object deserialization.
The registry makes the supported mapping explicit; payload validation and permission to perform
the selected operation remain separate. Do not silently substitute an unrelated default for an
unknown key.

## Naming that keeps the distinction visible

- `create*` / `new*` — often suggests freshness; verify the actual API contract.
- `of` / `from` / `valueOf` — a static factory; may return a cached or shared instance.
- `get*` — may construct: `Supplier.get()` does not guarantee freshness or reuse.
- `newInstance` on an injected object — may be a named provider or a supplier-like contract;
  preserve meaningful input, checked-failure, lifecycle and public API semantics.

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
