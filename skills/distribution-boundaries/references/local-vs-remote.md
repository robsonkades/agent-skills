# Local versus Remote Boundaries

## The arithmetic that makes a remote interface different

A local design that reads naturally:

```java
Customer customer = customers.byId(id);
Address address = customer.billingAddress();
List<Order> recent = orders.recentFor(customer.id(), 10);
Money outstanding = invoices.outstandingFor(customer.id());
```

Four calls, each essentially free. Ported across a network at 1 ms per round trip, this is
4 ms — plus tail. And tails do not average: with a p99 of 40 ms per call, the probability
that at least one of four calls hits the tail is roughly 4%, so the composite p99 is far
worse than any single call's.

Now put it in a loop over 50 customers on a list screen: 200 remote calls, and a page that
is fine in the developer's test with three rows.

The remote version must be one call:

```java
CustomerSummary summary = customerApi.summary(id);   // one round trip, one payload
```

That is a Remote Facade, and the payload is a DTO shaped by what the caller needs
(`remote-facade-and-dto`). It is a different interface from the local one on purpose —
attempting to share one interface across both is the mistake the pattern exists to prevent.

## Failure modes a local call does not have

```java
// In-process: two outcomes.
inventory.reserve(orderId, lines);      // returns, or throws

// Remote: at least six.
inventoryClient.reserve(orderId, lines);
//  1. success
//  2. failure, reported                → safe to fail the use case
//  3. timeout, work NOT done            → safe to retry
//  4. timeout, work DONE                → retry duplicates unless idempotent
//  5. success reported, response lost   → same as 4
//  6. hang beyond the deadline          → the caller's thread and pool are the casualty
```

Cases 4 and 5 are why every remote write needs an idempotency key or a naturally idempotent
operation (`idempotency`), and case 6 is why every remote call needs a timeout shorter than
the caller's own deadline (`timeouts-and-deadlines`). A remote call with no timeout is not a
slow call; it is an availability incident waiting for the downstream to hang.

## The module as rehearsal

The strongest reason to build a modular monolith before a service: the module boundary is
the same boundary, and it costs a refactor to correct instead of a migration.

```text
Stage 1   Package/module with a published surface; in-process calls.
          Wrong boundary costs: an IDE refactor.

Stage 2   Same surface, but calls go through an interface with an
          in-process implementation. Data ownership enforced: only this
          module writes its tables.
          Wrong boundary costs: a refactor.

Stage 3   Replace the implementation with a remote adapter. Everything
          above the interface is unchanged.
          Wrong boundary costs: a migration, two teams, and downtime.
```

Do not skip to stage 3. Teams that do consistently discover the boundary was wrong at the
point where correcting it is most expensive.

Stage 2 is where you learn the truth, and it is cheap: run for a month with the interface
in place and the data ownership enforced. If, in that month, a change required editing both
sides in the same commit, the boundary is wrong — and you found out for free.

## The distributed monolith

Detectable, and worth checking before adding the next service:

| Symptom                                                 | What it means                                       |
| ------------------------------------------------------- | --------------------------------------------------- |
| Services must be released in a specific order           | The contract is not versioned; there is no boundary |
| A feature routinely requires a PR in three repositories | The boundary cuts across features, not along them   |
| Services share a database or read each other's tables   | One service with a network inside it                |
| A shared library of DTOs must be upgraded in lockstep   | Compile-time coupling reintroduced over the network |
| One service down means the whole system is down         | No fault isolation — the main benefit is absent     |
| Integration testing requires the whole system running   | The units are not independently verifiable          |
| A "service" has no data of its own                      | It is a function call with a load balancer          |

Any three of these together mean the distribution is costing without paying. The remedy is
usually to merge services back — unpopular, and cheaper than the alternative of continuing.

## When distribution is genuinely right

Not a rare case; just a narrower one than practice suggests:

- **Divergent resource profiles.** A report generator needing 60 GB of heap next to an API
  needing 512 MB. Co-located, the API is sized for the report.
- **Divergent scaling curves.** One component scaling with users, another with catalogue
  size, and the difference is an order of magnitude.
- **Real fault isolation with a real fallback.** A recommendation engine whose failure
  should degrade the page, not break checkout — provided the caller actually degrades.
- **Team autonomy at organisational scale.** Beyond roughly two teams in one deployable,
  release coordination starts to dominate delivery time. This is the most common honest
  driver and deserves to be stated as such.
- **Regulatory or data-residency isolation.** Non-negotiable, and it settles the question.
- **Technology fit.** A component that genuinely needs a different runtime.

Note that "scale" appears twice and neither is "we expect a lot of traffic". A single
process with a connection pool and a cache serves a large amount of traffic; when it does
not, the bottleneck is usually the database, which extraction does not move
(`architecture-and-performance`).

## Running an extraction so it can be abandoned

1. **Enforce data ownership first**, in the monolith. All access to the module's tables goes
   through the module. This is the majority of the work and delivers value even if you stop
   here.
2. **Introduce the interface** at the intended boundary, with an in-process implementation.
3. **Coarsen it** until the call count per use case is what it should be over a network.
4. **Add a remote adapter** behind the same interface; route a percentage of traffic.
5. **Move the data** last, when the interface has been stable for a meaningful period.

Each step is independently valuable and independently reversible. Steps 1–3 improve the
monolith whether or not the extraction ever completes — which is the property that makes it
safe to start (`legacy-enterprise-modernization`).
