# The unknown outcome

A local method call has two outcomes. A remote call has three, and the third one has no
syntax in Java — it arrives as an exception indistinguishable from the second.

```java
// Conceptual: the shape the fault model forces on every remote write.
sealed interface Outcome<T> {
    record Applied<T>(T value) implements Outcome<T> {}
    // Provably never applied: safe to retry, safe to fail the caller.
    record Rejected<T>(Throwable cause) implements Outcome<T> {}
    // May or may not have applied: retrying duplicates, not retrying may lose.
    record Unknown<T>(Throwable cause) implements Outcome<T> {}
}
```

The value of the sealed type is not elegance — it is that `switch` over it is exhaustive, so
a new call site cannot quietly forget the third case. Modelling the exception hierarchy that
feeds it is `java-exception-design`.

## Classifying a real call

The question is always the same: **could the request have reached the peer and taken
effect?** Everything below follows from that.

| Call                | Rejected (never applied)                                                                        | Unknown                                                                                                                                   |
| ------------------- | ----------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| HTTP                | connect timeout, DNS failure, TCP refused, TLS handshake failure — no request bytes were sent   | response/read timeout, connection reset after the request was written, 502/504 from a proxy, client cancelled                             |
| JDBC statement      | failure acquiring a connection from the pool, syntax or constraint error returned by the server | socket read timeout during execution, connection dropped mid-statement                                                                    |
| JDBC `commit()`     | —                                                                                               | **always potentially unknown**: an exception from `commit()` may mean the commit record was durable and only the acknowledgement was lost |
| Kafka `send()`      | serialisation failure, `RecordTooLargeException`, unknown topic before dispatch                 | `TimeoutException` on the future or callback — the leader may have appended the batch and the ack was lost                                |
| Kafka offset commit | —                                                                                               | a failed commit may have been applied; a rebalance then redelivers                                                                        |

Two consequences that surprise people:

- **A connect timeout is a good outcome.** It is the one network failure that is provably
  Rejected, because the handshake never completed and no request bytes went out. This is why
  connect timeout and read timeout must be configured separately and never collapsed into
  one number: they carry different information.
- **`commit()` is the worst case in the table.** The two-generals structure is exact: the
  database cannot tell you it committed without a message that can be lost. A JDBC client
  that catches an exception from `commit()` and reports "transaction failed" is guessing.

## What Unknown forces the design to provide

Exactly one of these three, chosen per write path and written down:

1. **Idempotent by key.** The write carries a caller-generated key and repeating it is a
   no-op. This is the default answer; the mechanics — key choice, storage, retention,
   concurrent-duplicate handling — are `idempotency`.
2. **Reconcilable.** The write is not repeat-safe, so the caller records its intent durably
   before the call and a later reconciliation reads the peer's state to decide whether the
   effect exists. Cost: the window between attempt and reconciliation is inconsistent by
   design, so the business must tolerate it.
3. **Escalated.** No automatic resolution: the record is parked and a human decides. Legal
   for rare, high-value, non-idempotent operations. Illegal as an unstated default, which is
   what "log the exception and move on" actually is.

There is no fourth option. A write path that has none of the three resolves Unknown by
coin-flip.

## Read paths are not exempt, only cheaper

An unknown read is safe to retry — it has no side effect at the peer. But it still has a
cost the model must account for: the retry doubles the load on a peer that is already slow,
and it consumes the caller's remaining deadline. Retry budgets and backoff belong to
`retries-and-backoff`; what belongs here is the classification that says a read may be
retried at all, and a non-idempotent write may not.

## Reviewing for it

Three greps that find the erasure directly:

- `catch (TimeoutException` / `catch (SocketTimeoutException` followed by anything that
  reports failure to the caller, or by a plain retry of a non-idempotent operation.
- A retry policy (`@Retryable`, an interceptor, a `RetryTemplate`) applied to a method whose
  name is a verb like `create`, `charge`, `send` or `transfer` with no idempotency key in the
  signature.
- `commit()` inside a `try` whose `catch` logs and continues, or rolls back a transaction
  that may already be durable.

## Proving it

Do not test this with mocks that throw. Test it with a fault that is genuinely ambiguous:

- **Testcontainers plus a network fault** between the application and the dependency — pause
  the container, or drop packets on the bridge — _after_ the request is written. Assert the
  peer's state after recovery, not the exception the client saw.
- **A proxy that accepts and discards.** Put a proxy in front of the dependency that forwards
  the request and then closes the connection without returning the response. That is the
  Unknown case exactly, and almost nothing else reproduces it faithfully.
- Assert on the **downstream row count**, not on the caller's return value. The bug being
  hunted is a second row, and the caller cannot see it.
