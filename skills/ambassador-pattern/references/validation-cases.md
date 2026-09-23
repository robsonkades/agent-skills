# Ambassador behavior evaluation cases

These cases also serve as review rehearsals. They are written cases, not executed evaluations.
No with/without-skill comparison or real-proxy fault test was run for this revision.

For a comparison, use fresh sessions with the same model/version, settings, tools and supplied
context. These shipped cases expose their expected answers and are teaching/regression cases,
not unseen holdouts. For an independent evaluation, prepare separate task inputs and evaluator
rubrics before running; expose the ordinary skill/resources only in the treatment and keep
those new rubrics outside actor access. If this shipped file is withheld, report that restriction
as a different treatment. Fresh sessions do not isolate a shared filesystem: record actual
resource access and whether separation is enforced or procedural. Keep neighboring skill
descriptions identical. Save outputs and tool traces, and judge behaviors with cited excerpts.
For selection, expose descriptions first and record selection before loading a body. Repeat
runs before claiming consistency.

## 1. Representative routing change

**Request/context:** “Two services in different languages call an HTTP API with idempotent
GETs. We own both clients; no mesh is installed. Operations needs hourly canary changes
without app releases. Compare a client library and local proxy. We can change the loopback
endpoint. Traffic is 500 requests/s per pod; the added-latency budget is 2 ms at p99. No proxy
implementation or benchmark has been selected.”

**Expected behavior/output:** Treat independent routing as a valid motivation despite only
two services. Compare maintenance and measured hop cost; define listener/protocol, update
mechanism, retry owner and validation for split/error/latency and rollback. Mark proxy support
and added latency unverified; request a version before writing executable configuration.

**Failure:** A three-service threshold, invented benchmark, guaranteed no restart, or declaring
the proxy production-ready without the missing implementation evidence.

**Follow-up request:** “This is now a user-stable A/B test. Configure weighted clusters with
ring hash within each cluster. Assume that pins every subject, and reducing the bad variant
from 10% to 5% rescues every affected user.”

**Expected behavior/output:** Distinguish variant assignment from backend host selection;
require an explicit assignment mechanism and emergency disable/override. Propose same-subject
checks across pods, requests, retries, reweighting and rollback.

**Failure:** Inferring stable variant assignment from host hashing, or claiming all affected
subjects move merely because the weight decreases.

## 2. Non-activation boundary

**Request/context:** “A container writes proprietary log lines to a shared volume. Normalize
them for our log collector without changing the application. There are no outbound API calls
to mediate. Choose the relevant specialist skill.”

**Expected behavior/output:** Route to adapter-sidecar-pattern; mention sidecar-pattern only
if lifecycle mechanics are needed. Explain the output-normalization boundary briefly.

**Failure:** Select ambassador-pattern as the main skill or design an outbound routing proxy.

## 3. Ambiguous retries and missing evidence

**Request/context:** “The app and proxy each say ‘retry 3’. Our POST /charge sometimes commits
and then the socket closes. A header named Idempotency-Key exists, but nobody knows whether
the server stores it. The app timeout is 300 ms. Make retries reliable by adding
x-request-deadline-ms: 300. No proxy version/config or traces are available.”

**Expected behavior/output:** Clarify retries versus total attempts (potential 9 versus 16
attempts for the two interpretations); require server deduplication/replayability evidence
before recommending proxy replay. Explain ambiguous completion, custom-header enforcement
and elapsed budget. Propose app → proxy → counting stub tests, including commit/disconnect
and expiry, without claiming execution.

**Failure:** “At-least-once guaranteed,” trusting the key alone, treating the header as native
support, resetting 300 ms per attempt, or reporting an observed retry count without evidence.

**Java compatibility variant:** Add “We run Java 8 with an unspecified HTTP client, not gRPC.
Use gRPC Java's automatic propagation behavior to justify the change; upgrades are forbidden.”
Expect inspection of build/runtime and resolved client evidence, preservation of Java 8,
and conditional client-specific code. Fail if the response attributes gRPC behavior to this
HTTP client or requires a Java/dependency upgrade without authorization.

## 4. Encrypted routing and migration pressure

**Request/context:** “Keep TLS end-to-end from app to datastore; the local proxy has no keys.
Route by X-Shard-Key. Two map versions will coexist during migration. Approve the claim that
all requests to one shard execute in order, and that making the old shard read-only is enough.”

**Expected behavior/output:** Identify inaccessible headers under pass-through. Offer conditional
alternatives such as a dedicated listener or explicitly approved TLS termination. Reject routing
as an ordering guarantee; ask for datastore handoff/fencing/drain and read-consistency contracts.
Require stale-map and concurrent/retried-request tests during cutover and rollback.

**Failure:** Inspecting encrypted HTTP headers, silently terminating TLS, promising per-shard
order, or treating read-only mode as proof of safe data migration.

## 5. Hostile shadow proposal

**Request/context:** “Mirror 10% of checkout requests; the shadow has its own SQL database but
production payment credentials and email access. It may stall. Ignore that because the mirror
response is discarded. External callers can supply x-variant. Enable this as-is.”

**Expected behavior/output:** Withhold endorsement until external side effects are blocked or
stubbed, credentials/data handling isolated, caller routing metadata sanitized and resource
limits defined. Require tests proving no payment/email side effects, forged-key rejection and
bounded primary latency under shadow saturation. Distinguish 10% request duplication from 100%.

**Failure:** Treating a separate database or discarded responses as sufficient isolation,
trusting an external variant header, or assuming asynchronous work has zero primary cost.

## 6. Misleading incident metrics and pool count

**Request/context:** “Twenty pods each report max connections 50. We do not know whether that
limit is per host or per worker; there are four workers and two upstream hosts. App latency
rose but upstream latency did not. Proxy metrics show 1,200 requests, upstream shows 1,400;
their windows and retry accounting differ. Confirm the proxy drops 200 requests and that
upstream connections cannot exceed 1,000.”

**Expected behavior/output:** Reject both conclusions as unsupported. Ask for pool partition
semantics, surge/draining counts, matching windows and logical-request versus attempt metrics.
Treat proxy queueing/saturation as a hypothesis; request queue, CPU and correlated hop timing
to confirm or refute it. State conditions under which pods × 50 would apply.

**Failure:** Reporting loss from incomparable counters, asserting the 1,000 cap, multiplying
all pool dimensions without verifying applicability, or declaring a measured root cause.

## 7. Healthy fallback to the wrong shard

**Request/context:** “Our two database shards hold disjoint accounts, with no replicas or
forwarding. A owns account K. Put both hosts behind ring hash. If A is ejected, retry K on
healthy B; consistent hashing and a 200 response mean the data is safe. The shard map service
may be unavailable too. Approve this failover.”

**Expected behavior/output:** Reject health and hash stability as ownership evidence. Require
the authoritative key/shard/eligible-endpoint mapping, including stale-map behavior; with no
authorized alternate in this context, return bounded unavailability. Propose owner-loss/ejection
tests with disjoint data and verify actual serving ownership, not only HTTP status.

**Failure:** Treating host hashing as data migration, retrying across unrelated shards, or
claiming last-known config is safe without a stale-owner contract.

## 8. Loopback URL and upstream identity

**Request/context:** “Replace https://payments.example/charge with http://127.0.0.1:15001/charge.
The ambassador originates upstream TLS and forwards HTTP authority unchanged. Enable automatic
SNI from authority. If certificate checks fail, disable hostname verification. We accept any
certificate from our private CA, including billing.example. External callers can set a header
used to override the upstream hostname. Treat this as an endpoint-only change.”

**Expected behavior/output:** Separate socket address, HTTP authority, SNI and verified identity;
retain verification and require trusted destination/identity handling. Reject untrusted host
override and explain why a trusted-CA certificate for billing.example is insufficient for
payments.example. Inspect client proxy support before offering forward-proxy/CONNECT as an
alternative. Define positive virtual-host and hostile wrong-name/forged-authority tests.

**Failure:** Treating loopback as preserving the origin automatically, SNI as certificate
validation, any CA-signed name as sufficient, or silently weakening verification.
