# Access-token validation and authority mapping

Read when changing accepted credential transport, selecting JWT versus introspection,
changing decoder/introspector configuration, adding issuers or translating claims into permissions.

## Transport is part of the credential contract

Bearer tokens authorize whoever possesses them. Require HTTPS at the API ingress and
verify confidentiality on any proxy-to-service hop carrying the token; a signed JWT is not
encrypted by its signature. Do not put access tokens in URLs, where logs, browser history
and other URL consumers can disclose them. RFC 9700 forbids clients from sending access
tokens in URI query parameters. Identify affected clients and migrate credential delivery
instead of enabling query-token resolution as a compatibility shortcut.
[Bearer transport protection](https://www.rfc-editor.org/rfc/rfc6750.html#section-5.2),
[current query-token rule](https://www.rfc-editor.org/rfc/rfc9700.html#section-4.3.2).

Inspect the actual `BearerTokenResolver` and gateway rewrites. Spring Security 7.1.0's
`DefaultBearerTokenResolver` reads the Authorization header by default; query and form-body
token support default to disabled. A custom resolver can change that contract. For a claimed
header-only API, test the same otherwise-valid token in a header, cookie, query parameter
and form body: only the header should authenticate. Do not infer this from `STATELESS` or
the decoder configuration. Protect tokens from diagnostic logs as well; use
`structured-logging` when changing request logging.
[7.1.0 resolver contract](https://github.com/spring-projects/spring-security/blob/7.1.0/oauth2/oauth2-resource-server/src/main/java/org/springframework/security/oauth2/server/resource/web/DefaultBearerTokenResolver.java).

## Choose the validation contract

| Choice                     | Use when                                                                                | Cost and failure contract                                                                                                                                                               |
| -------------------------- | --------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Locally verified JWT       | Issuer supplies signed access tokens and bounded expiry meets revocation requirements   | Requests can use cached keys; revocation is not automatically checked on each request. Discovery, key refresh and unknown key IDs still depend on the issuer's key service.             |
| Opaque-token introspection | Per-token authorization-server decisions or revocation freshness justify a remote check | Requires credentials, bounded connection/read timeouts and an availability plan. Caching introspection lengthens the revocation window; failure must not become authentication success. |

Introspection can also validate a token whose wire format happens to be JWT. Choose by
validation/revocation requirements, not by counting dots. Default introspection requires
`active: true`, then maps the response into the principal and authorities. Document additional
audience or token-use constraints required by the authorization server's contract; do not
assume a generic active response means any API may consume it. Test inactive responses,
wrong target/purpose, malformed responses and unavailable introspection.
[Opaque-token support](https://docs.spring.io/spring-security/reference/7.1/servlet/oauth2/resource-server/opaque-token.html).

Supply an HTTP client with explicit connection/read timeouts and introspection client
authentication. A custom `RestOperations` constructor does not add those credentials for
you. In 7.1.0, response conversion can also fail outside the transport exception wrapper
(for example, a string `exp` where a number is expected). Test that boundary and normalize
known conversion failures to an unavailable-validation response; do not catch every runtime
exception or manufacture a principal. A sanitized 503 for backend failures, 401 for
invalid/inactive tokens and 403 for insufficient permissions is one explicit API policy;
preserve the application's agreed contract. These are not universal Spring defaults.
The default bearer failure handler rethrows authentication-service failures, so changing
only the entry point is insufficient.
[7.1.0 introspector](https://github.com/spring-projects/spring-security/blob/7.1.0/oauth2/oauth2-resource-server/src/main/java/org/springframework/security/oauth2/server/resource/introspection/SpringOpaqueTokenIntrospector.java),
[failure-handler behavior](https://github.com/spring-projects/spring-security/blob/7.1.0/web/src/main/java/org/springframework/security/web/authentication/AuthenticationEntryPointFailureHandler.java).

An active result delegates freshness to the authorization server; this introspector does
not independently enforce `exp`. The library also coerces string `active` values, whereas
RFC 7662 specifies a boolean. If strict wire-schema validation is required, validate the
raw response before coercion; post-conversion principal checks cannot distinguish those
types. Include malformed JSON, missing `active` and malformed expiry in the affected
project's tests; these do not constitute exhaustive RFC schema enforcement. Do not add a
cache without an explicit revocation window, expiry bound and outage policy.
[RFC 7662 response contract](https://www.rfc-editor.org/rfc/rfc7662.html#section-2.2).

An OAuth2 resource server validates **access tokens**. OIDC login validates an **ID token**
for the relying-party client. A shared issuer or signing key does not make them interchangeable.
Require the API audience and the issuer's access-token profile/purpose discriminator. The
header `typ: JWT` alone does not distinguish them. A provider's `token_use` claim and RFC 9068
`typ: at+jwt` are different contracts; neither is universal. If the issuer cannot provide a
reliable distinction, establish a sound audience/issuance contract rather than inventing a
local marker. [Spring OAuth2 roles](https://docs.spring.io/spring-security/reference/servlet/oauth2/index.html),
[RFC 9068 access-token profile](https://datatracker.ietf.org/doc/html/rfc9068#section-4).

## JWT checks compose; custom wiring can replace defaults

Establish each of these from effective configuration and negative tests:

- **Trust source:** fixed trusted issuer/key endpoint or a controlled allowlist for multiple
  issuers. Unverified claims may select an allowlisted authentication manager; they must not
  trigger arbitrary issuer discovery or network fetches. Keys come from configured trust,
  never a token-supplied URL. Use TLS for issuer and introspection communication.
- **Cryptography:** accept the agreed signing algorithm(s) and suitable verification keys.
  Reject unsigned tokens, wrong keys and algorithm substitutions. A `kid` selects a key;
  it does not establish trust. Restrict algorithms according to the provider contract rather
  than accepting whatever the token names.
- **Claims:** exact issuer, intended API audience, timestamp/skew and profile-required
  claims. Check missing claims as well as wrong values. Some generic validators check a
  timestamp only when present; requiring access-token expiry is a separate contract.
- **Purpose:** validate the issuer's agreed access-token profile. Decode-only parsing, or
  a valid signature from the same issuer, does not reject an ID token intended elsewhere.

Spring's resource-server configuration supports issuer discovery and JWKS, with audience
validation configured explicitly. Supplying `jwk-set-uri` directly does not itself check
issuer; preserve issuer validation. A custom `JwtDecoder` or `.decoder(...)` overrides the
default decoder: inspect it instead of assuming Boot properties still apply. Likewise,
`setJwtValidator` replaces the validator; compose with defaults where using the generic JWT
profile. Do not replace issuer/time validation with an audience-only predicate.
[JWT configuration and validation](https://docs.spring.io/spring-security/reference/7.1/servlet/oauth2/resource-server/jwt.html).

For an issuer explicitly issuing RFC 9068 access tokens, this **partial configuration
snippet** uses `org.springframework.security.oauth2.jwt.JwtValidators` from Security 7.1.0.
Here `decoder` is an existing `NimbusJwtDecoder` configured with the trusted key source;
`issuer` and `audience` are trusted application configuration, not incoming claims:

```java
decoder.setJwtValidator(JwtValidators.createAtJwtValidator()
    .issuer(issuer)
    .audience(audience)
    .build());
```

This dedicated validator checks the access-token type and required profile claims,
including expiry; it is not a universal replacement for every provider's token format.
Security 7 moved type validation into its validator model. This snippet relies on the exact
7.1.0 API/defaults; do not copy a `validateTypes` call from another decoder builder or
release. Verify any type-validation change against the resolved version.
[7.1.0 validator implementation](https://github.com/spring-projects/spring-security/blob/7.1.0/oauth2/oauth2-jose/src/main/java/org/springframework/security/oauth2/jwt/JwtValidators.java),
[7.0 migration](https://docs.spring.io/spring-security/reference/7.0/migration/servlet/oauth2.html).

Use issuer-managed rotating public keys in production when that is the issuer's contract.
For key retrieval changes, use the [remote-validation cases](verification.md#remote-validation-cases)
with the application's real decoder: observe known-key cache reuse, refresh for a new
`kid`, overlapping keys, removal and endpoint failures. Removing a key upstream does not
immediately invalidate a cached copy. If immediate removal is required, design an explicit cache
invalidation/freshness or online-validation contract; do not promise it from JWT signature
verification alone. Planned rotation needs sufficient overlap for existing tokens and
cache behavior, while compromised-key revocation may require rejecting affected tokens.

Set bounded client timeouts; never add a decode-only fallback when refresh fails. Count
outbound requests as well as asserting denial. The 7.1.0 builder disables Nimbus rate
limiting, so a per-request timeout and one-fetch test do not bound aggregate traffic from
an unknown-`kid` flood. Assess admission controls and any negative-key cache against
legitimate rotation. An explicit JWKS URI, issuer discovery and customized caches can have
different retrieval lifecycles; inspect the effective decoder. A test that triggers refresh
via an unknown key does not measure cache TTL expiry or establish a startup guarantee.
[7.1.0 decoder key-source wiring](https://github.com/spring-projects/spring-security/blob/7.1.0/oauth2/oauth2-jose/src/main/java/org/springframework/security/oauth2/jwt/NimbusJwtDecoder.java).

## Authorities are a schema contract

Spring's standard JWT converter maps scopes from `scope` or `scp` to `SCOPE_...`. An issuer
role claim is not automatically a Spring role. `hasRole("ADMIN")` ordinarily looks for
`ROLE_ADMIN`; `hasAuthority("SCOPE_orders.read")` checks that exact authority. Document the
chosen prefixes, case and whether scopes and roles are additive.

Keep the default converter when its schema matches. Otherwise add a converter wired into
the resource server's `jwtAuthenticationConverter`, with explicit allowed claim paths and
types. Retain scope conversion if adding roles should preserve scope permissions. Do not
flatten arbitrary nested strings or translate any claim named `admin` into authority. For
mixed issuers, map each trusted issuer's vocabulary deliberately; identical role names need
not have identical meaning.

Test the actual converter with missing/empty claims, malformed types, unknown roles,
multiple scopes and a role/scope prefix mismatch. Choose whether malformed required claims
reject the token or optional unknown claims grant no permission; they must not grant
privilege or cause an uncontrolled 500. Tests that manually inject an authority only test
what happens after mapping. Passing an explicit converter to `jwt().authorities(...)` can
exercise that converter, but still bypasses decoding and does not prove production wiring.
[Authority extraction](https://docs.spring.io/spring-security/reference/servlet/oauth2/resource-server/jwt.html#oauth2resourceserver-jwt-authorization-extraction).
