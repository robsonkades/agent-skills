# Experiments in a Real Environment

Deterministic fault tests exercise known claims in their fixture. A real-environment experiment
can expose additional couplings or validate operational recovery, within the tested conditions.
Choose it for an unresolved question, with a hypothesis and a limit.

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
- [ ] **Detection and abort coverage match the plan.** Verify alerts that should fire when
      their thresholds are crossed, or the declared manual/automated observation and stop path.
      Expected degradation below an alert threshold does not by itself prove an alert defect.
- [ ] **Relevant cheaper checks have addressed known prerequisites.** Do not use production
      to discover an unset timeout that a stub could expose. A real-environment recovery drill
      should target the remaining operational evidence, with known gaps recorded.
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

Use isolated environments to falsify known claims and rehearse the procedure. Production can
expose couplings absent there, but no fixed percentage is universally safe: shared pools and
dependencies can spread a small targeted fault. Preserve the authorized environment and scope;
this guidance does not itself authorize a production experiment.
Reuse authority already granted for the named target, actions and bounds; clarify only missing
or expanded scope. Record maximum duration, cleanup owner and an independent watchdog/stop path.
On success, failure or abort, verify injection removal, outstanding work and serving recovery;
removing a rule does not undo accepted effects or guarantee capacity has recovered.

## A worked experiment

**Claim being tested:** checkout survives a slow payment provider.

```text
Hypothesis     Checkout completion rate stays within 5% of the 1-hour
               baseline when the payment provider returns in 3 s
               instead of 200 ms.

Steady state   Completed checkouts per minute (business metric),
               5-minute trailing average.

Blast radius   10% of checkout traffic, one region, 15 minutes.

Injection      Mesh rule adding 2.8 s to the 200 ms provider baseline
               for the selected traffic slice.

Abort          Completion rate drops more than 10% below baseline,
               OR error rate exceeds 2%, OR anyone calls it.

Rollback       Remove the mesh rule — one command, rehearsed.
```

These numbers illustrate a plan, not recommended defaults. Validate the effective delay and
compare the affected cohort with a contemporaneous control, normalized by offered checkout rate.
Whole-service averages can hide failure in the 10% cohort; define cohort and global abort
thresholds plus a short-window signal, since a five-minute average can delay detection. Removing
the fault does not drain existing queues or undo writes: verify recovery and reconcile effects.

Outcomes worth anticipating, because each is a different finding:

- **Hypothesis holds.** Record support for the tested cohort, window and conditions; repeat
  relevant checks after changes to the path rather than claiming universal resilience.
- **Completion rate falls, checkout still returns.** Inspect response semantics, offered load,
  queueing and downstream outcomes; a returned response does not prove a valid fallback worked.
- **Unrelated endpoints degrade.** Investigate shared resources and correlated causes; verify
  the suspected thread/connection pool before choosing its control
  (`concurrency-limiting-and-bulkheads`).
- **Instances are removed from the load balancer.** Check the effective probe, routing decision
  and resource exposure. Shared-pool starvation is one hypothesis, not a conclusion from removal
  alone (`kubernetes-service-lifecycle`).

## Game days

A game day is the same discipline applied to the humans: the failure is injected, and the
response — detection, diagnosis, mitigation, communication — is what is being tested.

The findings are usually about the system's legibility rather than its resilience: an alert
that fires with no runbook, a dashboard nobody can find, a metric that is technically correct
and operationally useless, a runbook whose first step is a command that no longer exists.

Two rules keep them useful:

- Withhold the injected fault when independent detection/diagnosis is the agreed objective;
  disclose it for a walkthrough whose purpose is practicing a known recovery procedure.
- **Do tell them a game day is happening.** Covert exercises produce real stress responses and
  destroy trust in the practice.

## What to do with a finding

The experiment is not the deliverable. The deliverable is:

1. **The observed result and its limits**: violated invariant, unresolved hypothesis, or an
   accepted outcome. Do not manufacture a defect from expected behavior.
2. **A correction and focused regression for a confirmed defect**, where feasible at the
   cheapest credible level (`references/fault-injection.md`); otherwise retain the trace and
   an owned follow-up. Existing adequate controls can justify no change.
3. **Proportionate revalidation** after a correction. Reuse the authorized environment and
   bounds; a production rerun is not automatically required or authorized.

A chaos programme that generates findings and no regression tests will rediscover the same
problems annually. **The tests are the compounding asset; the experiments are how you find out
which tests to write.**

## When not to do this

- **The system has no observability for the injected fault.** Fix that first; it is more
  valuable than any experiment.
- **The proposed break adds no useful evidence about a known weakness.** Prefer correction or
  an isolated check. A bounded recovery drill can still be useful if recovery is the actual
  unresolved claim and the impact is authorized.
- **There is no capacity to act on findings.** Generating a list nobody will address converts
  the practice into theatre and burns the organisational credit needed to run it later.
- **The question is throughput, not failure.** That is a load test (`load-testing`,
  `capacity-planning`).
- **A narrow deterministic test can settle the question.** Use it; choose a real-environment
  drill only for the remaining implementation or operational evidence it can supply.
