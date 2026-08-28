---
name: timeouts-and-deadlines
description: >
  Bounding how long a call may take and propagating that bound: per-hop timeouts versus an
  absolute deadline, deadline propagation over HTTP and gRPC, remaining-budget arithmetic
  and refusing work that cannot finish, cancellation so a timed-out caller stops the callee,
  and keeping connect, read, total and retry timeouts consistent. Use when a client sets a
  connect timeout but no request timeout, when Future.get() or join() is called with no
  bound, when a timeout is a round number repeated across services, when three hops each
  wait five seconds, when a retry policy total exceeds the caller timeout, when a JDBC call
  has no setQueryTimeout, when a Kafka consumer rebalances during slow processing, or when a
  timed-out request leaves work running downstream. Does not cover what to do after the
  timeout fires (retries-and-backoff), percentiles (latency-statistics), tail decomposition
  (tail-latency-analysis), tripping on repeated timeouts (circuit-breakers),
  or pool sizing (connection-pool-sizing).
---

# Timeouts And Deadlines

## Purpose

A timeout is a local decision about how long **this** hop may wait. A deadline is an
absolute instant that the whole call graph shares. Confusing the two is what turns three
hops nobody set above 5 s into a 15 s worst case: per-hop timeouts **add**, a deadline only
**shrinks**. Every hop under a deadline knows how much time is left; every hop under a
timeout knows only its own patience.

The second failure this prevents is the timeout that saves nothing. A caller that stops
waiting but does not cancel has freed no connection, no thread and no database session at
the callee — it has put a retry on top of work that is still running, so the dependency now
serves two requests for one. Bounding the wait and stopping the work are separate
mechanisms; both have to be implemented.

## Workflow

1. **Fix the caller's budget first.** The outermost bound comes from the user-facing SLA or
   the upstream deadline. Everything inside is a division of that budget, never an
   independent choice.
2. **Take the value from the dependency's measured distribution.** Read its p99 and p99.9
   over a window with a stated sample count (latency-statistics owns how to read them), and
   decide explicitly which fraction of calls you are choosing to abandon.
3. **Add up the chain before deploying it.** Worst case is the sum of per-hop timeouts plus
   backoff. If that exceeds the caller's budget, the configuration is already broken — no
   traffic is needed to prove it.
4. **Propagate the remaining budget on every hop, and check it before starting work.**
   Compute `remaining`, refuse the call when it cannot plausibly finish, and shrink the
   downstream timeout to `remaining` minus a return-trip reserve. See
   `references/deadline-propagation.md`.
5. **Set every timeout layer the client actually has** — pool lease, connect, TLS, read or
   inactivity, total request — and name the failure each one does _not_ prevent. See
   `references/java-timeout-surface.md`.
6. **Wire cancellation to the expiry.** Interrupt, cancel the request, close the connection,
   call the database's cancel path. Then verify it: the callee's in-flight gauge must return
   to zero after the caller gives up.
7. **Assert the arithmetic in a test**, not in review. `attempts × per-attempt + Σ backoff ≤
budget` is a property of configuration and needs no network to check.

## Rules

- Per-hop timeouts compose by addition; deadlines compose by minimum. If a request crosses
  more than two hops, per-hop values alone cannot bound the total.
- Carry a **remaining duration** on the wire, not an absolute timestamp. A timestamp is only
  as good as clock synchronisation between the two hosts; a duration costs one transit-time
  error term and no clock assumption. `grpc-timeout` is a duration for exactly this reason.
  Convert it on arrival against a monotonic source (`System.nanoTime()`), so an NTP step
  cannot move the deadline mid-request.
- HTTP defines no deadline header. Pick one, put it in the API contract, and treat its
  absence as "no inherited budget, use the local default" — never as "unlimited".
- Refuse to start downstream work when `remaining` is below the operation's own measured p50
  plus the return-trip reserve. Work that cannot finish still costs the callee everything
  except the reply.
- A timeout set at the dependency's p99.9 is a decision to wait as long as its slowest 1 in 1000. Your p99.9 then contains that number by construction. Choosing p99 sheds ~1% of
  calls as failures and caps the wait — that trade is the actual decision.
- Hikari's `connectionTimeout` bounds waiting for a pooled connection, not TCP connect.
  Under saturation it is the first timeout to fire, and it fires on callers that have not
  yet sent a byte. Sizing the pool is connection-pool-sizing; the arithmetic relating wait
  time to arrival rate and service time is littles-law-and-queueing.
- Closing a JDBC connection does not reliably abort a statement already running on the
  server; whether and when the server notices is driver- and database-specific.
  `Statement.setQueryTimeout` — or an explicit server-side cancel — is the only portable
  request to stop it, and its effect is still driver-dependent. Verify on your driver.
- Kafka: a slow handler trips `max.poll.interval.ms`, not `session.timeout.ms`. Heartbeats
  have run on a background thread since KIP-62, so session timeout no longer covers
  processing. Raising `request.timeout.ms` does not help a slow handler.
- `HttpClient.Builder.connectTimeout` and `HttpRequest.Builder.timeout` are different
  bounds, and neither covers name resolution or the time spent consuming a streamed body.
- Never write `future.get()` or `join()` with no bound, and never catch `TimeoutException`
  without cancelling the future — the unbounded variants turn a downstream stall into a
  thread leak in the caller. Note that on a platform thread a blocking read on
  `java.net.Socket` does not respond to `Thread.interrupt()`; closing the socket is what
  unblocks it, so a cancellation path built only on interruption does nothing there.
- A retry policy whose total (attempts × per-attempt timeout + Σ backoff) exceeds the
  caller's remaining budget has attempts that are unreachable. The policy is decoration; the
  arithmetic is the review.
- Say what a timeout bounds. It bounds the caller's wait. It does not bound the callee's
  work, and with a retry above it, it does not bound the total either.

## References

- [The Java timeout surface](references/java-timeout-surface.md) — every timeout knob on
  `java.net.http.HttpClient`, Spring `RestClient`/`RestTemplate`, JDBC with its pool, and the
  Kafka consumer, each paired with the failure it does not prevent. Read before configuring
  or reviewing any client.
- [Deadline propagation](references/deadline-propagation.md) — the budget arithmetic, a
  `Deadline` carried across hops with the refuse-to-start check, when a propagated deadline
  is worth its cost, and how to test both the arithmetic and the cancellation. Read when a
  request crosses more than one hop, or when the chain's worst case exceeds the SLA.
