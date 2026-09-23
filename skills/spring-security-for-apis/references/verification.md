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
[Spring OAuth2 test support](https://docs.spring.io/spring-security/reference/7.0/servlet/test/mockmvc/oauth2.html).

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
  outside HTTP. Permission to read another user's record is a separate instance-policy test.
- **Browser changes:** missing/invalid/valid CSRF token under accepted browser credentials;
  credential-free preflight from allowed/hostile origins; actual hostile requests; cookie
  credentials presented to a claimed header-only API. Assert no forbidden mutation occurs.
- **Opaque-token changes:** active/inactive/wrong-purpose results, malformed responses,
  introspection timeout/failure and any cache window. Never treat backend failure as an
  authenticated principal. Reuse the application's upstream error contract.

Report which cases ran and the exact boundary exercised. A check of one path does not prove
the entire route inventory, and a server-side CORS check does not simulate browser behavior.

## Executable fixture

[SecurityContractCheck.java](../assets/SecurityContractCheck.java) is an executable Java
fixture for an in-process Spring MVC context. It generates ephemeral RSA keys, signs real
tokens and routes requests through real security filters and the decoder. Its RFC 9068
issuer contract is intentionally specific; do not apply it to an issuer with a different
access-token profile. Its browser chain accepts only test-injected authentication and must
not be copied as a login implementation.

The fixture includes real mapped endpoints that must remain denied, a read/write scope
split, a proxied service check, hostile JWTs, a deliberately accepted invalid `jwt()` mock
that illustrates bypass, and separate CSRF/CORS checks. Every case asserts both status and
the expected handler/service side-effect count; 401 cases also assert the bearer challenge.

Prerequisites for the recorded baseline:

- Java compiler supporting `--release 17`; Java 17+ runtime supported by the dependencies.
- Spring Security **7.1.0**: config, core, crypto, web, oauth2-core, oauth2-jose,
  oauth2-resource-server and test.
- Spring Framework **7.0.8**: aop, beans, context, core, expression, web, webmvc and test.
- Nimbus JOSE JWT **10.9**, Servlet API **6.1.0**, Micrometer observation/commons **1.17.0**,
  Apache Commons Logging **1.3.5**, JSpecify **1.0.0**.

Use an existing compatible project test classpath or already available dependencies in an
isolated directory. This asset does not need Maven, a new build file, real credentials,
network services or dependency upgrades. With the dependency classpath in `fixtureCp` and
an owned output directory in `fixtureOut`, PowerShell invocation is:

```powershell
javac --release 17 -cp $fixtureCp -d $fixtureOut ./assets/SecurityContractCheck.java
java -cp "$fixtureOut;$fixtureCp" SecurityContractCheck
```

On POSIX, use the platform classpath separator `:`. Compile output belongs outside the
installed skill's assets. Do not install dependencies or mutate shared caches merely to
run an example; if the classpath is unavailable, report the limit and implement relevant
tests in the target project's existing infrastructure.

The fixture does not test key rotation, opaque introspection, a custom role converter,
custom error bodies, browser execution or a production container/ingress. It is a starting
point for reproducing these specific checks, not a certification of an application's security.

Recorded authoring check on 2026-09-22: compilation with `javac --release 17` passed and
all **27 cases** passed using the dependencies above on Temurin **25.0.3**. The run used
existing cached jars without downloads. This verifies Java 17 source/API compilation and
behavior on the named runtime; it is not a recorded Java 17 runtime test or an evaluation
of an agent applying this skill.

## Sources and compatibility

Primary references were checked on **2026-09-22**. Spring's current documentation identified
7.1.1 and the versioned 7.0 pages identified 7.0.7; code uses the locally available **7.1.0**
artifacts and the **7.1.0 source tag**. The source baseline is Java 17, consistent with
[Spring Security prerequisites](https://docs.spring.io/spring-security/reference/prerequisites.html).
No claim of support for every older Security version follows from Java source compatibility.

The executable fixture and English guidance were newly authored for this catalog. The
earlier `spring-security-for-apis` in the local `java-skills` repository was inspected to
establish intended scope; no prose or code was copied because its redistribution license
was not established. It is not required to use this package. Official Spring source is
Apache-2.0 licensed; links support API behavior without vendoring that implementation.

Consequential sources are linked beside their rules in the other references. The
[7.1.0 JWT validator source](https://github.com/spring-projects/spring-security/blob/7.1.0/oauth2/oauth2-jose/src/main/java/org/springframework/security/oauth2/jwt/JwtValidators.java)
establishes the fixture's RFC 9068 required-claim/type behavior;
[NimbusJwtDecoder](https://github.com/spring-projects/spring-security/blob/7.1.0/oauth2/oauth2-jose/src/main/java/org/springframework/security/oauth2/jwt/NimbusJwtDecoder.java)
establishes the named decoder builder behavior. Prefer the target version's official
documentation/source when adapting it; similar method names on different builders do not
establish API compatibility.
