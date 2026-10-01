---
name: api-gateway-and-bff
description: >-
  Design or review an API gateway or backend for frontend when client journeys need
  different representations, too many round trips, an entry policy, or explicit
  degradation. Decide whether a BFF is warranted; define edge responsibility,
  bounded composition, identity propagation and failure contracts while keeping
  domain invariants in their owning services. Excludes replica selection and
  framework security implementation.
---

# API Gateway and BFF

An edge is a contract with clients and services, not a place to collect every concern.
Use this skill to choose its responsibilities, review an existing composition, or
implement a justified slice. Retaining an adequate API and ingress is a valid outcome.
A BFF serves a client experience; its name does not authorize another deployable.

## Discover the constraint before the topology

Inspect a representative client journey, actual request/response contracts, consumer
versions, gateway routes/filters, backend entry points, deployment paths and ownership.
Collect the evidence that can change the choice:

- Which client requirements differ: payload, interaction sequence, bandwidth, offline
  behavior, release cadence, browser session or accessibility needs? A different UI
  framework alone does not establish a different backend contract.
- Which calls are sequential, which are independent, and what measured latency, bytes
  or client complexity needs to change? Count downstream calls as well as browser calls.
- Which service owns each business decision, object/tenant authorization and mutation?
  Include internal callers and direct access paths that bypass the gateway.
- Which policies already exist at CDN, ingress, gateway, mesh, client and service?
  Find effective authentication, header handling, timeouts, retries and admission limits.
- Who deploys, supports and evolves the edge? Can a client-specific change ship without
  coordinating unrelated clients? How long do old mobile or partner clients remain live?

For Java/Spring work, inspect toolchains, resolved Boot/Cloud/Framework/Security versions,
the actual HTTP clients and Servlet/reactive execution model before selecting APIs.
This architectural skill declares no universal Java or Spring baseline. Reference
mechanisms are version-qualified; adopting it never implies an upgrade or new dependency.

Separate found facts, agreed contracts and hypotheses. If journey evidence is absent,
propose the smallest useful trace or contract comparison; do not claim latency savings.
If partial responses, trust or ownership are unspecified, identify the consequential gap
and keep that choice conditional while completing independent analysis. Ask only what
repository evidence cannot settle. A local route repair need not reopen the whole design.

## Choose the owner and the smallest useful boundary

| Evidence                                                                          | Decision to consider                                                            | Cost or rejection condition                                                                           |
| --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Existing API fits all clients and current ingress meets entry policy              | Keep it; repair the specific gap                                                | Another hop or BFF has no established benefit                                                         |
| Shared routing, transport or admission policy is missing                          | Configure an existing gateway/ingress, or justify a gateway                     | Shared availability and configuration blast radius; avoid duplicating proven controls                 |
| A client journey needs different composition, representation or release ownership | BFF owned with that client experience; colocate initially if boundaries suffice | Extra operational responsibility and duplicated adaptation; split by observed needs, not device count |
| All clients need the same business-shaped operation                               | Improve the owning service facade                                               | Copying that operation into BFFs would split business authority                                       |
| A read needs durable projections, cross-service freshness or query recovery       | Separate the query decision from edge formatting                                | A BFF name does not establish consistency or projection ownership                                     |

A gateway and BFF may share a process, be separate, or be unnecessary. Decide using change
ownership, failure isolation, runtime compatibility and operational cost. A shared gateway
plus optional BFFs is one topology, not a required chain. Keep route configuration owned
and reviewable; unrestricted dynamic destinations can turn a gateway into an open proxy.

Write a compact responsibility matrix for the affected path: concern, authoritative owner,
enforcement location, bypass behavior and verification. Place reusable entry policy at the
agreed edge; client-specific shaping/composition at the BFF; domain rules, authoritative
state and object/tenant checks at the owning operation. Early rejection at the edge can
supplement those checks. It cannot make a bypassing caller safe by itself.

The BFF may map data, sequence presentation reads and own client-session state. It must
not become the only place that enforces stock reservation, credit limits or payment
authorization. Forward a business command to its owner; durable multi-step business
coordination needs an explicit application/process owner and recovery contract. Do not
implement it as a series of gateway filters.

For contract evolution, use `rpc-and-api-contracts` when needed; for coarse service
operations and DTO boundaries, use `remote-facade-and-dto`. Replica eligibility/selection
belongs to `load-balancing-and-routing`. Detailed fan-out mechanisms belong to
`scatter-gather`, and retry ownership/budgets to `retries-and-backoff`. These are optional
handoffs for the relevant decision, not prerequisites for every edge task.

When a composed read needs a projection, a freshness contract or query recovery, use
`cross-service-query-design` for that read-path decision; keep client representation and
edge failure behavior here. When the task changes trust boundaries, workload identity
or delegated authority, use `service-identity-and-trust` for that architecture; retain
the edge's enforcement and propagation contract below. Neither handoff is required for
an unrelated route or presentation change.

## Make composition and trust explicit

For each composed endpoint, identify mandatory and optional contributions, the consistency
meaning, maximum fan-out, response bytes and end-to-end deadline. Reserve time to authorize,
transform and send the answer. Bound downstream concurrency and queueing as well as wait
time; preserve existing sufficient limits. A timeout on each call does not bound all work
when calls run sequentially, retry or wait for a connection.

Specify what happens when a required contribution fails and what an optional absence means.
Do not replace unavailable data with an empty list, zero price or a business approval.
Expose missing/stale state in the contracted representation; distinguish authorization
denial from transient failure internally without leaking unauthorized existence externally.
Validate the client renderer against that contract, not just the BFF's HTTP status.
Cancellation should release local work/resources; it does not prove a remote effect stopped.

Authenticate the relevant caller at each trust boundary and identify what represents the
workload, end user and tenant. Relay a token only when its intended resource, scope and
delegation contract permit that receiver. An authenticated gateway, forwarded header or
valid signature alone does not authorize an operation. Strip client-supplied identity and
proxy headers at the appropriate untrusted boundary before setting trusted values; document
how the receiving service verifies their origin and rejects alternate paths. Never weaken
audience validation to make relay work. Session-cookie BFFs also need browser/CSRF controls;
CORS is not authorization.

When designing partial responses, an identity hop, cache policy or hostile-path tests, read
[composition and trust contracts](references/composition-and-trust.md). When implementing
with Spring, choosing Gateway WebFlux versus MVC, or reviewing TokenRelay, read
[Spring integration](references/spring-integration.md). Keep framework-specific security
wiring with the appropriate specialist; the existing `spring-security-for-apis` covers
Servlet APIs and does not cover WebFlux. Use `spring-http-clients` for outbound wiring.

## Deliver and verify the affected slice

For **design**, deliver the selected boundary or no-change, rejected viable alternative,
responsibility matrix, changed client/edge/service contract and the check that could
disprove the choice. For **review**, attach evidence and consequence to each finding;
do not require code changes to finish a requested review. For **implementation**, change
the route/controller, consumer behavior, downstream contract tests and operational settings
needed for the slice. Reuse the project's conventions and managed components.

Keep boundary DTOs deliberate; do not expose JPA entities or downstream exception details.
Avoid shared business-model libraries that force every client/BFF to release together.
Preserve old clients for the declared compatibility window. Name who changes each contract,
how routes are activated, and how traffic can return to the previous path without losing
session validity or duplicating commands. Shadow only side-effect-free traffic with an
approved data policy; ordinary traffic mirroring can repeat mutations.

Choose validation by the changed claim:

- **Representation:** exercise old/new consumers, missing versus empty contributions,
  required failure and optional degradation; verify both payload and client behavior.
- **Trust:** test forged user/tenant/proxy headers, wrong audience, cross-tenant object
  access, and direct service access. The receiving operation must enforce its policy.
- **Resource bounds:** stall a dependency or exhaust its pool, exceed fan-out/body limits,
  and disconnect a client. Observe attempts, in-flight work, cleanup and terminal results.
  Test cancellation effects rather than inferring them from a cancelled future.
- **Operations:** observe latency/error/completeness by route and client contract with
  bounded labels; separate dependency time, pool wait, edge work and response size. Keep
  credentials and personal payloads out of logs. A rise in partial responses can hide
  behind healthy HTTP success metrics. Compare representative client journeys before
  claiming an improvement; fewer client round trips alone is not a performance result.

Scale the output to the task. End with implemented or proposed changes, checks actually
run, failures and remaining evidence. Configuration inspection, a written scenario and a
deployed failure drill establish different things. Never report one as proof of another.
