---
name: spring-boot-web
description: >-
  Implement, document and diagnose Spring Boot 4 MVC and Servlet APIs when HTTP binding,
  validation, error responses, Tomcat capacity or consumer contracts need verification.
  Covers documentation strategy, complete springdoc OpenAPI descriptions, examples and UI.
  Excludes WebFlux, identity providers and database query design.
---

# Spring Boot Web

Own the Spring MVC/Servlet boundary of a Boot 4.x application: actual HTTP behavior,
faithful consumer documentation and bounded request resource use. Use for implementation,
documentation, diagnosis or review; a findings-only review does not authorize edits.
Keep a focused endpoint or documentation change within its existing application boundary.
For an authorized whole-service task, compose persistence, access policy and Boot operations
with their owners; this skill's specialization must not shrink that task to a disposable
controller demo. Do not turn a sound MVC application into WebFlux or implement an identity
provider to satisfy this skill. Use of WebClient alone does not identify the server stack.

Use **Java 25** as the authoring and example baseline. If the target project uses another
release, state the compatibility difference and respect its constraints unless migration
is authorized. A skill activation does not silently upgrade the application.

Use the official [Spring Boot documentation](https://docs.spring.io/spring-boot/) for the
resolved version as the starting authority for MVC auto-configuration and properties.
When the HTTP contract crosses security, also consult the matching
[Spring Security reference](https://docs.spring.io/spring-security/reference/); for persistence
behavior behind an endpoint, route to JPA expertise with the matching
[Spring Data JPA reference](https://docs.spring.io/spring-data/jpa/reference/jpa.html).
Do not transplant a rolling reference's APIs into a different project release.

## Establish the actual contract

Inspect only evidence that can change the decision:

1. Read the request, build/toolchain, resolved Boot/Framework/Jackson/Servlet/server versions,
   security configuration, documentation build, ADRs and existing tests. This skill targets
   **Boot 4.x only**; identifying Boot 3 is a compatibility boundary, not permission to upgrade it. Fixture versions are in
   [the fixture guide](references/verification.md); one tested pair does not prove all 4.x pairs.
2. Inspect controller mappings, inherited interfaces, JSON names/views/custom serializers,
   converters, validation, advice, filters, context path and ingress rules. Identify consumers
   and compatibility constraints. Distinguish explicit requirements, consistent conventions,
   isolated patterns and assumptions. Do not infer organization policy from one controller.
   When the user supplies an architectural reference, trace its HTTP-to-use-case flow and
   preserve the intended naming and mapping roles; see [inputs and outputs](references/mvc-contracts.md#inputs-and-outputs).
3. For failures, retain the sanitized request, response, trace and dispatch boundary; for
   capacity, inspect the active executor and measured wait/CPU/queue/pool behavior. A plausible
   cause is a hypothesis until evidence discriminates it from alternatives.
4. Separate established decisions from reversible assumptions and unresolved contract choices.
   Resolve repository evidence before asking; group only questions that change behavior, such
   as PATCH null semantics, trusted proxies, public error detail or consumer compatibility.
   Include the evidence and a conditional recommendation. Continue independent work while
   those answers are pending; do not invent access policies or commercial quotas.

For each material concern, apply what the contract needs, reuse an adequate existing control,
clarify a consequential unknown, defer work outside the request with a reason/revisit condition,
or omit a feature with no demonstrated need. Record only decisions useful to maintenance.
For example, inspect a partner API's consumers and gateway policy before proposing a limiter;
ask which contractual quota applies only if that information is still missing. An internal
field-error correction normally reuses the current advice, tests and documentation pipeline.

For a new business API, establish its consumer flow before choosing a teaching fixture:
which operations are needed, which records must survive restart, which invariants span
replicas, who may read or mutate, and how consumers traverse a growing collection. Treat
business registrations as durable unless the user explicitly requests disposable data.
Choose an access policy from the intended actors; missing identity configuration is an
unresolved dependency, not permission to expose mutations publicly. Preserve intentionally
public operations when that is the agreed contract. Read the
[service acceptance guidance](references/verification.md#acceptance-for-a-complete-api)
for whole-service implementation; use only affected checks for a narrow endpoint change.

Preserve package structure, naming and adequate representations. Use single-constructor
or bean-method parameter injection in new code, without `@Autowired`. Register a component
once. Add a `WebMvcConfigurer` for an extension; adding `@EnableWebMvc` takes over MVC
configuration and requires accounting for Boot behavior that no longer applies.
Inspect the resolved Jackson generation and extension APIs; do not transplant Jackson 2
configuration or Boot 3 test imports into a Boot 4 project by resemblance.

Prefer `ResponseEntity<ConcreteDto>` for new or changed REST controller methods, including
`ResponseEntity<Void>` for a bodyless 204 and a concrete response DTO for pages. Make status
and headers explicit; avoid raw/wildcard response types. This convention belongs at the HTTP
boundary, not services or repositories. Preserve specialized streaming signatures and
framework override types where their contracts require them.

Start with Boot's MVC configuration, ordinary request/response DTOs and Jakarta validation.
If standard MVC Problem Details satisfy the consumer, use `spring.mvc.problemdetails.enabled=true`;
add `ResponseEntityExceptionHandler` overrides only for an actual representation requirement,
such as a field-violation extension. Reuse the project's error policy when adequate. An example
is evidence for its stated contract, not a checklist of infrastructure to copy: a plain public
endpoint does not need a synthetic token issuer, a generic field-name translator or a new body
buffering layer. Custom code needs a concrete contract that the existing facilities cannot meet.
Keep shared errors and sanitized unexpected failures in a global advice, such as a
`GlobalExceptionHandler`; introduce local or narrowly scoped handlers only for controller/module
semantics that differ. Preserve the common response contract and verify handler precedence;
see [error ownership](references/mvc-contracts.md#global-and-specific-exception-handlers).
When business failures share code/context, give them a small typed base contract and retain
the relevant identifier in specific exceptions. Keep Spring/HTTP mapping in the API layer;
shared handling must distinguish missing resources, conflicts and unexpected defects.

## Make the HTTP boundary explicit

| Decision             | Choose using these conditions                                                                                                                                                                                            | Verify the actual boundary                                                                                                                                           |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Mappings and binding | Match method/path, content types, query/header/cookie semantics and conversion. Preserve an established versioning scheme; neither URL versioning nor a verb choice follows from style alone.                            | Missing body/parameter, malformed JSON, conversion failure, unsupported media type and unacceptable response type.                                                   |
| Public DTOs          | Separate accepted data from entity/internal state. Choose create, replacement and patch contracts deliberately; do not let writable IDs, ownership or server fields slip through generic binding.                        | JSON names, token types/coercion, dates/precision/enums, unknown-property policy, optional/nested values and read/write exposure with the real mapper.               |
| Validation           | Transport shape belongs at MVC; domain invariants must also hold for non-HTTP callers. Inspect argument versus method validation and the role of class-level `@Validated`.                                               | Both `MethodArgumentNotValidException` and `HandlerMethodValidationException` where applicable, global errors and multiple violations for one field.                 |
| Error ownership      | Controller advice handles MVC paths, not every failure before dispatch. Locate security, container, filter and async errors separately. Preserve an established error envelope or intentionally implement ProblemDetail. | Status/media type/body at the origin; never leak stack traces, rejected secrets or internal SQL. Aggregate duplicate field errors without a duplicate-key exception. |
| Creation and reads   | Use public response DTOs, correct success status and Location when the contract supplies one. Preserve absent/null/default semantics and caching/conditional requests if present.                                        | Create then follow Location behind the intended context/proxy; no body for 204; check headers and serialized output.                                                 |
| Pagination/filtering | Bound page size and sort fields, use a stable ordering and explicit public representation. A framework Page's incidental JSON is not automatically the consumer contract.                                                | Empty/last pages, invalid bounds and stable tie ordering; hand query cardinality to persistence expertise.                                                           |
| Pipeline extension   | Filter for request/response wrapping and pre-dispatch work; interceptor for handler-aware concerns; resolver/converter for binding; advice for controller-wide handling.                                                 | Ordering, error/async dispatch, ownership and cleanup. Authentication belongs in the security chain, not an interceptor.                                             |

Read [MVC behavior and tests](references/mvc-contracts.md) for binding, semantic validation,
errors, security integration, bounded pagination, conditional HTTP requests, streaming,
uploads or test selection. Separate protocol semantics from resource-naming preferences;
do not turn every business action into CRUD or equate HTTP JSON with all REST constraints.
A uniqueness precheck is not a concurrency guarantee: coordinate a database constraint and map only its known conflict;
do not translate every integrity exception into HTTP 409.

For a new externally callable API, establish request limits; for an existing API, inspect
and preserve adequate controls. Bound JSON before binding: body bytes, parser depth/
token sizes and DTO constraints are different controls. Form/multipart limits do not cap
JSON bodies. Read [request bounds](references/request-bounds.md) for layer selection,
unknown-length bodies and adversarial checks. Validation error paths must use the public
input names, including nested JSON properties and header/query aliases; see the MVC reference.

For an OpenAPI delivery where many operations share an established 400/500 contract, reusable response components
can avoid duplicate declarations. Prefer correct springdoc inference or existing annotations;
use a global customizer when a real cross-group policy needs it. Apply it only to
owned operations, preserve operation-specific responses/examples, and verify default plus
grouped documents. Register referenced error schemas explicitly; do not depend on one
controller annotation making a shared schema reachable. Keep unexpected failures observable
through the project's safe logging/tracing policy while returning sanitized 500 responses.

## Deliver the consumer contract through the chosen documentation

Identify the authoritative contract and existing publication pipeline before adding tooling.
For a new API, changed consumers or a documentation-tool decision, read
[contract ownership and delivery](references/contract-delivery.md). Choose maintained OpenAPI,
code-generated OpenAPI, test-produced REST Docs or the existing usage guide from actual consumer
needs. OpenAPI descriptions, interactive UI and a usage guide are different deliverables.
Preserve an adequate existing choice for a narrow change; no new dependency is required simply
because a controller changed.

When OpenAPI/springdoc is selected or already owns generation, read
[springdoc/OpenAPI](references/springdoc-openapi.md). Document **all in-scope operations and
public properties, including optional and nested fields**, with meaningful semantics and
usable examples. Apply the same coverage obligation to an agreed REST Docs/guide delivery;
each approach proves only its exercised contracts. Applicable features depend on the API,
not whether a specification marks a field mandatory.

Essential decisions remain these:

- Inventoried path/method/media-type variants and public input/output properties define
  coverage. An annotation count, green parser or attractive UI cannot establish 100%.
- Required parameter, required body, required property, non-null, non-empty and a runtime
  default are different contracts. Create and PATCH often require different schemas.
- `@Schema` describes; it does not validate, hide serialized data or enforce access.
  Security annotations describe authentication requirements; they do not secure routes.
- Documented responses must match controller, advice **and filter** behavior. Include success,
  applicable errors and headers, without inventing a body for 204 or a universal error shape.
- For OpenAPI, generate/validate every published group and its examples against the chosen
  dialect and HTTP behavior; exercise Swagger UI when supplied. For REST Docs, execute the
  documenting tests and render the assembled guide, checking optional/variant coverage.
  Record limitations; an unexercised contract is not verified by an attractive publication.

Read [schemas and examples](references/schemas-and-examples.md) when matching OpenAPI schemas
to DTOs, PATCH, polymorphism, multipart or examples. Read
[Swagger UI and publication](references/swagger-ui.md) when configuring UI, groups,
security, external exposure, branding, proxy URLs or generation in CI. These references
separate format, generator, runtime and rendering limitations.

## Capacity follows workload and resource ownership

Read [capacity and lifecycle](references/capacity-and-lifecycle.md) for Tomcat, pools,
virtual threads, timeouts, HTTP/2, compression, quotas, overload or async request changes.
Reuse adequate gateway enforcement; rate limits bound arrivals, concurrency limits bound
in-flight work, and reactive backpressure requires a supporting pipeline. Select from the
resource and consumer policy, not a generic requirement to add Redis or WebFlux.

- Blocking I/O can justify virtual threads on a compatible JDK; CPU saturation needs bounded
  CPU work and capacity evidence. Virtual threads add neither database nor CPU capacity.
- Verify the executor actually in use. Boot's Tomcat `threads.max` and `min-spare` settings
  do not control virtual workers when virtual threads are enabled.
- Separate TCP connections, HTTP/2 streams, in-flight operations, executor queues, request
  admission and downstream pools. Do not build a virtual-thread pool to cap concurrency.
- Bound waits and work with a coherent deadline and cancellation policy. Connection,
  keep-alive, async, acquisition, query and lock timeouts are different controls.
- Keep resource ownership through completion, timeout and disconnect; request thread exit
  alone does not prove that downstream work stopped.

Do not recommend a pool size, timeout or compression setting as universally optimal.
Keep an adequate setup when no measured bottleneck or violated contract supports a change.

## Verification, output and stop condition

Use the smallest test that crosses the relevant boundary: unit tests for pure mapping,
MVC slice for conversion/validation/advice, application context for composition, and a real
server for container/network/filter integration. Boot 4 examples must use available test
modules and APIs; `@MockBean`/`@SpyBean` were removed, with Framework `@MockitoBean` and
`@MockitoSpyBean` available for appropriate bean overrides. Mock identity does not test JWT
validation. Test transactions do not roll back writes made by another server thread.

For a worked comparison of runtime behavior and generated documentation, load
[the fixture guide](references/verification.md) and copy
[the HTTP/OpenAPI fixture](assets/contract-fixture/) to an isolated temporary directory.
Read only the relevant controller/model/test first. Its extra Unicode constraint and schema
customizers serve explicit contracts; most controller tasks do not need them. The fixture is
public and demonstrates no durable storage, authentication or exact HTTP byte limit. It is
an HTTP/documentation mechanism fixture, not a complete business-service template. Apply the conditional
security/body-boundary guidance to the actual project when required; do not claim omitted
boundaries, arbitrary applications or browser interaction were verified by its tests.

Deliver changed behavior and consumer examples with targeted check results for implementation;
for diagnosis/review, deliver prioritized evidence, competing explanations, corrections and
the next discriminating check. For documentation, include the chosen contract/guide artifacts,
affected operation/property inventory, example validation and publication/access evidence.
Report UI results only when UI is supplied. Implement in the order contract decision,
DTO/controller integration, shared policy integration, documenting tests, then generation
and publication verification; reuse the existing build and tests. For extensive work, keep
progress and material decisions in the project's established format; use an ADR for a durable
architectural choice, not an annotation correction. Separate executed checks, source-supported
conclusions and pending runtime claims.

Finish when the requested contract is implemented or findings are substantiated, relevant
checks pass, scope is respected and limitations are explicit. If a server, dependency or UI
runner is unavailable, complete static work, state exactly which claim remains unverified
and give the command or fixture needed to resolve it. Do not fabricate execution evidence.

## Composition

If discovery establishes a WebFlux server, confirm the active stack and resolved Boot/Framework
versions, then hand off to an available WebFlux specialist with the request contract, ingress
limits, codec configuration and observed failure. Expect a reactive-stack decision and relevant
project tests. If no specialist is available, use the matching official
[Boot reactive](https://docs.spring.io/spring-boot/reference/web/reactive.html) and
[Framework WebFlux](https://docs.spring.io/spring-framework/reference/web/webflux.html)
references with the project's reactive tests; state any remaining evidence gap. Do not adapt
Servlet filters, request-body advice or MVC exception hooks to the reactive pipeline by analogy.

For Boot composition/version/property questions use `spring-boot`, passing resolved versions,
the active configuration and observed condition report; expect a compatible wiring decision.
For authorization/filter policies use `spring-security-for-apis`, passing routes, credential
transport, origins and actual 401/403 bodies; expect a tested chain and browser policy.
For persistence use `spring-boot-jpa`, passing the use-case transaction, query shape and HTTP
consistency contract; expect persistence behavior verified at its own boundary.

For public compatibility choices use `rpc-and-api-contracts` or `remote-facade-and-dto`;
for capacity budgets use `connection-pool-sizing` and `thread-sizing-and-virtual-threads`.
Pass measured workload, replica/resource limits and required outcomes. If a specialist is
unavailable, preserve the relevant guard here, make the unresolved decision explicit and
continue Web work that does not depend on it. These are optional handoffs, not prerequisites
for every controller.
