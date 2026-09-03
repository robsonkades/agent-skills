# Routing, shards and experiments through an ambassador

## Shard-aware routing

The app issues a request that carries the shard key and knows nothing else:

```
GET /v1/accounts/AC-91823/balance          # key in the path
X-Shard-Key: AC-91823                      # or in a header, when the path is opaque
```

The ambassador extracts the key, applies the shard function, and forwards to the owner. Two
mechanical rules follow:

- **Put the key where a proxy can see it cheaply** — request line or header. A key that only
  exists inside a JSON body forces the proxy to buffer and parse every request, which adds
  latency proportional to body size and couples the routing layer to a payload schema that no
  one versions.
- **The shard function is not this skill's.** Whether it is modulo, a range map or a hash
  ring, and how it behaves when a node is added, is `consistent-hashing` and
  `sharding-and-partitioning`. The ambassador is where it is _evaluated_, not where it is
  designed.

What the app gives up by delegating: it can no longer batch a multi-key request itself, since
two keys may live on different shards. Either the ambassador scatters and gathers — and then
partial failure becomes its problem, with a policy you must state — or the app splits the
request, and it is not shard-unaware after all. Decide which, explicitly.

### The resharding window

Moving a key from shard A to shard B has an interval in which both are plausible owners. In
that window:

- Ordering is **per shard**, and a key mid-move has no single ordering at all: an in-flight
  read can hit the old owner after a write hit the new one.
- A routing table pushed to N ambassadors converges at N different moments. There is no
  instant at which the fleet agrees, so the migration must be correct while both maps are in
  use — usually by making the old owner forward, or by making the moved range read-only for
  the duration.
- Verify convergence by asserting the config version each ambassador reports, not by waiting a
  fixed number of seconds.

## Canary and A/B

| Split by                                           | Selects                                      | Property                                                                            | Use when                                                   |
| -------------------------------------------------- | -------------------------------------------- | ----------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| Percentage of requests                             | A weighted random or hash-of-request choice  | Not stable per user: consecutive requests can differ                                | Infrastructure canaries where per-user consistency is moot |
| Hash of a trusted subject key plus experiment salt | The same subject usually maps to one variant | Stable for a fixed algorithm/config; weight or algorithm changes can remap subjects | Product A/B tests after privacy and trust-boundary review  |
| Explicit header (`x-variant`)                      | Whoever sets the header                      | Deterministic, and abusable — never trust it from outside the perimeter             | Internal testing, dogfooding, debug routes                 |

Two things go wrong reliably. First, a canary weighted at 5% of _requests_ is not 5% of
_users_, and a single heavy client can be most of the canary traffic — check the distribution
of requests per caller before believing the number. Second, sticky splits become sticky bugs:
a user hashed into a broken variant stays there until the weight changes.

## Shadow (mirrored) traffic

The rule with no exceptions: **mirrored requests must not be able to mutate production
state**. Enforce it structurally, not by convention —

- the shadow deployment points at its own datastore, or at credentials with no write grant;
- the mirror is fire-and-forget: the response is discarded and never retried, and the primary
  response is never delayed waiting for it;
- outbound calls made _by_ the shadow are themselves stubbed or blocked, or your mirror sends
  duplicate payments to a third party;
- mirrored requests are labelled (a header) so downstream logs and metrics can exclude them.

Mirroring doubles the load on everything it touches, including shared infrastructure the
shadow talks to. Ramp it like real traffic. Comparison of the two responses belongs offline —
diffing in the request path makes the shadow a latency dependency of production.

## Making a split observable

"The config says 10%" is not evidence. What you must be able to query:

- **Request count by variant** over a window, from the ambassador's own metrics, plus the same
  count as seen by the upstream. A discrepancy means requests are dying between them.
- **Error rate and latency per variant**, never pooled. A canary at 5% moves an aggregate
  error rate by 5% of its own delta — invisible against normal noise. Compare the variants
  against each other, not the aggregate against yesterday. Percentile aggregation rules are
  `latency-statistics`.
- **The variant on the response.** Have the ambassador add a response header naming the
  variant, shard or upstream that served the request, and log it. Without it, a user's bug
  report cannot be attached to a variant.
- **The config version each ambassador is running.** Expose it through a bounded info metric,
  status endpoint or structured log and alert on fleet disagreement. Avoid an ever-growing label
  value on every traffic series; stale proxies holding old routes otherwise look like routing
  bugs in the current config.

An experiment with no metric that could show it failing has not been run — it has been
deployed.
