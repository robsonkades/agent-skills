# Pattern Overuse

An abstraction is a cost paid every day for a benefit that is sometimes contingent and
sometimes imaginary. This is how to tell which.

## The four questions

For any abstraction under review:

1. **What varies behind it?** Name the second implementation — existing, or scheduled with a
   date. "We might switch databases" is not an answer; nobody switches, and if they did, the
   abstraction would not survive contact with the new engine's features.
2. **What would break if it were deleted?** If the answer is "nothing, callers would use the
   concrete type", it is a file.
3. **What does it cost per change?** Files touched to add a field; mocks per test; hops in a
   stack trace.
4. **Who is it for?** An abstraction for a future team is speculative; one for a caller that
   exists today is real.

Two or more weak answers is a strong signal to remove it.

## Interface-per-class

```java
public interface OrderService { OrderId place(PlaceOrderCommand c); }
public class OrderServiceImpl implements OrderService { ... }
```

**The claimed benefit:** testability and flexibility. **The reality:** modern mocking
libraries mock classes; there is no second implementation; and the interface's methods change
whenever the class's do, so nothing is decoupled.

**Cost:** two files per concept, one indirection in every navigation, and `Impl` in a name,
which is an admission that the interface names nothing.

**Keep it when:** the interface is owned by a different package than the implementation and
that inversion is doing architectural work (`enterprise-base-patterns`); there is a genuine
second implementation; or it narrows a wide framework surface deliberately.

**Delete it when:** interface and implementation live in the same package, change together
and have one implementation.

## Generic repository

Covered in the catalogue; the overuse-specific point is that its generality is exactly what
makes it useless. A base offering only what **all** entities share can only offer CRUD, so
every aggregate gets a surface it did not ask for and none gets what it needs. Generality and
usefulness trade off directly here, and the trade is visible in the method list.

## The mapping chain

```text
OrderRow → OrderEntity → Order → OrderDto → OrderResponse
```

Five representations. Typically two pairs are structurally identical, and a new field is a
five-file change with two chances to forget one.

**The test:** for each adjacent pair, name a field that differs, or a reason one must change
without the other. Pairs with no answer collapse into one.

**What survives the collapse:** the domain type (if a domain model is the choice) and the
wire type at a remote boundary. Two representations, one mapping — which is the normal
healthy shape (`remote-facade-and-dto`).

## Speculative plugin points

```java
public interface PricingStrategy { Money price(Order o); }
@Component class DefaultPricingStrategy implements PricingStrategy { ... }
// The only implementation. Since 2019.
```

**Cost:** a configuration key, a wiring test, a runtime misconfiguration failure mode, and a
call site that no longer says what happens.

**Rule:** a plugin point requires a second implementation to exist or to be scheduled with a
date. Variation that is _anticipated_ is cheaper to add when it arrives — extracting an
interface from a concrete class is a five-minute IDE refactor
(`architecture-decision-making`).

## Premature service layer

Covered in `service-layer-design`. The overuse-specific point: a pass-through service is not
just useless, it is **actively harmful**, because it establishes that the service layer is a
forwarding convention. That belief is what later makes it the natural home for every rule.

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
(`domain-logic-organization`). Reference data with three validations wants Active Record and
should say so.

## Abstraction over a framework abstraction

```java
public interface CacheService { <T> T get(String key, Supplier<T> loader); }
class RedisCacheService implements CacheService { /* delegates to RedisTemplate */ }
```

The framework already abstracts the cache. This layer adds a name and removes features
(TTL per entry, conditional caching, statistics). When the framework is replaced, this
interface will not survive either, because it was shaped by the framework it wraps.

**Same shape, same verdict:** a `TransactionService` over `@Transactional`; a `HttpService`
over `RestClient`; a `MessagingService` over a broker template. Wrap an external system
(`enterprise-base-patterns`), not your own framework.

## Configuration as a substitute for code

"Make it configurable so business users can change it" produces a mechanism with no type
checking, no tests, no version control of the rules, no IDE, and an interpreter you now
maintain.

**Justified when:** the variation is genuinely per-tenant and unbounded, business users
really do change it, and there is a review and rollback path for changes.

**Not justified when:** it is a way to avoid a deploy. Fix the deploy pipeline; it is
cheaper and it benefits everything else (`architecture-decision-making`).

## Removing an abstraction safely

1. **Inline at one call site** and run the tests. Confirms nothing hidden depended on it.
2. **Inline the rest** mechanically, one commit.
3. **Delete the abstraction and its tests.** Tests of a deleted indirection are not coverage
   loss; they tested the indirection.
4. **Re-check the files-per-change metric.** The number should drop; if it does not, the
   abstraction was not the cost.

Do not remove an abstraction and add a different one in the same change. If the removal is
correct, it stands alone; if it needs a replacement, the abstraction was doing something and
the analysis was wrong (`architecture-refactoring-paths`).

## The counterweight

Under-abstraction is equally real and this reference is not an argument for none. The
abstractions that reliably pay in enterprise applications:

- **A gateway around every external system** — including the clock and the filesystem.
- **The transaction boundary at one layer.**
- **A boundary type at every remote edge.**
- **An aggregate boundary where an invariant spans objects.**
- **One error shape, produced in one place.**

Each has a named, immediate benefit. That is the standard the questionable ones fail.
