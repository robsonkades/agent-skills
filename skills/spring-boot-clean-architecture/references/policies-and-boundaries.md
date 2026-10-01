# Allocate policies and trace dependencies

Read when locating a rule, assessing a leaked type or deciding whether a new seam
protects an actual contract. Use one operation and its failure paths as evidence.

## Policy ownership

An order's allowed state transition belongs to the business model; submitting an
order coordinates loading, access, transition and saving. A domain service may own
a rule that spans domain values without naturally belonging to one object. Calling
everything a service does not decide ownership. Conversely, a straightforward
transaction script can be sufficient; do not manufacture rich entities solely for
this pattern. These distinctions are supported by Fowler's
[Domain Model](https://martinfowler.com/eaaCatalog/domainModel.html) and
[Service Layer](https://martinfowler.com/eaaCatalog/serviceLayer.html).

Use the change that should affect the rule as a diagnostic:

| Given rule                                                | Owner and reason                                                       | Check that distinguishes a mistake                                                             |
| --------------------------------------------------------- | ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Orders require a positive total in this fixture           | Domain construction/transition; true for every entry                   | Direct construction rejects zero; bypassing HTTP cannot accept it                              |
| This actor may submit only for their customer account     | Application access policy using trusted actor context                  | Another entry with no entitlement cannot persist; body owner cannot select a different account |
| Order and local receipt must exist together on success    | Application requirement, implemented by an effective outer transaction | Second write fails and the first is absent after the entry returns                             |
| Unsupported media type maps to the HTTP response contract | HTTP adapter                                                           | HTTP test; moving this rule to the domain adds no business guarantee                           |
| Display amount as currency text for a particular view     | Presentation adapter                                                   | Change display formatting with unchanged inner outcome                                         |

These are fixture requirements, not universal commerce rules. In a real checkout,
obtain prices from trusted catalog/business rules instead of trusting submitted totals.
Authorization spanning loaded state belongs where those facts are available. Avoid
performing reads or returning details before access checks if that leaks protected
state. Domain rules that constrain transfer or approval can additionally participate;
not all security policy is a framework annotation.

## Two maps, two questions

For the shipped fixture, the **source dependency** map is:

```text
outer configuration --> outer transaction entry --> application PlaceOrder --> domain Purchase
outer JDBC adapter  --> application PlaceOrder.Ledger
outer receipt view  --> application PlaceOrder.Result
application PlaceOrder --> application-owned Ledger
```

The **execution** map for success is:

```text
trusted caller -> outer entry -> transaction begin -> use case -> domain validation
    -> Ledger dispatch -> JDBC adapter -> database (two writes)
    -> inner Result -> transaction commit -> caller -> representation mapping
```

The application calls an implementation that resides outside it at runtime, while
its compiled signature names its own interface. An interface placed in an
`infrastructure` package and imported by the application reverses that ownership.
Constructor injection alone cannot correct this. Martin's
[dependency and boundary explanation](https://blog.cleancoder.com/uncle-bob/2012/08/13/the-clean-architecture.html)
is the source for the distinction, not a requirement for a fixed number of packages.

## Boundary types and costs

Inspect parameter/return types, generic arguments, annotations, exceptions, inheritance,
callbacks and transitive collaborators. A `Page<JPAEntity>` returning from a use case
still exposes persistence semantics even if the service class moved to `application`.
For an independent core, define an application-owned query/result with the required
paging, ordering and absence semantics; let the adapter translate the actual framework
types. A naive replacement with `List` can lose totals, cursors or stable ordering.

Keep ORM-managed objects and serialization-specific views outside. Choose separate
types when schemas, invariants, mutability or lifecycle differ; preserve one suitable
plain value type where sharing does not leak those concerns. Do not copy matching
fields through five records without an ownership or contract reason. If an existing
simple CRUD model deliberately retains JPA annotations, describe that accepted
coupling and its lifecycle tests; it is not strict framework independence.

Application contracts specify whether absence is ordinary, a stale/conflicting write
is expected, and an infrastructure failure remains a failure. Translate technical
exceptions at the adapter boundary without exposing them as public business values.
Preserve diagnostic causes internally, avoid leaking them in HTTP responses, and let
rollback see the appropriate failure. A port alone cannot equalize two engines'
isolation, query semantics or durability.
