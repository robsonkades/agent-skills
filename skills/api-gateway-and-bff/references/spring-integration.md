# Spring integration at the edge

Read when implementing a gateway/BFF with Spring or reviewing its filters, outgoing
calls or identity forwarding. This is mechanism guidance, not executable sample code.
The sources below were consulted on 2026-09-30; Gateway 4.3 documentation rendered 4.3.5.
No Java/Boot runtime was built or tested for this reference. Match the target project's
resolved versions instead of treating these documentation versions as a required baseline.

## Decide whether a gateway library is needed

A BFF that owns three screen-shaped endpoints can be an ordinary Boot application with
controllers, service-specific clients and boundary DTOs. It does not require Spring Cloud
Gateway. Add a gateway product/library for named proxying/routing/policy responsibilities;
do not reproduce an adequate platform gateway inside every BFF.

Before changing dependencies, inspect the existing BOM, effective dependencies, Java
toolchain, runtime image and starter selection. Use the
[Spring Cloud compatibility table](https://spring.io/projects/spring-cloud/)
for the matching release train; verify the actual managed versions. Do not combine a
Gateway example from another train with the project's Boot dependencies by overriding
individual versions until it compiles.

For **Gateway Server WebFlux 4.3**, the documented starter is
`spring-cloud-starter-gateway-server-webflux`; it uses the Netty runtime and is not a
traditional Servlet/WAR gateway. For **Gateway Server Web MVC 4.3**, the documented
starter is `spring-cloud-starter-gateway-server-webmvc`; it uses WebMvc.fn and supports
Servlet runtimes. See the separate
[WebFlux starter](https://docs.spring.io/spring-cloud-gateway/reference/4.3/spring-cloud-gateway-server-webflux/starter.html)
and [MVC starter](https://docs.spring.io/spring-cloud-gateway/reference/4.3/spring-cloud-gateway-server-webmvc/starter.html)
contracts. Filter APIs, configuration namespaces and security chains are not interchangeable.
Verify feature support in the selected variant; do not combine starters to repair a filter
copied from the other stack.

Preserve a suitable Servlet BFF and its managed imperative HTTP clients. For a reactive
BFF/gateway, compose nonblocking calls and keep JDBC, blocking clients and `.block()` off
event-loop paths. If an unavoidable blocking integration must be isolated, bound and own
that work and validate cancellation/resource behavior; another scheduler does not make it
nonblocking. Virtual threads in an imperative application do not remove peer/pool limits.
The [WebFlux concurrency model](https://docs.spring.io/spring-framework/reference/web/webflux/new-framework.html)
supports the execution-model distinction, not an application-level speed claim.

Keep business composition in a testable application component, separate from broad proxy
filters. Use the existing managed HTTP client/connector so TLS, observations and pool
settings survive. Inspect actual pool-acquisition, connect and response/read timeouts;
then bound the whole operation, including queues and optional work. An outer reactive
timeout or cancelled future alone does not prove socket cleanup or remote rollback.

## TokenRelay is forwarding, not a trust policy

The [WebFlux 4.3 TokenRelay filter](https://docs.spring.io/spring-cloud-gateway/reference/4.3/spring-cloud-gateway-server-webflux/gatewayfilter-factories/tokenrelay-factory.html)
forwards an OAuth2 access token using the configured OAuth2 client facilities. Establish
whether the path is an OAuth2 login/client, bearer-token resource server, or both, and
which token the chosen configuration actually obtains/forwards. It is not sufficient to
put `TokenRelay` on a route and assume all callers now authenticate or gain delegation.

The documented default authorized-client service is in memory. If correctness across
replicas/restarts depends on retained login/authorized-client state, choose and test the
appropriate persistence/session arrangement, token lifetime and refresh behavior. Do not
conclude from that default that every gateway must use a database. Servlet and reactive
authorized-client/security components differ; consult the variant-specific documentation.

Inspect the receiving service's access-token validation and object/tenant authorization.
Test a token signed by the trusted issuer but intended for a different resource. Passing
it through the gateway must not make it acceptable. If the token is unsuitable downstream,
resolve the issuer/delegation contract; do not disable validation or synthesize an
unverified user header. Send credentials only to declared destinations and avoid logging
them in debug filters, traces or error payloads.

## Proxy headers, retries and verification

In the [Gateway WebFlux 4.3 remote-address predicate](https://docs.spring.io/spring-cloud-gateway/reference/4.3/spring-cloud-gateway-server-webflux/request-predicates-factories.html),
`XForwardedRemoteAddressResolver.trustAll()` accepts a spoofable first forwarded address.
`maxTrustedIndex` depends on the real number of trusted proxy hops. Do not copy a value
without checking bypass paths and header replacement at ingress. Request address resolution,
outbound forwarded-header filters and identity propagation are different mechanisms; a
setting for one does not prove the others safe. Inspect their effective version-specific
configuration and test malicious incoming values through each accepted path.

The [WebFlux 4.3 Retry filter](https://docs.spring.io/spring-cloud-gateway/reference/4.3/spring-cloud-gateway-server-webflux/gatewayfilter-factories/retry-factory.html)
can cache request bodies for retry, so replay choices also affect memory use. Inspect
client/gateway/mesh/service attempts together; choose a single intentional retry policy
for the operation, safe replay semantics, a total attempt/deadline budget and body limits.
Do not silently retry a charged mutation or a streaming body that cannot be replayed
safely. A timeout does not establish that the owning service rejected the command.

For a concrete change, compile with the project's existing toolchain and run a focused
slice using actual selected filters/security chains plus a controllable downstream stub.
Verify route matching/rewrite, unknown routes, sanitized headers, credential destination,
wrong-audience/direct-path rejection, timeout/cleanup, request size and response contract.
For reactive paths, include a stalled downstream and cancellation; for a cookie BFF,
include login/session and CSRF behavior. An in-process controller test that bypasses the
gateway or proxy cannot prove the complete trust path. Record which hops were exercised.
