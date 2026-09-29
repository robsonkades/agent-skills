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
