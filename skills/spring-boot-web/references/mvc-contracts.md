# MVC behavior and test boundaries

Read when changing controllers, mapping, validation, serialization, pipeline extensions,
security integration or conditional request lifecycles. Keep the application's conventions
unless evidence identifies a broken contract. Boot auto-configuration plus a narrow
WebMvcConfigurer is the simple baseline; full MVC takeover needs a reason and tests for
converters, static resources and other previously supplied behavior.

## Inputs and outputs

### HTTP semantics before naming style

Use the business operation and consumer interaction to choose a method. GET/HEAD must not
request a state-changing business action; incidental logging is a different concern. PUT
expresses creation/replacement of the target representation, while POST can process a domain
command. DELETE's idempotence concerns the intended effect: a repeated deletion may return
404 after 204 without violating it. A PATCH contract needs its own partial-update rules and
retry analysis; neither PATCH nor POST becomes idempotent by annotation. Resource plurals,
URL version prefixes and response envelopes are project conventions, not universal HTTP rules.

For a long-running accepted operation, distinguish 202 from completed creation (201) or a
completed bodyless result (204). Document how the consumer learns completion/failure, such as
an authorized status resource, only when asynchronous processing is actually part of the
contract. Returning 202 does not supply durable scheduling or successful eventual completion.
When retry-safe commands need an idempotency key, agree its caller/tenant/operation scope,
payload-mismatch response and replay lifetime with the owner of the durable invariant. Test
concurrent retries and failure after commit/before response; a controller-local map cannot
establish the guarantee across replicas. Do not add that mechanism to every POST by default.

For reads with a justified cache contract, define representation variants, privacy, freshness
and validators. Test Cache-Control, Vary where relevant, and conditional GET/HEAD with bodyless
304; authorize access before a conditional response and prevent cross-tenant reuse. MVC ResponseEntity
supports ETag/last-modified handling, but its presence alone does not prove a cheaper database
read. `ShallowEtagHeaderFilter` computes from the completed response: it can save transfer,
not the work to produce that response, and does not implement write-side If-Match protection.

For lost-update prevention, an If-Match contract uses strong comparison and a failed
precondition normally yields 412. Coordinate the checked version and mutation atomically
at the persistence boundary; checking a fetched value then unconditionally saving still
races. Keep a different established version/conflict contract when it satisfies consumers.
Test two writers with the same version and the agreed missing-precondition behavior. These
HTTP checks do not replace transaction/isolation analysis owned by the persistence specialist.

### Binding and representations

Inspect `@RequestMapping` conditions and actual consumed/produced media types. Two methods
with the same path and verb but different headers or query conditions may be distinct MVC
handlers while OpenAPI can represent only one operation for that path/verb. Consolidate
the documented contract without losing variants, or explicitly record the representation
limit; do not delete a valid handler to make generation easier.

Keep MVC request binding annotations distinct from similarly named Swagger annotations.
Use explicit names for path/query parameters where needed and verify compiler parameter
metadata. Model query objects through their external names and conversion rules; do not
expose arbitrary persistence sort paths. Unsupported input media types typically differ
from unacceptable response media types; test both rather than relabeling every 4xx as 400.

Use JSON DTOs as a public boundary. Establish whether unknown properties fail or are ignored,
whether numeric precision survives consumers, how dates/timezones are represented, and how
custom enum codes serialize. A Java String is insufficient to document a decimal amount,
an identifier or a timestamp's meaning. Preserve custom mapper modules and naming policy;
adding a new ObjectMapper can bypass the intended Boot configuration.

Test JSON token types before Bean Validation: a valid Java value can already have lost the
client's meaning during binding. A numeric SKU must not silently become text, nor a fractional
dimension become an integer, when the published schema excludes those inputs. Configure the
affected mapper/type through the resolved Boot/Jackson extension points and test real HTTP
binding; do not replace the managed mapper. Jackson's `ALLOW_COERCION_OF_SCALARS` alone does
not control coercion to String. JSON Schema integer also accepts `1.0` and `1e0`: use exact
conversion when supporting these forms, rather than truncation or floating-point rounding.
Preserve an intentional legacy coercion contract; changing accepted inputs needs a compatibility
decision. Unknown-property handling is a separate choice, including how supplied server fields
are rejected or ignored; schema `additionalProperties` must agree with that choice.

When the project or a user-supplied reference separates API interfaces, controllers, use cases
and presenters, preserve those responsibilities. An API interface can own mappings/OpenAPI;
the controller translates input and delegates to an explicitly named use case such as
`CreateCompanyUseCase`. Trace `CreateCompanyRequest` to an application command, then map the
application output through the presenter to `CompanyResponse`, returned as
`ResponseEntity<CompanyResponse>`. Request and command have different owners, as do output
and response; do not expose an application output merely because it currently serializes.
Keep HTTP status/headers and public field selection at the API edge. Name operations for
their intent (`createCompany`, `listCompanies`, `getById`) using the established vocabulary.
Preserve purposeful interface/presenter organization without inventing those abstractions
for every small endpoint. A reference establishes design intent, not permission to copy its
wildcard response types, unbounded sorting/paging or translation of arbitrary technical
failures into business errors; reconcile it with the actual requested contract.

For partial updates, define absent, explicit null, empty string/collection and invalid value
separately. Choose an existing presence wrapper, patch document, dedicated DTO or explicit
tree parser that can actually preserve those distinctions. Do not bind into a new incomplete
entity and merge it. A documented default must also be applied at runtime, not only displayed
in the UI. Read-only schema metadata does not reject a client-supplied ID by itself.

Growing collections need bounded traversal, not `findAll()` followed by an in-memory slice.
Define a default and maximum size, allowed filters/sorts and a unique ordering tie-breaker;
carry those bounds into the storage query. Choose offset pages when clients need page numbers,
or a supported cursor/continuation when they need successive results. Publish totals only
when needed and account for their query cost. A top-N endpoint is valid for an explicit
recent-items contract; it is not pagination when consumers need every matching record.
Test continuation, equal sort keys and invalid bounds. Stable ordering alone does not promise
a snapshot across concurrent inserts/deletes; state that consistency choice explicitly.

## Validation and errors

Choose the smallest error policy that satisfies the API. For standard MVC Problem Details,
Boot's `spring.mvc.problemdetails.enabled=true` supplies the framework exception handling;
it does not require a custom advice just to reproduce those responses. A promised `violations`
array, stable domain codes or a legacy envelope justifies narrow application handling. Reuse
an existing advice before creating another one. The fixture extends `ResponseEntityExceptionHandler`
because its consumers need the documented violations extension and safe unexpected-error policy.
It is an example of that conditional contract, not the minimum configuration for a controller.

Use Jakarta Bean Validation for constraints expressible on the transport model and validate
nested structures explicitly. Verify method validation selection: class `@Validated` uses
AOP; built-in MVC method validation introduced in Framework 6.1 uses another path. Depending
on signature, handle argument and method validation exceptions. A class-level annotation is
not a universal prerequisite for validating a request body.

Define canonicalization and semantic validity together. If an identifier accepts presentation
punctuation, normalize only those agreed forms and use the same canonical key for lookup,
uniqueness and writes. Do not remove arbitrary characters until an invalid value becomes
valid. Keep domain invariants on the application/domain path for non-HTTP callers too.
For human names, decide blankness, control characters, trimming and length units while
preserving legitimate international text. `@NotBlank` is not a business-name validator:
Java whitespace excludes NBSP (`U+00A0`), and NUL is not whitespace. Test whitespace-only,
NBSP-only, embedded controls and valid accented/supplementary text against the chosen policy;
do not impose an ASCII alphabet or remove every Unicode format character by default.
Validate the canonical value that is stored and returned, while bounding raw input separately.

Multiple constraints can reject one field. Return a list or intentionally aggregate messages
per field, including global errors; a map collector without a merge rule can turn a client
error into 500. Do not echo passwords, tokens or rejected private values. Stable codes are
often better machine contracts than localized prose; follow the existing error format.

Define the public location convention for violations. Bean Validation property paths name
Java properties; `FieldError.getField()` does not automatically apply Jackson `@JsonProperty`
or naming strategies. For JSON bodies, keep Java and public names aligned when that fits
the existing contract; otherwise map the affected public paths explicitly or reuse the
project's supported mapping. Mapper metadata can help a genuine generic API framework, but
a reflective path translator is not a prerequisite for one renamed DTO property. Query,
header, cookie and path-variable errors use the binding annotation's public name; form/model
attribute errors follow their own binder contract. Test both argument and method-validation
paths, changing only an external property name to expose accidental coupling to Java names.

For example, `@JsonProperty("display_name") String displayName` must not publish
`displayName` when the consumer expects JSON field locations: an explicit mapping to
`display_name` solves this local contract without general traversal machinery. Preserve
nested indices where meaningful; do not echo private map keys. A documented `request`
fallback is appropriate only where the consumer permits global errors, not as a substitute
for required field locations. Test aliases/naming strategies with the actual mapper when
present. Custom deserializers and unwrapped/polymorphic values need their own public mapping.
The fixture's Java/JSON names and query parameter names intentionally match; its simple
advice relies on that verified condition and must be adapted if the public names change.

ProblemDetail can carry standard fields and controlled extensions. When extending it, test
the actual flattened JSON and document those public extensions, not its internal Java
properties map. Set status/media type consistently and avoid blanket advice that catches all
exceptions and turns defects into successful responses. Known conflicts require precise
classification; an existence precheck cannot eliminate simultaneous insertion races.

Failures from authentication entry points, access-denied handlers, container parsing or a
filter before DispatcherServlet may not reach controller advice. Identify and test each
owned boundary; do not promise a universal ProblemDetail response from advice alone.

When a resource-server chain publishes Problem Details, preserve its bearer status and
`WWW-Authenticate` challenge before writing the safe body. Test no credentials/invalid token
(401), valid token without the required permission (403), and permitted access with a real
decoder when token validation is claimed. Assert rejected requests do not mutate state and
compare these responses with generated security requirements and response components in
each published group. Use the application's real protected operation and configured chain;
do not add a test issuer or a second security chain to an otherwise public MVC example merely
to demonstrate the mechanism. JWT trust, chain design and browser policy remain owned by
`spring-security-for-apis`; pass the credential contract, actual response headers/bodies and
documented requirements. Its result should be a compatible tested policy, not an invented issuer.

### Global and specific exception handlers

When several business failures share a code/context contract, use a small `BusinessException`
or `BaseException` extending `RuntimeException`, with specific subclasses carrying immutable
typed context. For example, `CompanyNotFoundException(UUID companyId)` retains the requested
ID and identifies it in a useful diagnostic message; a no-argument exception saying only
"Company not found" loses the failed lookup. Prefer explicit fields/accessors to an arbitrary
context map. Preserve a cause when translating a real underlying failure. Do not wrap every
library/programming exception or create a deep hierarchy solely to inherit a constructor.

Business exceptions need no `HttpStatus`, Spring import or response object. Map their known
categories at the API boundary, preserving stable machine codes independently of message
wording. Keep diagnostic context distinct from public detail: do not serialize exceptions,
blindly return `getMessage()`, or reveal secrets, SQL, causes or cross-tenant existence.
Expose the requested identifier only when the caller's visibility contract allows it; an
authorized missing-resource URI can already identify it through ProblemDetail `instance`.
The fixture retains product ID/SKU on typed exceptions and publishes only its known code
and safe message. Test both exception context and the HTTP representation.

Use one shared global `@RestControllerAdvice` (for example, `GlobalExceptionHandler`) for
the common MVC/validation representation and a sanitized unexpected-failure fallback.
Retain an existing adequate `ApiExceptionHandler`/`ApiErrors` rather than adding a second
generic handler just for naming. A known business exception belongs there when its meaning
is shared. When its HTTP meaning belongs to one controller or module, use a controller-local
`@ExceptionHandler` or an advice selected by `assignableTypes`/`basePackageClasses`.
Do not require a handler class for every controller or copy validation/catch-all code into each.

Local exception handlers run before advice. Among applicable advice beans, the first matching
advice in priority order wins: a higher-priority catch-all can mask a lower-priority specific
handler. Keep the global fallback at explicit low priority (for example,
`@Order(Ordered.LOWEST_PRECEDENCE)`) when combining advices, with narrower advice ahead of it.
Specificity, including root-versus-cause matching, is resolved within each controller/advice;
it does not override advice order. Test wrapped exceptions too if that is how the application
actually propagates them. These rules concern MVC; security/filter failures keep their owners.

Method-security failures can occur inside MVC dispatch. A catch-all advice must let Spring
Security's `AuthenticationException`/`AccessDeniedException` propagate to the configured security
handlers, or explicitly integrate with that same policy; converting them to the unexpected-500
fallback prevents the filter chain from translating them. Advice priority alone does not solve
this boundary. Pass the actual advice/chain configuration to `spring-security-for-apis` and test
method-level denials as well as pre-dispatch denials, including status, challenge headers and
absence of side effects. The public fixture has no such security exceptions to handle.

All handlers must honor the common public envelope, media type and safe metadata. A local
409 for a known conflict must not expose exception messages/SQL or turn other failures into 409. Verify local and scoped handlers win where intended, fall through elsewhere, and leave
framework errors and the sanitized 500 policy intact. The fixture's test-only probes exercise
these ownership choices without adding fake business errors to its production operations.

Choose inheritance by responsibility: ordinary business-only or controller-specific advice
does not need `ResponseEntityExceptionHandler`. Boot's default Problem Details can own
framework errors when adequate. The fixture extends the framework base because it customizes
argument/method validation and type-mismatch responses; it does not reimplement the entire
resolver. Use that base when the shared advice needs these MVC hooks, then
override the specific hooks that need different representation, retaining framework status,
headers and already-committed-response behavior. MVC already supplies an absent ProblemDetail
instance from the request URI; do not duplicate that lifecycle merely to appear explicit.
Handle body validation and HandlerMethodValidationException inputs consistently, including
field, object/global and cross-parameter conditions. Return-value validation is a server
contract failure (500), not a client validation error (400); do not expose the invalid output.
Prefer `ResponseEntity<ProblemDetail>` for application handlers whose signatures you own.
Retain `ResponseEntity<Object>` on framework hooks and handlers delegating to those helpers.
If combining custom advice
with Boot's default handling, inspect the actual registered beans and priorities; a low-priority
generic fallback must not intercept a known framework error before its intended handler.

For a common application policy, an unexpected-exception fallback can preserve a safe 500
while more-specific inherited handlers keep known statuses such as 404/405 and the Allow
header. Such a fallback must not swallow observability: follow established logging/tracing
and redaction without attaching request payloads or credentials. Exception messages/stacks
also need the project's privacy policy. Do not log expected client validation as an unexpected
server defect. A catch-all that returns success or converts every exception to 400 is wrong.

Document common owned errors once in components.responses and add references through a
global customizer with put-if-absent semantics. Register their schema components independently
of incidental controller references. Keep meaningful per-operation examples and media types;
do not add fictitious 401/403 to an intentionally public fixture. Check interaction with
springdoc's automatic advice-response inference; the fixture disables that inference because
its explicitly tested customizer owns the common policy. This does not establish that every
filter, container or committed-stream failure uses the same envelope.

## Filters, browser behavior and async lifecycles

Use the existing Spring Security chain for authentication/authorization. Choose CORS origins,
credentials and preflight handling from the actual browser contract. Decide CSRF from how
credentials are sent automatically, not from the label REST or stateless. Documentation access
is itself a route exposure decision; disabling Try it out is not authorization.

For forwarded headers, establish which ingress strips client-supplied values and supplies
trusted replacements. Verify generated Location/server URLs at that boundary; do not trust
arbitrary X-Forwarded-Host merely because it makes a local example work.

For uploads, bound request/file size, parts, headers and disk/memory use; validate content
and storage names, and clean temporary resources after rejection/disconnect. Servlet and
application limits may produce different errors. JSON needs its own [pre-binding bounds](request-bounds.md).
For streaming/SSE, establish event encoding,
heartbeat, reconnect/resume expectations, authentication lifetime, backpressure or bounded
buffering, timeout and client disconnect cleanup. Once headers/body are committed, a later
failure cannot always become an ordinary JSON error response. For async dispatch, account for
filter dispatch types, context propagation/cleanup and who owns the executor or stream.

## Choose evidence by mechanism

| Test boundary                  | Demonstrates                                                           | Does not establish by itself                                                           |
| ------------------------------ | ---------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Pure unit                      | Mapping/domain decision, error aggregation                             | MVC converters, security chain or container behavior                                   |
| MVC slice / MockMvc            | Binding, validation, advice and configured filters in that context     | Real network, connector limits or production wiring excluded from the slice            |
| Full context with mock request | Application composition and mock HTTP behavior                         | Real port/TLS/ingress behavior                                                         |
| Random-port server             | Actual Servlet dispatch, HTTP status/headers/body and included filters | Production ingress, real identity provider, database semantics absent from the fixture |
| Browser against fixture        | UI selection, examples, auth flow and emitted requests                 | Exhaustive schema conformance or production access policy                              |

Use the project's managed test starter and imports. For Boot 4, verify modularized test
dependencies and Framework bean override annotations rather than copying `@MockBean`.
Use constructor injection with test constructor autowiring when context injection is needed.
Test a fixed Clock only if the production component actually receives it. A random-port HTTP
test runs the application request on another thread: database cleanup needs explicit isolation,
not assumed rollback from a transaction attached to the test thread.

Sources: [Boot Servlet integration](https://docs.spring.io/spring-boot/reference/web/servlet.html),
[HTTP method, precondition and status semantics, RFC 9110](https://www.rfc-editor.org/rfc/rfc9110.html),
[MVC HTTP caching, Framework 7.0.9](https://github.com/spring-projects/spring-framework/blob/v7.0.9/framework-docs/modules/ROOT/pages/web/webmvc/mvc-caching.adoc),
[shallow ETag limits, Framework 7.0.9](https://github.com/spring-projects/spring-framework/blob/v7.0.9/framework-docs/modules/ROOT/pages/web/webmvc/filters.adoc),
[Boot managed JSON mapper customization](https://docs.spring.io/spring-boot/how-to/spring-mvc.html),
[Jackson 3.1.5 scalar-coercion scope](https://github.com/FasterXML/jackson-databind/blob/jackson-databind-3.1.5/src/main/java/tools/jackson/databind/MapperFeature.java),
[JSON Schema 2020-12 numeric types](https://json-schema.org/draft/2020-12/json-schema-validation.html#section-6.1.1),
[MVC validation](https://docs.spring.io/spring-framework/reference/web/webmvc/mvc-controller/ann-validation.html),
[MVC error responses](https://docs.spring.io/spring-framework/reference/web/webmvc/mvc-ann-rest-exceptions.html),
[MVC advice scope and local precedence, Framework 7.0.9](https://github.com/spring-projects/spring-framework/blob/v7.0.9/framework-docs/modules/ROOT/pages/web/webmvc/mvc-controller/ann-advice.adoc),
[advice order and exception matching, Framework 7.0.9](https://github.com/spring-projects/spring-framework/blob/v7.0.9/spring-web/src/main/java/org/springframework/web/bind/annotation/ControllerAdvice.java),
[Jakarta Validation 3.1 NotBlank](https://jakarta.ee/specifications/bean-validation/3.1/apidocs/jakarta/validation/constraints/notblank),
[Java 25 whitespace](<https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/lang/Character.html#isWhitespace(int)>),
[method-validation exception contract](https://docs.spring.io/spring-framework/docs/7.0.9/javadoc-api/org/springframework/web/method/annotation/HandlerMethodValidationException.html),
[validation field paths](https://docs.spring.io/spring-framework/docs/7.0.9/javadoc-api/org/springframework/validation/beanvalidation/SpringValidatorAdapter.html),
[resource-server processing](https://docs.spring.io/spring-security/reference/servlet/oauth2/resource-server/index.html),
[method-security denial propagation](https://docs.spring.io/spring-security/reference/servlet/authorization/method-security.html),
[Boot test boundaries](https://docs.spring.io/spring-boot/reference/testing/spring-boot-applications.html),
[Boot 4 migration](https://github.com/spring-projects/spring-boot/wiki/Spring-Boot-4.0-Migration-Guide).
