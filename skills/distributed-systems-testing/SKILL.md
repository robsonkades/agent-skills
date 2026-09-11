---
name: distributed-systems-testing
description: >
  Testing the failure behaviour a distributed system claims: injecting latency, errors,
  partitions and process death; verifying that timeouts, retries, breakers and fallbacks do
  what their configuration says; checking idempotency against duplicate delivery; and running
  a controlled experiment in production rather than a chaos tool. Use when resilience
  configuration exists but has never been exercised, when a timeout or retry budget is being
  chosen, when an incident was caused by a dependency being slow rather than down, when a
  consumer is assumed idempotent, when a rollout is protected by a probe nobody has failed on
  purpose, or when chaos engineering is proposed without a hypothesis. Does not cover the
  in-process test pyramid and architecture rules (architecture-testing), thread-level race
  testing (concurrency-testing), throughput and saturation measurement (load-testing), or the
  remedies themselves (retries-and-backoff, circuit-breakers, timeouts-and-deadlines).
---

# Distributed Systems Testing

## Purpose

Make the system's failure behaviour something that has been observed rather than configured.
Timeouts, retry budgets, circuit breakers, fallbacks, idempotency keys and readiness probes
are all claims; until each has been exercised against the failure it exists for, the system's
resilience is a set of YAML values that have never executed.

Happy-path tests against a fast dependency and healthy-system load tests leave failure
behaviour unchecked: a slow dependency, a duplicate after a broker reconnect, or a node that
vanishes mid-transaction. Extend existing tests where they can expose the relevant contract.

The two failures this exists to prevent: resilience settings that provably do nothing —
a retry budget exhausted by its first attempt, a breaker that never records the failures it
was meant to count; and chaos experiments run without a
hypothesis or a blast-radius limit, which produce an incident rather than a finding.

## Workflow

Reuse the accepted fault model, outcome contract, prior checks and environment authority before
asking for gaps that change the experiment. Name the effect and observation boundary, permitted
intermediate states, caller deadline and recovery/cleanup bounds; a timeout is not proof that
remote work stopped or that nothing committed. Existing counters or fixture queries can be
sufficient evidence without new production instrumentation.

1. **Write the claim down first.** "A payment gateway timing out returns 503 within 2 s and
   does not double-charge." An untestable claim is a configuration you do not understand yet.
2. **Pick the cheapest level that can falsify it.** Most claims fall at the component level
   with one faulty dependency; very few need a whole environment.
3. **Select faults from the dependency contract and incident evidence.** Include slow,
   unavailable, duplicated, lost and partial outcomes where relevant; do not assume a
   universal frequency ranking or that connection refusal covers a blackhole.
4. **Assert the observable outcome**, not the mechanism: the status code, the elapsed time,
   the number of times the downstream was called, the number of rows written. Asserting that
   a breaker library was invoked tests the library.
5. **Assert the budget, not just the behaviour.** Retry counts and timeouts compose across
   hops; the property that matters is the total, and it is where retry storms come from.
6. **Use production only when the unresolved claim needs it and it is authorized** — expected
   outcome, blast radius, abort condition, tested fault removal and recovery checks. Keep existing
   scope and recovery deadlines; the skill does not authorize promotion or extend an incident.

Return the claim, chosen level and its limits, fault/control observations, invariant and timing
results, and cleanup/recovery state. Mark unexecuted cases and unresolved outcomes explicitly.

## The failure taxonomy to test against

Use this coverage menu according to the workload and failure model, not as a frequency ranking:

```text
SLOW              Dependency responds, eventually. Threads/connections
                  pile up behind it. Tests: does the timeout fire, is the
                  pool bounded, does the caller shed rather than queue?
                  (cascading-failures).

DUPLICATED        The same message or request arrives twice. Tests: is
                  the effect applied once (idempotency, delivery-semantics)?

PARTIAL           One call in a fan-out fails; one write of two succeeds.
                  Tests: are intermediate/final invariants preserved and
                  the declared recovery policy followed
                  (distributed-transactions-and-sagas)?

REORDERED         Messages arrive out of order across partitions.
                  Tests: does the consumer tolerate it, or silently
                  corrupt (message-ordering-and-partitioning)?

ERRORING          5xx, connection reset, malformed body. Tests: is the
                  classification right — retryable vs permanent?

DOWN              Connection refusal, unavailable endpoints or silent drops.
                  Distinguish fast errors from timeout-driven detection.

PARTITIONED       Both sides alive, cannot see each other. Tests: split
                  brain, duplicate leaders, lock expiry
                  (distributed-locks-and-leases, leader-election).

DEAD MID-FLIGHT   Process dies between the write and the acknowledgement.
                  Tests: is the work lost, duplicated, or recovered?
```

## Decision rules

```text
The claim is about how a response is classified or a policy decides
        → unit test the pure policy. No network needed, and every edge
          case is a one-line test (humble-objects-and-functional-core).

The claim is about the client's behaviour — timeout fires, retry count,
connection released
        → component test against a stub server that can delay, reset and
          return errors. This is the highest-value level and where most
          resilience claims belong.

The claim is about consumer idempotency
        → deliver the same message twice in a test and assert the effect
          once. This is cheap and almost never done.

The claim is about behaviour under a slow dependency at load
        → load test with latency injected into the dependency. Neither a
          plain load test nor a plain fault test finds this
          (load-testing, littles-law-and-queueing).

The claim is about deployed lifecycle behavior when a node or pod dies
        → use owned or authorized real components with a bounded failure
          and recovery fixture. A simulation can check modeled recovery
          logic, not actual shutdown/probe behavior (kubernetes-service-lifecycle).

The claim is about a partition between two stateful components
        → model the protocol where useful; test actual network/client
          behavior with an injector on the exercised paths between real
          instances. A stub or simulation does not validate those paths.

The proposal is "let us run chaos experiments"
        → require the hypothesis, the steady-state metric, the blast
          radius and the abort condition first. Without those it is an
          outage with better branding.

The fault or its invariant cannot be observed
        → establish a trustworthy observation before execution. Local
          fixture counters can suffice; operational monitoring needs
          belong to slo-and-alerting and metrics-and-cardinality.
```

## Rules

- **Include slow faults when held capacity or deadlines matter.** Fast refusal does not exercise
  a stalled response or blackhole. Select applicable timeout phases and verify their bounds;
  existing admission and cancellation controls may already contain the slowdown.
- **Assert timing, not only outcome.** "Returns an error" passes whether the timeout fired at
  2 s or at 60 s. The elapsed time is the assertion that matters.
- **Do not mock the dependency you are testing the failure of.** A mocked client returns the
  exception you told it to and proves nothing about connection handling, pool exhaustion or
  socket timeouts. Use a stub server that can genuinely hang and reset
  (`architecture-testing`).
- **Check effective retry and timeout budgets where the relevant hops compose.** Three
  layers making three total attempts each permit up to twenty-seven deepest calls; three
  retries plus the initial attempt at each layer permit sixty-four. This multiplication is
  a possible amplification bound, not a measured attempt count; clipping deadlines, retry
  predicates and admission can reduce it. Isolated single-service tests omit the composition
  (`retries-and-backoff`, `cascading-failures`).
- A circuit breaker's history usually spans multiple logical calls. Check its scope, window,
  minimum sample count, recorded outcomes and timeout/retry ordering. A caller's shorter
  deadline does not imply that the shared breaker can never open
  (`circuit-breakers`).
- **Idempotency is a claim about duplicates, so test with duplicates.** Send the same request
  or message twice, concurrently as well as sequentially, and assert one effect. Concurrent
  duplicates can expose a broken atomic claim or invariant that sequential ones miss (`idempotency`).
- Kill the process at the awkward moment — between the database write and the acknowledgement,
  between two writes, mid-batch. This is where at-least-once semantics stop being theoretical
  and where the outbox either works or does not.
- **Fault injection needs a controllable boundary.** A gateway interface, controlled server,
  proxy or platform hook can provide one. A static call may still be intercepted at its network
  boundary; introduce an application seam when it materially improves focused tests
  (`framework-coupling-and-independence`).
- Use controlled fault points and bounded execution for regression tests. Seeded property
  tests and deterministic simulations can run in CI; retain seeds, traces and failing inputs.
  A seed alone does not reproduce uncontrolled network or thread scheduling.
- Run experiments in production only with a hypothesis, a steady-state metric, a bounded blast
  radius and an abort condition — and only where the failure is already observable. Anything
  else is not an experiment.
- Turn a confirmed defect into a regression at the cheapest credible level where feasible.
  Record an unresolved hypothesis or accepted consequence honestly; neither requires an invented
  fix or a production rerun. Preserve a trace and owned follow-up when no reliable reproduction exists.

## References

Before implementing Java tests, inspect compiler/runtime and resolved test, client and resilience
libraries. The virtual-thread example requires Java 21; preserve lower targets using their
existing executors. No upgrade or dependency change is implied. Examples are partial fixture
shapes, not standalone suites. A passing run establishes only the exercised fault/interleaving.

- [Failure scenario audit](references/failure-scenarios.md) — read when checking missing coverage
  or defining the invariant and an assertion that would otherwise hide failure.
- [Techniques and controlled time](references/techniques.md) — read when selecting infrastructure,
  implementing concurrent duplicate tests, or controlling local time.

- [Injecting failure in a Java system](references/fault-injection.md) — the tooling ladder
  from a stub server through a TCP-level proxy to mesh and node-level faults; what each can
  and cannot produce; concrete test shapes for timeout, retry, breaker, duplicate delivery and
  mid-flight death; and asserting budgets across hops. Read when writing a specific failure
  test.
- [Experiments in a real environment](references/chaos-experiments.md) — turning a resilience
  claim into a hypothesis with a steady-state metric, choosing blast radius and abort
  conditions, the readiness checklist a system must pass before an experiment is worth running,
  game days, and what to do with a finding. Read before proposing or running chaos engineering.
