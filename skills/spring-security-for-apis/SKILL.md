---
name: spring-security-for-apis
description: >-
  Configure and review Spring Security Servlet APIs when filter-chain matchers leave
  routes uncovered, bearer tokens need JWT or opaque-token validation, claim mapping
  produces unexpected authorities, method checks are bypassed, or CSRF, CORS and
  401/403 behavior are unclear. Covers resource-server wiring and adversarial security
  tests; object ownership, tenant policy and transactional authorization belong to
  java-application-security-basics and service-layer-design. Excludes WebFlux and
  implementing an identity provider.
---

# Spring Security for APIs

Make the deployed HTTP surface and token trust contract explicit. A protected route must
select the intended filter chain, authenticate an appropriate access token, and enforce the
operation's authorization rule. A valid signature alone does not establish all three.

## Compatibility and scope

Inspect the resolved Spring Security, Spring Framework and Boot versions, Java toolchain,
Servlet mappings, security beans, deployment ingress and test setup before proposing code.
The example baseline is **Java 17 source, Spring Security 7.1.0, Spring Framework 7.0.8,
Servlet 6.1**; it uses no preview features or Boot auto-configuration. This is a verified
example target, not an instruction to upgrade. Match the project's managed dependencies;
do not mix a Security 7 example into a Boot 3 / Security 6 project without adapting and
checking the APIs. Source and dependency evidence is in
[verification](references/verification.md#sources-and-compatibility).

This skill owns Servlet `SecurityFilterChain`, OAuth2 resource-server validation,
claims-to-authorities wiring, method-security interception and browser-facing controls.
OAuth2 login/client features obtain credentials and establish client sessions; resource
servers consume access tokens. Do not add login redirects or an authorization server to
make an API accept bearer tokens. An OIDC ID token is for the client that authenticated
the user, not a substitute API access token.

## Workflow

1. **Map the real request surface.** List ordered chains and their `securityMatcher`, then
   authorization rules within each chain. Include management contexts/ports, error/forward
   dispatches, alternate HTTP methods and paths outside `/api`. The first matching chain
   wins; authorization rules in later chains do not add protection. If no chain matches,
   Spring Security does not protect that request. `anyRequest()` only covers its own
   chain. Read [chains and browser controls](references/chains-and-browser.md) when
   changing matchers, sessions, method wiring, CORS or CSRF.
2. **Write the credential contract before configuring it.** Establish trusted issuer,
   intended API audience, access-token profile, accepted algorithms and keys or
   introspection service, token lifetime, revocation needs and authority vocabulary.
   Inspect sanitized issuer metadata and actual configuration; never infer a trust root
   from an incoming token's `iss`, `jku` or `x5u`. If these facts are missing, identify the
   gap and keep the dependent configuration conditional. Read
   [token validation](references/token-validation.md) for JWT/opaque selection or changes.
3. **Keep authentication and permissions separate.** Preserve framework validation while
   adding audience/profile checks. Map only the agreed claim schema; `SCOPE_orders.read`
   and `ROLE_ADMIN` are different authorities. A route requiring `authenticated()` accepts
   any successfully authenticated caller; that is insufficient where permissions differ.
   Prefer explicit permitted operations with `denyAll()` for the remaining surface when
   the API contract is an allowlist; retain an authenticated fallback only when all such
   callers intentionally share access.
4. **Trace the protected invocation.** `@EnableMethodSecurity` enables method checks;
   annotations must be reached through the Spring proxy. Self-invocation and manually
   constructed objects can bypass interception. Method permissions do not establish
   ownership of a requested object. Hand off instance/tenant rules and consistency of the
   protected write to `java-application-security-basics` and `service-layer-design`;
   use `query-objects-and-specifications` for mandatory tenant predicates in queries.
5. **Decide browser behavior from credential delivery.** `STATELESS` is not proof that
   CSRF is irrelevant. Cookies containing bearer tokens, session cookies and browser
   Basic authentication are automatically sent credentials. Keep appropriate CSRF
   protection for these flows. Disable it only for a surface whose accepted credentials
   are explicitly supplied, such as an Authorization-header-only bearer API, with no
   cookie/session alternative. CORS neither authenticates callers nor replaces CSRF.
6. **Verify the negative paths at the right boundary.** Read
   [verification](references/verification.md) when implementing or validating a fix.
   `jwt()`/`opaqueToken()` and `@WithMockUser` inject authentication: useful for
   authorization tests, but they do not prove signature, issuer, audience, expiry or
   introspection validation. Real bearer-header tests must exercise the actual decoder
   and converter. Assert denial prevents handler/service side effects, not merely that
   an error body appeared.

## Decisions that prevent common regressions

| Evidence                                             | Decision and verification                                                                                                                                                                    |
| ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Only an `/api/**` chain exists                       | Add or verify an ordered fallback for every other reachable surface; test a real handler outside `/api`, not just a nonexistent path.                                                        |
| A new permissive rule precedes a narrower rule       | Recheck first-match semantics for chain selection and for authorization; test the overlapping path with an insufficient authority.                                                           |
| API returns 302/login HTML, or 403 for every failure | Inspect the selected chain, authentication entry point, denied handler and CSRF/CORS rejection. Preserve bearer challenges and distinguish invalid credentials from insufficient permission. |
| Custom `JwtDecoder`/validator bean exists            | Inspect effective wiring: Boot properties may no longer configure that decoder. Adding audience validation must preserve issuer, time and token-profile validation.                          |
| `jwt()` test succeeds with an expired token          | The test has bypassed token validation; add a signed hostile token through the real decoder, retaining the useful authorization test.                                                        |
| `permitAll()` route rejects a malformed bearer token | Authentication filters still run; public authorization does not promise that invalid supplied credentials are ignored. Specify and test the intended behavior.                               |
| Trusted issuer changes or an unknown `kid` arrives   | Follow configured key discovery/rotation and bounded failure behavior; never fall back to decoding without verification.                                                                     |

Do not broaden `permitAll`, disable filters in tests or weaken a scope check to remove an
unexpected 403. First establish which layer denied the request. An absent final
authorization rule is not by itself proof that requests are public: distinguish the
authorization manager's behavior from a request that never selected any security chain.

## Deliverable

For a review, identify the affected route/call, selected chain or token-validation step,
reachable caller, consequence, and concrete correction with a negative test. For an
implementation, include the changed configuration and tests with their prerequisites.
Report actual execution separately from proposed cases, and separate framework facts from
unverified deployment assumptions. An adequate existing configuration can remain unchanged.

Read [the executable security fixture](references/verification.md#executable-fixture)
when a local example would help reproduce real JWT rejection and matcher behavior. It is
a test harness with ephemeral keys, not a production authentication service.

For adjacent tasks: secret-safe logs go to `structured-logging`, error bodies to
`rpc-and-api-contracts`, and credential storage or framework-independent authorization to
`java-application-security-basics`. These are optional handoffs, not required installs.
