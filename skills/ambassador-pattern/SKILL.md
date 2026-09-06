---
name: ambassador-pattern
description: >
  Choose or review a local outbound proxy when discovery or routing changes require client
  releases, a canary or shadow needs routing outside the app, or retries overlap across app,
  proxy and mesh. Define the listener, policy ownership, deadlines and failure behavior.
  Covers shard-map consumption and experiment routing, not shard algorithms
  (sharding-and-partitioning), container lifecycle (sidecar-pattern), or output normalization
  (adapter-sidecar-pattern).
---

# Ambassador Pattern

## Purpose and boundary

An ambassador mediates the application's outbound calls through a local peer process.
The app can delegate topology and transport policy, but still owns business intent and
observes latency, errors and deadlines. This skill covers that delegation, not ingress
gateways or the Ambassador-branded product. Pod mechanics belong to `sidecar-pattern`.

Policy can change independently of application code **if** the selected proxy supports
the required configuration updates. Hot reload, proxy replacement and a pod rollout have
different restart consequences; name the actual update mechanism before promising no restart.

## Workflow

1. **Establish the evidence.** Obtain the outbound call path, protocols on both hops,
   proxy/mesh and client versions, effective routes and retry settings, deadline semantics,
   upstream operation contracts, replica count and relevant latency/load limits. For a
   diagnosis, request correlated app/proxy/upstream traces, attempt counts and queue metrics.
   Configuration shows intent; runtime counters and fault tests show behavior. If evidence
   is missing, name the gap and proceed only with conditional options, not deployable settings
   or a claimed root cause.
   For Java client or deadline changes, apply the compatibility checks in
   [Failure and policy composition](references/failure-and-policy-composition.md#java-client-compatibility).
2. **Choose what moves.** Inventory discovery, shard maps, retries, timeouts, pools and TLS,
   then assign each responsibility explicitly; the inventory is not an automatic migration
   list. Keep business authorization and operation identity in the application. Prefer an
   existing mesh when it supports the required protocol and policy; document a concrete gap
   before adding another proxy and specify which layer owns each overlapping function.
3. **Define the local contract.** State explicit loopback versus transparent interception,
   listener/port, protocol, upstream selection and TLS termination points. A dedicated TCP
   listener can select an upstream without parsing HTTP. Routing by path or `Host`/`:authority`
   requires visible HTTP; TLS pass-through cannot inspect those fields. Allowlist destinations
   and define missing/forged routing-key behavior. Locality alone does not authenticate callers.
4. **Check cost and failure semantics.** Compare the maintained client-library baseline with
   independent policy rollout and operational ownership. Measure added latency under representative
   concurrency and payloads; no service-count or millisecond threshold alone decides adoption.
   For policy migration, configuration or incidents, read
   [Failure and policy composition](references/failure-and-policy-composition.md).
5. **Validate the selected route.** For shards, canaries, A/B or mirroring, read
   [Routing and experiments](references/routing-and-experiments.md). Before shipping, exercise
   the real proxy version's attempt bounds, deadline expiry, failure and config rollback in an
   isolated environment. Report unexecuted checks explicitly.

## Decision rules

- Use an ambassador when independent topology/policy changes or language coverage justify
  the extra process and it can implement the upstream protocol correctly. A missing SDK is
  not proof that a generic proxy can replace its authentication or protocol semantics.
- Prefer a client library when policy changes with business code and a maintained client
  already meets the requirements. Keep decisions requiring unavailable application state in
  the application, or define a trusted metadata contract before delegating them.
- Prefer one retry owner and bound **total attempts, including the original**, across all
  layers. Three attempts at each of two layers can yield nine upstream attempts; three retries
  at each can yield sixteen. A bounded retry policy permits duplicates but guarantees neither
  delivery nor exactly-once execution. Require idempotent semantics and replayable requests;
  a deduplication header alone is not evidence of server-side deduplication.
- Preserve the caller's remaining deadline across the hop, including queues and backoff;
  a static route timeout can be an additional ceiling, not a replacement for the caller budget.
- Specify failure behavior per fault: proxy unavailable, route absent, discovery stale and
  upstream failing. Bypass is possible only with a designed alternate path; do not silently
  bypass mandatory authentication, TLS or destination restrictions to improve availability.
- Prefer validated, observable hot reload for frequent routing changes when supported.
  Controlled rollouts can suit rare changes. Both need config-version visibility, convergence
  checks and rollback; config acceptance is not proof that a route serves traffic correctly.

## Minimum deliverable

For a small review, provide the decision or finding, evidence and consequence, proposed
adjustment and the check that would confirm or refute it. For a design/configuration change,
also record the local/upstream contract, policy owners, attempt/deadline bounds and failure/
rollback behavior. Separate observed facts from hypotheses; do not label a plausible proxy
bottleneck a confirmed cause without measurements from both sides of the hop.

When evaluating this skill or rehearsing difficult decisions, use
[Validation cases](references/validation-cases.md). These are agent behavior cases, separate
from tests of a deployed proxy.
