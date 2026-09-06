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
        String eventId,        // globally unique occurrence identity
        URI source,            // publisher/domain identity
        String type,           // stable semantic type, e.g. "OrderPlaced"
        URI dataSchema,
        String subject,        // domain subject; not automatically the broker key
        String partitionKey,   // explicit ordering/placement scope
        Instant occurredAt,    // domain occurrence time when known
        String causationId,
        String correlationId,
        String traceparent,
        T payload) {}
```

This is a domain-oriented example, not a replacement for a standard envelope. CloudEvents
defines interoperable core attributes such as `id`, `source`, `specversion`, `type`, optional
`subject`, `time` and `dataschema`; broker partition key and trace propagation remain binding-
specific. Define nullability, size and trust for every extension. CloudEvents occurrence
uniqueness is the pair `source` + `id`; the example's globally unique eventId is a stronger
application choice. State the deduplication key explicitly. A Java record is only shallowly
immutable: T must be an immutable snapshot or serialized/copy-owned before asynchronous use.

`occurredAt` should represent domain occurrence time when the domain can know it. Preserve
separate observed/published/broker-append times: they diverge under backlog, retry and outbox
relay, and each answers a different question. Cross-host clocks need an uncertainty policy.

## Fat versus thin

|                            | **Thin** (id only)                                    | **Fat** (event-carried state)                  |
| -------------------------- | ----------------------------------------------------- | ---------------------------------------------- |
| Consumer needs             | May call/fetch if the notification lacks needed state | Usually no synchronous read for included state |
| Producer availability      | Back in the read path for every consumer              | Out of the path                                |
| Payload and retention cost | Minimal                                               | Grows with the data, for the whole retention   |
| Access control             | The read API can enforce it per consumer              | Every topic reader sees every field            |
| Schema surface             | Small                                                 | Every carried field is now a contract          |

**Read-back stampede is a failure mode of notification-only events.** If one publish reaches N
consumers and each immediately calls the producer for details, fan-out of N
becomes N synchronous reads landing at the moment the producer has just finished the work that
emitted them. Under a burst, or a backlog replay, it is a self-inflicted load spike against the
service whose availability the events were supposed to stop depending on.

The workable middle: carry the fields that define the fact and the ones most consumers need;
leave large blobs, rarely used detail, and anything with a stricter access policy behind a
fetch. Say which is which in the schema's documentation, because consumers cannot tell.

Choose delta versus resulting state from semantics. A delta preserves the business operation
and may compose/commute, but often requires complete ordered history and duplicate handling. A
state snapshot enables repair but must carry an authoritative version; otherwise an older
snapshot arriving late overwrites newer state. Some contracts carry both operation and resulting
versioned state. See `message-ordering-and-partitioning`.

## The schema is a contract with consumers you cannot enumerate

Two properties that become especially important with retained asynchronous messages:

- **Consumer discovery is imperfect, not impossible.** Maintain owners, schema registrations,
  usage telemetry and deprecation acknowledgements, while assuming unknown/offline consumers
  may exist. A registry validates structural rules, not semantic dependence.
- **Choose compatibility directions from actual overlap.** Existing readers receiving new
  writes need forward compatibility; new/reset readers replaying old writes need backward
  compatibility. Their windows differ: deployed reader support versus oldest replayable
  data, including archive and DLQ recovery. Choose the covered schema versions explicitly;
  a latest-version check does not establish compatibility with all retained history.
  Full/transitive compatibility, upcasters or a migration cutoff are alternative policies.
  The per-format rules belong to
  `schema-evolution-and-compatibility`.

Consequences to apply directly:

- Prefer additive compatible evolution, but exact legal changes are serialization-format and
  compatibility-mode specific. Defaults, nullability, enum handling, field-number reuse and
  validation changes all need old/new producer-consumer fixture tests.
- For a breaking change, choose a new type/topic, versioned transformation or explicit cutoff.
  If dual-publishing, keep logical occurrence identity/correlation and prevent subscribers to
  both forms from applying the business effect twice. A version number alone does not make
  changed meaning compatible.
- Retire using owner acknowledgements, consumption evidence and the archive/DLQ/replay policy;
  zero recent traffic does not prove that an offline consumer or recovery path is retired.
- A consumer that fails on an unknown property has silently made every producer change
  breaking. The Jackson default and Spring Boot's override are in `rpc-and-api-contracts`.

## Payload contents

- **Belongs in the event:** the entity id, the occurrence time, the fields that define the
  fact, and the authorized historical values needed to interpret it — the price charged, the tier applied,
  the address used. A consumer fetching them later gets today's values and computes a different
  answer for a past fact. This is the strongest argument for a fatter event.
- **Fetch instead:** large binaries, data owned by another service, and anything whose access
  policy is stricter than "everyone who can read this topic".
- **Do not publish without policy:** mutable derived state consumers may misread as current,
  secrets, or personal/regulatory data lacking purpose, access, retention and erasure design.
  Encryption does not solve broad reader authorization; immutable logs, replicas, DLQs and
  backups all extend deletion scope.

With event-carried state transfer, **name the authority and the resync path** in the same
document as the schema: which service owns the current value, and how a consumer that missed a
window rebuilds — a read API, a snapshot event, or a compacted topic. Without it, consumers'
projections diverge and no one can say which is right.

## Proving it

- A CI check that runs the registry's compatibility test for the target mode against the
  schema on the branch and the required historical versions. This checks structural evolution;
  semantic consumer fixtures remain necessary. Run it before merge, not before release.
- A consumer test that deserialises a **stored fixture of an old event** — a real serialised
  record, checked in — rather than one produced by the current schema. A round-trip test with
  today's classes on both ends proves nothing about the events already in the log.
- Contract tests for new-producer→old-consumer, old-producer→new-consumer and replayed archive
  combinations that actually occur; include unknown enums, omitted/default fields, maximum
  payload, duplicate/out-of-order versioned state and authorization redaction.

## Sources

- [CloudEvents 1.0.2](https://github.com/cloudevents/spec/blob/v1.0.2/cloudevents/spec.md): occurrence identity and envelope attributes.
- [Confluent schema evolution](https://docs.confluent.io/platform/current/schema-registry/fundamentals/schema-evolution.html): reader/writer direction and transitive versus latest-version checks.
