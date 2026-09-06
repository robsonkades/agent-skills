# Routing, shards and experiments through an ambassador

## Shard-aware routing

The app issues a request that carries the shard key while delegating physical shard selection.
Illustrative request metadata, not executable proxy configuration:

```
GET /v1/accounts/AC-91823/balance          # key in the path
X-Shard-Key: AC-91823                      # or in a header, when the path is opaque
```

The ambassador extracts the key, applies the shard function, and forwards to the owner. Two
mechanical rules follow:

- **Prefer a key in visible request metadata** — path or trusted header. Body extraction
  requires protocol/schema-aware parsing and may require buffering; establish size limits,
  schema compatibility and measured cost before choosing it. Neither body nor headers are
  visible through TLS pass-through. Verify key authorization; a caller-supplied shard key
  must not let the caller select another tenant's data.
- **The shard function is not this skill's.** Whether it is modulo, a range map or a hash
  ring, and how it behaves when a node is added, is `consistent-hashing` and
  `sharding-and-partitioning`. The ambassador is where it is _evaluated_, not where it is
  designed.

Multi-key requests require an explicit contract. The app can still form a logical batch, but
an ordinary proxy cannot necessarily partition it by shard. A protocol-aware proxy or upstream
coordinator may do that; otherwise the app must split it or the API must reject cross-shard
batches. Name who owns partial failure and atomicity rather than assuming scatter/gather support.

### The resharding window

Moving a key from shard A to shard B has an interval in which both are plausible owners. In
that window:

- Routing alone guarantees **no execution ordering**, even within one shard: concurrent
  connections, streams and retries can reorder operations. Any ordering guarantee needs an
  upstream sequencing/consistency contract. During a move, an in-flight read can hit the old
  owner after a write hit the new one.
- Config distribution is not an atomic fleet-wide cutover. Mixed maps and in-flight requests
  require a migration protocol owned by the datastore: for example fenced ownership with
  forwarding, or quiescing and draining writes before a synchronized handoff. Forwarding or
  read-only mode alone does not prove data transfer, read consistency or stale-writer safety.
  Test stale-map requests and retries during cutover and rollback; do not design the shard
  migration protocol inside a routing change.
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
a user hashed into a broken variant can stay there after a weight change. Define and test an
explicit disable/override path that removes the broken variant, including persisted assignments.

Distinguish **variant assignment** from **host selection within that variant**. A backend
ring-hash policy alone does not make a weighted cluster split stable per subject. Name the
mechanism that selects the variant, its missing-key behavior, and whether app retries, proxy
retries or failover can change it. Test the same subjects across multiple pods and new client
requests, then during reweighting and rollback. Per-request route stability alone does not
establish per-subject stability across an experiment.

## Shadow (mirrored) traffic

For a shadow experiment, **prevent production side effects** structurally, not by convention.
An intended production dual-write is a different migration contract, not harmless mirroring.

- the shadow deployment uses an isolated datastore, or verified read-only credentials;
  also constrain queues, caches, object stores and other mutable systems;
- the primary does not wait for the mirror response; disable shadow retries by default and
  verify effective behavior in the selected proxy. Bound mirror buffering, concurrency and
  timeouts, with drops under saturation, so asynchronous work cannot exhaust primary resources;
- outbound calls made _by_ the shadow are themselves stubbed or blocked, or your mirror sends
  duplicate payments to a third party;
- mirrored requests are labelled (a header) so downstream logs and metrics can exclude them.

At mirror fraction f, one shadow attempt adds approximately f times the eligible request count;
100% mirroring doubles that count, not necessarily CPU or downstream load. Fan-out and retries
can amplify it. Ramp against measured headroom, test a stalled shadow, and block external
side effects such as payments and email. Confirm copied payloads and credentials are allowed
in the shadow environment. Response comparison requires an explicit capture mechanism;
many proxies discard mirror responses. Compare offline rather than adding a latency dependency.

## Making a split observable

"The config says 10%" is not evidence. What you must be able to query:

- **Logical request and upstream attempt counts by variant** over matching windows, with
  eligible requests as the split denominator. Reconcile retry, mirror, local rejection and
  telemetry semantics before attributing a discrepancy to lost traffic. A finite random sample
  need not equal the configured percentage exactly; state the observation window and tolerance.
- **Error rate and latency per variant**, never pooled. A canary at 5% moves an aggregate
  error rate by 5% of its own delta — invisible against normal noise. Compare the variants
  against each other, not the aggregate against yesterday. Percentile aggregation rules are
  `latency-statistics`.
- **Correlatable routing evidence.** Use access logs or traces with a request ID, selected
  route, attempt destination and local failure reason. A response header can help internal
  debugging, but is optional and may disclose topology; public responses can carry an opaque
  correlation ID. Route selection alone does not prove the selected upstream served the call.
- **The config version each ambassador is running.** Expose it through a bounded info metric,
  status endpoint or structured log and alert on fleet disagreement. Avoid an ever-growing label
  value on every traffic series; stale proxies holding old routes otherwise look like routing
  bugs in the current config.

An experiment with no metric that could show it failing has not been run — it has been
deployed.

## Source grounding

Checked 2026-09-05: [Envoy HTTP routing](https://www.envoyproxy.io/docs/envoy/latest/intro/arch_overview/http/http_routing)
documents cluster selection and per-request route stability;
[Envoy load balancers](https://www.envoyproxy.io/docs/envoy/latest/intro/arch_overview/upstream/load_balancing/load_balancers)
describes ring-hash host selection within a cluster. The distinction motivates the variant
assignment tests above. [Its mirroring example](https://www.envoyproxy.io/docs/envoy/latest/start/sandboxes/route-mirror)
demonstrates asynchronous duplication and ignored responses. These are moving development
docs, not proof of support in an unspecified proxy release. Verify the deployed version.
The ordering counterexample, mixed-map checks and isolation requirements above are engineering
reasoning and validation criteria, not claims that a particular migration has been tested.
