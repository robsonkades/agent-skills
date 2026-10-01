# Integrating architecture decisions

Read when individually reasonable proposals conflict, when a process boundary changes
semantics, or when implementation needs verification across several owners. Use only the
questions that affect the requested operation. These are composition checks; consult the
owning specialists for their mechanisms.

## Find the incompatible assumptions

A dependency arrow means one decision consumes another decision's guarantee. Give that
guarantee a scope and verify the consumer actually receives it. A diagram alone does not
show whether an edge carries stale data, delegated authority or an uncertain outcome.

| Proposal combination                                                           | Separating evidence                                                                      | Required resolution                                                                                         |
| ------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Private service data, but a reporting job writes its tables                    | Job credentials, grants and real write path                                              | Name every writer and resolve or bound the exception before calling ownership enforced.                     |
| A cached cross-service view authorizes an irreversible operation               | Allowed staleness/revocation, authoritative check at the effect                          | Separate display from authorization; protect the effect or obtain an explicit change to its contract.       |
| Independent deployments, but old consumers require the previous payload/schema | Consumer contracts, deployed versions, migration sequence                                | Establish compatible coexistence or record the coordinated release dependency.                              |
| Caller can stop waiting, therefore retry is harmless                           | Remote commit point, retry identity and result lookup                                    | Resolve unknown outcome and duplicate effects; timeout alone is no evidence of non-execution.               |
| A local commit guarantees a required downstream effect will be attempted       | Persisted intent or reconstructible work, dispatch path and crash recovery               | Close the commit-to-dispatch gap and identify who recovers stranded work; deduplication alone cannot do so. |
| Gateway authenticates traffic, but jobs or services bypass the edge            | All entry paths, identity provenance and operation authorization                         | Enforce the operation's policy on each permitted path; do not trust a header merely because it is present.  |
| Separate processes, therefore failures are isolated                            | Shared database/connection limits, identity/discovery dependencies and failure injection | State the demonstrated failure boundary and unresolved common failure paths.                                |

For each conflict, link the two decision IDs, the conflicting statements, the owner who
can change each, and a discriminating check. An absent measurement leaves a claim open;
it does not prove that the proposed design failed. Resolve the binding requirement first,
then adjust its dependent choices. Do not add a resilience mechanism to hide an unresolved
business invariant.

## Worked constraint change: invoice issuance

This is an illustrative design walkthrough, not a tested system or benchmark.

**Common evidence.** A Java/Spring application handles orders, stock and invoicing.
Orders and stock commit together in one relational transaction. Invoices are issued after
an order is accepted; the business explicitly permits a visible pending-invoice state.
Repeated delivery of an issuance request must not produce multiple legal invoices. Existing
modules have named owners and pass their acceptance tests. There is no measured requirement
to scale them independently. Versions and infrastructure remain those of the target project.

**Case A: the current deployment satisfies all binding constraints.** Preserve its process
arrangement. A useful first slice might verify the existing module contract from order
acceptance to invoice status, including repeated issuance. New network endpoints, discovery
infrastructure and separate databases provide no established benefit for this case. Record
what new constraint would reopen the process decision; do not invent a performance gain.

**Case B: change only the deployment constraint.** An accepted requirement now mandates
issuing invoices through a separately operated fiscal service. Hand this constraint to
`distribution-boundaries`; do not spend the engagement arguing away the accepted premise.
Keep the existing orders/stock transaction unless evidence requires changing it.

The changed constraint affects several existing decisions:

- Order acceptance can commit before the first issuance attempt is sent. Establish how
  required work survives a crash: reuse durable pending work if it is sufficient, or
  evaluate atomic intent recording (for example, an outbox) or reconstruction from
  authoritative state. Name the recovery owner and acceptable pending age; an in-memory
  callback or duplicate filter alone does not close this gap. Route mechanism selection
  to the transaction/publication specialists.
- The invoicing contract needs an issuance identity, supported result/status lookup and
  its caller's authorization. Verify the provider contract before relying on these features.
- The first remote attempt can commit while its response is lost. Carry that unknown
  outcome into repetition/reconciliation and the pending-invoice representation.
- The legal invoice authority remains identifiable; a local status projection is not a
  second invoice issuer. Retain provenance and any access limits on the representation.
- The application must work with the supported provider versions and have a documented
  recovery path for pending requests. Returning traffic to the prior application version
  cannot undo invoices that have already been issued.

The first slice can issue one invoice for an accepted order, read its status through the
real application path, recover a crash after order commit but before dispatch, then exercise
a lost response after remote commit without a duplicate invoice. Check that rolled-back
orders cannot trigger issuance. That slice needs only the owners whose contracts it crosses.
Use a controlled provider fixture if a test environment is unavailable and state that it
does not validate the provider's actual guarantees. If the provider offers neither a safe
retry contract nor an authoritative reconciliation route, record that blocker and obtain
its contract; do not synthesize a guarantee with local deduplication alone.

If someone also requires order/stock acceptance and remote invoice issuance to be one
immediate atomic effect, that is a **new, conflicting constraint**, not the common case
above. Route the transaction participation/recovery question and expose the conflict to
its authority before accepting a pending-state design. A compensation is another business
operation whose feasibility must be established, not a generic reversal of history.

For the commit-to-dispatch failure window, see the motivation and duplicate-message caveat
in [AWS transactional outbox guidance](https://docs.aws.amazon.com/prescriptive-guidance/latest/cloud-design-patterns/transactional-outbox.html).
The relevant principle is preserving required work across failure; this example does not
require AWS, a message broker or a particular storage mechanism.

## Java/Spring implementation checks

Use the repository's wrapper commands, test infrastructure and supported versions. Inspect
build, profiles and resolved dependencies before selecting an HTTP client, event transport
or transaction API. Record the versions actually exercised; no sample here authorizes a
platform change.

Follow the chosen slice from controller/job/listener through the application operation to
the authoritative write and consumer-visible result. Preserve domain invariants at their
owner, keeping wire representations separate where their evolution or semantics differ.
Carry caller/tenant identity, error behavior and cancellation/deadline requirements through
that path; verify the effective wiring rather than only testing a directly constructed class.

For transaction-sensitive work, inspect the actual transaction manager and invocation path.
Spring's ordinary declarative transactions surround advised operations; the imperative
model commonly uses thread-bound state and the reactive model uses Reactor context.
Neither model makes an arbitrary HTTP call part of the database transaction by annotation.
Verify any explicitly configured resource participation separately. See the official
[declarative transaction implementation documentation](https://docs.spring.io/spring-framework/reference/data-access/transaction/declarative/tx-decl-explained.html)
when this distinction affects the slice; the page consulted on 2026-09-30 identifies Spring
Framework 7.0.9. Recheck the equivalent documentation for the target version. Mechanism
selection and publication atomicity belong to `spring-transactions-and-events` and
`distributed-transactions-and-sagas`.

Verify the claim at the boundary where it can fail. A Spring context test can establish
that configured collaborators load; it does not establish remote behavior. Contract tests
can establish exercised payload/semantic compatibility; they do not establish production
latency or independent deployment. Select a failure fixture or mixed-version integration
check only when the corresponding guarantee is required. Reuse existing suitable tests,
report exact commands and observations, and distinguish unexecuted operational checks.
