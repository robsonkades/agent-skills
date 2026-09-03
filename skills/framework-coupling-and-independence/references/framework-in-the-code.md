# Where the Framework May Appear

The placement decisions that actually come up in a Spring and JPA codebase, each with the
cost of getting it wrong and the cost of the alternative. None of these has a universal
answer; each has a defensible answer once the context is stated.

## Injection and stereotypes

`@Service`, `@Component`, `@Repository` and constructor injection are the cheapest rung of
the ladder. The class is a plain object with a constructor; the annotation tells a container
how to build it. Constructor injection remains plain Java; removing Spring from an annotated class
also requires removing/replacing the annotation dependency and wiring, though its business behavior
can remain directly testable.

```java
@Service
public final class PlaceOrder {                 // plain object, plain constructor
    private final Orders orders;
    private final PricingPolicy pricing;

    public PlaceOrder(Orders orders, PricingPolicy pricing) {
        this.orders = orders;
        this.pricing = pricing;
    }
}
```

Field injection is the version that is not cheap: `@Autowired` on a field means the class's
dependencies cannot be supplied without reflection. It can still be unit-tested — with
`ReflectionTestUtils` or `@InjectMocks` — but only by reaching around the type's own
construction, and the class can never guarantee it was fully initialised. The cost has nothing
to do with framework independence; it is a design defect the annotation happens to enable
(`java-dependency-inversion`).

**Verdict:** accept freely. Use constructor injection. Do not build an abstraction over DI.

## `@Transactional` and other declarative behaviour

`@Transactional`, `@Scheduled`, `@Cacheable`, `@Retryable` attach behaviour to your methods
through a proxy. They are the moderate rung: mechanical to move, but numerous, and their
semantics are framework-specific in ways that matter.

Two properties are worth knowing regardless of the coupling question, because both cause
silent failures:

- **Self-invocation bypasses default Spring proxy advice.** A method calling another method on `this` does not
  go through that proxy, so the annotation on the callee does nothing in proxy mode. AspectJ mode
  and calls through an injected/exposed proxy behave differently. This is a common
  cause of "the transaction annotation is there but nothing rolled back"
  (`enterprise-transactions`).
- **Placement determines the boundary.** On a repository, the transaction is one query wide,
  so a use case with two writes is not atomic. On a controller, it spans response rendering
  and can hold a connection during serialisation. The application service is where it belongs
  (`service-layer-design`).

**Verdict:** accept, at the application-service layer. Do not wrap. Do learn the proxy
semantics, because they are the actual risk — far more than portability.

## Persistence annotations on domain types

This is the decision that generates the most argument and has the most context-dependent
answer.

**One model — the entity is the domain type.** `@Entity`, `@Column` and the rest sit on the
class that carries the business rules.

- Cheaper: one model, one place to add a field, no mapper.
- The coupling is mostly metadata, and metadata survives a lot: a JPA provider swap keeps
  these annotations, since they are Jakarta Persistence, not Hibernate.
- Real costs are not only portability but persistence semantics: provider/spec-version constraints
  on construction and proxying can weaken ordinary construction paths; hydration may bypass public
  factories; lazy proxies can escape into business code; equality can become tangled with identity.
  Encapsulation and validation are still possible, but every reconstitution path must preserve them.

**Two models — a domain type plus a separate persistence entity.**

- Buys: a domain type that is immutable, validating, final where it wants to be, and readable
  without knowing the schema.
- Costs: a mapper, a second set of types, and two edits per field — forever, on every change.
  This is the cost that gets omitted when the choice is argued on principle
  (`orm-structural-mapping`).

The pattern-level version of this choice — Active Record versus Data Mapper — is
`data-source-patterns`. What follows is only its coupling half.

```text
Is the domain logic rich — invariants, state machines, rules that
change independently of the schema?
        no  → one model. The entity IS the domain type. A CRUD service
              with a second model is paying for nothing
              (domain-logic-organization).
        yes ↓

Do the schema and the domain model diverge in shape — legacy tables,
a schema owned elsewhere, aggregates spanning several tables?
        yes → two models. The mapping already exists; making it
              explicit is cheaper than distorting the domain.
        no  ↓

Will the invariants tolerate JPA's requirements (no-arg constructor,
mutable fields, identity semantics)?
        yes → one model, with the requirements accepted deliberately.
        no  → two models. This is the strongest case: the domain type
              cannot be correct AND be an entity.
```

The rung this really sits on is not "annotations present" but **"can persistence concerns
change the domain's shape"**. `@Column(length = 40)` on a field is metadata. A `@PrePersist`
callback that assigns a business identifier, or a rule expressed as a lazily-loaded
collection's contents, is the model leaking.

## The base-class trap

Extending a framework class from business code is the one coupling worth refusing almost
categorically.

```java
// Refuse: the extends slot is spent, the lifecycle is imported,
// and the class can no longer be constructed in a plain test.
public class OrderService extends JdbcDaoSupport { }
```

Reasons, in order of importance:

1. Java has single inheritance; the slot is now gone for the rest of the class's life.
2. The superclass's lifecycle, state and protected surface become part of your class, and
   change under you on every upgrade (`java-composition-over-inheritance`).
3. It cannot be undone incrementally — every subclass moves at once.

Frameworks that once required base classes have almost all moved to annotations and
interfaces for exactly this reason. Where a base class is still offered, there is normally a
compositional alternative; prefer it.

**The exception that is fine:** framework-provided base classes in _test_ code and in
_adapters_ you would rewrite anyway. The cost is bounded because the blast radius is.

## Serialisation annotations

`@JsonProperty`, `@JsonIgnore` and their relatives on a domain type couple the domain's shape
to an external contract, which is a coupling to a **consumer**, not merely to a framework.
Rename a field for clarity and an API breaks.

This is why the DTO is usually worth its cost even when a separate persistence model is not:
the wire contract genuinely evolves independently of the domain, has its own compatibility
rules, and is read by parties you cannot refactor (`remote-facade-and-dto`,
`rpc-and-api-contracts`).

The distinguishing test between this and the persistence case: **a schema is yours to migrate;
a published API contract is not.**

## Enforcing the decision

Automate the decision where static structure represents it faithfully. Semantic boundaries still
require review and behavioral tests; rule cost depends on classpath size and complexity.

```java
@Test
void domainDoesNotDependOnTheFramework() {
    JavaClasses classes = new ClassFileImporter()
            .withImportOption(new ImportOption.DoNotIncludeTests())
            .importPackages("com.example");

    noClasses().that().resideInAPackage("..domain..")
            .should().dependOnClassesThat()
            .resideInAnyPackage(
                    "org.springframework..",
                    "com.fasterxml.jackson..",
                    "jakarta.servlet..")
            .check(classes);
}
```

Note what this rule deliberately does _not_ forbid: `jakarta.persistence`. That is the
one-model decision made explicit and enforced — the domain may be persisted, but may not know
about the web, the container or the serialiser. Write the rule to match the decision you
actually made, and let the exclusion list document it.

A complementary rule catches the leak that hurts most in practice:

```java
@Test
void entitiesDoNotEscapeTheWebLayer() {
    methods().that().areDeclaredInClassesThat().resideInAPackage("..web..")
            .and().arePublic()
            .should().notHaveRawReturnType(resideInAPackage("..persistence.entity.."))
            .check(classes);
}
```

## Quick placement table

| Construct                                | Domain type | Application service | Adapter / web | Test |
| ---------------------------------------- | ----------- | ------------------- | ------------- | ---- |
| Constructor injection                    | n/a         | yes                 | yes           | yes  |
| `@Service` / `@Component`                | no          | yes                 | yes           | —    |
| `@Transactional`                         | no          | **yes — here**      | no            | —    |
| `@Entity`, `@Column`                     | decision    | no                  | yes           | —    |
| `@PrePersist` containing a business rule | no          | no                  | no            | —    |
| Jackson annotations                      | no          | no                  | yes           | —    |
| Framework base class                     | no          | no                  | tolerable     | yes  |
| Reactive types in the signature          | no          | decision            | yes           | —    |

"decision" means both answers are defensible and the choice must be recorded, not defaulted.
