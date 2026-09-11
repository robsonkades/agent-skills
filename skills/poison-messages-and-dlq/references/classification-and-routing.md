# Classifying the failure, and where the message goes

## The failure classes

Classification is a hypothesis supported by operation, input, environment and downstream
evidence. It can change after deployment/configuration repair or status lookup; persist the
reason and classifier version rather than deciding forever from one exception class.

| Class                     | Identifying signal                                                                                                                               | Destination                                                                                                      |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------- |
| **Payload-intrinsic**     | Authenticated schema says invalid encoding/value and the same supported build/schema reproduces it; immutable business intent can never be legal | Secure quarantine, often after one diagnostic attempt; repair/producer feedback owns it                          |
| **Transient/overload**    | Explicit retryable response, dependency unavailability, quota/lock contention with no effect, bounded resource pressure                          | Backoff/delay/pause within deadline and retry budget; exhaustion escalates or parks—it does not change the cause |
| **Ambiguous**             | Timeout/reset/cancellation after possible dispatch; downstream may have applied the effect                                                       | Preserve operation ID; status lookup/reconcile or retry only against downstream idempotency                      |
| **Poison-by-environment** | Failure tracks build/schema/configuration or key availability; compare the same input in supported environments before attributing cause         | Contain the affected admission/dispatch scope; investigate and repair its environment                            |

Two consequences worth stating plainly:

- Attempt count and elapsed/deadline budgets protect capacity for transient and ambiguous
  work; they do not identify the cause. Exhausted transient work may remain in a durable retry
  queue or trigger incident recovery. A native DLQ can serve as that durable recovery queue
  when its cause/disposition metadata, ownership, retention and replay contract support it;
  being stored there does not make the record permanently poison.
- **The fourth row is why an attempt count is not a classifier.** A deploy that breaks
  deserialisation makes every record look permanently poison, individually indistinguishable
  from genuine poison, and the DLQ fills with valid data. The signal is the _rate_: one poison
  record in a million suggests local data; fleet-wide failures demand investigation of
  consumers, producers, schema/configuration and dependencies, not an automatic diagnosis.

## Where a failed message goes

```text
Dead-letter immediately when:
- evidence proves the payload itself violates a supported immutable contract, not merely that
  this consumer build/environment cannot parse it
- the record's business intent is already invalid and no retry can change that
- the quarantine has an automated or human remediation/disposition workflow at expected volume

Retry in place (no topic hop) when:
- the failure is transient and recovery fits the latency/retry budget
- broker ownership is maintained: Kafka can pause dispatch while continuing poll;
  queue visibility/ack leases need their own renewal and duplicate-handling policy
- rebuild gates after reassignment; Kafka pause state is not retained through rebalance
- per-key ordering must hold, because a topic hop reorders the record relative to its key

Use a retry topic or delay queue when:
- the failure is transient and durable delayed recovery fits the business deadline
- ordering is not required, or a durable gate parks every later record for this key
- you want the main partition to keep advancing for the other keys on it
- the delayed transfer and source acknowledgement are atomic or repeat-safe

Block the partition (gate dispatch and prevent commits past unresolved work) when:
- per-key ordering is a correctness requirement downstream — a state machine, a CDC
  stream, an event-sourced projection — and a gap would corrupt the projection
- the outage is expected to be short relative to the partition's latency budget
- you have an alert on consumer lag, because this design's failure mode is silence
- retries are bounded; permanent defects wait for remediation rather than busy-loop

Pause the affected admission/dispatch scope when:
- systemic failure evidence requires containment and investigation before mass quarantine
- neither the quarantine path nor a proven fallback can make disposition durable;
  retain source ownership/recoverability rather than ack
- stop the whole consumer only when that is the affected scope or narrower isolation cannot
  preserve ownership, ordering and durable progress; otherwise healthy independent work may continue
```

## The head-of-line decision, worked through

A partitioned log has one committed position per group/partition, which may advance over a
batch. Commit only a completed or durably transferred prefix of delivered records; numeric
offset gaps are possible. Skipping leaves a missing business transition even if the remaining
effects stay relatively ordered. The numbers below are business sequence numbers, not offsets.

```
partition 3:  … [k=A:47] [k=A:48 ← fails] [k=B:12] [k=A:49] [k=C:5] …
                            ▲
                      the decision point
```

**Option 1 — block.** Gate later dispatch, account for already in-flight work, and do not
commit past unresolved 48. In this serial policy `k=B:12`, `k=A:49` and `k=C:5` also wait;
this is a policy choice, not proof that other keys can never be processed independently.

- What is preserved: per-partition ordering, and therefore per-key ordering, exactly.
- What is paid: every key on that partition stops. While arrivals continue, lag grows until
  recovery or retention loss; other partitions may look healthy and hide it in aggregates. With a
  uniform distribution, one bad record stalls roughly `1/partitions` of keys; traffic impact
  depends on hot keys and partition skew.
- Required: an alert on **per-partition** lag or per-partition oldest-record age, not fleet
  lag. Without it this option fails silently for hours.

**Option 2 — atomically quarantine and commit past.** Durably transfer 48, then commit the next
source position, continue. If `A:48` has source offset 101 and the delivered prefix through it
is safely resolved, committing 102 resumes after it; business sequence 49 is not that offset.

- What is preserved: progress for every other key on the partition, and the record itself, in
  the DLQ, with its context.
- What is paid: `k=A` now has a gap. `A:49` is applied to a state that never saw `A:48`. If A's
  events require intermediate transitions, the projection needs repair/reconciliation;
  if they are full-state snapshots (last-writer-wins on the whole entity), the gap is
  harmless only when an authority version guard proves 49 supersedes 48 and no intermediate
  effect/audit transition is required.
- Required: the business transition/effect contract as well as the schema; payload shape
  alone cannot prove that skipping an intermediate event is acceptable.

**Option 3 — block the key, not the partition.** Divert every subsequent record for `k=A` to
the same retry path while letting other keys through. This preserves per-key ordering _and_
partition progress, at the cost of real machinery: a per-key "parked" set, a check on every
record, and durable ordered buffering across restart/rebalance with ownership fencing.
Do not acknowledge source work until the transfer is durable; preserve key order while
draining and prevent live traffic overtaking it. Bound retention/admission and route the
ordering protocol to `message-ordering-and-partitioning`. Worth it
where the gap in option 2 is unacceptable and the block in option 1 is too expensive — and
only then, because the parked set is a new place to lose messages.

**Option 4 — resynchronize from authority.** Quarantine the bad delta, fetch an authoritative
snapshot/version, atomically replace the projection, and continue from a known watermark. This
preserves progress but intentionally gives up observing every intermediate transition; it is
valid only when the projection contract allows that and the snapshot and stream watermark
come from a consistent recovery protocol, not unrelated reads.

## What this decision is not

- It is not a retry policy. How long and how often to retry the transient class is
  `retries-and-backoff`; this reference only decides which class the failure is in and where
  the message goes when retrying stops.
- It is not an ordering design. Whether per-key ordering is required at all, and how the key
  maps to a partition, is `message-ordering-and-partitioning`. What is settled here is only
  that dead-lettering out of an ordered log costs an ordering gap, and that the cost has to be
  named before the code is written.

## Classification tests

Select cases for the classifier or routing contract being changed; an explanation or review
can close from adequate existing evidence. For implementation, exercise relevant boundaries:

- replay the same bytes against old/current/next consumer builds and schema registry state;
- test representative HTTP/domain results, especially 408/409/412/425/429, authentication
  refresh, validation and business terminal rejection;
- inject downstream apply-then-drop-response and prove it is `AMBIGUOUS`, not transient;
- trigger one corrupt record versus a fleet-wide deserializer/config failure and verify the
  circuit pauses before mass quarantine;
- version the classifier rules in the envelope so reclassification/redrive is auditable.

For Kafka consumer groups, verify offset gaps, processing/commit boundaries and pause/rebalance
behavior against the [Kafka 4.1 consumer API](https://kafka.apache.org/41/javadoc/org/apache/kafka/clients/consumer/KafkaConsumer.html).
