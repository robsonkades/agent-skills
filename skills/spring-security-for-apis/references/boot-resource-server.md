# A focused Boot resource-server configuration

Read when implementing a Servlet bearer API in an existing Boot application. This is a
partial application example, not a standalone project. Use the project's managed
resource-server starter and Java/Boot baseline; verify the property names against that
Boot version. The Java configuration uses Java 17 / Security 7.1.0 APIs.

## Start from the actual contract

Assume one trusted issuer, standard scope authorities, explicitly supplied bearer headers,
read/write permissions for orders, and denial of every other route. The issuer's generic
JWT profile must match the effective validators. If required claims or token-purpose checks
are missing, add those specific checks as described in [token validation](token-validation.md).
This example does not silently select RFC 9068 or make every signed token an access token.

In a compatible Boot version, issuer, audience and accepted algorithms belong in existing
application configuration:

```yaml
spring:
  security:
    oauth2:
      resourceserver:
        jwt:
          issuer-uri: https://issuer.example.test
          audiences: [orders-api]
          jws-algorithms: [RS256]
```

These values are illustrative, not deployable credentials or an issuer selected for the
user. Substitute externally supplied configuration from the actual identity provider;
do not provide a production fallback when a required value is missing. An intentionally
public API does not need a resource server solely to follow this example.

Keep the managed decoder; an audience requirement alone does not justify replacing it.
Inspect an existing custom `JwtDecoder` before relying on these properties, since it can
replace Boot's configured decoder.
[Spring's Boot resource-server configuration](https://docs.spring.io/spring-security/reference/7.1/servlet/oauth2/resource-server/jwt.html).

Only the application's authorization and credential-delivery decisions need Java code:

```java
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.security.config.Customizer;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.web.SecurityFilterChain;

@Configuration(proxyBeanMethods = false)
class ApiSecurity {
    @Bean
    SecurityFilterChain securityFilterChain(HttpSecurity http) throws Exception {
        return http
            .authorizeHttpRequests(rules -> rules
                .requestMatchers(HttpMethod.GET, "/api/orders/{id}")
                    .hasAuthority("SCOPE_orders.read")
                .requestMatchers(HttpMethod.POST, "/api/orders/{id}")
                    .hasAuthority("SCOPE_orders.write")
                .anyRequest().denyAll())
            .sessionManagement(session -> session
                .sessionCreationPolicy(SessionCreationPolicy.STATELESS))
            .csrf(csrf -> csrf.disable())
            .oauth2ResourceServer(server -> server.jwt(Customizer.withDefaults()))
            .build();
    }
}
```

The chain has no `securityMatcher`, so it also denies real handlers outside `/api`.
Boot supplies the security infrastructure; this configuration does not need manual MVC
bootstrap, an authentication provider, a custom filter or a duplicate scope converter.
Keep existing public/management routes only where the deployment policy explicitly allows
them. An adequate existing chain can be edited in place rather than replaced by this class.

CSRF is disabled here **only because accepted credentials are explicitly supplied by the
caller**. A gateway translating a browser cookie into a bearer header still needs an
end-to-end CSRF contract. A combined UI/API service needs its browser protection preserved;
distinct credential policies can justify separate ordered chains. Do not transplant this
disable into that service. CORS configuration is conditional on actual browser clients.

## Verify the application, not an imitation of it

Reuse the existing MVC tests and load this application's security configuration. Use a
slice when it includes the relevant chain and collaborators; use a full Boot context when
auto-configuration, multiple chains or method interception is part of the claim. Keep the
project's managed test dependencies and version-appropriate annotations.

For authorization, a missing bearer header must return 401 with a bearer challenge, a read
principal cannot perform a write, and a write principal can reach the real handler. Check
the denied write never calls the protected collaborator or changes state. Also exercise a
real unmatched handler: a nonexistent URL does not establish its protection.

Use Spring Security's `jwt()` or `opaqueToken()` helpers for those authorization cases.
They deliberately bypass token validation. When issuer/audience/profile configuration
changes, send a signed token in the actual Authorization header to the real decoder, with
a valid control and a hostile value for the changed condition. Do not replace the decoder
with a mock and claim these properties were validated. The
[verification guide](verification.md) selects the additional cases only when their
boundary changes.
