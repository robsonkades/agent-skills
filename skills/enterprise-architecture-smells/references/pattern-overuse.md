# Pattern Overuse

An abstraction is a cost paid every day for a benefit that is sometimes contingent and
sometimes imaginary. This is how to tell which.

## The four questions

For any abstraction under review:

1. **What responsibility does it isolate?** Identify actual variation, ownership, policy or
   a stable caller contract. Database portability needs concrete supported operations and
   compatibility evidence; a second implementation is useful evidence, not a prerequisite
   for every boundary.
2. **What would break if it were deleted?** If the answer is "nothing, callers would use the
   concrete type", it is a file.
3. **What does it cost per change?** Files touched to add a field; mocks per test; hops in a
   stack trace.
4. **Who is it for?** Distinguish a hypothetical future team from an accepted integration,
   ownership or compatibility obligation. A committed external contract can matter before
   its consumer goes live; state the evidence and the cost of deferring the boundary.

Weak answers justify investigation; remove only after establishing cost and the contracts
that must survive. Do not turn the question count into a deletion threshold.

## Interface-per-class

```java
public interface OrderService { OrderId place(PlaceOrderCommand c); }
public class OrderServiceImpl implements OrderService { ... }
```

**The claimed benefit:** testability and flexibility. **Check:** does the installed mocking
toolchain support the concrete class, and does the interface constrain callers or establish
ownership? Co-changing methods are evidence of coupling, not proof the interface adds nothing.

**Possible cost:** parallel edits and extra navigation. An `Impl` suffix alone is not
evidence of a meaningless interface.

**Keep it when:** the interface is owned by a different package than the implementation and
that inversion is doing architectural work (`enterprise-base-patterns`); there is a genuine
second implementation; or it narrows a wide framework surface deliberately.

**Consider deleting when:** it adds no required contract or boundary and its indirection has
measurable cost. Check public API consumers, dependency injection and JDK-versus-class proxy
behavior first; package placement and implementation count are insufficient.

## Generic repository

Covered in the catalogue; inspect whether the generic surface exposes operations callers
must not perform or forces domain queries elsewhere. Generic implementation reuse and a
selective interface can be useful; type parameters alone establish neither harm nor value.

## The mapping chain

```text
OrderRow → OrderEntity → Order → OrderDto → OrderResponse
```

Five representations. Typically two pairs are structurally identical, and a new field is a
five-file change with two chances to forget one.

**The test:** for each adjacent pair, name a field that differs, or a reason one must change
without the other, including trust and serialization policy. Pairs with no justified
boundary are candidates for consolidation after compatibility checks.

**What survives the collapse:** representations justified by persistence, domain, read/write
permissions or independently versioned wire contracts. Identical fields can still have
different trust and evolution requirements; there is no universal healthy representation
count (`remote-facade-and-dto`).

## Speculative plugin points

```java
public interface PricingStrategy { Money price(Order o); }
@Component class DefaultPricingStrategy implements PricingStrategy { ... }
// The only implementation. Since 2019.
```

**Cost:** a configuration key, a wiring test, a runtime misconfiguration failure mode, and a
call site that no longer says what happens.

**Rule:** justify the extension contract and its present cost. A supported external SPI can
be useful with one bundled implementation; an internal speculative switch may be cheaper to
defer. Later extraction can break published consumers or configuration, so estimate the
actual compatibility work (`architecture-decision-making`).

## Premature service layer

Covered in `service-layer-design`. Investigate forwarding conventions that attract unrelated
rules or create repeated edits. A forwarding method may still define authorization,
transactions or a stable application entry point through configuration/annotations.

## Premature domain model

```java
// Five CRUD screens over reference data.
@Entity class Country {
    private CountryCode code;      // value object
    private CountryName name;      // value object
    private Region region;         // aggregate reference
    // + repository interface, + adapter, + mapper, + DTO, + 3 test classes
}
```

**Cost:** everything a domain model costs — mapping, reconstitution, aggregate discipline,
onboarding — with no invariant to protect.

**Rule:** a domain model is justified by interacting rules, not by an entity's importance
(`domain-logic-organization`). Simple reference data may fit Transaction Script with an
existing suitable data-access boundary or Active Record; choose from actual rules and
repository conventions, not a validation count or a mandatory new gateway.

## Abstraction over a framework abstraction

```java
public interface CacheService { <T> T get(String key, Supplier<T> loader); }
class RedisCacheService implements CacheService { /* delegates to RedisTemplate */ }
```

Inspect which cache contract callers need. This example omits expiry, type/key ownership and
failure semantics; that may be intentional narrowing or a source of incorrect behavior.
Framework substitution needs compatibility tests, not a portability claim based on the name.

**Apply the same questions to:** a `TransactionService` over `@Transactional`; a `HttpService`
over `RestClient`; a `MessagingService` over a broker template. Each can be useful when it
owns policy or isolates a dependency. Establish that contribution before keeping or removing it
(`enterprise-base-patterns`).

## Configuration as a substitute for code

"Make it configurable so business users can change it" introduces another change path.
Inspect schema/type validation, versioned rules, tests, permissions and rollback; those
controls can exist for configuration but must be designed and operated.

**Justified when:** the variation serves real tenant or operational needs, authorized users
really do change it, and there is a review and rollback path for changes.

**Compare with:** a code change and deploy, including the cost of improving that pipeline.
Independent rollout, emergency controls or tenant settings can justify runtime configuration;
avoiding deployment alone does not establish that it is cheaper (`architecture-decision-making`).

## Removing an abstraction safely

1. **Inventory contracts and indirect consumers.** Include reflective/configuration uses,
   published APIs, transactions, authorization and proxy advice. Define preserved behavior.
2. **Change one call path** and run focused behavior/contract tests through the real boundary.
   A passing unit test does not establish the absence of hidden dependencies.
3. **Migrate remaining callers and remove the redundant type.** Preserve useful assertions
   at the remaining owner; delete only tests of behavior that intentionally ceases to exist.
4. **Check the claimed benefit**, such as simpler rule changes or less navigation, alongside
   behavior and compatibility. A lower raw file count is neither necessary nor sufficient.

Replacing an overly broad boundary with a narrower one can be correct. Keep the migration
small and reviewable, and explain which responsibility survives and which cost disappears
(`architecture-refactoring-paths`).

## The counterweight

Under-abstraction is equally real and this reference is not an argument for none. The
abstractions that reliably pay in enterprise applications:

- **A gateway where dependency policy or isolation needs an owner** — existing clock or
  filesystem APIs may already provide the needed seam.
- **Transaction demarcation matching the unit of work.**
- **An explicit contract at a remote edge.**
- **An aggregate boundary where an invariant spans objects.**
- **Consistent error translation at the relevant boundary.**

Each has a named, immediate benefit. That is the standard the questionable ones fail.

Before Spring interface or forwarding-layer removal, consult the project's version of
[Spring AOP proxying](https://docs.spring.io/spring-framework/reference/core/aop/proxying.html):
self-invocation bypasses proxy advice, and changing interface/class proxying can change which
methods can be advised. Verify transaction/security behavior through the configured entry point.
