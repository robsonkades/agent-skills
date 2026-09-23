# Access-token validation and authority mapping

Read when selecting JWT versus introspection, changing decoder/introspector configuration,
adding issuers or translating claims into permissions.

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
[Opaque-token support](https://docs.spring.io/spring-security/reference/7.0/servlet/oauth2/resource-server/opaque-token.html).

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
[JWT configuration and validation](https://docs.spring.io/spring-security/reference/7.0/servlet/oauth2/resource-server/jwt.html).

For an issuer explicitly issuing RFC 9068 access tokens, the Java 17 / Security 7.1.0
fixture uses this **partial configuration snippet** (imports and the trusted key source are
in the [fixture](../assets/SecurityContractCheck.java)):

```java
decoder.setJwtValidator(JwtValidators.createAtJwtValidator()
    .issuer(ISSUER)
    .audience(AUDIENCE)
    .build());
```

This dedicated validator checks the access-token type and required profile claims,
including expiry; it is not a universal replacement for every provider's token format.
Security 7 moved type validation into its validator model. The fixture relies on the exact
7.1.0 API/defaults and does not copy a `validateTypes` call from another decoder builder or
release. Verify any type-validation change against the resolved version.
[7.1.0 validator implementation](https://github.com/spring-projects/spring-security/blob/7.1.0/oauth2/oauth2-jose/src/main/java/org/springframework/security/oauth2/jwt/JwtValidators.java),
[7.0 migration](https://docs.spring.io/spring-security/reference/7.0/migration/servlet/oauth2.html).

Use issuer-managed rotating public keys in production when that is the issuer's contract.
The fixture's ephemeral public key avoids network access; it does not demonstrate discovery,
JWKS caching, refresh or rotation. For a deployment change, test known-key cache use,
new/unknown `kid`, key overlap/removal and key-endpoint failure with a local controlled
JWKS service. Set bounded client timeouts; never add a decode-only fallback when refresh
fails. State startup versus first-request discovery behavior from the actual version/config.

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
