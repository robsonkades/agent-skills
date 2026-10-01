---
name: cross-service-query-design
description: >-
  Choose API composition or a read model when a query joins data owned by multiple
  services, a list needs cross-service filtering or ordering, or projection lag changes
  what a consumer may conclude. Define freshness, completeness, authorization, query
  bounds and rebuild. Excludes fan-out mechanics, event-store adoption and CDC operations.
---

# Cross-Service Query Design

Choose a read path that can answer the consumer's actual question under change and failure.
A joined response is a new contract: successful calls to every owner do not establish a
common snapshot, an exact global page, or permission to return every field.

This skill owns the choice and contract of the cross-service query. Keep an adequate
existing API, local query or reporting solution when it satisfies that contract. It does
not require extracting services or replacing mutable state with an event store.

## Discover the question before choosing the mechanism

Inspect the endpoint and its consumers, domain rules, API/event contracts, ADRs, query plans,
traces, access policies, incidents and recovery runbooks. Capture only evidence that changes
the choice:

- **Purpose and authority:** display, search, reconciliation, export or a decision authorizing
  an effect? Who owns each fact and who may change it? Can a missing/stale fact change eligibility?
- **Query semantics:** predicates, join keys and cardinality, null/absence meaning, duplicates,
  sort/ties, totals, pagination and expected data growth. Which owner can identify candidates
  before enrichment? A sample response does not establish the complete query contract.
- **Visibility:** required freshness per fact, read-your-writes, coherent snapshot or permitted
  mixed versions, completeness, and the response when a source is late or unavailable.
- **Access:** caller/tenant, row and field permissions, revocation/deletion visibility, caches,
  background consumers and exports. Authentication of a service is not end-user authorization.
- **Cost and recovery:** request/byte/concurrency budgets, measured joint dependency latency,
  update volume, source replay/backfill support, retention and acceptable rebuild/outage time.
- **Target stack:** JDK/toolchain, resolved Spring/driver versions, transaction managers, actual
  datasource routing, client deadlines and deployment constraints. Inspect build and runtime
  evidence; do not infer deployed behavior from annotations or a starter dependency.

Separate found requirements from conventions and hypotheses. If the allowed delay or partial
answer policy is absent, inspect consumers first; ask only when the missing policy changes the
decision. Continue a query inventory or bounded experiment while the decision stays conditional.
Never turn an unknown freshness guarantee into an assumed number.

The architectural guidance is framework-independent. The partial Java/Spring example uses
**Java 25 without preview and Spring Framework 7.0.9** as an authoring baseline; it is not a
tested application or permission to upgrade the target. Spring Data Commons **4.1.1** and
PostgreSQL **17** sources support conditional pagination guidance. Match target versions before
adapting APIs or configuration.

## Establish what an answer proves

1. **Separate a display from a command precondition.** A dashboard can show stock observed
   earlier. An order command must enforce its stock invariant through the authoritative owner,
   for example an atomic reservation under that owner's rules. Even a freshly composed read
   followed by a write has a race. Revalidate at the effect boundary or use a proven protocol
   covering all affected invariants; moving the query to the primary alone does not close it.
2. **Define freshness and completeness independently.** All required sources may answer with
   old state; recent returned rows may omit an unavailable owner. Distinguish not found,
   not visible under policy, unavailable, pending projection and known deleted. Do not leak
   existence when the public authorization contract intentionally merges some of these cases.
3. **Name the coherence requirement.** Independent owner reads or projection checkpoints are
   not a distributed snapshot. If a parent and its dependent record must appear together,
   specify the required causal/version relationship and how the query enforces it. A
   timestamp on each row or the newest event timestamp is not that proof.
4. **Make degraded behavior consumable.** Return an explicitly contracted partial/stale result,
   delay within budget, or fail. An absent payment answer must not become zero debt. An
   all-required query cannot silently switch to partial success to satisfy a latency target.
   Expose authorized status/coverage information without publishing private service topology.
5. **Keep permissions valid on every path.** Apply tenant/row/field policy to primary reads,
   projections, caches, fallback paths and pagination. A projection of mutable permissions needs
   its own accepted revocation bound; zero-delay revocation cannot rest on an asynchronous copy
   without another enforcing mechanism. Keep effect authorization at its authoritative owner.

For cross-service predicates, exact totals or cursor semantics, read
[query semantics and Java/Spring boundaries](references/query-contracts.md).

## Choose the least complex sufficient read path

| Evidence                                                                                                           | Candidate and condition                                                                                                                                                  | Reject or reconsider when                                                                                                  |
| ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| One owner can answer the query, or existing local/reporting data satisfies it                                      | Keep that query and its supported access contract; optimize only a demonstrated bottleneck.                                                                              | It needs unsupported access to another owner's private schema or lacks the required visibility/security contract.          |
| Small bounded candidate set, owner APIs support batch enrichment, request-time observations fit the latency budget | Compose APIs. Identify the candidate owner and the semantic join, then bound total work.                                                                                 | Exact cross-owner filtering/order demands unbounded scans, or required owners cannot meet the joint deadline.              |
| Repeated cross-owner joins, global filters/sorts or high query load; delayed visibility is acceptable              | Build a purpose-specific read model if supported feeds/backfills, ownership and recovery cost are viable.                                                                | Source history/state cannot rebuild it, the lag contract cannot be enforced, or the required operating capacity is absent. |
| Most data can be projected but one fact needs stronger freshness                                                   | Consider a projection plus authoritative enrichment only if the fact cannot invalidate candidate membership/order, or a bounded complete query plan handles that change. | Revalidation removes rows after paging while the response still promises exact pages/totals.                               |
| Large export/reconciliation needs a defined cutoff and cannot fit an interactive request                           | Use a bounded asynchronous report with explicit snapshot/coverage and access semantics.                                                                                  | It silently changes the requested business cutoff, omits failed ranges or stores an unbounded sensitive export.            |

CQRS separates command and query models; it does not require separate services, separate
databases or event sourcing. A projection can be maintained from ordinary state plus supported
change contracts. A local read model updated in the same transaction differs from an
asynchronous cross-service projection. Use the smallest separation that resolves the query;
do not announce system-wide CQRS merely because one reporting view is useful.
[Fowler's CQRS discussion](https://martinfowler.com/bliki/CQRS.html) explains the distinction
and complexity trade-off.

For composition, record candidate/leaf limits, maximum bytes, batch sizes, end-to-end deadline,
admission and behavior after timeout. Measure the root request with realistic concurrency and
data skew. Parallel calls, virtual threads and a GraphQL resolver do not remove query work or
the need for bounds. Use existing batch APIs when their semantics fit; do not convert one list
request into an unnoticed call per row.

For a read model, read [projection lifecycle](references/projection-lifecycle.md) before
approving the design. Name its owner, authoritative inputs, query/index shape, progress
evidence, deletion handling, rebuild source and cutover criterion. Eventual consistency alone
supplies neither a delay deadline nor a repair mechanism.

## Execute the requested scope

- **Decision/design:** deliver the query contract, alternatives including retention of the
  current path, chosen path with evidence, resource/visibility budgets and a discriminating
  validation plan. Include projection recovery only when a projection is chosen.
- **Review/diagnosis:** report the failing contract and its consequence, observed evidence,
  proposed correction and remaining uncertainty. Do not infer a capacity fix from one trace.
- **Implementation:** change the query boundary and actual consumers together when authorized.
  Add only justified DTOs, adapters, indexes or feeds; preserve domain ownership and existing
  framework conventions. Wire authentication/authorization, configuration, error/degraded
  responses, metrics and recovery for the chosen path. Do not leave the new contract as an
  unused interface or move business-command rules into the query assembler.

Use an immutable query representation or explicit result state where it prevents accidental
mutation or ambiguity. Do not expose ORM entities, provider errors or raw cursor payloads as
the public contract. Avoid a universal query engine when a specific bounded use case suffices.

## Validate the contract

Select checks for the changed claim, reusing adequate evidence. A design may end with a
reproducible test plan; implementation should execute the available relevant checks.

- Compare joined results against a controlled authoritative fixture: empty, one-to-many,
  duplicate, deleted and missing inputs. Exercise filters/order across page boundaries.
- Reach a scan cap with no eligible rows and overflow a response with batch matches. Verify
  consumer continuation preserves the remaining matches without declaring premature exhaustion.
- Change a sort/filter field between pages; verify the promised snapshot or live traversal
  semantics, cursor expiry and behavior after a projection generation changes.
- Delay/fail one required source and one optional enrichment. Verify that missing data is not
  converted to a favorable business value, and work remains bounded after caller timeout.
- Replay duplicates and reordered updates; interrupt projection processing at its commit
  boundary. Verify visible state, durable progress and recovery rather than process health.
- Use hostile tenant IDs, copied cursors, revoked permissions and a stale cache/projection.
  Check rows, fields, totals and metadata for leaks, including fallback and export paths.
- For an effect-authorizing consumer, race two commands after the same observed state. The
  owner's invariant must hold even if both clients saw an acceptable read.

Measure freshness from a known source change to its **query-visible** result and track missing
coverage separately. Check stalls on quiet feeds; last-event age is not itself source lag.
Keep metrics bounded in cardinality. Measure rebuild/catch-up with representative volume before
promising a recovery time; a configuration setting proves no production guarantee.

Report commands/results, versions, fixture coverage and limitations. Distinguish structural
checks, executed code/contract tests, executed agent evaluations and written walkthroughs.
Do not claim improved latency or agent decisions without a suitable measurement/comparison.

## Handoffs

Use optional specialists when their mechanisms become necessary; pass the query contract,
observed versions, failing evidence and requested result.

- Use `service-data-ownership` when a feed, export, SQL read or other data access lacks an
  authorized contract or a defined owner. Resolve authority and supported interfaces there,
  then use the approved contracts to choose the query path here.
- `scatter-gather` owns fan-out completion, deadlines and cancellation mechanics.
- `consistency-models` owns the formal visibility/session model; `distributed-transactions-and-sagas`
  owns protocols for effects spanning authorities, with `idempotency` for repeat-safe processing.
- `event-sourcing` owns adoption and authoritative event history; `change-data-capture-operations`
  owns capture/snapshot continuity. Neither is implied by choosing a read model.
- `spring-http-clients`, `spring-transactions-and-events` and `spring-boot-jpa` own concrete
  Spring wiring; `spring-security-for-apis` owns framework enforcement.
- `sql-query-performance` owns local plans/index analysis; `distributed-systems-testing` owns
  broader fault experiments. This skill retains the cross-service answer's acceptance criteria.
