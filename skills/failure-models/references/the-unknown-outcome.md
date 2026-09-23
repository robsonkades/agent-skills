# The unknown outcome

A remote write can have a known applied effect, a known non-applied effect or an unknown
effect. Classify at a named effect boundary. If a debit applied but its notification failed,
preserve that known partial completion and resolve the notification separately; the whole
operation was neither wholly rejected nor necessarily wholly unknown. Even a local exception
can follow partial mutation; remote calls add uncertainty about an independently executing peer.

```java
// Optional Java representation of certainty about one effect, not a multi-effect workflow.
sealed interface Outcome<T> {
    record Applied<T>(T value) implements Outcome<T> {}
    // Provably never applied; retry eligibility still depends on cause and budget.
    record Rejected<T>(Throwable cause) implements Outcome<T> {}
    // May or may not have applied: unsafe retry may duplicate; abandoning may lose intent.
    record Unknown<T>(Throwable cause) implements Outcome<T> {}
}
```

An exhaustive pattern `switch` can expose an unhandled variant. Existing protocol statuses,
results or exceptions may already carry this information; preserve it without requiring a
new type or a Java runtime. Modelling a Java exception hierarchy is `java-exception-design`.

## Classifying a real call

The question is always the same: **could the request have reached the peer and taken
effect?** Everything below follows from that.

| Call                | Rejected (never applied)                                                                                     | Unknown                                                                                                                                                                                                               |
| ------------------- | ------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| HTTP                | locally proven pre-dispatch failure, such as invalid URI or DNS failure with no usable cached route          | response/read timeout, reset after dispatch, client cancellation, and proxy 502/504 unless intermediary evidence proves non-forwarding                                                                                |
| JDBC statement      | failure acquiring a connection before dispatch; server rejection whose transaction semantics prove no effect | socket timeout or disconnect during execution; a driver may not know whether a trigger/procedure or transaction effect occurred                                                                                       |
| JDBC `commit()`     | proven pre-dispatch/protocol rejection with known transaction state                                          | disconnect/exception after possible commit dispatch can mean the commit was durable and only its acknowledgement was lost                                                                                             |
| Kafka `send()`      | synchronous serialization/size/configuration failure before the record enters the accumulator                | delivery timeout or disconnect after possible transmission; classify from producer metadata and protocol evidence, because `TimeoutException` can also arise while metadata or buffer progress never allowed dispatch |
| Kafka offset commit | proven rejection with known committed offsets                                                                | timeout after possible dispatch may hide a successful commit; replay after rebalance depends on the actual committed offsets                                                                                          |

Two consequences that surprise people:

- **Pre-dispatch evidence can turn ambiguity into rejection.** A DNS error before any route
  is selected or a local serialization failure proves this attempt did not reach the peer.
  A connect timeout often occurs before application bytes are written, but do not infer that
  from an exception name alone: clients, proxies and transparent retries can change the
  boundary. Instrument whether the request entered the transport and whether an
  intermediary forwarded it. Connect and response timeouts should remain separately
  observable because they carry different evidence.
- **A commit acknowledgement can be lost after durability.** A JDBC client that catches
  an exception from `commit()` and claims "the transaction rolled back" without further
  evidence is guessing. Reporting that the caller could not confirm success is accurate.

## What Unknown forces the design to provide

Choose an explicit resolution policy per write path; these mechanisms can be combined:

1. **Safe to repeat.** Natural operation semantics or a stable operation key prevent the
   repeated logical intent from duplicating its business effect. For keyed deduplication, preserve the key
   and payload semantics, and resolve the original result. The mechanics — key choice, storage, retention,
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
An absent lookup result is not proof of failure while the original request may still complete,
or the query can be stale. Require authoritative terminal status, a protocol guarantee that the
operation cannot apply later, or a retry that remains safe despite that race.

## Read paths are not exempt, only cheaper

Retry a read only when its actual semantics are safe to repeat: a name or HTTP verb does not
prove a custom endpoint is free of business side effects. A later read may also return a
different version, so preserve required snapshot/precondition semantics. Repetition has a
cost the model must account for: another attempt adds load to a peer that may already be slow,
and it consumes the caller's remaining deadline. Retry budgets and backoff belong to
`retries-and-backoff`; what belongs here is evidence that repetition is safe. A non-idempotent
write with an unknown effect cannot be retried blindly; one proven never applied may be
retried if its cause and remaining budget permit. Include earlier transparent attempts in
that proof, not only the last attempt.
A rejected later attempt does not resolve an earlier unknown effect.

## Reviewing for it

Three search leads for possible erasure; inspect the contract before calling them defects:

- `catch (TimeoutException` / `catch (SocketTimeoutException` followed by anything that
  claims the effect never applied, or retries without evidence that repetition is safe.
- A retry policy (`@Retryable`, an interceptor, a `RetryTemplate`) applied to a method whose
  name is a verb like `create`, `charge`, `send` or `transfer` with no idempotency key in the
  signature.
- `commit()` inside a `try` whose `catch` logs and continues, or rolls back a transaction
  that may already be durable.

A key can come from an interceptor or domain identity, and an operation can be naturally
idempotent. A caller-visible timeout is legitimate if the effect remains classified as unknown.
Trace these semantics rather than requiring a key parameter or particular result type.

## Proving it

Unit tests can check classification and recovery decisions, but a mock throwing an exception
does not establish what a real peer did. For transport and durability claims, use an isolated
integration test with controlled fault timing and inspect actual peer state:

- **Testcontainers plus a network fault** between the application and the dependency — pause
  the container, or drop packets on the bridge — _after_ the request is written. Assert the
  peer's state after recovery, not the exception the client saw.
- **A proxy that forwards then cuts the response.** Put a controllable proxy in front of the
  dependency, allow the request to apply, and close or black-hole the response. This is a
  faithful unknown-outcome case; also test the complementary pre-dispatch cut to prove the
  client distinguishes the two.
- Assert the **business effect** at the peer: row count, balance, ledger entries or external
  action count as appropriate. Duplicate increments can corrupt one row without creating another.

## Evidence hierarchy

Classify from the strongest available evidence, not the Java exception class:

1. peer-side durable operation ID and terminal status;
2. protocol acknowledgement whose durability scope is documented;
3. intermediary evidence that the request was or was not forwarded;
4. client transport phase (queued, connected, bytes written, response started);
5. timeout/cancellation alone — normally `Unknown` for a mutating operation.

Cancellation may prevent an unstarted task from running or request interruption/cooperative
stop after it starts; the client and protocol determine the behavior. Observing cancellation
or even handler termination does not by itself establish whether an effect already applied.
Classify `Rejected` only with evidence that the relevant effect never applied and cannot apply
later, accounting for earlier attempts. An HTTP/2 stream reset, interrupted Java future, or
expired deadline does not by itself roll back a peer-side commit.

## Primary references

- [RFC 9110: HTTP Semantics, §9.2.2 Idempotent Methods](https://httpwg.org/specs/rfc9110.html#idempotent.methods)
- [Java 17 Connection.commit](<https://docs.oracle.com/en/java/javase/17/docs/api/java.sql/java/sql/Connection.html#commit()>): commit contract and exceptions; determine actual outcome from protocol evidence.
- [Java 17 Future.cancel](<https://docs.oracle.com/en/java/javase/17/docs/api/java.base/java/util/concurrent/Future.html#cancel(boolean)>): cancellation before execution and attempted interruption after execution starts.
- [gRPC cancellation](https://grpc.io/docs/guides/cancellation/): cancellation signals and cooperative server-side termination.
- [JDBC 4.3 specification, transactions](https://jcp.org/aboutJava/communityprocess/mrel/jsr221/index3.html)
- [Apache Kafka 4.3 producer configuration: delivery timeout and idempotence](https://kafka.apache.org/43/configuration/producer-configs/)
- [Apache Kafka 4.0 consumer API: offset commits and rebalance](https://kafka.apache.org/40/javadoc/org/apache/kafka/clients/consumer/KafkaConsumer.html)
  — use documentation matching the deployed client; these links do not require an upgrade.
