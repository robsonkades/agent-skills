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
- `Future.get` versus `CompletableFuture.join`, queue/semaphore/latch methods;
- socket streams, NIO selectors/channels and async channels;
- JDBC acquisition/query and driver `Statement.cancel`/socket timeout;
- HTTP future/body/transport cancellation and connection reuse;
- file I/O, network mounts and DNS/TLS;
- native/foreign calls and library-specific abort handles;
- reactive subscription cancellation.

## Adapter state machine

When a callback/handle API completes a Future:

```text
public result: PENDING -> SUCCEEDED | FAILED | CANCELLED
underlying work: ACTIVE -> CANCEL_REQUESTED -> TERMINATED -> RELEASED
                         (normal completion can also reach TERMINATED)
```

These are related state machines, not simultaneous transitions. Complete the public stage once
under the chosen race policy; record physical termination and release independently. An abort
can fail or never be acknowledged, so retain an unresolved/residual-work state and escalate
after the grace bound rather than declaring successful release.

Retain the underlying request handle. Cancellation can win before handle publication: record
the pending request atomically, then have handle registration deliver cancellation if it already
won. Serialize registration and cancellation so neither misses the other, and invoke the
external cancel operation outside internal locks because it may synchronously call back.
Test synchronous completion during registration and late success after public cancellation;
release an otherwise unclaimed returned resource even when its result cannot be delivered.
Invoke an underlying handle's cancel according to its idempotency/retry contract rather than
equating one successful public transition with one guaranteed downstream acknowledgement.

Moving the hook outside a lock does not bound it. Keep cancel/close hooks and their inline
callbacks bounded and safe on the initiating thread. `CompletableFuture` non-async completion
actions may run on that thread too. If an abort may block, dispatch it through owned, bounded
capacity with a policy for rejection, hook failure and grace expiry. Do not queue the only
abort path behind the work it must unblock. A queued abort is not an acknowledged stop; keep
its admission/execution state visible and retain an independent escalation path.

For example, Java 25's default `HttpClient.sendAsync` returns cancelable futures (including
derived futures) whose `cancel(true)` attempts exchange cancellation. The request may already
have reached the server, and resource release can be asynchronous. Completion racing cancellation
can expose a wrapped cancellation exception even when `isCancelled()` is false. Inspect the owned
cancellation state and exception chain; a nested I/O cause does not by itself make the operation
an ordinary retryable failure. Neither local exceptional completion nor a closed transport proves
that server-side work or committed effects have stopped.

For a shared exchange, cancelling a provider-derived future can therefore affect other callers.
Do not assume `copy()` removes that authority: OpenJDK 25.0.3's HTTP future preserves the cancel
handle through `newIncompleteFuture()`. Under a caller-local abandonment policy, relay the outcome
to a fresh base future without a downstream cancel bridge, and let the operation owner decide
when shared work can stop. The owner still observes late failures and cleans up unclaimed
resource-bearing results; relaying a value does not create a second ownership claim. Test that cancelling one
view leaves another caller able to complete. See `completablefuture-composition` for the relay
and deadline mechanics; inspect other providers before choosing an isolation boundary.

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
- [CompletableFuture execution and timeout contracts](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/util/concurrent/CompletableFuture.html)
  — non-async callback execution, receiver mutation and derived-future construction; checked 2026-09-19.
- [InterruptibleChannel](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/nio/channels/InterruptibleChannel.html)
- [JDBC `Statement.cancel`](<https://docs.oracle.com/en/java/javase/25/docs/api/java.sql/java/sql/Statement.html#cancel()>)
- [Java HTTP client](https://docs.oracle.com/en/java/javase/25/docs/api/java.net.http/java/net/http/HttpClient.html)
- [OpenJDK 25.0.3 cancelable future](https://github.com/openjdk/jdk25u/blob/jdk-25.0.3%2B9/src/java.net.http/share/classes/jdk/internal/net/http/common/MinimalFuture.java)
  and [exchange cancellation](https://github.com/openjdk/jdk25u/blob/jdk-25.0.3%2B9/src/java.net.http/share/classes/jdk/internal/net/http/MultiExchange.java)
  — implementation evidence for the completion/cancellation race; recheck other builds/providers.
