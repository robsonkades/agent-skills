import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.interfaces.RSAPrivateKey;
import java.security.interfaces.RSAPublicKey;
import java.time.Instant;
import java.util.Date;
import java.util.List;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.function.Consumer;

import com.nimbusds.jose.JOSEObjectType;
import com.nimbusds.jose.JWSAlgorithm;
import com.nimbusds.jose.JWSHeader;
import com.nimbusds.jose.crypto.RSASSASigner;
import com.nimbusds.jwt.JWTClaimsSet;
import com.nimbusds.jwt.SignedJWT;
import jakarta.servlet.http.Cookie;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.annotation.Order;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.mock.web.MockServletContext;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.oauth2.jose.jws.SignatureAlgorithm;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.JwtValidators;
import org.springframework.security.oauth2.jwt.NimbusJwtDecoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.HttpStatusEntryPoint;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.context.support.AnnotationConfigWebApplicationContext;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;
import org.springframework.web.servlet.config.annotation.EnableWebMvc;

import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.security.test.web.servlet.setup.SecurityMockMvcConfigurers.springSecurity;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.options;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

/**
 * Isolated test fixture, not production configuration. Java 17 source; dependencies
 * and execution instructions are in references/verification.md. No network services
 * or persistent writes are used. Private keys exist only in this process.
 */
public class SecurityContractCheck {
    static final String ISSUER = "https://issuer.example.test";
    static final String AUDIENCE = "orders-api";
    static final AtomicInteger EFFECTS = new AtomicInteger();
    static KeyPair trustedKey;
    static int checks;

    public static void main(String[] args) throws Exception {
        KeyPairGenerator generator = KeyPairGenerator.getInstance("RSA");
        generator.initialize(2048);
        trustedKey = generator.generateKeyPair();
        KeyPair hostileKey = generator.generateKeyPair();
        try (var context = new AnnotationConfigWebApplicationContext()) {
            context.setServletContext(new MockServletContext());
            context.register(FixtureConfiguration.class);
            context.refresh();
            MockMvc mvc = MockMvcBuilders.webAppContextSetup(context)
                .apply(springSecurity()).build();

            String read = access("orders.read", claims -> {});
            String write = access("orders.write", claims -> {});
            check(mvc, "no token", get("/api/orders/7"), 401, 0);
            check(mvc, "valid read", bearer(get("/api/orders/7"), read), 200, 1);
            check(mvc, "read cannot write", bearer(post("/api/orders/7"), read), 403, 0);
            check(mvc, "valid write", bearer(post("/api/orders/7"), write), 200, 1);
            check(mvc, "missing scope", bearer(get("/api/orders/7"),
                access(null, claims -> {})), 403, 0);
            check(mvc, "wrong audience", bearer(get("/api/orders/7"),
                access("orders.read", claims -> claims.audience("other-api"))), 401, 0);
            check(mvc, "missing audience", bearer(get("/api/orders/7"),
                access("orders.read", claims -> claims.audience((List<String>) null))), 401, 0);
            check(mvc, "wrong issuer", bearer(get("/api/orders/7"),
                access("orders.read", claims -> claims.issuer("https://hostile.example.test"))), 401, 0);
            check(mvc, "expired", bearer(get("/api/orders/7"),
                access("orders.read", claims -> claims.expirationTime(Date.from(Instant.now().minusSeconds(300))))), 401, 0);
            check(mvc, "missing expiry", bearer(get("/api/orders/7"),
                access("orders.read", claims -> claims.expirationTime(null))), 401, 0);
            check(mvc, "future nbf", bearer(get("/api/orders/7"),
                access("orders.read", claims -> claims.notBeforeTime(Date.from(Instant.now().plusSeconds(300))))), 401, 0);
            check(mvc, "wrong signing key", bearer(get("/api/orders/7"),
                signed(hostileKey, JWSAlgorithm.RS256, "at+jwt", "orders.read", claims -> {})), 401, 0);
            check(mvc, "disallowed signing algorithm", bearer(get("/api/orders/7"),
                signed(trustedKey, JWSAlgorithm.RS512, "at+jwt", "orders.read", claims -> {})), 401, 0);
            check(mvc, "ID-like token has wrong type even with API audience", bearer(get("/api/orders/7"),
                signed(trustedKey, JWSAlgorithm.RS256, "JWT", "orders.read", claims -> {})), 401, 0);
            check(mvc, "malformed bearer", bearer(get("/api/orders/7"), "not-a-jwt"), 401, 0);
            check(mvc, "cookie does not authenticate header-only API", get("/api/orders/7")
                .cookie(new Cookie("access_token", write)), 401, 0);
            check(mvc, "actual unclassified API handler", bearer(get("/api/new-route"), read), 403, 0);
            check(mvc, "actual handler outside API", get("/unclassified"), 403, 0);
            check(mvc, "method permission required", bearer(get("/api/report"), read), 403, 0);
            check(mvc, "method permission granted", bearer(get("/api/report"),
                access("report.export", claims -> {})), 200, 1);

            // Authorization-only control: this expired, wrong-issuer mock is accepted.
            // It proves why jwt() cannot demonstrate decoder validation.
            check(mvc, "mock bypasses decoder", get("/api/orders/7").with(jwt().jwt(builder -> builder
                .issuer("https://hostile.example.test")
                .expiresAt(Instant.now().minusSeconds(300))
                .claim("scope", "orders.read"))), 200, 1);

            // Mocked users here deliberately isolate CSRF, not credential validation.
            check(mvc, "browser missing CSRF", post("/browser/change").with(user("alice")), 403, 0);
            check(mvc, "browser invalid CSRF", post("/browser/change").with(user("alice"))
                .with(csrf().useInvalidToken()), 403, 0);
            check(mvc, "browser valid CSRF", post("/browser/change").with(user("alice"))
                .with(csrf()), 200, 1);
            MvcResult preflight = check(mvc, "allowed preflight", preflight("https://app.example.test"), 200, 0);
            if (!"https://app.example.test".equals(preflight.getResponse().getHeader("Access-Control-Allow-Origin"))) {
                throw new AssertionError("allowed preflight lost its origin header");
            }
            check(mvc, "hostile preflight", preflight("https://hostile.example.test"), 403, 0);
            check(mvc, "hostile actual CORS request", bearer(post("/api/orders/7"), write)
                .header("Origin", "https://hostile.example.test"), 403, 0);
        }
        System.out.println("PASS: " + checks + " security cases; real decoder and mock-only cases are labeled.");
    }

    static MvcResult check(MockMvc mvc, String name, MockHttpServletRequestBuilder request,
                           int expectedStatus, int expectedEffects) throws Exception {
        int before = EFFECTS.get();
        MvcResult result = mvc.perform(request).andReturn();
        if (result.getResponse().getStatus() != expectedStatus || EFFECTS.get() - before != expectedEffects) {
            throw new AssertionError(name + ": status=" + result.getResponse().getStatus()
                + ", effects=" + (EFFECTS.get() - before));
        }
        if (expectedStatus == 401) {
            String challenge = result.getResponse().getHeader("WWW-Authenticate");
            if (challenge == null || !challenge.startsWith("Bearer")) {
                throw new AssertionError(name + ": missing bearer challenge");
            }
        }
        checks++;
        return result;
    }

    static MockHttpServletRequestBuilder bearer(MockHttpServletRequestBuilder request, String token) {
        return request.header("Authorization", "Bearer " + token);
    }

    static MockHttpServletRequestBuilder preflight(String origin) {
        return options("/api/orders/7").header("Origin", origin)
            .header("Access-Control-Request-Method", "POST")
            .header("Access-Control-Request-Headers", "Authorization");
    }

    static String access(String scope, Consumer<JWTClaimsSet.Builder> mutate) throws Exception {
        return signed(trustedKey, JWSAlgorithm.RS256, "at+jwt", scope, mutate);
    }

    static String signed(KeyPair key, JWSAlgorithm algorithm, String type, String scope,
                         Consumer<JWTClaimsSet.Builder> mutate) throws Exception {
        Instant now = Instant.now();
        JWTClaimsSet.Builder claims = new JWTClaimsSet.Builder().issuer(ISSUER).audience(AUDIENCE)
            .subject("alice").issueTime(Date.from(now)).expirationTime(Date.from(now.plusSeconds(600)))
            .jwtID("fixture-token").claim("client_id", "fixture-client");
        if (scope != null) {
            claims.claim("scope", scope);
        }
        mutate.accept(claims);
        SignedJWT jwt = new SignedJWT(new JWSHeader.Builder(algorithm)
            .type(new JOSEObjectType(type)).keyID("fixture-key").build(), claims.build());
        jwt.sign(new RSASSASigner((RSAPrivateKey) key.getPrivate()));
        return jwt.serialize();
    }

    @Configuration(proxyBeanMethods = false)
    @EnableWebMvc
    @EnableWebSecurity
    @EnableMethodSecurity
    public static class FixtureConfiguration {
        @Bean
        JwtDecoder decoder() {
            // Test-only key source. Production uses its explicitly trusted key contract.
            NimbusJwtDecoder decoder = NimbusJwtDecoder.withPublicKey((RSAPublicKey) trustedKey.getPublic())
                .signatureAlgorithm(SignatureAlgorithm.RS256).build();
            decoder.setJwtValidator(JwtValidators.createAtJwtValidator()
                .issuer(ISSUER).audience(AUDIENCE).build());
            return decoder;
        }

        @Bean
        @Order(1)
        SecurityFilterChain api(HttpSecurity http) throws Exception {
            CorsConfiguration cors = new CorsConfiguration();
            cors.setAllowedOrigins(List.of("https://app.example.test"));
            cors.setAllowedMethods(List.of("GET", "POST"));
            cors.setAllowedHeaders(List.of("Authorization", "Content-Type"));
            cors.setAllowCredentials(false);
            UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
            source.registerCorsConfiguration("/api/**", cors);
            return http.securityMatcher("/api/**")
                .authorizeHttpRequests(rules -> rules
                    .requestMatchers(HttpMethod.GET, "/api/orders/*").hasAuthority("SCOPE_orders.read")
                    .requestMatchers(HttpMethod.POST, "/api/orders/*").hasAuthority("SCOPE_orders.write")
                    .requestMatchers(HttpMethod.GET, "/api/report").authenticated()
                    .anyRequest().denyAll())
                .sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                // Scoped to header-only bearer; browser chain below retains CSRF.
                .csrf(csrf -> csrf.disable())
                .cors(configuration -> configuration.configurationSource(source))
                .oauth2ResourceServer(server -> server.jwt(jwt -> {}))
                .build();
        }

        @Bean
        @Order(2)
        SecurityFilterChain browserFixture(HttpSecurity http) throws Exception {
            // Authentication is injected only by tests; this is not a login implementation.
            return http.securityMatcher("/browser/**")
                .authorizeHttpRequests(rules -> rules.anyRequest().authenticated()).build();
        }

        @Bean
        @Order(3)
        SecurityFilterChain fallback(HttpSecurity http) throws Exception {
            return http.authorizeHttpRequests(rules -> rules.anyRequest().denyAll())
                .exceptionHandling(errors -> errors.authenticationEntryPoint(
                    new HttpStatusEntryPoint(HttpStatus.FORBIDDEN))).build();
        }

        @Bean Reports reports() { return new Reports(); }
        @Bean Routes routes(Reports reports) { return new Routes(reports); }
    }

    public static class Reports {
        @PreAuthorize("hasAuthority('SCOPE_report.export')")
        public String export() {
            EFFECTS.incrementAndGet();
            return "report";
        }
    }

    @RestController
    public static class Routes {
        private final Reports reports;
        public Routes(Reports reports) { this.reports = reports; }

        @GetMapping({"/api/orders/{id}", "/api/new-route", "/unclassified"})
        public String read() { EFFECTS.incrementAndGet(); return "read"; }

        @PostMapping({"/api/orders/{id}", "/browser/change"})
        public String write() { EFFECTS.incrementAndGet(); return "changed"; }

        @GetMapping("/api/report")
        public String report() { return reports.export(); }
    }
}
