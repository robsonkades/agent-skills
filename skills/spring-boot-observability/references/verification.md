# Verification by observable contract

Use the smallest test that can distinguish the reported defect. Prefer the application's
existing test: a plain registry mock cannot prove Boot wiring, and a synchronous invocation
cannot prove `@Async` propagation. Keep sampling and backend ingestion separate from local
span creation.

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
