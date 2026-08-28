# Designing an event

## Naming

`<Entity><PastTenseVerb>` in the **producer's** vocabulary: `OrderPlaced`, `PaymentCaptured`,
`ShipmentDispatched`.

Three names that are all the same mistake:

- `ShipOrder` — imperative. It is a command; see `references/choosing-the-style.md`.
- `OrderSaved`, `CustomerRowUpdated` — the persistence mechanism, not the fact. A consumer
  cannot tell an address correction from a cancellation, so every consumer reacts to every
  write and then filters. The event type is the cheapest filter you will ever have.
- `OrderReadyForShipping` — the _consumer's_ interpretation. The producer now has to be
  changed when shipping's rules change, which is the coupling events were meant to remove.

## Envelope and payload

Keep identity and routing metadata separate from the domain payload, so a consumer can
deduplicate, order and route without parsing the body:

```java
record EventEnvelope<T>(
        UUID eventId,          // dedup key at the consumer (idempotency)
        String type,           // "OrderPlaced"
        int schemaVersion,
        String subject,        // the entity id — also the partition key
        Instant occurredAt,    // when the fact happened, not when it was published
        String correlationId,  // the flow this belongs to
        T payload) {}
```

`occurredAt` is the fact's time and must come from the producer's domain, not from the broker's
append time — they diverge under backlog, retry and outbox relay, and consumers that use the
publish time compute the wrong business answer with no error.

## Fat versus thin

|                            | **Thin** (id only)                       | **Fat** (event-carried state)                |
| -------------------------- | ---------------------------------------- | -------------------------------------------- |
| Consumer needs             | A call back to the producer per event    | Nothing                                      |
| Producer availability      | Back in the read path for every consumer | Out of the path                              |
| Payload and retention cost | Minimal                                  | Grows with the data, for the whole retention |
| Access control             | The read API can enforce it per consumer | Every topic reader sees every field          |
| Schema surface             | Small                                    | Every carried field is now a contract        |

**The read-back stampede is the reason thin events disappoint.** One publish reaches N
consumers, each of which immediately calls the producer for the details — so a fan-out of N
becomes N synchronous reads landing at the moment the producer has just finished the work that
emitted them. Under a burst, or a backlog replay, it is a self-inflicted load spike against the
service whose availability the events were supposed to stop depending on.

The workable middle: carry the fields that define the fact and the ones most consumers need;
leave large blobs, rarely used detail, and anything with a stricter access policy behind a
fetch. Say which is which in the schema's documentation, because consumers cannot tell.

**Carry the resulting state, not the delta**, wherever the domain allows. An event saying
"balance decreased by 30" is correct only if the consumer has every prior event for that key in
per-key order; one saying "balance is now 120, as of this instant" survives a gap and a
reorder. That single choice removes an ordering requirement, and the alternatives to ordering
are `message-ordering-and-partitioning`.

## The schema is a contract with consumers you cannot enumerate

Two properties an RPC contract does not have:

- **You cannot ask who depends on a field.** Nothing in the producer records it. Publish the
  schema to a registry with a compatibility mode enforced at publish time, and treat a rejected
  publish as the design review it is.
- **Compatibility is needed in both directions at once.** A producer must be deployable without
  touching consumers, so existing readers must tolerate fields they do not know (forward). A
  new or reset consumer reads events written before it existed, so it must read old ones
  (backward). Both must hold across the **retention plus replay horizon** — which for a
  compacted or archived topic is effectively unbounded. The per-format rules and the
  expand/migrate/contract sequence are `rpc-and-api-contracts`; the point here is that events
  need the stricter, both-directions mode by default.

Consequences to apply directly:

- Additive, optional fields only. Never repurpose a field, never narrow a type, never add
  validation to an existing field — that last one reads as harmless and breaks producers whose
  older records are still in the log.
- When a change cannot be additive, publish a **new event type** and dual-publish for the
  migration window. A `schemaVersion` bump that changes meaning is a breaking change wearing a
  number.
- Retire on evidence: a per-type, per-version consumption metric. Without it, the old type is
  published forever.
- A consumer that fails on an unknown property has silently made every producer change
  breaking. The Jackson default and Spring Boot's override are in `rpc-and-api-contracts`.

## Payload contents

- **Belongs in the event:** the entity id, the occurrence time, the fields that define the
  fact, and every value that was true _at that moment_ — the price charged, the tier applied,
  the address used. A consumer fetching them later gets today's values and computes a different
  answer for a past fact. This is the strongest argument for a fatter event.
- **Fetch instead:** large binaries, data owned by another service, and anything whose access
  policy is stricter than "everyone who can read this topic".
- **Never in the event:** mutable derived state a consumer will treat as current, and personal
  data you have not decided how to delete — an event on a long-retention topic keeps whatever
  it carries for that entire period, and an erasure request then applies to the log itself.

With event-carried state transfer, **name the authority and the resync path** in the same
document as the schema: which service owns the current value, and how a consumer that missed a
window rebuilds — a read API, a snapshot event, or a compacted topic. Without it, consumers'
projections diverge and no one can say which is right.

## Proving it

- A CI check that runs the registry's compatibility test for the target mode against the
  schema on the branch. This is the whole safety net; run it before merge, not before release.
- A consumer test that deserialises a **stored fixture of an old event** — a real serialised
  record, checked in — rather than one produced by the current schema. A round-trip test with
  today's classes on both ends proves nothing about the events already in the log.
