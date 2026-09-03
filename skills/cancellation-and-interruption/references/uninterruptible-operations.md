# Blocking operations and cancellation adapters

## Capability inventory

For each call record from the exact API/provider/JDK:

| Call | Thread/blocking mechanism | Interrupt behavior | Other cancel/close | Resource consequence | Positive control |
| ---- | ------------------------- | ------------------ | ------------------ | -------------------- | ---------------- |
|      |                           |                    |                    |                      |                  |

Avoid class-wide claims. Overloads/providers, platform versus virtual threads, channel versus
stream, multiplexed versus dedicated connections, and JDK versions can differ.

## Families to verify

- monitor entry versus `Lock.lockInterruptibly`/timed `tryLock`;
- `Object.wait`, `Condition.await`, `Thread.sleep`, `join`;
- `Future.get` versus `join`, queue/semaphore/latch methods;
- socket streams, NIO selectors/channels and async channels;
- JDBC acquisition/query and driver `Statement.cancel`/socket timeout;
- HTTP future/body/transport cancellation and connection reuse;
- file I/O, network mounts and DNS/TLS;
- native/foreign calls and library-specific abort handles;
- reactive subscription cancellation.

## Adapter state machine

When a callback/handle API completes a Future:

```text
PENDING -> SUCCEEDED | FAILED | CANCELLING -> CANCELLED(underlying terminal/released)
```

Retain the underlying request handle. Invoke cancel once, complete the public stage only once, and
resolve late completion versus cancellation. A cancelled public future does not prove underlying
resource release.

## Close as cancellation

Close is appropriate when the task exclusively owns the resource and the API says close wakes it.
For pooled/shared/multiplexed resources, close can abort unrelated work. Prefer request/stream-level
cancel. Test completion racing close, close failure, return-to-pool before old work exits, and remote
commit after local close.

## JDBC and remote calls

JDBC behavior is driver/database-specific. Retain handles, configure deadlines at the owning layer,
and verify server-side query/locks stop. Remote cancellation is a fallible protocol message; side-
effect outcome remains unknown until idempotent status/reconciliation.

## Process isolation

For uncooperative native/tool code, a separately owned process may be the only forcible boundary.
Define TERM/grace/KILL, child tree, pipes/temp files/locks, cleanup and external side effects. Java
thread force-stop is not a safe fallback.

## Test harness

Use a controllable fake/server signaling entry, cancel received, underlying operation terminated,
resource released/reusable, and post-deadline side effect/reconciliation. Assert termination, not
only exceptional completion of the caller future.

## Authoritative references

- [Java concurrency APIs](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/util/concurrent/package-summary.html)
- [InterruptibleChannel](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/nio/channels/InterruptibleChannel.html)
- [JDBC `Statement.cancel`](<https://docs.oracle.com/en/java/javase/25/docs/api/java.sql/java/sql/Statement.html#cancel()>)
- [Java HTTP client](https://docs.oracle.com/en/java/javase/25/docs/api/java.net.http/java/net/http/HttpClient.html)
