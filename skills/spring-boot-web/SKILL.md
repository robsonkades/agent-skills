---
name: spring-boot-web
description: >-
  Implement, document and diagnose Spring Boot 4 MVC and Servlet APIs when HTTP binding,
  validation, error responses, Tomcat capacity or complete springdoc OpenAPI contracts
  need verification. Covers optional fields, examples and Swagger UI consumption.
  Excludes WebFlux, identity providers and database query design.
---

# Spring Boot Web

Own the Spring MVC/Servlet boundary of a Boot 4.x application: actual HTTP behavior,
faithful consumer documentation and bounded request resource use. Use for implementation,
documentation, diagnosis or review; a findings-only review does not authorize edits.
Do not turn a sound MVC application into WebFlux, introduce persistence, or implement an
identity provider to satisfy this skill. Use of WebClient alone does not identify the server stack.

Use **Java 25** as the authoring and example baseline. If the target project uses another
release, state the compatibility difference and respect its constraints unless migration
is authorized. A skill activation does not silently upgrade the application.

## Establish the actual contract

Inspect only evidence that can change the decision:

1. Read the request, build/toolchain, resolved Boot/Framework/Jackson/Servlet/server versions,
   security configuration and existing tests. This skill targets **Boot 4.x only**; identifying
   Boot 3 is a compatibility boundary, not permission to upgrade it. Fixture versions are in
   [the fixture guide](references/verification.md); one tested pair does not prove all 4.x pairs.
2. Inspect controller mappings, inherited interfaces, JSON names/views/custom serializers,
   converters, validation, advice, filters, context path and ingress rules. Identify consumers
   and compatibility constraints. Distinguish explicit requirements, consistent conventions,
   isolated patterns and assumptions. Do not infer organization policy from one controller.
3. For failures, retain the sanitized request, response, trace and dispatch boundary; for
   capacity, inspect the active executor and measured wait/CPU/queue/pool behavior. A plausible
   cause is a hypothesis until evidence discriminates it from alternatives.
4. Resolve evidence already in the project before asking. Ask only when a missing contract
   changes behavior, such as PATCH null semantics, trusted proxies or public error details.
   Continue reversible local work independently and state consequential assumptions.

Preserve package structure, naming and adequate representations. Use single-constructor
or bean-method parameter injection in new code, without `@Autowired`. Register a component
once. Add a `WebMvcConfigurer` for an extension; adding `@EnableWebMvc` takes over MVC
configuration and requires accounting for Boot behavior that no longer applies.
Inspect the resolved Jackson generation and extension APIs; do not transplant Jackson 2
configuration or Boot 3 test imports into a Boot 4 project by resemblance.

## Make the HTTP boundary explicit

| Decision             | Choose using these conditions                                                                                                                                                                                            | Verify the actual boundary                                                                                                                                           |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Mappings and binding | Match method/path, content types, query/header/cookie semantics and conversion. Preserve an established versioning scheme; neither URL versioning nor a verb choice follows from style alone.                            | Missing body/parameter, malformed JSON, conversion failure, unsupported media type and unacceptable response type.                                                   |
| Public DTOs          | Separate accepted data from entity/internal state. Choose create, replacement and patch contracts deliberately; do not let writable IDs, ownership or server fields slip through generic binding.                        | JSON names, dates/precision/enums, unknown-property policy, optional/nested values and read/write exposure with the real mapper.                                     |
| Validation           | Transport shape belongs at MVC; domain invariants must also hold for non-HTTP callers. Inspect argument versus method validation and the role of class-level `@Validated`.                                               | Both `MethodArgumentNotValidException` and `HandlerMethodValidationException` where applicable, global errors and multiple violations for one field.                 |
| Error ownership      | Controller advice handles MVC paths, not every failure before dispatch. Locate security, container, filter and async errors separately. Preserve an established error envelope or intentionally implement ProblemDetail. | Status/media type/body at the origin; never leak stack traces, rejected secrets or internal SQL. Aggregate duplicate field errors without a duplicate-key exception. |
| Creation and reads   | Use public response DTOs, correct success status and Location when the contract supplies one. Preserve absent/null/default semantics and caching/conditional requests if present.                                        | Create then follow Location behind the intended context/proxy; no body for 204; check headers and serialized output.                                                 |
| Pagination/filtering | Bound page size and sort fields, use a stable ordering and explicit public representation. A framework Page's incidental JSON is not automatically the consumer contract.                                                | Empty/last pages, invalid bounds and stable tie ordering; hand query cardinality to persistence expertise.                                                           |
| Pipeline extension   | Filter for request/response wrapping and pre-dispatch work; interceptor for handler-aware concerns; resolver/converter for binding; advice for controller-wide handling.                                                 | Ordering, error/async dispatch, ownership and cleanup. Authentication belongs in the security chain, not an interceptor.                                             |

Read [MVC behavior and tests](references/mvc-contracts.md) for binding, validation, errors,
security integration, streaming, uploads or test selection. A uniqueness precheck is not
a concurrency guarantee: coordinate a database constraint and map only its known conflict;
do not translate every integrity exception into HTTP 409.

When the application defines common 400/500 contracts, implement the MVC error policy once
and publish reusable response components through a global customizer. Apply them only to
owned operations, preserve operation-specific responses/examples, and verify default plus
grouped documents. Register referenced error schemas explicitly; do not depend on one
controller annotation making a shared schema reachable. Keep unexpected failures observable
through the project's safe logging/tracing policy while returning sanitized 500 responses.

## Complete controller documentation is a deliverable

For every controller implementation or documentation task, read
[springdoc/OpenAPI](references/springdoc-openapi.md). Document **all in-scope operations
and all public properties, including optional and nested fields**, with meaningful
descriptions, types, constraints, presence/null/direction semantics and usable examples.
Use every applicable family of springdoc/Swagger/OpenAPI features; applicability depends
on the API contract, not whether the specification marks a field mandatory.

Essential decisions remain these:

- Inventoried path/method/media-type variants and public input/output properties define
  coverage. An annotation count, green parser or attractive UI cannot establish 100%.
- Required parameter, required body, required property, non-null, non-empty and a runtime
  default are different contracts. Create and PATCH often require different schemas.
- `@Schema` describes; it does not validate, hide serialized data or enforce access.
  Security annotations describe authentication requirements; they do not secure routes.
- Generated responses must match controller, advice **and filter** behavior. Include success,
  applicable errors and headers, without inventing a body for 204 or a universal error shape.
- Generate each published group, resolve references, verify examples against the declared
  dialect and HTTP behavior, and exercise Swagger UI as a consumer. Explicitly record
  limitations or inapplicable features; unresolved applicable items prevent a 100% claim.

Read [schemas and examples](references/schemas-and-examples.md) whenever defining DTO
documentation, PATCH, polymorphism, multipart or examples. Read
[Swagger UI and publication](references/swagger-ui.md) when configuring UI, groups,
security, external exposure, branding, proxy URLs or generation in CI. These references
separate format, generator, runtime and rendering limitations.

## Capacity follows workload and resource ownership

Read [capacity and lifecycle](references/capacity-and-lifecycle.md) for Tomcat, pools,
virtual threads, timeouts, HTTP/2, compression, overload or async request changes.

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

For an executable starting example, load [the fixture guide](references/verification.md)
and copy [the HTTP/OpenAPI fixture](assets/contract-fixture/) to an isolated temporary
directory. Its tests exercise actual HTTP and generated contracts, not arbitrary applications.
Do not claim its unexercised advanced families or browser checks passed.

Deliver changed behavior and consumer examples with targeted check results for implementation;
for diagnosis/review, deliver prioritized evidence, competing explanations, corrections and
the next discriminating check. For documentation, include generated artifacts, the operation/
property coverage inventory, applicable feature decisions, example validation and UI results.
Scale the report to the task; do not require an ADR or benchmark for an annotation correction.

Finish when the requested contract is implemented or findings are substantiated, relevant
checks pass, scope is respected and limitations are explicit. If a server, dependency or UI
runner is unavailable, complete static work, state exactly which claim remains unverified
and give the command or fixture needed to resolve it. Do not fabricate execution evidence.

## Composition

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
