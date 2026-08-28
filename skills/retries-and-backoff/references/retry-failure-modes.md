# Retry failure modes

Five shapes. Each is given as the mechanism, the code or config that produces it, and the
observation that distinguishes it from the others.

## 1. The retry storm

**Mechanism.** A dependency slows past the caller's timeout. Every caller times out and
retries. The dependency's inbound rate rises by the attempt multiplier exactly while its
capacity is reduced, so more calls time out, so more are retried. The loop sustains itself
after the original trigger is gone: removing the cause does not end the incident, because the
retries are now the cause.

**Signature.** The dependency's inbound request rate **rises** while its success rate
**falls**. Nothing else produces that combination — under organic load growth both rise, and
under a pure dependency fault the inbound rate is flat.

**Exit.** Retries have to be cut, not waited out. A budget empties on its own because there
are no successes to refill it; attempt counts do not. Shedding at the dependency
(rate-limiting-and-load-shedding) and breaking the circuit are the other two levers. The
system-level treatment is cascading-failures.

## 2. Layered amplification

**Mechanism.** Retry configured at more than one layer multiplies rather than adds.

```
gateway 3 attempts × service 3 attempts × HTTP client 3 attempts = 27 requests
```

**Where it hides.** The third layer is usually not application code: a service mesh sidecar
with a default retry policy, an SDK with retries enabled by default, or a database driver
reconnecting. Two of the three layers are typically invisible in the repository.

**Observation.** Count requests at each hop for a single logical call in a trace, not in
review. `downstream_requests / logical_calls` above the layer's own `maxAttempts` proves a
second retrying layer exists.

**Fix.** Retry at exactly one layer — the one that knows whether the operation is idempotent,
which is almost never the sidecar — and set the others to a single attempt _explicitly_, so
the decision is greppable rather than inherited from a default.

## 3. The non-idempotent write retried after a timeout

**Mechanism.** The caller times out; the request had already been applied; the retry applies
it again. The caller reports a failure and the user is charged twice.

**Code shape.**

```java
// wrong: a timeout is not evidence that nothing happened
catch (HttpTimeoutException e) {
    return http.send(request, handler);      // POST, no idempotency key
}
```

**Observation.** Duplicate business records whose creation timestamps differ by roughly the
client timeout plus one backoff. That interval is the fingerprint — it distinguishes a retry
duplicate from a consumer-rebalance duplicate, which delivery-semantics owns.

**Fix.** An idempotency key carried across attempts so the server can collapse them
(idempotency), or classify the timeout as ambiguous and refuse to retry it.

## 4. Retry with no budget during a partial outage

**Mechanism.** One dependency instance out of five is failing. With `maxAttempts(3)` and no
budget, the 20% of calls that land on it become 60% extra load spread over the healthy four,
which now carry 1.4× their normal traffic. The partial outage becomes a total one.

**Observation.** Healthy instances saturate while the unhealthy one is idle. Per-instance
request rate diverges from the load balancer's intended split.

**Fix.** A budget bounds this at 1.1× regardless of how much of the fleet is failing. Setting
`maxAttempts` lower is a smaller multiplier, not a bound.

## 5. Retry that holds a resource

**Mechanism.** The backoff sleep happens inside a transaction, or while a pooled connection
is checked out. Each retrying request holds its resource for `Σ backoff` longer, so the pool
drains at the dependency's failure rate and requests that never touch the failing dependency
start timing out on connection acquisition.

**Code shape.** `@Retryable` and `@Transactional` on the same method with the retry advice
inside; or a retry loop between `getConnection()` and `close()`.

**Observation.** Pool acquisition timeouts on endpoints unrelated to the failing dependency.
The blast radius is wrong for the fault, which is the tell.

**Fix.** Retry above the transaction boundary. Pool sizing under this load is
connection-pool-sizing; the queueing arithmetic is littles-law-and-queueing.

## What to plot

| Series                                             | Healthy shape | Incident shape                                                        |
| -------------------------------------------------- | ------------- | --------------------------------------------------------------------- |
| attempts ÷ logical calls                           | ~1.0, flat    | climbs to `maxAttempts` and plateaus there                            |
| dependency inbound rps ÷ caller inbound rps        | constant      | rises while the dependency's success rate falls — the storm signature |
| retry budget rejections per second                 | 0             | > 0, which is the budget working; alert on it as a dependency signal  |
| p99 of the logical call vs p99 of a single attempt | roughly equal | logical ≈ attempts × attempt + Σ backoff; the retry is inside the SLA |
| duplicate business records per hour                | 0             | > 0 after any ambiguous-class retry that lacked an idempotency key    |

Instrument attempts as a **ratio to logical calls**, never as a raw counter. A counter of
retries rises with traffic and with failures identically, so it cannot distinguish growth
from an incident; the ratio can.

## Proving the policy before production

- **Configuration test, no network.** Assert `maxAttempts × per-attempt timeout + Σ backoff ≤
the caller's budget` for every declared policy, and assert that exactly one layer in the
  path has `maxAttempts > 1`.
- **Fault injection.** A proxy in front of the dependency (Testcontainers with a latency or
  connection-cut toxic) driven to a fixed failure rate. Assert the dependency's observed
  request count stays within the budget multiplier — that is the amplification bound made
  falsifiable.
- **Duplicate detection.** Run the ambiguous path deliberately: inject a timeout _after_ the
  server has committed, then assert exactly one business record exists. This is the test that
  catches a missing idempotency key, and it fails loudly on the shape that costs money.
