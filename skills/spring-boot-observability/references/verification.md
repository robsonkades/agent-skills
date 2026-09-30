# Verification by observable contract

Use the smallest test that can distinguish the reported defect. Prefer the application's
existing test: a plain registry mock cannot prove Boot wiring, and a synchronous invocation
cannot prove `@Async` propagation. Keep sampling and backend ingestion separate from local
span creation.

## Locate the first unsupported boundary

For missing backend data, record the affected service, deployment, time window and a
safe reproducible request before changing configuration. Follow the existing path:

1. **Operation and local emission:** did the intended operation run and complete, and does
   its actual registry/SDK contain the expected timer or finished span? A successful HTTP
   response does not prove that an asynchronous business operation completed. Inspect
   observation predicates and meter filters as well as instrumentation ownership.
2. **Selection and export:** inspect effective sampling, exporter activation, destination,
   protocol and credential references, including deployment overrides. Protect secrets
   when capturing configuration. An in-memory exporter bypasses the network exporter;
   local success does not validate transport, authentication or export queue behavior.
3. **Ingestion and query:** if that boundary is accessible, inspect the existing collector's
   receive/process/export evidence and the backend's resource identity, filters and query
   window. Respect batching/scrape intervals and ingestion delay when selecting a bounded
   observation window. Do not add a new collector to diagnose the existing one.

Report an observation separately from its cause: "local span finished" supports emission,
not "the collector dropped it." When access is missing, request the smallest artifact
from the next boundary, state what result would confirm or refute the hypothesis, and
continue local checks. Do not mark ingestion fixed without evidence at that boundary.
The [OpenTelemetry collector troubleshooting guide](https://opentelemetry.io/docs/collector/troubleshooting/)
describes per-hop evidence; apply it only when that collector is actually in the path.
Use the equivalent native diagnostics for another existing provider.

An unsampled trace is not proof that a request never ran. Likewise, full sampling does
not prove durable delivery: exporter or collector failure can still lose records.
Ordinary operational diagnosis can reuse sampled traces plus aggregate metrics; a
requirement to preserve every committed business change needs a separately specified
durability, atomicity, access and retention contract. Escalate that requirement to its
application owner without installing audit storage as an observability fix. See
[OpenTelemetry sampling](https://opentelemetry.io/docs/concepts/sampling/) for selection
semantics and trade-offs; the target project's approved policy remains authoritative.

## Verify the changed application boundary

For new service wiring, exercise one successful request and each materially different
failure path through real HTTP. Check status/outcome and count/duration meters under varied
identifiers, management access and unhealthy probe behavior. Capture logs to check useful
error context and absence of fake secrets. If tracing is part of the selected stack,
assert parentage and emitted attributes; do not require an exporter to prove local metrics.
For an existing service fix, select only the checks that distinguish the changed contract.

For a missing parent across an **existing** executor boundary, the optional
[propagation probe](../assets/observation-fixture/README.md) shows the relevant assertion:
real inbound HTTP -> proxied async bean -> managed `RestClient` -> loopback receiver.
It uses `@SpringBootTest`, Boot's executor and client builder, and an in-memory exporter.
There is no custom business span: automatic HTTP instrumentation measures this operation.

The probe checks parent/trace IDs through success and downstream failure, HTTP outcome
metrics, reuse of the actual worker without a lingering observation, and bounded meter
dimensions under varied inputs and a fake secret header. It does not launch a series of
alternative applications or create a security policy just to collect more assertions.
Read its prerequisites before running a temporary copy.

When adapting the assertions:

- Check both trace ID and parent span ID. A non-null span or registry is insufficient.
  Include a negative control: in an isolated copy, disable propagation and confirm the
  parent assertion fails. Do not weaken it because both requests still return HTTP 200.
- Wait with a bounded deadline for server observations to finish. Receiving a response
  can precede publication of its final span or timer. Compare counts against the test's
  initial count when a cached Boot context is shared.
- Inspect the reused worker without decorating the inspection itself; a new capture
  could conceal a leak. Test success and failure. A custom executor or decorator needs
  its own equivalent test, including restoration of any prior worker context.
- Keep high sampling and a synchronous in-memory span processor local to tests. These
  choices make assertions deterministic; they do not recommend a production export policy.

On Boot 4.1.1, `spring-boot-micrometer-tracing-test` supplies `@AutoConfigureTracing` and is
included by `spring-boot-starter-opentelemetry-test`. Use it when the full Boot test needs
tracing components normally disabled for tests. A sliced test
with that annotation supplies a no-op tracer, which cannot establish real export. Metrics
have separate `@AutoConfigureMetrics` support. Inspect the target version rather than
copying the older combined `@AutoConfigureObservability` annotation. See
[Boot test observability support](https://docs.spring.io/spring-boot/reference/testing/spring-boot-applications.html#testing.spring-boot-applications.tracing).

For a management or health change, use the concrete cases in
[management and probes](management-and-probes.md) against the application's actual policy.
The bundled probe intentionally has no security chain, user store or exposed management
surface. It is not a service template and does not validate deployment authorization.

A pass establishes only the exercised local SDK and metric behavior. Backend ingestion,
log/MDC fields, production sampling/overhead, histogram export, custom executors, virtual
threads, Reactor and separate management ports need evidence at their own boundary. State
which checks ran and what remains unknown; compilation is not behavioral verification,
and neither is evidence that an agent makes better decisions with this skill.

## Leave a usable operational handoff

Extend the project's existing service documentation rather than creating a parallel
observability handbook. Include only what changed and what its consumer needs:

- Signal name, unit, bounded dimensions and outcome/completion semantics; show a sanitized
  emitted example and identify whether it measures HTTP acceptance, an attempt or the
  complete business operation. Coordinate name/key changes with existing dashboards and
  alerts rather than treating meter names as private implementation details.
- The existing owner of instrumentation, destination and required environment/secret
  references; management paths, intended identities and probe membership when changed.
- A reproducible safe request or command and the expected local evidence. Distinguish a
  backend query validated against that provider from a proposed, unexecuted one.
  Explain the next check when a signal is absent and how to revert temporary
  diagnostic logging or sampling changes.
- Checks actually executed, failure cases exercised and remaining boundaries with their
  verification owner. A local fix may finish without deployment access; its report must
  preserve that limitation rather than claim production readiness.

A fix to one log correlation field may need only its configuration diff, captured output
and a runbook line. A new service's operational wiring needs the signal and access contract
above. Neither case justifies inventing an SLO, retention rule or new backend.
