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

A timeout is a local duration bound on a named phase. A deadline is a request budget represented
locally as an instant and propagated as a shrinking timeout. Sequential per-hop maxima can add
when no outer bound exists; with a 5 s outer timeout the caller may return at 5 s while uncancelled
descendants continue toward their own bounds. A propagated deadline constrains both visible wait
and useful downstream work only when every hop honors expiry and cancellation.

The second failure this prevents is the timeout that saves nothing. A caller that stops
waiting but does not cancel has freed no connection, no thread and no database session at
the callee — it has put a retry on top of work that is still running, so the dependency now
serves two requests for one. Bounding the wait and stopping the work are separate
mechanisms; both have to be implemented.

## Workflow

1. **Fix the caller's budget first.** The outermost bound comes from the user-facing SLA or
   the upstream deadline. Everything inside is a division of that budget, never an
   independent choice.
2. **Use uncensored measurements and the consequence model.** A chosen percentile is evidence,
   not the timeout itself: include network phases, overload, cold paths and failure recovery;
   decide the tolerated abandonment rate and resource occupancy.
3. **Model the whole policy before deploying it.** For sequential attempts, the configured
   maximum is phase waits + per-attempt work + backoff, clipped by remaining deadline. Include
   pool/DNS/TLS/body time and hidden framework retries; hedges overlap instead of adding simply.
4. **Propagate a shrinking remaining budget on every hop.** Deduct elapsed local work and a
   return reserve before each outbound call; clamp untrusted inputs to a local maximum. Refuse
   work only when its probability/value of timely completion no longer justifies its cost. See
   `references/deadline-propagation.md`.
5. **Set every timeout layer the client actually has** — pool lease, connect, TLS, read or
   inactivity, total request — and name the failure each one does _not_ prevent. See
   `references/java-timeout-surface.md`.
6. **Wire best-effort cancellation to expiry.** Signal the protocol/task, stop producing output,
   close/abort resources where safe and invoke database cancellation/server timeout. Cancellation
   is cooperative and races completion; verify bounded resource release and make effects safe
   for an unknown outcome.
7. **Assert policy invariants and fault behavior.** Sequential configured maxima must fit the
   outer budget or be clipped; then inject stalls in pool, DNS/connect/TLS, headers, body and
   server work and observe cancellation/resource release.

## Rules

- Sequential phase/attempt maxima add when no smaller outer bound stops the wait. Nested timeouts
  do not make the user wait for every orphan sequentially, but they can bind resources much later
  than the response. A deadline composes by minimum only if it is inherited, never reset.
- A **remaining duration** avoids cross-host wall-clock skew but transit time before receipt is
  not observable to the receiver and therefore consumes unaccounted budget. Deduct elapsed time
  before every onward propagation and retain a network reserve; mature protocols such as gRPC
  propagate a timeout with elapsed time deducted. Convert inbound duration to a local monotonic
  deadline (`System.nanoTime()`); never compare `nanoTime` values across processes.
- HTTP defines no deadline header. Pick one, put it in the API contract, and treat its
  absence as "no inherited budget, use the local default" — never as "unlimited".
- Refuse or degrade when the conditional chance/value of finishing within `remaining - reserve`
  is lower than the cost and admission policy allow. p50 is not a universal threshold: it would
  reject work that still has about a 50% chance under a stationary distribution and ignores
  criticality, queue state, cancellation cost and warm/cold path.
- A timeout at a historical p99 nominally abandons about 1% only if the distribution is
  representative, uncensored and independent of the timeout. Client metrics often record a
  spike at the configured timeout and hide how long the dependency would have taken. Measure
  server work and outcomes too; choose from the end-to-end budget and failure cost.
- Hikari's `connectionTimeout` bounds waiting for a pooled connection, not TCP connect.
  Under saturation it is the first timeout to fire, and it fires on callers that have not
  yet sent a byte. Sizing the pool is connection-pool-sizing; the arithmetic relating wait
  time to arrival rate and service time is littles-law-and-queueing.
- JDBC exposes `Statement.setQueryTimeout`, `Statement.cancel`, `Connection.setNetworkTimeout`
  and `Connection.abort`, with distinct semantics and driver support. Prefer a database-side
  statement timeout as the authoritative execution/lock bound when available, align the driver
  and transaction limits, and verify whether cancel releases server work and locks promptly.
- Kafka: processing that delays `poll()` can exceed `max.poll.interval.ms`; broker request and
  heartbeat/session limits are different. Static membership can defer reassignment until session
  expiry, and under the consumer group protocol the broker controls session/heartbeat settings.
  Raising `request.timeout.ms` does not make a slow handler safe.
- `HttpClient.Builder.connectTimeout` and `HttpRequest.Builder.timeout` are different. In current
  JDK built-in implementations the request timeout extends through body-subscriber completion;
  a returned `InputStream` body shifts later consumption/close responsibility to the caller.
  DNS behavior and implementation details still require fault testing.
- An unbounded `future.get()`/`join()` is acceptable only when a stronger task/request lifetime
  is guaranteed. Catching `TimeoutException` should normally initiate cancellation and preserve
  interrupt status where applicable, but cancellation does not prove the effect stopped. On a
  platform thread a blocking read on
  `java.net.Socket` does not respond to `Thread.interrupt()`; closing the socket is what
  unblocks it, so a cancellation path built only on interruption does nothing there.
- For sequential fixed maxima, `Σ phase/attempt bounds + Σ backoff` must be clipped by the
  shrinking deadline. Attempts beyond it are unreachable. Use overflow-safe duration arithmetic;
  parallel hedges require a concurrency/resource budget rather than the same sum.
- Say what a timeout bounds. It bounds the caller's wait. It does not bound the callee's
  work, and with a retry above it, it does not bound the total either.

## Failure contract, security and observability

- Distinguish `deadline_exceeded_before_start`, local pool/connect/request timeout, remote
  deadline response and cancellation. A timeout leaves the business outcome **unknown** unless
  the protocol provides an outcome/status query; retries require idempotency or reconciliation.
- Clamp and authenticate inherited budget/priority where a trust boundary requires it. Reject
  malformed, negative and overflow values; prevent a caller from buying excessive resource time
  or forcing near-zero budgets as an amplification attack.
- Record original/remaining budget, phase, attempt, cancellation signal/acknowledgement and work
  continuing after caller expiry. Keep identifiers low-cardinality and do not log sensitive
  payload/header contents.

## Primary references

- [gRPC deadlines](https://grpc.io/docs/guides/deadlines/) — propagation, elapsed-time deduction and cooperative server cancellation.
- [JDK `HttpRequest.Builder.timeout`](<https://docs.oracle.com/en/java/javase/25/docs/api/java.net.http/java/net/http/HttpRequest.Builder.html#timeout(java.time.Duration)>) — specified request bound and JDK implementation behavior.
- [JDBC `Connection.setNetworkTimeout`](<https://docs.oracle.com/en/java/javase/25/docs/api/java.sql/java/sql/Connection.html#setNetworkTimeout(java.util.concurrent.Executor,int)>) — network timeout versus query timeout.
- [Apache Kafka consumer configuration](https://kafka.apache.org/41/generated/consumer_config.html) — poll interval, static membership and group-protocol distinctions.

## References

- [The Java timeout surface](references/java-timeout-surface.md) — every timeout knob on
  `java.net.http.HttpClient`, Spring `RestClient`/`RestTemplate`, JDBC with its pool, and the
  Kafka consumer, each paired with the failure it does not prevent. Read before configuring
  or reviewing any client.
- [Deadline propagation](references/deadline-propagation.md) — the budget arithmetic, a
  `Deadline` carried across hops with the refuse-to-start check, when a propagated deadline
  is worth its cost, and how to test both the arithmetic and the cancellation. Read when a
  request crosses more than one hop, or when the chain's worst case exceeds the SLA.
