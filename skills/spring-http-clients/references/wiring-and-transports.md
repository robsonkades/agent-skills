# Wiring and transports

Read when creating a client, explaining why properties do not apply, or changing a
transport, interface proxy, TLS or context propagation. All property/API examples in
this reference target Boot 4.1.1; inspect target metadata for other releases.

Use [official Boot documentation](https://docs.spring.io/spring-boot/) matched to the
project's version for client wiring and properties. If the task crosses OAuth credential
acquisition or a JPA transaction boundary, consult the corresponding version of the
[Spring Security reference](https://docs.spring.io/spring-security/reference/) or
[Spring Data JPA reference](https://docs.spring.io/spring-data/jpa/reference/jpa.html)
for that contract and hand off broader policy. HTTP annotations establish neither
authorization nor database transaction semantics; unrelated tasks need no such detour.

## Preserve the useful builder configuration

Inject `RestClient.Builder` or `WebClient.Builder` and customize locally. A Boot
customizer is appropriate for a convention shared by every client; peer credentials,
base URLs and exceptional limits belong to that peer. Clone a reused builder before
giving two clients different settings. Static `create()` and independent `builder()`
calls omit Boot configuration. Test a distinctive customizer on the actual outgoing
request so an accidental bypass fails visibly.
[Boot client integration](https://docs.spring.io/spring-boot/reference/io/rest-client.html)
documents builder customization and client detection.

Separate dependencies needed to run a client from those starting a server. Boot 4.1's
`spring-boot-starter-restclient` supplies the imperative client support; do not introduce
a web server to acquire a builder. Inspect existing starters and resolved transport libraries before changing
the build. Adding a library can alter automatic transport selection without changing
the call site.

For Boot 4.1.1, this illustrative configuration selects the JDK imperative factory:

```properties
spring.http.clients.imperative.factory=jdk
spring.http.clients.connect-timeout=500ms
spring.http.clients.read-timeout=500ms
spring.http.clients.redirects=dont-follow
```

These are illustrative limits, not recommended service budgets. The reactive selection
property is `spring.http.clients.reactive.connector`. Use exact-release
[configuration metadata](https://docs.spring.io/spring-boot/appendix/application-properties/index.html)
to check names, units and scope; plural `clients` matters on this baseline. Programmatic
common settings use `HttpClientSettings`, applied through the appropriate request
factory or connector builder. Overriding either builder is an ownership decision:
check what auto-configuration backs off and which global settings still reach it.

## Define what the application consumes

Identify the authority for the peer contract: a versioned provider specification,
approved SDK or documented protocol plus representative exchanges. Reuse the project's
generated client when its transport, lifecycle and compatibility meet the need; keep
its generator/input version and reproduction command if generation is part of the
change. An OpenAPI description can define wire shapes without specifying billing,
replay or business completion. Do not infer those guarantees from generated methods,
an example payload or an HTTP status alone. Use a focused typed client when generation
would add maintenance without helping the consumed operations; do not create a parallel
provider specification or an inbound documentation stack merely to call one endpoint.

Start from the provider contract and the caller's use case, not from a reusable CRUD
client abstraction. In a project using domain ports, a `CompanyRegistryGateway` may
be implemented by a `RegistryHttpGateway`; its provider `RegistryCompanyResponse`
belongs beside that adapter, mapped to the application's result. Follow established
package and naming conventions; do not introduce a port, mapper interface or exception
base solely to mirror each remote method. A declarative HTTP interface describes the
provider protocol and is not automatically the application's domain port.

Choose the return shape deliberately:

| Consumed contract                       | Implementation and verification                                                                                                                                                                                                                                                                                                         |
| --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A representation is required on success | `RestClient.body(...)` may return `null`; an empty `Mono` is also possible with `WebClient`. Reject a missing required result at the integration boundary, rather than letting a later dereference fail. Framework 7.0.4+ supplies `requiredBody(...)` for imperative extraction; keep an explicit check on an older supported release. |
| No representation is part of success    | Use a bodiless result or `ResponseEntity<Void>` when headers/status matter. Do not invent an empty DTO to turn a legitimate `204` into the preceding case.                                                                                                                                                                              |
| Headers/status change the next action   | Preserve a typed `ResponseEntity<T>` or reactive equivalent in the HTTP adapter to inspect `ETag`, `Location` or status. A `202 Accepted` is acceptance for processing, not completed business work; implement polling/callback reconciliation only when required by that provider contract.                                            |
| The body has generic elements           | Use a declared generic HTTP-interface return type or `ParameterizedTypeReference<List<RegistryCompanyResponse>>` with body extraction. A raw `List.class`, untyped `Map` or unchecked cast loses the element contract; test decoded element fields.                                                                                     |

For an imperative bodiless call, finish `retrieve()` with `toBodilessEntity()`; merely
obtaining the `ResponseSpec` does not dispatch the request. For a reactive call, return
the composed publisher to its lifecycle owner rather than starting a detached
subscription to make it run. Verify that the intended request actually occurs.

See the versioned [RestClient response API](https://docs.spring.io/spring-framework/docs/7.0.9/javadoc-api/org/springframework/web/client/RestClient.ResponseSpec.html),
[WebClient response API](https://docs.spring.io/spring-framework/docs/7.0.9/javadoc-api/org/springframework/web/reactive/function/client/WebClient.ResponseSpec.html)
and [HTTP 202 semantics](https://www.rfc-editor.org/rfc/rfc9110.html#section-15.3.3).
An empty-body policy does not validate the contents: check required provider fields,
identity and business invariants before applying the result to local state. A record or
Bean Validation annotation alone is not evidence that response deserialization enforces
those constraints. Reject a malformed or semantically inconsistent success as a provider
contract failure; do not manufacture a default company or reinterpret it as absence.
Use typed DTOs and the configured message converters for JSON instead of concatenating
request bodies. Preserve the peer's documented compatibility rules for unknown fields.

Build paths and queries with URI templates and variables, respecting the configured
encoding mode. Do not concatenate user values into a URL or pre-encode them without an
explicit already-encoded contract; either can change reserved characters or double-encode
data. Test a query value containing `+`, `&`, spaces and non-ASCII characters through the
real configured client. URI encoding does not enforce the allowed-destination policy
below. See [Spring URI encoding](https://docs.spring.io/spring-framework/reference/web/webflux/uri-building.html#web-uribuilder-encoding).

Preserve the provider's evolution contract at the adapter: decide how unknown enum
values, added optional fields or removed required fields affect the consumed result.
Tolerating an added field does not mean accepting a missing identity or interpreting an
unknown business state as success. Coordinate incompatible provider changes with the
integration owner; test the relevant old/new representations instead of changing the
application's global mapper for one peer. For remote pagination or polling, preserve
documented continuation tokens/links and impose an agreed total work/deadline bound;
apply destination and credential rules to continuation URLs too. Do not silently label
a truncated traversal as a complete result.

## HTTP interfaces keep the underlying client contract

`@HttpExchange` describes HTTP method, path, parameters and representation. Match the
adapter and return types to the caller: `RestClientAdapter` for imperative calls;
`WebClientAdapter` for reactive calls. Do not hide blocking behind a reactive-looking
API. In Boot 4.1.1, use `@ImportHttpServices` and group properties for ordinary
registration, even for a single interface. An explicit `HttpServiceProxyFactory`
is useful on an older supported baseline or when a client needs construction outside
the registry; the number of interfaces alone does not justify manual registration.
Choose one registration route per interface.

### A finite customer lookup

Assume an imperative application, a known small JSON response, and a remote protocol
whose HTTP errors can retain Spring's standard exception behavior. These are partial
application snippets, each public type in its own file, using the existing Boot
application and managed `spring-boot-starter-restclient` dependency:

```java
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.service.annotation.GetExchange;
import org.springframework.web.service.annotation.HttpExchange;

@HttpExchange(accept = "application/json")
public interface CustomerDirectory {
    @GetExchange("/customers/{id}")
    Customer findById(@PathVariable("id") long id);

    record Customer(long id, String name) {}
}
```

```java
import org.springframework.context.annotation.Configuration;
import org.springframework.web.service.registry.ImportHttpServices;

@Configuration(proxyBeanMethods = false)
@ImportHttpServices(group = "directory", types = CustomerDirectory.class)
public class DirectoryClientConfiguration {}
```

```properties
spring.http.serviceclient.directory.base-url=${DIRECTORY_BASE_URL}
spring.http.serviceclient.directory.connect-timeout=500ms
spring.http.serviceclient.directory.read-timeout=2s
```

Let the existing application discover/import this configuration and constructor-inject
`CustomerDirectory` into its consumer. No wrapper, manual proxy bean or custom JSON
decoder is needed. Budgets are illustrative; properties do not define a whole-operation
deadline. The caller must still decide what an empty success or `404` means for its
endpoint contract.

For one call already implemented in a configured `RestClient`, keeping
`client.get().uri("/customers/{id}", id).retrieve().body(Customer.class)` may be simpler.
Changing to an interface solely for style is unnecessary. If responses become
untrusted/unbounded, revisit extraction and limits in
[failure and response bounds](failure-and-response-bounds.md); the DTO is not a byte cap.
Group configurers support conditional customizations beyond properties. Boot 4.1.1
also [applies `RestClientCustomizer` beans to group builders](https://github.com/spring-projects/spring-boot/blob/v4.1.1/module/spring-boot-restclient/src/main/java/org/springframework/boot/restclient/autoconfigure/service/RestClientCustomizerHttpServiceGroupConfigurer.java).
Verify the outgoing request; bean presence alone does not prove the active configuration.

The [Boot HTTP service documentation](https://docs.spring.io/spring-boot/reference/io/rest-client.html#io.rest-client.httpservice)
and [Framework registry](https://docs.spring.io/spring-framework/reference/integration/rest-clients.html#rest-http-service-client-groups)
describe this registration path. The group APIs require Framework 7; retain a working
Boot 3 integration rather than copying these snippets or upgrading it implicitly.

Treat empty responses, generic bodies, error statuses and path encoding as protocol
contracts. A proxy's error mapping comes from its underlying client. Test a failing
endpoint through the proxy itself; testing only a hand-written client can miss a
different factory or handler. See
[Framework HTTP services](https://docs.spring.io/spring-framework/reference/integration/rest-clients.html#rest-http-interface).

## Select and own the transport resources

Record the actual `ClientHttpRequestFactory` or `ClientHttpConnector`, its version,
resource owner and active overrides. Inspect customizer beans and construction order;
classpath presence alone is not proof of the instance being used.

For pooled transports, distinguish active connections, idle connections, pending
acquisition count and acquisition timeout. A rising pending queue with normal remote
latency suggests local admission pressure; remote latency growth may be the cause of
occupied connections. Check both before enlarging a pool. Size against downstream
concurrency and HTTP/2 stream capacity, not solely worker or virtual-thread count.
Use transport-specific settings and measurements; the JDK client does not expose the
same pool controls as Apache or Reactor Netty.

Reactor Netty supports explicit pool/acquisition limits and resource disposal. Shared
resources and custom dedicated pools have different lifecycle owners. Do not dispose
a shared pool when one client finishes; arrange context shutdown for a pool created
by the application. Exercise concurrent acquisition, cancellation and shutdown with
the deployed transport before claiming a leak fixed. The
[Reactor Netty HTTP client reference](https://projectreactor.io/docs/netty/release/reference/http-client.html#connection-pool)
defines its pool controls and metrics; it does not establish suitable sizes for the
application. Bean construction or a mocked exchange does not measure pool reuse or saturation.

## TLS, destinations and context are configuration contracts

Reuse the application's named SSL bundles and secret source. Keep certificate and
hostname verification enabled; a trust-all client is not a certificate deployment fix.
Verify expected trust, wrong hostname, untrusted issuer and required client certificate
when those properties change. Inspect proxy and redirect settings as part of the
credential destination: a base URL alone cannot constrain arbitrary absolute URIs
supplied at a call site.

Be careful with configuration order. Applying
[`RestClientSsl`](https://docs.spring.io/spring-boot/api/java/org/springframework/boot/restclient/autoconfigure/RestClientSsl.html)
replaces a previously assigned factory; applying
[`WebClientSsl`](https://docs.spring.io/spring-boot/api/java/org/springframework/boot/webclient/autoconfigure/WebClientSsl.html)
replaces a previously assigned connector. When SSL must coexist with custom transport
behavior, compose it through the appropriate builder/settings path and test both
properties. Neither order chosen by intuition nor successful bean creation proves
that the timeout and trust settings survived.

For user-supplied destinations, establish an explicit URI/address/redirect policy and
test forbidden targets and redirects at the relevant network boundary. Host string
checks alone do not cover resolution changes. Do not put credentials in arbitrary
global headers or forward inbound authorization without a destination/audience contract.
A disabled-redirect test alone does not establish complete SSRF protection.

Read credentials and request context at the correct request/subscription lifetime.
Avoid capturing one user's value in a singleton, and do not assume thread-local state
follows Reactor scheduling. Use the installed propagation mechanism and verify two
requests with distinct identities plus an absent-context case. Client observations
should use the Boot-configured registry when observability is enabled; verify an
outgoing propagation header or observation, not merely that a bean exists.

## Document the integration that was delivered

For a maintained integration, update its existing README/contract/runbook where the
following information belongs; a one-line configuration repair usually needs only the
affected setting and evidence:

- Consumed operations and authoritative provider version; request/response types,
  absence, rejection, pending and uncertain outcomes; representative sanitized examples.
  Document only pagination, conditional requests or idempotency semantics actually used.
- Configuration names, units, environment overrides and active transport; approved
  destinations, credential/SSL secret references and resource owner. State which
  timeout/bound is enforced locally and which depends on provider/platform guarantees.
- Retry/admission ownership across application and egress, effective attempt policy,
  and the diagnostic signals distinguishing provider rejection, local saturation and
  uncertain mutation. Link the supported reconciliation/escalation path and its owner
  when required; never document an unimplemented recovery guarantee as available.
- Reproducible contract/configuration checks and any provider sandbox prerequisite;
  how a provider schema or credential/configuration change is checked and rolled out.
  Keep secret values and unrestricted payload dumps out of documentation and evidence.

Prefer existing telemetry and operational conventions. Additional dashboards, a client
DSL, a gateway policy or a resilience dependency need a concrete gap and an owner; they
are not completion criteria for every HTTP call.
