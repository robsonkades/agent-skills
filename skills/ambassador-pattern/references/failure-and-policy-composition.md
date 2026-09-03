# Failure surface and policy composition

## What the application sees when the ambassador misbehaves

| Ambassador state                    | The app observes                                                 | Wrong conclusion usually drawn | What actually to check                                                 |
| ----------------------------------- | ---------------------------------------------------------------- | ------------------------------ | ---------------------------------------------------------------------- |
| Stopped / restarting                | `Connection refused` on loopback, instantly                      | "The upstream is down"         | Container restart count for the proxy; pooled sockets held by the app  |
| Slow (saturated, GC, CPU throttled) | Latency rise on _every_ upstream at once                         | "The network is bad"           | Per-upstream latency inside the proxy versus as seen by the app        |
| Retrying invisibly                  | One app-side call taking 3× the configured upstream timeout      | "The upstream got slower"      | The proxy's attempt counter per request; the deadline it actually used |
| Fails closed on a bad route         | 503 for traffic that the upstream would have served              | "Partial outage upstream"      | Route table version; which route the response header names             |
| Fails open                          | Success with the policy silently not applied — no mTLS, no split | Nothing at all; this is silent | Assert policy application as a metric, not as config presence          |

The general two-container failure matrix (crash loop, OOM, gray failure, eviction) is in
`sidecar-pattern`. The rows above are the ones specific to owning outbound traffic: the
ambassador's failures are indistinguishable from the upstream's unless you instrument both
sides of the loopback hop.

## Policy belongs to exactly one layer

| Policy           | Put it in                                                         | What double-configuration produces                                       |
| ---------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Retry            | Prefer one owner; otherwise one shared end-to-end attempt budget  | Multiplication: `app_attempts × proxy_attempts` requests upstream        |
| Timeout          | Both, but as a **budget hierarchy**: app deadline > proxy timeout | Proxy still retrying after the app gave up — work with no consumer       |
| Circuit breaking | Match the desired scope; a per-pod ambassador sees only that pod  | Two breakers with different views; one open, one closed, flapping        |
| TLS / mTLS       | The ambassador                                                    | Two handshakes, or an app that thinks it is encrypted and is not         |
| Load balancing   | The ambassador                                                    | Client-side LB over a single loopback endpoint — a no-op that looks fine |
| Idempotency key  | The **application** — only it knows business identity             | A proxy-generated key is per attempt, which defeats deduplication        |

The last row is the boundary. A proxy can make a call safe to repeat only if the payload
already carries something that identifies the intent; it cannot invent that identity.

## The pool moved

Before: each app pod holds `n` connections to the upstream, so the upstream sees
`pods × n`. After: each app pod holds a cheap loopback pool, and the ambassador holds
`m` to the upstream, so the upstream now sees `pods × m`. Three consequences:

- Sizing `m` is the real decision; the app-side number is nearly free and should be small.
- The ambassador multiplexes — with HTTP/2 or gRPC a single connection carries many concurrent
  streams, so `m` is no longer proportional to concurrency and the old rule of thumb does not
  transfer. Size against measured concurrency, using `connection-pool-sizing`.
- Queueing moved too. Requests now wait _inside the proxy_ when `m` is exhausted, where the
  app's own pool metrics cannot see it. Export the proxy's pending-request and queue-depth
  metrics or that saturation is invisible; the arithmetic is `littles-law-and-queueing`.

## Deadline and trace context across the hop

```java
// Conceptual: the app's client for an upstream reached via the ambassador.
// No discovery, no retry here — one layer owns retry, and it is not this one.
HttpClient client = HttpClient.newBuilder()
        .connectTimeout(Duration.ofMillis(200))
        .build();

Duration remaining = deadline.remaining();          // from the inbound request's budget
if (remaining.isNegative() || remaining.isZero()) {
    throw new DeadlineExceededException();          // do not start work already out of budget
}

HttpRequest request = HttpRequest.newBuilder(URI.create("http://127.0.0.1:15001/v1/accounts/AC-91823"))
        .header("x-request-deadline-ms", Long.toString(remaining.toMillis()))
        .header("traceparent", currentTraceParent()) // forwarded, never regenerated
        .timeout(remaining)                          // the app's own ceiling, not a fixed constant
        .GET()
        .build();
```

The ambassador must read `x-request-deadline-ms` (or whatever the fleet's agreed header is)
and cap its own upstream timeout _and its retry budget_ by it. A proxy retrying past the
caller's deadline is doing work no one will read while holding a connection someone else
needs. Deadline semantics are `timeouts-and-deadlines`.

For gRPC, deadlines are encoded as a remaining timeout to avoid clock-skew problems. Some
language stacks propagate them automatically for child calls (Java does), while a proxy that
terminates and re-originates traffic must be verified to preserve and decrement the budget.
Do not assume an arbitrary proxy/filter chain keeps the semantics intact.

## Testing it

Three tests, each proving something a config review cannot:

- **No double retry.** Point the app at a stub that counts requests, configure the ambassador
  for 3 attempts, make the stub fail. Assert the stub saw exactly 3, not 9. This is the test
  that catches the amplification the day someone re-enables retries in the app's client.
- **Fault injection at the proxy.** Most proxies can be configured to inject latency or return
  a status for a fraction of requests. Turn on 100% 503 for one upstream and assert the app
  degrades the way you claimed — fails open or fails closed, with the right user-visible
  result — rather than hanging.
- **Crash the proxy process mid-load.** Run an open-loop client, terminate PID 1 inside the
  ambassador container or use the platform's supported fault-injection mechanism, and count
  errors until restart recovery. Kubernetes does not expose deletion of one container as a
  standalone workload operation. This exercises pooled-socket invalidation and the app's
  reconnection path; a closed-loop client hides the outage by throttling itself, which is
  `coordinated-omission`.

Run the first of these in CI. The other two belong in a pre-production environment with the
real proxy image, because a stub proxy has none of the behaviour being tested.
