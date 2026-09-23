# Chains, invocation boundaries and browser credentials

Read when changing exposure, HTTP errors, method interception, sessions, CORS or CSRF.

## Two levels of matching

`securityMatcher` chooses a chain; `requestMatchers` inside `authorizeHttpRequests`
chooses a rule after that chain is selected. Put narrower chains before broader ones and
specific authorization rules before overlapping general rules. A final chain without a
`securityMatcher` covers otherwise unmatched requests. An API-only application's fallback
can deny everything; a combined UI/API application instead needs the UI's own authentication
and browser protections. Do not blindly append a deny-all chain ahead of existing chains.
[Spring's multiple-chain contract](https://docs.spring.io/spring-security/reference/7.0/servlet/configuration/java.html).

Build a small route table: method, path, dispatcher/servlet context, winning chain,
credential mechanism, authority and expected denial. Include actual management exposure;
a separate management application context may have separate chains. A broad
`/actuator/**.permitAll()` cannot be justified merely by a health probe requirement. Expose
only intended health information under the deployment's network and authentication policy.
Do not make every probe public without inspecting that policy.

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
handler side effects. [Resource-server processing](https://docs.spring.io/spring-security/reference/7.0/servlet/oauth2/resource-server/index.html).

## Method checks and the protected operation

`@EnableMethodSecurity` enables pre/post annotations; a plain annotation on an unproxied
object does nothing. Check the bean returned by the application context and its actual
callers. In proxy mode, a call through `this` bypasses the proxy; private/final methods and
final classes can prevent intended interception depending on proxy type. JDK proxies expose
interface methods; class proxies have subclassing constraints. Test an external invocation
of the Spring bean with insufficient authorities, then inspect internal call paths.
[Method security](https://docs.spring.io/spring-security/reference/7.0/servlet/authorization/method-security.html),
[proxy limitations](https://docs.spring.io/spring-framework/reference/core/aop/proxying.html).

Use a bean boundary that callers actually cross, or a deliberate explicit authorization
check at the protected operation. Do not force another layer solely to duplicate an adequate
existing check. `@PostAuthorize` runs after the method; it is unsuitable as the only guard
against a forbidden mutation or external side effect. Post-filtering a result collection
also does not establish query-level tenant isolation or correct pagination. These policy
and consistency questions belong to the neighboring application/query skills.

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
read the version-specific [SPA integration](https://docs.spring.io/spring-security/reference/7.0/servlet/exploits/csrf.html)
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
requests independently. [Spring CORS integration](https://docs.spring.io/spring-security/reference/7.0/servlet/integrations/cors.html).
