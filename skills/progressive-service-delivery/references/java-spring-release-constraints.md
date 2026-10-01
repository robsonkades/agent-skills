# Java/Spring release constraints

Read when Java runtime behavior, Spring startup/shutdown or mixed consumers changes a
release's exposure and recovery contract. This is a diagnostic/planning reference with no
executable code. Spring-specific statements below were checked against Boot 3.5 documentation
(served as 3.5.16 on 2026-09-30); they do not mandate that version or apply automatically to
another release line. Pin the project's actual patch, dependencies and container image.

## Identify what the deployed artifact can do

Read Maven/Gradle toolchains and compiler release, the resolved dependency graph, packaged
artifact and runtime image. Inventory flags, profiles, serializers, generated clients and
database migration runners that differ between stable and candidate. A compiler setting
does not show what an image contains, and a source-compatible DTO edit does not prove wire
compatibility with another service.

A feature disabled at the request seam does not disable a migration runner, startup bean,
message listener or scheduled job automatically. Establish which effects begin on context
creation and which begin only after business activation. If deployment already starts the
hazardous work, the exposure limit must cover those paths before traffic switching.

For mixed Java consumers, obtain representative payloads and actual decoder configurations:
an HTTP 200 or successful JSON parse can conceal a changed default, missing enum handling
or altered business meaning. Include generated-client and retained-event versions that can
reach the deployment, plus the old artifact if binary rollback is proposed. Let the API
and schema owners determine permitted pairs and adapters; this release plan consumes their
evidence without assuming that all readers upgrade together.

## Ready is a prerequisite, not a promotion verdict

For Boot 3.5, Actuator readiness/liveness groups expose application availability. These
groups do not add dependency health checks by default. A successful probe on a separate
management context can coexist with a broken application connector, so validate the serving
path as well. See the versioned [Actuator documentation](https://docs.spring.io/spring-boot/3.5/reference/actuator/endpoints.html#actuator.endpoints.kubernetes-probes).

Readiness alone does not show that critical behavior was exercised or that the candidate
can sustain the next exposure. Record first-request latency, class loading/JIT and cache
warm-up under the intended CPU/memory limits, connection-pool behavior and workload. Compare
candidate and control at interpretable lifecycle stages. A declared settling window can
separate warm-up from steady-state analysis, but keep startup errors and latency in a
separate acceptance gate: excluding them silently hides customer impact.

Preserve the existing server model and executor choices; adopting virtual threads or a new
JDK is a different change with its own evidence. If runtime/library changes are part of the
authorized release, identify them as treatment variables rather than attributing every
regression to business code.

## Capacity, routing and termination remain independent

Derive candidate capacity from admitted workload and headroom, including skew and retries.
A small candidate with a large route weight can overload while idle stable replicas appear
healthy; autoscaling can also change replica fractions mid-observation. Confirm actual
traffic share and per-instance load after each step.

Kubernetes Deployment completion means its replica rollout meets the controller's criteria;
it does not evaluate business outcomes. A progress deadline reports stalled progress and
does not itself roll back. Use these [Deployment semantics](https://kubernetes.io/docs/concepts/workloads/controllers/deployment/#deployment-status)
as lifecycle evidence, not a release-success signal. Delegate probe, surge and shutdown
mechanics to the existing lifecycle owner instead of making this skill a second runbook.

If using Argo without a traffic manager, canary weight is approximated through integer
replica counts. Its [canary documentation](https://argoproj.github.io/argo-rollouts/features/canary/)
distinguishes this from explicit traffic management. Neither a desired weight nor a replica
ratio proves the observed fraction of requests, users or expensive operations.

Boot 3.5 enables graceful web shutdown by default and provides
`spring.lifecycle.timeout-per-shutdown-phase`; the setting is a per-phase budget, not an
end-to-end recovery objective. Embedded servers differ in how they reject new requests,
and persistent connections affect behavior. Consult the pinned [graceful shutdown documentation](https://docs.spring.io/spring-boot/3.5/reference/web/graceful-shutdown.html)
and verify the effective signal path and configuration.

Rehearse the release's actual route change with an in-flight request, queued work and a
message whose result is delayed. Observe whether work is admitted after containment,
whether interrupted work can retry safely, and whether the remaining fleet can absorb it.
Do not infer that graceful HTTP shutdown drains every executor, listener or scheduled task.
Expose these as requirements to their lifecycle owners; reuse existing proven mechanics.

## Recovery evidence to request

Ask the contract owner for the prior build's demonstrated behavior on state produced by the
candidate, supported rollback configuration and how to identify incomplete/unknown effects.
Keep business effect recovery separate from image replacement. An emitted event, database
write or external notification survives a redeploy unless its explicit recovery protocol
changes it. If the old image cannot interpret current state, keep writes contained and
select a compatible forward repair or the owner's tested restoration path.

For a representative check, record the exact artifacts and effective configuration, submit
one risky operation, contain the candidate while its outcome is delayed, and verify the
authoritative result before deciding to retry. Repeat against the supported recovery build
only in isolation with representative state. The expected outcome comes from the domain
contract, not from whether the rollout command exits successfully.

The checks described here are recipes, not executed service tests. Version-matched
documentation supports framework semantics; source inspection and isolated execution must
still establish how the target application uses them.
