# Experiments in a Real Environment

Deterministic fault tests prove the failures you thought of. An experiment in a real
environment finds the ones you did not — but only if it is run as an experiment, with a
hypothesis and a limit, rather than as an act of vandalism with a dashboard open.

## What makes it an experiment rather than an outage

Four things, and the absence of any one of them turns the exercise into an incident you caused:

1. **A steady-state metric** — a measurement of normal that you can watch in real time.
   Business-level beats technical: orders per minute, successful logins, payments cleared. CPU
   is not steady state; it does not tell you whether users are being served
   (`slo-and-alerting`).
2. **A hypothesis, stated before** — "orders per minute stays within 5% of baseline when one
   payment provider is given 3 s of latency."
3. **A bounded blast radius** — one instance, one route, one percent of traffic, one
   availability zone. Chosen so that being wrong is survivable.
4. **An abort condition and a way to stop** — the metric threshold that ends the run, and a
   single action that removes the fault. Tested _before_ the experiment, because it will be
   needed under stress.

Without a hypothesis there is no finding, only an anecdote. Without a steady-state metric
there is nothing to compare against. Without a blast radius the experiment is the incident.
Without an abort you are committed to the outcome.

## Readiness: do not run one yet if any of these is false

An experiment against an unprepared system produces an outage and no information. Check first:

- [ ] **The steady-state metric exists and is trustworthy**, with a known baseline and a
      dashboard someone can read during the run.
- [ ] **The failure being injected is observable** — if a dependency slows down, a graph
      shows it. Injecting an invisible fault yields an unattributable symptom
      (`metrics-and-cardinality`, `distributed-tracing-design`).
- [ ] **Alerting works.** If the experiment triggers no alert while degrading the steady
      state, that is the finding, and it should be fixed before continuing.
- [ ] **The deterministic tests pass.** Do not discover in production what a stub server would
      have found in CI. Chaos is for the unknown unknowns, and it is an expensive way to learn
      that a timeout is unset.
- [ ] **Someone can stop it**, and the stop has been rehearsed.
- [ ] **The team knows it is happening**, and the on-call is in the room. An unannounced
      experiment that pages someone burns the goodwill the practice depends on.

The most common honest answer at this point is "our observability is not good enough yet",
and that is a better outcome than the experiment would have been.

## Where to run it

```text
Staging with production-like traffic
        + Safe; can be aggressive; good for rehearsing the method.
        − Data, scale and topology differ, so the interesting couplings
          are frequently absent. Finds fewer real problems than expected.

Production, small blast radius
        + Where the real couplings, real data volumes and real traffic
          mix live. This is where findings come from.
        − Requires everything in the readiness checklist.

Production, wide
        Only for a mature practice, and normally only for a rehearsed
        scenario such as a zone evacuation.
```

Staging is the right place to rehearse _the procedure_; production at 1% is the right place to
learn about _the system_. A programme that never leaves staging tends to conclude that the
system is resilient, because staging lacks the shared pools, noisy neighbours and data skew
that cause real failures.

## A worked experiment

**Claim being tested:** checkout survives a slow payment provider.

```text
Hypothesis     Checkout completion rate stays within 5% of the 1-hour
               baseline when the payment provider returns in 3 s
               instead of 200 ms.

Steady state   Completed checkouts per minute (business metric),
               5-minute trailing average.

Blast radius   10% of checkout traffic, one region, 15 minutes.

Injection      Mesh rule adding 3 s of latency to the provider route
               for the selected traffic slice.

Abort          Completion rate drops more than 10% below baseline,
               OR error rate exceeds 2%, OR anyone calls it.

Rollback       Remove the mesh rule — one command, rehearsed.
```

Outcomes worth anticipating, because each is a different finding:

- **Hypothesis holds.** The claim is now evidence rather than configuration. Record it and
  re-run after changes to the checkout path.
- **Completion rate falls, checkout still returns.** The fallback works but is not free —
  usually a queue filling somewhere. Find it, bound it, and add a deterministic test.
- **Unrelated endpoints degrade.** A shared thread or connection pool. This is the highest
  value finding this method produces, and it is essentially undiscoverable any other way
  (`concurrency-limiting-and-bulkheads`).
- **Instances are removed from the load balancer.** The readiness probe shares the exhausted
  pool, so healthy pods are marked unready and the survivors receive more traffic. The
  self-inflicted outage (`kubernetes-service-lifecycle`).

## Game days

A game day is the same discipline applied to the humans: the failure is injected, and the
response — detection, diagnosis, mitigation, communication — is what is being tested.

The findings are usually about the system's legibility rather than its resilience: an alert
that fires with no runbook, a dashboard nobody can find, a metric that is technically correct
and operationally useless, a runbook whose first step is a command that no longer exists.

Two rules keep them useful:

- **Do not tell the responders which fault was injected.** Detection and diagnosis are the
  point; announcing the answer tests only the fix.
- **Do tell them a game day is happening.** Covert exercises produce real stress responses and
  destroy trust in the practice.

## What to do with a finding

The experiment is not the deliverable. The deliverable is:

1. **A fix**, prioritised like any other defect.
2. **A deterministic regression test at the cheapest level that reproduces it** — usually a
   stub-server test that takes milliseconds (`references/fault-injection.md`). Without this,
   the same finding recurs after the next refactor.
3. **A re-run of the experiment** to confirm the hypothesis now holds.

A chaos programme that generates findings and no regression tests will rediscover the same
problems annually. **The tests are the compounding asset; the experiments are how you find out
which tests to write.**

## When not to do this

- **The system has no observability for the injected fault.** Fix that first; it is more
  valuable than any experiment.
- **Known unmitigated single points of failure exist.** Breaking a thing you already know is
  fragile teaches nothing. Fix the known problems, then look for unknown ones.
- **There is no capacity to act on findings.** Generating a list nobody will address converts
  the practice into theatre and burns the organisational credit needed to run it later.
- **The question is throughput, not failure.** That is a load test (`load-testing`,
  `capacity-planning`).
- **The question is a specific, known failure mode.** Write the deterministic test. Chaos
  engineering is for discovery, and it is an expensive substitute for a test you could have
  written.
