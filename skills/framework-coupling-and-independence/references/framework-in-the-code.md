# Where the Framework May Appear

The placement decisions that actually come up in a Spring and JPA codebase, each with the
cost of getting it wrong and the cost of the alternative. None of these has a universal
answer; each has a defensible answer once the context is stated.

## Injection and stereotypes

`@Service`, `@Component`, `@Repository` and constructor injection are the cheapest rung of
the ladder. The class is a plain object with a constructor; the annotation tells a container
to discover it; wiring also depends on constructor/configuration rules. Constructor injection remains plain Java; removing Spring from an annotated class
also requires removing/replacing the annotation dependency and wiring, though its business behavior
can remain directly testable.

The Java excerpts are partial examples; use the project's declared Java, Spring and test-library
versions and supply imports/collaborator types. The final class below assumes no subclass-based
proxy is required; adding transactional/cache advice changes that constraint.

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

Field injection without an explicit constructor/setter leaves dependencies inaccessible through
ordinary construction. It can still be unit-tested — with
`ReflectionTestUtils` or `@InjectMocks` — but only by reaching around the type's own
construction, and the class can never guarantee it was fully initialised. The cost has nothing
to do with framework independence; it is a design defect the annotation happens to enable
(`java-dependency-inversion`).

**Verdict:** accept freely. Use constructor injection. Do not build an abstraction over DI.

## `@Transactional` and other declarative behaviour

`@Transactional`, `@Cacheable` and proxy-based retry attach behavior through interception;
check the actual framework/module and mode. `@Scheduled` registers tasks through a bean
post-processor, rather than advising every call. Calling its method directly does not schedule
it. Their syntax may be cheap to move while timing, failure and lifecycle semantics are not.

Two properties are worth knowing regardless of the coupling question, because both cause
silent failures:

- **Self-invocation bypasses default Spring proxy advice.** A method calling another method on `this` does not
  go through that proxy, so the annotation on the callee does nothing in proxy mode. AspectJ mode
  and calls through an injected/exposed proxy behave differently. This is a common
  cause of "the transaction annotation is there but nothing rolled back"
  (`enterprise-transactions`).
- **Invocation and propagation determine the boundary.** A repository method can execute many
  queries and join an outer transaction; separate repository calls are not automatically one
  atomic use case. A proxied synchronous controller transaction normally ends on method return,
  before later response serialization; reactive/asynchronous paths differ. Trace the actual
  transaction, persistence context and connection separately. A service boundary commonly
  makes a multi-repository use case explicit
  (`service-layer-design`).

**Verdict:** prefer an application-service boundary for use-case transactions; repository defaults
can remain valid for local operations. Verify rollback/propagation and external-call timing.

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
- Costs: mapping and a second representation to maintain when a change crosses the boundary.
  This is the cost that gets omitted when the choice is argued on principle
  (`orm-structural-mapping`).

The pattern-level version of this choice — Active Record versus Data Mapper — is
`data-source-patterns`. What follows is only its coupling half.

```text
Is the domain logic rich — invariants, state machines, rules that
change independently of the schema?
        no  → favor one persistence/domain model unless schema ownership,
              security or independently evolving contracts justify separation
              (domain-logic-organization).
        yes ↓

Do the schema and the domain model diverge in shape — legacy tables,
a schema owned elsewhere, aggregates spanning several tables?
        yes → two models. The mapping already exists; making it
              explicit is cheaper than distorting the domain.
        no  ↓

Will the invariants tolerate the target provider/specification's construction,
hydration, persistent-state and identity requirements?
        yes → one model, with the requirements accepted deliberately.
        no  → two models. This is the strongest case: the domain type
              cannot be correct AND be an entity.
```

The rung this really sits on is not "annotations present" but **"can persistence concerns
change the domain's shape"**. `@Column(length = 40)` on a field is metadata. A `@PrePersist`
callback that assigns a business identifier, or a rule expressed as a lazily-loaded
collection's contents, is the model leaking.

## The base-class trap

Prefer composition when business code does not need the inherited framework lifecycle.

```java
// Review: inherits support lifecycle and protected API.
// It remains directly constructible and configurable in a plain test.
public class OrderService extends JdbcDaoSupport { }
```

Reasons, in order of importance:

1. Java has single class inheritance; the current superclass constrains other inheritance choices.
2. The superclass's lifecycle, state and protected surface become part of your class, and
   can change with an upgrade (`java-composition-over-inheritance`).
3. Migration must inspect inherited behavior and caller type dependencies. A delegate or adapter
   can permit subclass-by-subclass migration; shared superclass contracts may require coordination.

Check whether the target framework offers a compositional alternative that preserves the
needed lifecycle and protected behavior before replacing the base class.

**The exception that is fine:** framework-provided base classes in _test_ code and in
_adapters_ you would rewrite anyway. The cost is bounded because the blast radius is.

## Serialisation annotations

`@JsonProperty`, `@JsonIgnore` and their relatives on a domain type couple the domain's shape
to an external contract, which is a coupling to a **consumer**, not merely to a framework.
Renaming an implicitly exposed property can break an API; an explicit stable `@JsonProperty`
name can preserve it. Verify actual serialized output and consumer compatibility.

This is why the DTO is usually worth its cost even when a separate persistence model is not:
the wire contract genuinely evolves independently of the domain, has its own compatibility
rules, and is read by parties you cannot refactor (`remote-facade-and-dto`,
`rpc-and-api-contracts`).

Determine ownership and compatibility for both boundaries: shared or externally owned schemas
can be just as constrained as published APIs.

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

A complementary partial rule catches direct raw entity return types. Reuse the imported
`JavaClasses classes` above in the test fixture and the project's ArchUnit/JUnit dependencies:

```java
@Test
void entitiesDoNotEscapeTheWebLayer() {
    methods().that().areDeclaredInClassesThat().resideInAPackage("..web..")
            .and().arePublic()
            .should().notHaveRawReturnType(resideInAPackage("..persistence.entity.."))
            .check(classes);
}
```

This rule misses `List<Entity>`, `ResponseEntity<Entity>`, reactive wrappers, parameters and
runtime serialization. Extend checks to generic type dependencies for the actual contract and
test wire output; test that the importer selected the intended classes and that a forbidden
fixture fails. In a one-model layout, entity packages may differ from `..persistence.entity..`.

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
The table is a suggested one-model policy, not a framework restriction; repository transaction
defaults and isolated adapter transaction boundaries can be legitimate exceptions.

## Sources and compatibility

- [Spring scheduling](https://docs.spring.io/spring-framework/reference/integration/scheduling.html)
  and [caching](https://docs.spring.io/spring-framework/reference/integration/cache/annotations.html)
  (consulted for Framework 7.0.9): task registration versus interception; cache synchronization
  depends on the provider. Check the target version and configured interception mode.
- [Spring Data JPA transactionality](https://docs.spring.io/spring-data/jpa/reference/jpa/transactions.html):
  inherited repository configuration and outer facade transaction boundaries.
- [JdbcDaoSupport API](https://docs.spring.io/spring-framework/docs/current/javadoc-api/org/springframework/jdbc/core/support/JdbcDaoSupport.html):
  public construction and explicit DataSource/JdbcTemplate configuration.
- [Spring Data Redis cache](https://docs.spring.io/spring-data/redis/reference/redis/redis-cache.html):
  locking/non-locking writers, null caching and TTL configuration; inspect the deployed provider.
