# MVC behavior and test boundaries

Read when changing controllers, mapping, validation, serialization, pipeline extensions,
security integration or conditional request lifecycles. Keep the application's conventions
unless evidence identifies a broken contract. Boot auto-configuration plus a narrow
WebMvcConfigurer is the simple baseline; full MVC takeover needs a reason and tests for
converters, static resources and other previously supplied behavior.

## Inputs and outputs

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

For partial updates, define absent, explicit null, empty string/collection and invalid value
separately. Choose an existing presence wrapper, patch document, dedicated DTO or explicit
tree parser that can actually preserve those distinctions. Do not bind into a new incomplete
entity and merge it. A documented default must also be applied at runtime, not only displayed
in the UI. Read-only schema metadata does not reject a client-supplied ID by itself.

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

`ResponseEntityExceptionHandler` is an appropriate base when adopting MVC Problem Details:
override the specific hooks that need different representation, retaining framework status,
headers and already-committed-response behavior. MVC already supplies an absent ProblemDetail
instance from the request URI; do not duplicate that lifecycle merely to appear explicit.
Handle body validation and HandlerMethodValidationException inputs consistently, including
field, object/global and cross-parameter conditions. Return-value validation is a server
contract failure (500), not a client validation error (400); do not expose the invalid output.

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
[MVC validation](https://docs.spring.io/spring-framework/reference/web/webmvc/mvc-controller/ann-validation.html),
[MVC error responses](https://docs.spring.io/spring-framework/reference/web/webmvc/mvc-ann-rest-exceptions.html),
[method-validation exception contract](https://docs.spring.io/spring-framework/docs/7.0.9/javadoc-api/org/springframework/web/method/annotation/HandlerMethodValidationException.html),
[validation field paths](https://docs.spring.io/spring-framework/docs/7.0.9/javadoc-api/org/springframework/validation/beanvalidation/SpringValidatorAdapter.html),
[resource-server processing](https://docs.spring.io/spring-security/reference/servlet/oauth2/resource-server/index.html),
[Boot test boundaries](https://docs.spring.io/spring-boot/reference/testing/spring-boot-applications.html),
[Boot 4 migration](https://github.com/spring-projects/spring-boot/wiki/Spring-Boot-4.0-Migration-Guide).
