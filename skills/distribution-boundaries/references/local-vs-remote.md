# Local versus Remote Boundaries

## The arithmetic that makes a remote interface different

A partial Java illustration (domain types omitted) that reads naturally:

```java
Customer customer = customers.byId(id);
Address address = customer.billingAddress();
List<Order> recent = orders.recentFor(customer.id(), 10);
Money outstanding = invoices.outstandingFor(customer.id());
```

Local dispatch can be cheap; these methods may still do expensive database or I/O work.
If four sequential remote calls each add 1 ms of transport overhead, that adds 4 ms before
work and queueing. For four independent calls each with a 1% probability of exceeding a
40 ms threshold, the probability at least one exceeds it is `1 - 0.99^4 = 3.9404%`.
This does not determine the composite p99: measure the joint latency distribution and
critical path. These are illustrative assumptions, not benchmark results.

Now put it in a loop over 50 customers on a list screen: 200 remote calls, and a page that
is fine in the developer's test with three rows.

One candidate remote shape is:

```java
CustomerSummary summary = customerApi.summary(id);   // one round trip, one payload
```

That is a Remote Facade, and the payload is a DTO shaped by what the caller needs
(`remote-facade-and-dto`). It is a different interface from the local one on purpose —
an interface shared with a local implementation must still expose remote failure and
latency semantics. Consider batching the list use case too; one call per customer still
means 50 calls. Balance payload size, pagination and freshness against round trips.

## Failure modes a local call does not have

```java
// Partial Java illustration: even local code can block or throw after a mutation.
inventory.reserve(orderId, lines);

// Remote: at least six.
inventoryClient.reserve(orderId, lines);
//  1. success
//  2. failure, reported                → inspect contract for partial effects
//  3. timeout, work NOT done            → usually indistinguishable from 4
//  4. timeout, work DONE                → retry duplicates unless idempotent
//  5. success reported, response lost   → same as 4
//  6. hang beyond the deadline          → the caller's thread and pool are the casualty
```

Cases 3–5 require safe repetition or outcome reconciliation before retrying a write
(`idempotency`); a timeout alone does not establish that nothing happened. Case 6 is why
every remote call needs a timeout within
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

Stage 3   Introduce a remote adapter and review caller contracts for
          deadlines, unknown outcomes, idempotency and compatibility.
          Wrong boundary costs: migration and coordination; downtime is a risk.
```

Prefer this rehearsal when feasible; record why a regulatory, runtime or migration
constraint requires a different sequence. Observe representative changes and workloads,
not an arbitrary month. Frequent coordinated edits can expose misplaced responsibilities;
a feature intentionally spanning both sides is not sufficient evidence of a wrong boundary.

## The distributed monolith

Detectable, and worth checking before adding the next service:

| Symptom                                                 | What it means                                                                                 |
| ------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Services must be released in a specific order           | Check persistent lockstep versus a compatible expand/contract migration                       |
| A feature routinely requires a PR in three repositories | Inspect responsibility placement and causes of cochange                                       |
| Services share a database or read each other's tables   | Distinguish shared infrastructure from private-schema/write coupling                          |
| A shared library of DTOs must be upgraded in lockstep   | Compile-time coupling reintroduced over the network                                           |
| One service down means the whole system is down         | That path has a required dependency; assess whether isolation was promised                    |
| Integration testing requires the whole system running   | Check whether component/contract tests can cover more; some end-to-end tests remain necessary |
| A "service" has no data of its own                      | Stateless compute can still justify scaling or isolation; inspect its driver                  |

These are investigation prompts, not a score or automatic merge rule. Compare measured
deployment friction, incidents and operating cost with the stated gains. Options include
contract repair, responsibility/data changes, or merging services when migration cost is justified.

## When distribution is genuinely right

Not a rare case; just a narrower one than practice suggests:

- **Divergent resource profiles.** A report generator needing 60 GB of heap next to an API
  needing 512 MB. Co-located, the API is sized for the report.
- **Divergent scaling curves.** One component scaling with users, another with catalogue
  size, and the difference is an order of magnitude.
- **Real fault isolation with a real fallback.** A recommendation engine whose failure
  should degrade the page, not break checkout — provided the caller actually degrades.
- **Team autonomy.** Measured release coordination and ownership friction can justify
  separation; team count alone cannot.
- **Regulatory or data-residency isolation.** Map the actual requirement to storage,
  deployment and access controls; a process boundary alone may not satisfy it.
- **Technology fit.** A component that genuinely needs a different runtime.

Note that "scale" appears twice and neither is "we expect a lot of traffic". A single
process may serve the workload adequately. Identify whether CPU, memory, queueing or
storage is limiting it; service extraction alone does not remove a shared database bottleneck
(`architecture-and-performance`).

## Running an extraction so it can be abandoned

1. **Enforce data ownership first**, in the monolith. All access to the module's tables goes
   through the module. This is the majority of the work and delivers value even if you stop
   here.
2. **Introduce the interface** at the intended boundary, with an in-process implementation.
3. **Coarsen it** until the call count per use case is what it should be over a network.
4. **Add a remote adapter** with explicit failure semantics. Canary reads where safe;
   write routing must preserve one authoritative owner per key and operation identity.
   Do not execute both old and new write paths as an unprotected comparison.
5. **Migrate data with a tested cutover plan.** Sequence backfill, change capture,
   reconciliation and writer handoff according to the storage topology. Prevent stale
   writers from accepting writes after handoff; define how rollback catches up new writes.

Steps 1–3 can improve the monolith even if extraction stops. Later rollback is conditional
on compatible data and contracts, reconciled writes and a tested ownership transfer; it
is not automatically reversible (`legacy-enterprise-modernization`).

## Source

[Fowler on distributed objects and microservices](https://martinfowler.com/articles/distributed-objects-microservices.html)
explains why transparent remote objects and fine-grained calls are problematic. The
arithmetic here is an explicit model; the extraction sequence is conditional design guidance.
