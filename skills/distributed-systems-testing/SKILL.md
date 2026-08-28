---
name: distributed-systems-testing
description: >
  Testing the failure behaviour a distributed system claims: injecting latency, errors,
  partitions and process death; verifying that timeouts, retries, breakers and fallbacks do
  what their configuration says; proving idempotency against duplicate delivery; and running
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

The gap this closes is specific. Functional tests exercise the happy path against a fast,
available dependency. Load tests exercise a healthy system at volume. Neither produces the
condition that actually causes outages: **a dependency that is slow rather than down**, a
duplicate delivered after a broker reconnect, a node that vanishes mid-transaction.

The two failures this exists to prevent: resilience settings that provably do nothing —
a retry that never fires because the timeout is longer than the client's, a breaker whose
threshold cannot be reached before the caller gives up; and chaos experiments run without a
hypothesis or a blast-radius limit, which produce an incident rather than a finding.

## Workflow

1. **Write the claim down first.** "A payment gateway timing out returns 503 within 2 s and
   does not double-charge." An untestable claim is a configuration you do not understand yet.
2. **Pick the cheapest level that can falsify it.** Most claims fall at the component level
   with one faulty dependency; very few need a whole environment.
3. **Inject the failure that actually happens.** Slow, not down. Duplicated, not lost.
   Partial, not total. Down is the easy case and the rare one.
4. **Assert the observable outcome**, not the mechanism: the status code, the elapsed time,
   the number of times the downstream was called, the number of rows written. Asserting that
   a breaker library was invoked tests the library.
5. **Assert the budget, not just the behaviour.** Retry counts and timeouts compose across
   hops; the property that matters is the total, and it is where retry storms come from.
6. **Promote to production only with a hypothesis and a limit** — expected outcome, blast
   radius, abort condition, and a way to stop.

## The failure taxonomy to test against

Ordered by how often each causes a real incident, which is roughly the inverse of how often
it is tested:

```text
SLOW              Dependency responds, eventually. Threads/connections
                  pile up behind it. Tests: does the timeout fire, is the
                  pool bounded, does the caller shed rather than queue?
                  ── the most common cause of cascading failure, and the
                     least tested (cascading-failures).

DUPLICATED        The same message or request arrives twice. Tests: is
                  the effect applied once (idempotency, delivery-semantics)?

PARTIAL           One call in a fan-out fails; one write of two succeeds.
                  Tests: is the outcome consistent, is compensation
                  triggered (distributed-transactions-and-sagas)?

REORDERED         Messages arrive out of order across partitions.
                  Tests: does the consumer tolerate it, or silently
                  corrupt (message-ordering-and-partitioning)?

ERRORING          5xx, connection reset, malformed body. Tests: is the
                  classification right — retryable vs permanent?

DOWN              Dependency refuses connections. The easy case: fails
                  fast, and every design handles it.

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

The claim is about the system surviving a node or pod dying
        → kill it in a real environment. No stub reproduces the
          combination of in-flight work, connection draining and probe
          timing (kubernetes-service-lifecycle).

The claim is about a partition between two stateful components
        → a network-level fault injector between real instances.
          Application-level stubs cannot produce a partition.

The proposal is "let us run chaos experiments"
        → require the hypothesis, the steady-state metric, the blast
          radius and the abort condition first. Without those it is an
          outage with better branding.

The system has no monitoring for the failure being injected
        → fix the observability first. An experiment you cannot observe
          produces no finding (slo-and-alerting, metrics-and-cardinality).
```

## Rules

- **Test slow before down.** A dependency returning in 30 s exhausts the caller's threads and
  connections and takes down healthy services; a dependency refusing connections fails fast
  and is usually survived. Every timeout in the system deserves one test that it actually
  fires.
- **Assert timing, not only outcome.** "Returns an error" passes whether the timeout fired at
  2 s or at 60 s. The elapsed time is the assertion that matters.
- **Do not mock the dependency you are testing the failure of.** A mocked client returns the
  exception you told it to and proves nothing about connection handling, pool exhaustion or
  socket timeouts. Use a stub server that can genuinely hang and reset
  (`architecture-testing`).
- **Retry and timeout budgets compose across hops and must be tested end to end.** Three
  services each retrying three times is twenty-seven downstream calls. This multiplication is
  the mechanism of most retry storms, and it is invisible in any single service's tests
  (`retries-and-backoff`, `cascading-failures`).
- A circuit breaker's configuration is testable as arithmetic before it is testable as
  behaviour: if the caller's timeout is shorter than the time needed to accumulate the
  breaker's failure threshold, the breaker can never open. Check that first
  (`circuit-breakers`).
- **Idempotency is a claim about duplicates, so test with duplicates.** Send the same request
  or message twice, concurrently as well as sequentially, and assert one effect. Concurrent
  duplicates find the missing unique constraint that sequential ones miss (`idempotency`).
- Kill the process at the awkward moment — between the database write and the acknowledgement,
  between two writes, mid-batch. This is where at-least-once semantics stop being theoretical
  and where the outbox either works or does not.
- **Fault injection needs a seam.** A gateway behind an interface, a proxy, or a service mesh
  can be made to fail; a static call buried in business logic cannot. Testability of failure
  is an argument for the adapter boundary, independent of portability
  (`framework-coupling-and-independence`).
- **Determinism beats realism for regression tests.** A test that injects a fixed fault at a
  fixed point and asserts a fixed outcome belongs in CI. Randomised experiments belong in a
  scheduled run against a real environment, where a failure is investigated rather than
  retried.
- Run experiments in production only with a hypothesis, a steady-state metric, a bounded blast
  radius and an abort condition — and only where the failure is already observable. Anything
  else is not an experiment.
- **Every finding becomes a regression test at the cheapest level that reproduces it.** The
  value of an experiment is the test it leaves behind, not the incident it simulated.

## References

- [Injecting failure in a Java system](references/fault-injection.md) — the tooling ladder
  from a stub server through a TCP-level proxy to mesh and node-level faults; what each can
  and cannot produce; concrete test shapes for timeout, retry, breaker, duplicate delivery and
  mid-flight death; and asserting budgets across hops. Read when writing a specific failure
  test.
- [Experiments in a real environment](references/chaos-experiments.md) — turning a resilience
  claim into a hypothesis with a steady-state metric, choosing blast radius and abort
  conditions, the readiness checklist a system must pass before an experiment is worth running,
  game days, and what to do with a finding. Read before proposing or running chaos engineering.
