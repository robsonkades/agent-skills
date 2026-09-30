# Chains, invocation boundaries and browser credentials

Read when changing exposure, HTTP errors, method interception, sessions, CORS or CSRF.

## Two levels of matching

`securityMatcher` chooses a chain; `requestMatchers` inside `authorizeHttpRequests`
chooses a rule after that chain is selected. Put narrower chains before broader ones and
specific authorization rules before overlapping general rules. A final chain without a
`securityMatcher` covers otherwise unmatched requests. An API-only application's fallback
can deny everything; a combined UI/API application instead needs the UI's own authentication
and browser protections. Do not blindly append a deny-all chain ahead of existing chains.
[Spring's multiple-chain contract](https://docs.spring.io/spring-security/reference/7.1/servlet/configuration/java.html).

Build a small route table: method, path, dispatcher/servlet context, winning chain,
credential mechanism, authority and expected denial. Include actual management exposure;
a separate management application context may have separate chains. A broad
`/actuator/**.permitAll()` cannot be justified merely by a health probe requirement. Expose
only intended health information under the deployment's network and authentication policy.
Do not make every probe public without inspecting that policy.

For each public rule, identify the operation and response fields permitted without a
principal. A public catalog read need not imply public registration or internal metadata.
Keep agreed public operations working without credentials, and test a neighboring protected
operation and a new unlisted route. OpenAPI security declarations describe this policy;
they do not enforce it. Coordinate documentation with `spring-boot-web` when it changes.

Use the project's matcher semantics. Spring Security 7 string matchers use path patterns;
paths are absolute within the application, excluding the context root. Multiple servlet
mappings require the appropriate servlet/base path. Test trailing slash, alternate methods,
dispatches and encoded-path handling against the actual framework/container. Retain the
HTTP firewall; relaxing it to make a path match changes the attack surface.
[Request matching](https://docs.spring.io/spring-security/reference/servlet/authorization/authorize-http-requests.html).

Prefer `permitAll` over bypassing Spring Security with `web.ignoring` for ordinary public
application endpoints, retaining filters and security headers. `permitAll` is an
authorization decision, so an invalid bearer header can still fail authentication first.
An unknown URL returning 404 does not prove a real newly added handler is protected.

## HTTP errors are emitted at different layers

For a bearer resource server, missing/invalid authentication ordinarily produces a 401
with the applicable `WWW-Authenticate: Bearer` challenge; a valid authenticated principal
lacking permission ordinarily produces 403. This is not a universal status rule: malformed
bearer transport can be 400, CSRF/CORS can reject before authorization, and a deny-only
fallback can deliberately return 403 without offering authentication.

`AuthenticationEntryPoint` starts the authentication response;
`AccessDeniedHandler` handles access denial. Resource-server handlers understand bearer
error/challenge semantics. When a custom API body is required, preserve their HTTP status
and protocol headers, set the intended content type, and avoid token/claim leakage. Do not
replace every denial with 401 or a login redirect. `@ControllerAdvice` alone does not own
failures emitted before MVC in the filter chain. Test both status/headers and absence of
handler side effects. [Resource-server processing](https://docs.spring.io/spring-security/reference/7.1/servlet/oauth2/resource-server/index.html).

Method-security exceptions thrown during an MVC handler call can reach MVC exception
resolution before returning to the security filters. A generic
`@ExceptionHandler(Exception.class)` that consumes `AccessDeniedException` can therefore
turn a denied invocation into a 500 or another incompatible response. Preserve security
exceptions for the configured security handlers, or explicitly delegate to an equivalent
authentication/denial mapping. Do not translate every `AccessDeniedException` to a domain
not-found error or assume every denial is an authenticated 403. Test the actual proxied
service through MVC with the global advice present, including missing authentication and
an authenticated caller lacking permission.
[Security exception translation](https://github.com/spring-projects/spring-security/blob/7.1.0/web/src/main/java/org/springframework/security/web/access/ExceptionTranslationFilter.java),
[MVC exception resolution](https://github.com/spring-projects/spring-framework/blob/v7.0.8/spring-webmvc/src/main/java/org/springframework/web/servlet/mvc/method/annotation/ExceptionHandlerExceptionResolver.java).

Share the API's error representation where useful, but write filter errors through their
response-handling contract; a controller's `ResponseEntity` return convention does not move
those failures into MVC. Use stable public details instead of copying decoder, provider or
exception messages into JSON. Inspect challenge headers as well: bearer handlers can render
an OAuth error description in `WWW-Authenticate`. Preserve required challenge semantics
while sanitizing custom errors at their source. Test that neither body nor headers reveal
tokens, private claims, internal URLs or hostile upstream text.
[Bearer challenge construction](https://github.com/spring-projects/spring-security/blob/7.1.0/oauth2/oauth2-resource-server/src/main/java/org/springframework/security/oauth2/server/resource/web/BearerTokenAuthenticationEntryPoint.java).

## Method checks and the protected operation

`@EnableMethodSecurity` enables pre/post annotations; a plain annotation on an unproxied
object does nothing. Check the bean returned by the application context and its actual
callers. In proxy mode, a call through `this` bypasses the proxy; private/final methods and
final classes can prevent intended interception depending on proxy type. JDK proxies expose
interface methods; class proxies have subclassing constraints. Test an external invocation
of the Spring bean with insufficient authorities, then inspect internal call paths.
[Method security](https://docs.spring.io/spring-security/reference/7.1/servlet/authorization/method-security.html),
[proxy limitations](https://docs.spring.io/spring-framework/reference/core/aop/proxying.html).

Use a bean boundary that callers actually cross, or a deliberate explicit authorization
check at the protected operation. Do not force another layer solely to duplicate an adequate
existing check. `@PostAuthorize` runs after the method; it is unsuitable as the only guard
against a forbidden mutation or external side effect. Post-filtering a result collection
also does not establish query-level tenant isolation or correct pagination. These policy
and consistency questions belong to the neighboring application/query skills.

Keep an adequate guard in the existing business service. When a separate policy bean is
needed, `@PreAuthorize` can call it, but a generic policy framework or a second repository
does not follow from using method security. Test the real Spring service with a permitted
caller, a wrong owner, a wrong tenant and a missing record; denied calls must leave the
protected state unchanged. Include a non-HTTP caller if it reaches this service. Identity
comes from validated authentication, never an untrusted `X-Tenant` override. For mutable
ownership, pass the read/check/write sequence and transaction evidence to
`java-application-security-basics` or `service-layer-design`; expect a consistent authorized
write, not just a proxy check. If those skills are unavailable, retain the guard and report
any unresolved race instead of inventing an atomicity guarantee. When implementation is
authorized, use the project's service/repository mechanisms to close that race; do not stop
at a handoff merely because an optional skill is absent.

Trace the same instance policy through list/count queries, secondary-key lookups and writes,
not only `GET /{id}`. Filtering a page after retrieval can leak counts and produce incorrect
pages. A caller-supplied tenant selector must be checked against authenticated membership;
it must not become trusted identity just because it was bound to a DTO. Allowlist editable
fields so create/patch binding cannot overwrite ownership, tenant membership or privileges.
Where the contract conceals inaccessible records with 404, apply that policy consistently
without revealing the real owner or tenant; keep authentication failures distinct.
[Object authorization](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html),
[Mass assignment](https://cheatsheetseries.owasp.org/cheatsheets/Mass_Assignment_Cheat_Sheet.html).

## Security context across task boundaries

Trace the actual execution path when a protected call moves to an executor, `@Async` method
or deferred response. Servlet security context is normally thread-local; a valid principal
on the request thread does not prove that the worker sees it. Reuse existing integration
before adding propagation: Spring MVC's supported `Callable` processing integrates with
security context, while application work completing a `DeferredResult` does not inherit
that integration automatically.
[MVC async integration](https://github.com/spring-projects/spring-security/blob/7.1.0/docs/modules/ROOT/pages/servlet/integrations/mvc.adoc).

When worker-side Spring method checks need the submitter's identity, use the matching
`DelegatingSecurityContextExecutor`/task-executor integration around the actual managed
executor, capturing context for each submission and clearing/restoring it on completion.
Do not configure one request's context as a fixed identity for every task. A global
inheritable-thread-local strategy does not refresh identity on reused pool threads: values
are inherited at thread creation, not each submission. The delegated context is not a
deeply immutable snapshot; do not mutate shared authentication to impersonate another caller.
Keep the executor's capacity, lifecycle and exception behavior intact; context propagation
does not replace secured-proxy interception or propagate a transaction. If the application
already uses explicit trusted caller context, preserve that contract rather than introducing
a second implicit identity source. Propagation does not revalidate an expired token or
guarantee current permissions for a delayed durable job; establish that job's actor and
authorization lifetime separately. Verify caller isolation and cleanup on the actual
executor, including a task that throws.
[Concurrency integration](https://github.com/spring-projects/spring-security/blob/7.1.0/docs/modules/ROOT/pages/servlet/integrations/concurrency.adoc),
[context cleanup and restoration](https://github.com/spring-projects/spring-security/blob/7.1.0/core/src/main/java/org/springframework/security/concurrent/DelegatingSecurityContextRunnable.java),
[thread inheritance](https://docs.oracle.com/en/java/javase/17/docs/api/java.base/java/lang/InheritableThreadLocal.html).

## Browser decision table

| Accepted credential delivery on this surface                                                 | CSRF decision                                                                                                            |
| -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Caller explicitly sets `Authorization: Bearer`; no cookie/session/Basic alternative accepted | A scoped CSRF disable is justified for this contract. Verify credential-free browser submissions cannot authenticate.    |
| Browser automatically sends an authentication cookie, including a self-contained JWT cookie  | Retain CSRF protection on unsafe methods; stateless token content does not change browser delivery.                      |
| Browser Basic authentication or a combined browser login/API surface                         | Inspect automatic credential behavior and retain the required browser protections; separate chains when policies differ. |
| Credential transport is unknown                                                              | Inspect clients, gateway rewrites and credential resolvers before disabling CSRF.                                        |

`SessionCreationPolicy.STATELESS` governs Spring Security's use of the HTTP session for
security context. It does not prohibit application code or other libraries from creating a
session, and does not turn a cookie into an explicitly supplied credential. Diagnose
unexpected `JSESSIONID` at its creator. Keep safe HTTP methods free from business mutations.
[Session behavior](https://docs.spring.io/spring-security/reference/servlet/authentication/session-management.html),
[stateless CSRF cases](https://docs.spring.io/spring-security/reference/features/exploits/csrf.html).

For a cookie/browser application, use the version's supported CSRF token repository and
request-handler pairing; test missing, invalid and valid tokens. A CSRF token cookie must
be paired with a request token comparison, not accepted merely because the cookie exists.
SPA handling depends on deferred tokens, BREACH masking and refresh after login/logout;
read the version-specific [SPA integration](https://docs.spring.io/spring-security/reference/7.1/servlet/exploits/csrf.html)
before transplanting a cookie-token snippet. `SameSite` can complement this contract.

## CORS is a browser permission policy

Process legitimate preflight before authentication because it normally carries no user
credential. Wire the relevant `CorsConfigurationSource` to the selected chain; explicitly
select the source when several sources/chains exist. Allow only intended origins, methods
and request headers. For header bearer requests, allow `Authorization`; do not set
`allowCredentials(true)` merely because an Authorization header is used.

Credentialed cookie requests need trusted origins and intentional credentials support.
`allowedOrigins("*")` with credentials is invalid; a wildcard origin pattern or arbitrary
Origin reflection can still grant untrusted origins credentialed response access. An
intentional uncredentialed public API can have a wider origin policy. CORS is not server
authorization: non-browser clients are unconstrained, and browser requests may cause effects
even when JavaScript cannot read a response. Test allowed and hostile preflight and actual
requests independently. [Spring CORS integration](https://docs.spring.io/spring-security/reference/7.1/servlet/integrations/cors.html).
