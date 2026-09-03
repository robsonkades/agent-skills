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

| Call                | Rejected (never applied)                                                                                     | Unknown                                                                                                                                                                                                               |
| ------------------- | ------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| HTTP                | locally proven pre-dispatch failure, such as invalid URI or DNS failure with no usable cached route          | response/read timeout, reset after dispatch, client cancellation, and proxy 502/504 unless intermediary evidence proves non-forwarding                                                                                |
| JDBC statement      | failure acquiring a connection before dispatch; server rejection whose transaction semantics prove no effect | socket timeout or disconnect during execution; a driver may not know whether a trigger/procedure or transaction effect occurred                                                                                       |
| JDBC `commit()`     | —                                                                                                            | **always potentially unknown**: an exception from `commit()` may mean the commit record was durable and only the acknowledgement was lost                                                                             |
| Kafka `send()`      | synchronous serialization/size/configuration failure before the record enters the accumulator                | delivery timeout or disconnect after possible transmission; classify from producer metadata and protocol evidence, because `TimeoutException` can also arise while metadata or buffer progress never allowed dispatch |
| Kafka offset commit | —                                                                                                            | a failed commit may have been applied; a rebalance then redelivers                                                                                                                                                    |

Two consequences that surprise people:

- **Pre-dispatch evidence can turn ambiguity into rejection.** A DNS error before any route
  is selected or a local serialization failure proves this attempt did not reach the peer.
  A connect timeout often occurs before application bytes are written, but do not infer that
  from an exception name alone: clients, proxies and transparent retries can change the
  boundary. Instrument whether the request entered the transport and whether an
  intermediary forwarded it. Connect and response timeouts should remain separately
  observable because they carry different evidence.
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

These are the terminal strategies; a protocol may combine them (for example, status lookup
before a keyed retry). A write path with none leaves the business outcome unresolved.

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
- **A proxy that forwards then cuts the response.** Put a controllable proxy in front of the
  dependency, allow the request to apply, and close or black-hole the response. This is a
  faithful unknown-outcome case; also test the complementary pre-dispatch cut to prove the
  client distinguishes the two.
- Assert on the **downstream row count**, not on the caller's return value. The bug being
  hunted is a second row, and the caller cannot see it.

## Evidence hierarchy

Classify from the strongest available evidence, not the Java exception class:

1. peer-side durable operation ID and terminal status;
2. protocol acknowledgement whose durability scope is documented;
3. intermediary evidence that the request was or was not forwarded;
4. client transport phase (queued, connected, bytes written, response started);
5. timeout/cancellation alone — normally `Unknown` for a mutating operation.

Cancellation only stops the caller's wait unless the protocol confirms cancellation of the
operation. An HTTP/2 stream reset, interrupted Java future, or expired deadline does not by
itself roll back a peer-side commit.

## Primary references

- [RFC 9110: HTTP Semantics, §9.2.2 Idempotent Methods](https://www.rfc-editor.org/rfc/rfc9110#section-9.2.2)
- [JDBC 4.3 specification, transactions](https://jcp.org/aboutJava/communityprocess/mrel/jsr221/index3.html)
- [Apache Kafka producer configuration: delivery timeout and idempotence](https://kafka.apache.org/documentation/#producerconfigs)
