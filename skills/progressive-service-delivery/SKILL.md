---
name: progressive-service-delivery
description: >-
  Plan and verify gradual service releases when cohorts, mixed versions and persisted effects affect promotion or recovery. Choose valid cohort signals and explicit promote, pause or abort criteria.
---

# Progressive Service Delivery

## Purpose

Decide how much of a service release to expose, what evidence permits the next increase,
and how to contain harm if the release fails. A healthy fleet average can hide a failing
tenant or region; a quiet canary can mean that nobody exercised the changed behavior.

Use for release strategy, cohort selection, activation, promotion gates and release
recovery. Preserve a simple rolling release when its compatibility and exposure controls
meet the requirement. This skill does not require Kubernetes, a mesh, a feature-flag vendor
or a progressive-delivery controller.

Architectural transformation belongs to `architecture-refactoring-paths`; component and
shared-library release boundaries to `component-and-release-boundaries`. Consume the
compatibility decisions from `rpc-and-api-contracts`, `schema-evolution-and-compatibility`
and, for relational DDL, `online-database-schema-migrations`. Use
`kubernetes-service-lifecycle` for pod readiness and draining mechanisms. These are optional
handoffs when their decisions are unresolved, not prerequisites for every release review.

## Discover the release contract

Inspect the release diff, immutable artifact identifiers, effective deployment and routing
configuration, flag evaluation, consumer inventory, retained messages, jobs, shared data
and the existing operating policy. Reuse reliable evidence; distinguish a required policy
from a customary rollout percentage. Ask only for missing information that changes exposure
or recovery, and continue independent review while that answer is missing.

Record the decisions that matter:

- **Change and reach:** code, configuration, runtime, schema or behavior; HTTP callers,
  event consumers, scheduled work and administrative entry points that can exercise it.
- **Versions:** deployed, candidate and recovery builds; supported clients and readers;
  Maven/Gradle toolchains, compiler release, resolved Boot/Framework/serializer versions,
  CI and runtime images. Compiling on a JDK does not establish the deployed runtime contract.
- **Affected population:** assignment unit, region, operation, tenant class and workload;
  where shared databases, queues or dependencies let candidate harm reach the control.
- **Decision evidence:** authoritative business outcome, SLIs, error-budget policy,
  attribution, collection delay, sample sufficiency and the window in which harm can emerge.
- **Recovery:** who can stop admission, which prior build can process current state,
  remaining old-version capacity, and the contract owner's treatment of persisted effects.

The architectural guidance has no mandatory Java baseline. The examples are planning
pseudocode and synthetic arithmetic, not executable Java or production measurements.
Read [Java/Spring release constraints](references/java-spring-release-constraints.md) when
runtime readiness, mixed Java consumers or Spring lifecycle behavior affects the release.
Inspect the target versions before using its conditional guidance; do not upgrade a project
or add a platform merely to follow this skill.

## Keep three controls separate

**Deployment** makes an artifact runnable. **Routing** decides which instance or worker
gets work. **Activation** decides whether that work uses the changed behavior. A flag off
can still leave startup hooks, migrations or consumers running; a candidate replica count
does not establish its request share; routing zero new requests does not cancel admitted work.

Choose a stable assignment unit when behavior must remain consistent across an operation,
session or aggregate. A tenant cohort can preserve one business context but concentrate
traffic in a few large tenants. A per-request split can mix versions within one workflow.
Record actual observed exposure separately from intended exposure, including retries and
long-lived connections. For asynchronous work, establish assignment and completion at the
work-item level; a percentage of consumers is not a percentage of messages or effects.

Treat cohort membership as routing context, not authorization. Derive trusted identity at
the existing boundary; do not let an untrusted header select a privileged path. Preserve
business authorization and tenant isolation in both branches. For flags, record the owner,
configuration revision, outage/default behavior, propagation delay and removal condition.
Keep decisions at a small application seam instead of scattering provider SDK calls through
domain logic. Test both permitted branches and the supported off/default state.

## Choose an exposure strategy

| Strategy                            | Appropriate when                                                                                                | Evidence or constraint that changes the choice                                                                                                                                                  |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Existing rolling replacement        | Old/new instances can coexist; ordinary availability and recovery controls meet the risk                        | Replacement order gives no fixed traffic fraction. Add analysis or bounded admission if the accepted harm cannot tolerate ordinary rollout speed.                                               |
| Canary by workload or population    | A bounded cohort exercises the risky behavior and results can be attributed before expansion                    | Sparse or unrepresentative work makes promotion inconclusive; shared effects can defeat containment. Change the cohort or use a rehearsed cutover if isolation cannot be established.           |
| Blue/green environments             | A candidate can be prepared and checked beside the active environment, with capacity for switching and recovery | Switching all traffic can create immediate fleet exposure; shared storage and old connections remain. Add staged routing if needed and prove the old environment can process post-switch state. |
| Feature activation after deployment | Behavior can be selected independently of artifact placement and the inactive path is supported                 | It does not contain migrations, startup failures or effects outside the flag. Use it with a deployment strategy and retire transitional branches deliberately.                                  |

Do not prescribe a percentage ladder or wait duration without deriving it from workload,
failure impact, detection delay and recovery capacity. Include work admitted while detecting
the fault and stopping admission, plus already admitted work that can still cause effects.
If that exposure exceeds the remaining harm allowance, change admission or containment before
starting. If a failure can escape through a shared dependency, reduce or isolate the hazardous
work itself; merely shrinking the canary may not bound the damage. A rehearsed maintenance
window can be appropriate when coexistence is impossible and the service contract permits
interruption.

## Make promotion a decision with sufficient evidence

Before exposure, specify the candidate/control identities, cohort boundaries, metric
queries, denominators, window, collection lag, minimum coverage, harm limits and decision
owner. Reuse existing SLI contracts; `slo-and-alerting` and `latency-statistics` can resolve
population or statistical questions. Read [Cohort evidence and gates](references/cohort-evidence-and-gates.md)
when budgeting exposure during containment delay, designing queries, comparing regions/tenants,
handling sparse traffic, or implementing an automated decision.

Use these states, mapped explicitly onto the actual release tool:

- **Promote one step:** required contracts and recovery checks pass; all required cohorts
  have sufficient, fresh evidence within their absolute harm limits and permitted regression
  against a comparable control. Capacity and recovery remain viable at the next exposure.
- **Pause as inconclusive:** necessary data is missing, stale, insufficient, contaminated
  or has not covered the relevant business cycle. Freeze expansion, preserve evidence and
  set an owner and bounded investigation time. Holding exposure is appropriate only while
  its risk remains acceptable; otherwise contain it through the abort path.
- **Abort exposure:** a credible severe correctness/security failure or a predefined harm
  limit requires containment. Stop admitting affected work using the verified mechanism,
  then select recovery from the compatibility/effect contract. Do not wait for a large
  sample to respond to a confirmed duplicate charge or tenant isolation failure.

Missing metrics, zero denominators, query errors and NaN are not evidence of success.
An automatic timer must not turn an unresolved pause into promotion. Specify what happens
if monitoring or the controller fails and who can perform containment. A manual override
records the reason and residual risk; it does not relabel unknown evidence as passing.

## Order exposure around compatibility and effects

Use a small release matrix of **caller/producer, callee/reader, stored representation,
behavior/flag state, evidence and recovery target**. Include supported old consumers,
retained/replayed work and the prior build only when it is an intended recovery target.
Test semantic values and effects, not just successful decoding. An additive field can still
change meaning, and routing cohorts do not isolate a shared database.

Obtain the allowed sequence from the relevant contract owners. Expose new output or values
only after every reachable required reader can handle them or a tested adapter isolates
them. If a migration or authority transfer is unresolved, return that dependency and its
owner; do not invent DDL, dual-write or compensation algorithms in the rollout plan.

Recovery has distinct actions:

1. Stop new exposure and observe actual admission stopping, including background paths.
2. Drain, complete, cancel or quarantine in-flight work under its existing contract.
3. Restore routing or a binary only if the target understands current state, has required
   configuration/credentials and can absorb the returning workload. Check it again after
   candidate writes; a successful pre-release rollback rehearsal is not that proof.
4. Reconcile already persisted or external effects with their owner. Forward repair,
   compensation or restore may be required even after traffic returns. Identify unknown
   outcomes before retrying; a timeout does not prove that no effect occurred.

For example, turning off a feature that emitted a new enum value cannot make an old event
consumer understand messages already retained. Keep a compatible reader or repair forward
according to the schema owner's plan. Do not replay a timed-out payment merely because
the previous image is running; use the operation's established outcome and idempotency
contract. `distributed-transactions-and-sagas` and `idempotency` own those mechanisms.

## Execute and verify the requested work

For a review, return the unsafe decision, evidence, consequence and smallest correction.
For a plan, deliver the selected strategy, release matrix, first cohort, ordered exposure
steps, gates, recovery target/effect limits and owners. A narrow question may need only the
decision and its decisive missing evidence.

When implementation is requested, change the repository's existing deployment/flag seam,
metric queries, decision wiring and operational recovery instructions. Preserve its build
and platform conventions. Do not stop at a generic runbook or introduce a controller when
the current mechanism can enforce the contract. Production actions still follow the task's
authorization and existing release policy.

Validate the claims affected by the change in an isolated environment:

- Run mixed-version consumer/producer and representative state tests, including the chosen
  recovery build after candidate effects. Report unresolved pairs rather than marking the
  whole matrix green.
- Check cohort assignment and actual distribution through the real routing/flag path;
  include spoofed cohort input, retries, long-lived work and a poorly represented cohort
  when relevant. A negative result must show the unauthorized branch or effect is rejected.
- Feed the decision mechanism healthy, degraded, empty, stale and insufficient samples;
  check next-step promotion, pause and abort separately. Include a healthy global average
  with a failing candidate region/tenant class and monitoring loss during a rollout.
- Rehearse containment and recovery with delayed work and persistent effects. Observe
  admission, outcomes and elapsed convergence; a manifest diff or controller status alone
  cannot establish user availability, semantic compatibility or repair.

Record artifact/configuration versions, command, environment, workload and observed result.
Distinguish executed checks from walkthroughs and production observations from hypotheses.
The absence of observed failures supports only the populations and sensitivity measured;
unavailable telemetry permits a conditional recommendation, not a verified safe release.
