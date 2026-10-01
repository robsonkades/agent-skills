# Java and Spring boundary implementation

Read when applying a context decision to Java/Spring code, reviewing shared entities or
making a module boundary executable. This is an implementation guide for an accepted
semantic cut, not authorization to extract services or introduce a framework.

The package layout below is pseudocode. The Java interface is a partial signature sketch,
not a standalone program; referenced domain types, implementation and tests are omitted.
It uses ordinary interfaces available in Java 8+, without requiring Java 8 as the project's
runtime baseline. The optional Spring Modulith guidance was checked against the 2.0.8
documentation source linked below; it was not compiled or run here.
Use documentation matching the project's resolved version and Boot compatibility before
changing dependencies. A project without Modulith can enforce its existing module rules.

## Connect the model to code

Locate the business decision and all callers before moving classes. Prefer business
modules containing their own application, domain and persistence code when this makes
ownership visible; retain a working project layout if a small facade/translation solves
the actual problem. Do not create an extra abstraction for every method by default.

Illustrative layout in a single Spring Boot application:

```text
com.example.Application
com.example.sales
    SalesOrders                 public module contract
    AcceptedOrder               public fact/value contract, independent of ORM entities
com.example.sales.internal
    NegotiatedOrder             private Sales model
    persistence/...             private mappings and repositories
com.example.billing
    InvoiceOperations           public module contract
com.example.billing.internal
    SalesOrderTranslation       consumes the Sales contract, produces Billing input
    IssuedInvoice               private Billing model
    persistence/...             private mappings and repositories
```

Here Billing can depend on Sales' published contract, while Sales does not import Billing's
model. This is one possible arrangement, not a universal dependency direction: a consumer
port with an adapter can invert the source dependency when that simplifies independent
modeling. Keep the owner and meaning of the published fact explicit whichever arrangement
is chosen. An application coordinator can call both contracts without owning their rules.

Choose an operation that expresses the business decision:

```java
// Partial signature sketch. The types express agreed contracts, not implementation.
public interface InvoiceOperations {
    IssueOutcome issue(IssueInvoice command);
}
```

`IssueInvoice` must state which accepted fact, scoped identity and effective values it
uses. `IssueOutcome` distinguishes the results the caller actually needs, including a
business rejection or unresolved mapping where those are part of the contract. Prefer
the project's established value classes and error convention. Records, sealed types or
fluent builders are optional conveniences only if the target version and construction
needs justify them. A builder must not create an apparently valid command with an
unresolved recipient; a fluent surface does not strengthen the underlying invariant.

Avoid publishing a generic `save(Entity)` merely because a repository already exposes
it. That often gives callers the responsibility to establish the owner's invariant. It
can be adequate for deliberate simple CRUD with a clear validation authority; inspect the
operation rather than banning CRUD signatures as a naming rule.

## Protect model meaning at the boundary

- Keep another context's JPA entities, lazy associations and repositories out of the
  public contract unless that shared model is an explicit, justified decision. Translate
  published values to local value types; copying a persistence class into a `dto` package
  does not remove its lifecycle assumptions.
- Define identifier scope and conversion failure. Two wrapper classes around the same
  string can protect against accidental substitution at compile time, but the mapper
  still needs valid tenant/issuer/business correspondence. A successful cast or parse
  cannot supply that correspondence.
- Preserve values needed for a historical decision. Loading a current address, price or
  status during translation can change the original fact. If the contract needs current
  authority instead, fetch or validate it at the relevant operation and state that choice.
- Expose only the state consumers need; immutable snapshots avoid leaking writable
  references but do not guarantee freshness or authorization. Preserve the project's
  copying and collection contracts when creating a boundary value.
- A Spring `@Service`, package name or `@Transactional` annotation does not itself assign
  business ownership. Inspect the actual transaction manager, entry path, propagation
  and resource participation before claiming two writes are atomic. Preserve existing
  atomicity when a local refactoring changes call paths or proxy interception.

For Spring transaction or event changes, use `spring-transactions-and-events`. This
semantic cut does not make an ordinary application event a durable integration event.
If the task later introduces a process boundary, reconsider the contract's serialization,
unknown outcomes and compatible evolution through `distribution-boundaries` and
`rpc-and-api-contracts` instead of replacing each local call with HTTP mechanically.

## Verify the implementation mechanism you actually use

Use existing architecture tests first. A rule can allow calls to a module API and reject
imports of its internals; prove the rule with an intentionally forbidden dependency in
an isolated fixture. Do not add unused tools solely to draw a module diagram. Static
dependency checks need separate coverage for reflective wiring or other dynamic paths
that the chosen tool does not observe.

If the project already uses compatible Spring Modulith, its
[module arrangement rules](https://github.com/spring-projects/spring-modulith/blob/2.0.8/src/docs/antora/modules/ROOT/pages/fundamentals.adoc)
identify APIs and internal packages. Default detection treats each direct subpackage of
the application package as a module; its public base-package types form its API. Public
types in deeper packages remain internal unless exposed, for example through named
interfaces. Inspect custom detection, explicitly nested modules, open modules and named
interfaces before applying that default. `public` Java visibility by itself does not
make an internal type part of a Modulith-exposed API.

The documented
[module verification](https://github.com/spring-projects/spring-modulith/blob/2.0.8/src/docs/antora/modules/ROOT/pages/verification.adoc)
through `ApplicationModules.of(Application.class).verify()` checks dependency cycles,
access through allowed APIs and explicit allowed dependencies when configured. Open
modules relax access to internals. Check that the intended modules are detected and the
test actually runs; a green test over an empty or excluded arrangement is not evidence
of this boundary. These checks assess code structure, not whether a Billing concept is
semantically distinct from a Sales concept.

Pair structure checks with tests of the translation and public operation. In the
illustrative flow, a Sales address revision must not silently rewrite an issued invoice;
an unknown acceptance state must not become a successful issuance. Test at the owning
public contract, with real persistence/transaction integration if that behavior is part
of the change. A mock returning the expected outcome cannot establish atomicity or
historical-value preservation in the actual implementation.

When implementation is requested, finish the slice: callers use the intended contract,
translation has a named location and owner, required documentation reflects the mapping,
and relevant tests run under the existing build. For legacy code, record remaining
boundary violations and an incremental path with `architecture-refactoring-paths`;
do not weaken an existing rule merely to call a partial migration complete. Report any
untested runtime assumptions separately from the structural result.
