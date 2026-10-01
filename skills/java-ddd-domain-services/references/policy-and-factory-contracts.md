# Policy and factory contracts

Read the relevant section when a rule consumes external facts, spans aggregates,
is expressed as a specification, or constructs/reconstitutes an object. The
signatures and flows below are design sketches using project domain types, not
standalone Java programs. Amounts and durations are illustrative requirements to
confirm with domain experts, not reusable defaults.

## External facts: deciding is different from acquiring evidence

Suppose an order needs a credit assessment. In this bounded context, the aggregate
owns its allowed status changes; a credit policy interprets a customer credit
snapshot. A use case obtains that snapshot through `CustomerCreditGateway`, calls
the policy and coordinates the authoritative reservation before submission.

```text
domain.order.Order
  submit(CreditReservation reservation)

domain.order.CreditEligibility
  assess(OrderCreditRequest request, CreditSnapshot snapshot, Instant decisionAt)
    -> CreditAssessment

domain.order.CustomerCreditGateway
  obtainSnapshot(CustomerID customerID)
  reserve(CreditReservationRequest request)

application.order.submit.DefaultSubmitOrderUseCase
  execute(SubmitOrderCommand command)

infrastructure.order.credit.CustomerCreditHttpGateway
  translates external credit contracts into this context's facts and outcomes
```

The gateway is a capability contract, not a second domain service containing HTTP
behavior. Its actual operation granularity follows the provider's guarantees;
these names do not manufacture a reservation API that the provider lacks.

Bind a reservation to the customer/tenant, order or operation, amount/currency
and applicable lifetime. The trusted gateway/application boundary establishes
its provenance and external validity; the aggregate checks locally available
binding and transition conditions. The authoritative provider must enforce
consumption and reuse semantics. A token alone must not authorize an unrelated
order, an insufficient amount or a second consumption. Cover those rejections
and expiry in the reservation contract tests.

Make the evidence contract carry what the decision actually depends on:

| Fact                                | Required interpretation                                                                                           |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Customer and tenant identity        | Facts must belong to the requested subject and trusted scope                                                      |
| Amount and currency                 | Compare compatible amounts; conversion needs an explicit rate, direction, effective time and rounding rule        |
| Observation time                    | When the authoritative source observed the fact, which may precede local retrieval                                |
| Effective interval                  | When the fact or terms apply; define inclusive/exclusive endpoints                                                |
| Source version or reservation token | Detect changed facts or bind an authoritative commitment; a version field alone provides no concurrency guarantee |
| Decision time                       | Supply it explicitly; distinguish business effective time from server receipt time                                |
| Terms version                       | Identify the policy used if replay, explanation or historical calculation matters                                 |

For example, if the agreed policy allows observations at most five minutes old,
test just before, exactly at and just after that age. A retrieved-at timestamp
cannot prove that the source observation is recent. A future observation may
mean clock skew or malformed evidence; encode the agreed tolerance instead of
silently accepting it. Missing source timestamps are unknown freshness.

Choose an explicit response to unusable evidence: refresh, defer/manual review,
or reject when the business authorizes that meaning. Do not convert timeout into
"customer ineligible," use stale facts as an undocumented fallback, or equate
"no matching result" with a measured zero balance. Application code handles
retrieval failures and retries; the pure policy distinguishes valid facts from
facts insufficient for its decision.

The policy can return `Eligible`, `Ineligible(reason)` or `NeedsEvidence(reason)`
using the project's supported result representation. An eligible snapshot is an
assessment at a time, not an irrevocable authorization. Record sufficient facts
and policy identity when explanations must survive changes to terms.

If an assessment is stored or passed to a later transition, define what it
applies to: subject, relevant order values or revision, terms and validity
interval. Editing an order from 80 to 120 after assessing 80 invalidates that
assessment. Recompute against the changed inputs or reject its use; preserve
the storage conflict check so another writer cannot race the transition. A
revision is useful only when relevant writes actually change and check it.
Conversely, when the business promises a fixed offer until expiry, model that
commitment and its acceptance conditions: a later tariff change alone need not
invalidate the offer. Decide which contract exists before adding a reusable
boolean approval or silently repricing an accepted offer.

## Several aggregates: a domain service is not a transaction mechanism

Two orders can each observe available credit of 100 and independently request 80. Both policy evaluations may be correct for the supplied snapshot while the
combined submissions violate the limit. Putting both checks in
`CreditEligibility` does not serialize them. A fresh read immediately before the
write still leaves a race unless the authoritative operation closes it.

Distinguish these contracts before implementation:

- **Local invariant:** one aggregate owns a balance and atomically accepts a
  reservation under a checked version or another verified storage mechanism.
  The use case handles persistence conflicts and retries according to policy.
- **Shared-store rule:** multiple aggregates participate in an explicit local
  transaction whose constraints/isolation actually protect the rule. Merely
  adding a transaction annotation or optimistic versions to different rows can
  still permit write skew. Revisit the model boundary if coordination dominates.
- **External commitment:** the owning system provides a reservation/authorization
  with expiry and idempotency. Define confirmation, expiration, cancellation and
  recovery when order persistence fails after a reservation succeeds. Identify
  when the hold becomes a durable commitment; local submission before expiry
  does not prove a later confirmation will succeed.
- **Eventually reconciled rule:** temporary inconsistency is accepted by the
  business, with a named corrective process. State what can be visible until
  correction and who owns it.

An invariant must identify its enforcement point; an advisory recommendation
must identify its validity and limits. Do not promise cross-system atomicity
because a service invokes two gateways or because a unit test uses a single
thread. Never mutate two aggregates and claim that in-memory success commits
both durably.

A timeout from `reserve` can mean the provider committed the hold but the reply
was lost. Model that outcome as unknown, not as a business rejection or proof
that nothing happened. Application recovery must resolve the same operation
through the provider's status lookup or supported idempotent retry, with the
same identity and request meaning within its retention contract. Changing the
amount is a new intent, not an identical retry. Without those capabilities,
define reconciliation/manual handling instead of inventing exactly-once behavior.
Test a lost successful reply and expiry during confirmation as well as an
ordinary decline. The [AWS Builders Library's idempotent API analysis](https://aws.amazon.com/builders-library/making-retries-safe-with-idempotent-APIs/)
supports the retry distinction; inspect the actual provider's guarantees.

## Domain specification versus a database predicate

Use a specification for a business criterion whose independent name/composition
helps callers. A direct method such as `Subscription.canRenewOn(date)` is enough
when the rule naturally belongs to that object and has no independent lifecycle.
`Predicate<T>` is a Java representation option, not a requirement to create a
universal specification framework.

An in-memory `EligibleForRenewal` evaluates complete facts and yields a decision.
A JPA `Specification` constructs a provider query; keep that adapter concern in
infrastructure. A shared business meaning does not imply that a Java lambda can
be translated to SQL or that ORM criteria types belong in the domain.

Before offering two implementations of the same criterion, define equivalence:

- SQL NULL/unknown versus Java's explicit absent value; `NOT` particularly exposes
  the difference. Decide the intended business result for missing facts.
- Inclusive date endpoints, zone and daylight-saving interpretation, source
  precision and one agreed effective instant per evaluation.
- Text normalization, collation, numeric scale and currency conversion semantics.
- Collection quantifiers: "one item satisfies A and B" differs from "an item
  satisfies A and an item satisfies B." Joins may duplicate roots.
- Availability of facts: a partial projection or unloaded association cannot
  silently count as the full aggregate. A getter causing a lazy load defeats a
  supposedly pure predicate.
- Tenant/access restrictions: bind trusted scope outside user-controlled
  disjunctions and apply it to count/existence as well as content results.

Test matching and nonmatching boundary fixtures against each implementation. When
database filtering is deliberately only a candidate prefilter, document that it
must include every eligible candidate and that final domain evaluation still
occurs. Account for paging/counts over filtered candidates; applying a predicate
after pagination does not produce correct eligible-result pagination by itself.

Specification composition should preserve meaning and evaluation cost. A boolean
predicate is insufficient when callers need multiple business rejection reasons;
return an assessment or use the project's validation handler deliberately.
Do not run remote calls behind combinators whose short-circuit ordering changes
which effects occur.

## Factories: new lifecycle versus restoring an existing one

Creation deserves a separate factory when it encapsulates complex valid assembly
or independent creation policy. A constructor or named static factory is adequate
for simple construction. Avoid an `OrderFactory` whose only value is forwarding
arguments to `Order.create`.

| Contract | New creation                                                 | Reconstitution                                                               |
| -------- | ------------------------------------------------------------ | ---------------------------------------------------------------------------- |
| Identity | Accept or obtain the project's new domain identity           | Preserve the stored domain identity and version                              |
| Time     | Use explicitly supplied creation/effective time              | Preserve original times; do not call now                                     |
| Policy   | Apply rules and terms governing this creation                | Interpret stored state under its recorded schema/terms                       |
| Events   | Record the newly performed business occurrence when required | Restore without announcing another creation event                            |
| State    | Produce the whole valid initial aggregate                    | Restore the persisted lifecycle state without resetting it                   |
| Failure  | Explain a rejected creation request                          | Surface corrupt/incompatible persisted state through the repository contract |

Follow existing `newCategory(...)`, `create(...)`, `of(...)` and `with(...)` naming
only after reading their meaning. In this family `with(...)` may reconstitute stored state, so it
must not become a general setter-shaped bypass for request handlers. Where the
project uses `reconstitute(...)`, preserve that clearer contract.

Reconstitution does not mean accepting arbitrary corruption. Validate structural
and always-applicable invariants, preserve historical state valid under earlier
terms, and surface incompatible schema or impossible combinations explicitly.
Re-running today's creation eligibility can make legitimate older aggregates
unloadable. Migration and reconciliation need deliberate owners and checks.

Place persistence mapping in infrastructure; pass restored domain values through
an explicit domain construction contract. A factory must not start a transaction,
save itself, fetch network facts covertly or publish to a broker. A use case can
gather facts first, then call a factory that builds the aggregate and records its
domain events.

Verify changed creation/reconstitution separately: accepted and rejected new
requests, identity/version preservation, historical terms, corrupt stored state,
and no duplicate creation events on loading. An object equality assertion alone
does not verify lifecycle effects.
