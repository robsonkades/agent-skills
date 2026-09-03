# Classifying the failure, and where the message goes

## The three classes

Classification is a hypothesis supported by operation, input, environment and downstream
evidence. It can change after deployment/configuration repair or status lookup; persist the
reason and classifier version rather than deciding forever from one exception class.

| Class                     | Identifying signal                                                                                                                               | Destination                                                                                                      |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------- |
| **Payload-intrinsic**     | Authenticated schema says invalid encoding/value and the same supported build/schema reproduces it; immutable business intent can never be legal | Secure quarantine, often after one diagnostic attempt; repair/producer feedback owns it                          |
| **Transient/overload**    | Explicit retryable response, dependency unavailability, quota/lock contention with no effect, bounded resource pressure                          | Backoff/delay/pause within deadline and retry budget; exhaustion escalates or parks—it does not change the cause |
| **Ambiguous**             | Timeout/reset/cancellation after possible dispatch; downstream may have applied the effect                                                       | Preserve operation ID; status lookup/reconcile or retry only against downstream idempotency                      |
| **Poison-by-environment** | The same record fails on one consumer version and succeeds on another — a bad deploy, a missing schema, a wrong config                           | Neither. Stop the consumer and fix the environment                                                               |

Two consequences worth stating plainly:

- Attempt count and elapsed/deadline budgets protect capacity for transient and ambiguous
  work; they do not identify the cause. Exhausted transient work may remain in a durable retry
  queue or trigger incident recovery rather than contaminate a poison quarantine.
- **The fourth row is why an attempt count is not a classifier.** A deploy that breaks
  deserialisation makes every record look permanently poison, individually indistinguishable
  from genuine poison, and the DLQ fills with valid data. The signal is the _rate_: one poison
  record in a million is data; every record failing at once is the consumer.

## Where a failed message goes

```text
Dead-letter immediately when:
- evidence proves the payload itself violates a supported immutable contract, not merely that
  this consumer build/environment cannot parse it
- the record's business intent is already invalid and no retry can change that
- the quarantine has an automated or human remediation/disposition workflow at expected volume

Retry in place (no topic hop) when:
- the failure is transient and expected to clear within the poll budget
  (max.poll.interval.ms for a Kafka consumer, the visibility timeout for a queue)
- per-key ordering must hold, because a topic hop reorders the record relative to its key

Use a retry topic or delay queue when:
- the failure is transient and the expected recovery time exceeds the poll budget
- ordering for this key is not required, or the key has at most one in-flight record
- you want the main partition to keep advancing for the other keys on it
- the delayed transfer and source acknowledgement are atomic or repeat-safe

Block the partition (stop committing, keep retrying) when:
- per-key ordering is a correctness requirement downstream — a state machine, a CDC
  stream, an event-sourced projection — and a gap would corrupt the projection
- the outage is expected to be short relative to the partition's latency budget
- you have an alert on consumer lag, because this design's failure mode is silence

Stop the consumer entirely when:
- the failure rate is near 100%, which means the consumer or its environment is the fault
- the DLQ is on the same infrastructure as the failing dependency, so dead-lettering
  would fail too and the record would be dropped
```

## The head-of-line decision, worked through

A partitioned log delivers per-partition ordering and advances one offset at a time. There is
no "skip this one" that preserves that: committing past a record is what a skip _is_, and the
record's position in its key's sequence is then permanently empty.

```
partition 3:  … [k=A:47] [k=A:48 ← fails] [k=B:12] [k=A:49] [k=C:5] …
                            ▲
                      the decision point
```

**Option 1 — block.** Do not commit. Keep retrying 48. `k=B:12`, `k=A:49` and `k=C:5` are not
processed either, because there is one offset for the partition, not one per key.

- What is preserved: per-partition ordering, and therefore per-key ordering, exactly.
- What is paid: every key on that partition stops. Consumer lag on partition 3 grows without
  bound; the other partitions look healthy, so an aggregate lag dashboard hides it. With a
  typical hashing of keys to partitions, one bad record stalls roughly `1/partitions` of the
  keyspace.
- Required: an alert on **per-partition** lag or per-partition oldest-record age, not fleet
  lag. Without it this option fails silently for hours.

**Option 2 — atomically quarantine and commit past.** Durably transfer 48, then commit the next
source offset (49 in Kafka's next-offset convention), continue.

- What is preserved: progress for every other key on the partition, and the record itself, in
  the DLQ, with its context.
- What is paid: `k=A` now has a gap. `A:49` is applied to a state that never saw `A:48`. If A's
  events are a state machine or a set of deltas, the projection is now wrong and will stay
  wrong; if they are full-state snapshots (last-writer-wins on the whole entity), the gap is
  harmless only when an authority version guard proves 49 supersedes 48 and no intermediate
  effect/audit transition is required.
- Required: knowing which of those two your payloads are. That is the whole decision, and it
  is answerable from the event schema, not from operational preference.

**Option 3 — block the key, not the partition.** Divert every subsequent record for `k=A` to
the same retry path while letting other keys through. This preserves per-key ordering _and_
partition progress, at the cost of real machinery: a per-key "parked" set, a check on every
record, and the parked set itself becoming state that must be bounded and drained. Worth it
where the gap in option 2 is unacceptable and the block in option 1 is too expensive — and
only then, because the parked set is a new place to lose messages.

**Option 4 — resynchronize from authority.** Quarantine the bad delta, fetch an authoritative
snapshot/version, atomically replace the projection, and continue from a known watermark. This
preserves progress but intentionally gives up observing every intermediate transition; it is
valid only when the projection contract allows that.

## What this decision is not

- It is not a retry policy. How long and how often to retry the transient class is
  `retries-and-backoff`; this reference only decides which class the failure is in and where
  the message goes when retrying stops.
- It is not an ordering design. Whether per-key ordering is required at all, and how the key
  maps to a partition, is `message-ordering-and-partitioning`. What is settled here is only
  that dead-lettering out of an ordered log costs an ordering gap, and that the cost has to be
  named before the code is written.

## Classification tests

- replay the same bytes against old/current/next consumer builds and schema registry state;
- test representative HTTP/domain results, especially 408/409/412/425/429, authentication
  refresh, validation and business terminal rejection;
- inject downstream apply-then-drop-response and prove it is `AMBIGUOUS`, not transient;
- trigger one corrupt record versus a fleet-wide deserializer/config failure and verify the
  circuit pauses before mass quarantine;
- version the classifier rules in the envelope so reclassification/redrive is auditable.
