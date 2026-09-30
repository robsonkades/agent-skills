# Verification that matches the security claim

Read when writing tests or checking a proposed security fix. Start with the changed trust
boundary; keep existing useful tests instead of replacing every mock with an integration test.

## What each test proves

| Test setup                                                                   | Useful evidence                                                                             | Does not establish                                                          |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| `@WithMockUser` or `user()`                                                  | Role/authority decisions with an injected principal; CSRF behavior                          | Bearer parsing, JWT validation or claim conversion                          |
| `jwt()` / `opaqueToken()`                                                    | Authorization with the expected principal type; controller principal access                 | Real decoder/introspector validation, expiry, signature, issuer or audience |
| Direct production converter invocation, or `jwt().authorities(theConverter)` | Claim-to-authority transformation for supplied claims                                       | Decoder behavior or that the application actually wires the converter       |
| Bearer header with mocked decoder/introspector                               | Bearer extraction and downstream wiring/error handling                                      | Cryptographic verification or the upstream service contract                 |
| Signed bearer header with real decoder and actual chains                     | Decoder, converter, filter selection and authorization under the fixture's key/claim policy | Remote JWKS discovery/rotation or production ingress behavior               |
| Local introspection/JWKS stub plus real client and HTTP stack                | Specified remote success/failure/cache/timeout behavior                                     | The live provider's configuration or availability                           |

`jwt()` creates a mock JWT; it can contain expired claims or `alg: none` while an
authorization test succeeds. Use the mock deliberately, and add real validation where the
claim requires it. Default mock scopes can also invalidate a supposed "no authority" test;
explicitly supply an empty authority collection or remove the relevant claims.
[Spring OAuth2 test support](https://docs.spring.io/spring-security/reference/7.1/servlet/test/mockmvc/oauth2.html).

Load the application's actual security configuration and filter chain in MVC tests. A
standalone controller test, an unrelated test chain or `addFilters = false` does not cover
production exposure. A slice with `jwt()` may still require a decoder bean to construct
the chain even though the request never calls it.

## Required hostile cases depend on the change

- **Chain/rule changes:** missing token, valid token with insufficient permission, wrong
  HTTP method, overlapping chain match, real handler outside the API prefix and a new real
  handler inside it. Assert handlers or protected collaborators were not invoked. Include
  alternate servlet/management context and dispatch paths when affected.
- **JWT changes:** valid signed access token as control; wrong signature/key/algorithm,
  issuer, audience, expired/future time beyond allowed skew, missing required claims and
  ID-token substitution. Test the real decoder, not a builder-created `Jwt` object. Include
  unknown `kid` and rotation with a local JWKS server when modifying key retrieval.
- **Authority/method changes:** agreed scopes and roles, missing or malformed claim types,
  prefixes, and calls through the real Spring bean. Inspect self-invocation and callers
  outside HTTP. Include the MVC path with global exception advice enabled: a denied method
  call must retain the agreed security status/challenge and must not become a generic 500.
  Permission to read another user's record is a separate instance-policy test.
- **Instance-policy integration:** wrong owner/tenant and missing identity across detail,
  list/count, secondary lookup and write operations. Try a payload that assigns another
  tenant/owner or an elevated privilege. Assert unchanged protected state, no foreign records
  or counts, and a permitted control; validate query/transaction behavior with the real
  persistence boundary when claiming that isolation.
- **Public-policy or error changes:** an intended public operation without credentials,
  protected neighboring operations, new unlisted handlers and supplied invalid credentials.
  For security errors, assert both JSON and challenge headers against sensitive sentinels;
  a sanitized body alone does not establish a sanitized response.
- **Browser changes:** missing/invalid/valid CSRF token under accepted browser credentials;
  credential-free preflight from allowed/hostile origins; actual hostile requests; cookie
  credentials presented to a claimed header-only API. Assert no forbidden mutation occurs.
- **Credential transport changes:** a valid token in the accepted header as control;
  the same valid token in query/form parameters must not authenticate a header-only API.
  Inspect ingress TLS, proxy hops and token redaction separately; MockMvc does not prove them.
- **Opaque-token changes:** active/inactive/wrong-purpose results, malformed responses,
  introspection timeout/failure and any cache window. Never treat backend failure as an
  authenticated principal. Reuse the application's upstream error contract.
- **Gateway identity changes:** spoof identity/tenant headers through the public ingress
  and attempt direct service access through relevant deployment paths. Assert the trusted
  ingress replaces/rejects spoofed input and bypass is unavailable or independently
  authenticated. A MockMvc request with a trusted header does not establish that boundary.
- **Async context changes:** use the application's executor and actual secured bean with
  permitted and denied callers, then callers A/B and an unauthenticated task on a reused
  worker. Include an exception before the next task. Assert the correct identity and
  unchanged denied state; stale identity or lost cleanup is a failure. Separate this from
  token revalidation and the business policy for jobs that outlive the request.

Report which cases ran and the exact boundary exercised. A check of one path does not prove
the entire route inventory, and a server-side CORS check does not simulate browser behavior.

## Focused project tests

Use the [Boot example](boot-resource-server.md) only when its contract matches the application.
Keep tests in the existing test suite, using the application's actual configuration and
collaborators. A custom main-method runner, provider implementation or shared assertion
hierarchy is not needed to test an authorization change.

For example, a read permission must not authorize a write. This **partial test snippet**
uses static MockMvc/Spring Security/Mockito imports, Spring's `SimpleGrantedAuthority`,
and the project's mocked `orders` collaborator:

```java
mvc.perform(post("/api/orders/7")
        .with(jwt().authorities(new SimpleGrantedAuthority("SCOPE_orders.read"))))
    .andExpect(status().isForbidden());

verifyNoInteractions(orders);
```

Adapt the path, valid request body and collaborator to the real operation. Pair denial
with a permitted write reaching that collaborator; otherwise malformed input or an
unrelated rule could make every case fail closed. This test says nothing about signatures
or whether the production converter creates that authority.

For a changed JWT trust rule, use the project's signing/test-token helper or an ephemeral
test key to create a valid access token, then change only the relevant claim/key/profile.
Send both tokens as bearer headers through the actual chain and decoder. Keep the signing
key test-only and never use production credentials. A test override may replace the key
endpoint; it must not replace the validator under test. If a custom decoder is unavoidable
in the test, name the production configuration it no longer covers.

For a changed converter, invoke the actual converter with missing/empty claims, malformed
types, allowed and unknown roles, and mismatched prefixes. Then send one valid signed token
through the real chain to prove that converter is wired. For instance-policy integration,
test the real service bean with another owner's ID, another tenant's ID, missing tenant
identity and a nonexistent record. Assert no protected write occurs and include a permitted
control. A proxy check does not prove transaction isolation; use the existing service and
repository rather than inventing a second policy/store for the test.

## Remote-validation cases

Use these only when changing key retrieval, introspection, caching or their failure policy.
Reuse the project's maintained local HTTP stub/test-server facility and the real decoder
or introspector with its configured client. A mocked `JwtDecoder` or `OpaqueTokenIntrospector`
cannot establish these properties. Bind to loopback on an ephemeral port, use invented
credentials, bound delayed responses and close the server/client resources after the test.

| Changed boundary                  | Scenario and meaningful observation                                                                                                                                                                                                                                                                                  |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| JWKS retrieval and rotation       | Fetch key A, reuse it, publish A+B, then request B to exercise refresh. Remove A upstream and distinguish cached acceptance from rejection after refresh. Use an unknown key to prove rejection; count fetches according to the resolved cache/refresh contract.                                                     |
| JWKS outage or malformed response | With a warmed cache, compare a retained known key with an unknown key that needs retrieval. Assert the unknown key never reaches the handler. A known cached key may remain valid; do not equate provider outage with revocation.                                                                                    |
| Introspection and revocation      | Use the same token with active then inactive responses. Test missing `active`, malformed JSON/claim types, wrong audience/purpose where the provider requires them, failure and recovery. Verify actual client authentication and configured cache policy.                                                           |
| Remote time bounds                | Delay response bytes beyond the configured read timeout. Assert the documented error, no business effect, bounded elapsed time with reasonable scheduling slack and expected outbound request count. A read-timeout case does not test DNS, TLS, connection stalls, pool acquisition or aggregate key-flood traffic. |

Do not adopt an exact fetch count, cache lifetime or status from another application's
probe. Record the dependency/configuration and the claim exercised. A forced refresh does
not establish TTL expiry, and local HTTP does not prove production TLS or provider uptime.

Keep invalid credentials separate from an unavailable validation service. For an API
whose agreed policy is 401 for invalid tokens and sanitized 503 for backend failure, test
both through the actual filter chain, including the bearer challenge for 401 and no leaked
upstream content for 503. In Security 7.1.0 the default failure handler rethrows
authentication-service exceptions; changing only the entry point is insufficient.
[Token validation](token-validation.md) covers that version-specific behavior and malformed
introspection response conversion. Do not install a custom failure handler merely to copy
this example's optional status policy.

If the project lacks a usable local HTTP test facility, first determine whether this remote
boundary is actually changing. For an authorization-only change, use existing MVC tests.
For a key-service/introspection change, add a focused integration test using a supported
project test dependency or report the unavailable runtime check; a mocked remote success
does not substitute for the missing evidence.

## Sources and compatibility

The Java API examples retain the **Java 17 source / Security 7.1.0 / Framework 7.0.8**
reference baseline. The Boot example is partial configuration in the consuming project;
it does not establish a new Boot dependency baseline or certify that project's property
binding. Inspect its resolved version and effective beans.

The linked Security 7.1 guides may redirect to documentation for a later patch release;
on this review they identified 7.1.1. Use the 7.1.0 source tags below for exact reference
baseline behavior, and the consuming project's version for implementation. The 7.0
migration guide is linked only for the change introduced in that major release.

The [7.1.0 validator source](https://github.com/spring-projects/spring-security/blob/7.1.0/oauth2/oauth2-jose/src/main/java/org/springframework/security/oauth2/jwt/JwtValidators.java),
[decoder source](https://github.com/spring-projects/spring-security/blob/7.1.0/oauth2/oauth2-jose/src/main/java/org/springframework/security/oauth2/jwt/NimbusJwtDecoder.java),
[introspector source](https://github.com/spring-projects/spring-security/blob/7.1.0/oauth2/oauth2-resource-server/src/main/java/org/springframework/security/oauth2/server/resource/introspection/SpringOpaqueTokenIntrospector.java)
and [failure-handler source](https://github.com/spring-projects/spring-security/blob/7.1.0/web/src/main/java/org/springframework/security/web/authentication/AuthenticationEntryPointFailureHandler.java)
support the version-sensitive mechanisms described here. Use the target version's official
documentation/source when adapting; Java source compatibility does not establish framework
or Boot compatibility.

Source review, snippet compilation, local contract execution and agent evaluation are
different evidence. Report only checks actually run, with their boundary and limitations.
