# Management surface and health groups

Read for Actuator configuration and verification. The following partial properties target
Boot 4.1.1 and demonstrate a small management surface; adapt endpoint choice and security
to the actual consumer. They do not install an exporter or implement authorization:

```properties
management.endpoints.access.default=none
management.endpoint.health.access=read-only
management.endpoint.metrics.access=read-only
management.endpoints.web.exposure.include=health,metrics
management.endpoint.health.show-details=never
management.endpoint.health.probes.enabled=true
management.endpoint.health.group.liveness.include=livenessState
management.endpoint.health.group.readiness.include=readinessState
```

`metrics` is a diagnostic endpoint, not a Prometheus scrape endpoint. If the chosen
consumer needs Prometheus, the registry dependency and `prometheus` endpoint are separate
choices; an OTLP registry instead pushes. Preserve the project's existing exporter and
credentials. Inspect the backend's actual naming and histogram representation rather
than assuming `/actuator/metrics` is its exported format.
[Boot metrics](https://docs.spring.io/spring-boot/reference/actuator/metrics.html)
describes the registry and endpoint integrations.

Availability/access, exposure and authentication answer different questions. Inventory
JMX as well as HTTP, the effective base/context paths, management address/port, proxy
routes and all security chains. A user `SecurityFilterChain` can make default security
back off. Define explicit matching and a fallback policy. Permit only the intended
probe paths anonymously when required, protect operational metrics according to the
scraper's identity, and verify wrong-role as well as anonymous requests. Do not disable
CSRF globally to make a diagnostic client work. Exercise the application's existing access
policy; adding an in-memory user store or a second security chain only for a telemetry
example does not validate the policy used in production.

Health group inclusion is independent of aggregate health. An optional dependency can
make aggregate health DOWN while liveness/readiness remain UP by deliberate policy.
Readiness dependencies require an explicit all-replicas-unready decision; liveness must
not trigger restart because a remote service failed. Test the HTTP response during
`REFUSING_TRAFFIC` and `BROKEN`, not just the JSON status after startup. Custom status
mappings must retain the required DOWN/OUT_OF_SERVICE failure mappings.

Bound a custom health indicator's dependency call with the client's actual acquisition,
connect and response/query timeouts as applicable. Keep the overall check below the probe
budget, including retries; avoid mutating business state or doing expensive full scans.
`management.endpoint.health.logging.slow-indicator-threshold` only controls a warning after
the indicator responds; it does not interrupt a blocked check. Inject a stalled dependency
in a test and verify bounded completion and the intended status. Polling must not consume
the resources the application needs to recover. The
[Boot 4.1.1 health implementation](https://github.com/spring-projects/spring-boot/blob/v4.1.1/module/spring-boot-health/src/main/java/org/springframework/boot/health/actuate/endpoint/HealthEndpointSupport.java)
logs elapsed time in `finally`; configure the timeout at the dependency boundary.

For a separate management server, consider
`management.endpoint.health.probes.add-additional-paths=true` and verify `/livez` and
`/readyz` on the application port with its security rules. Management-port success alone
does not prove the serving connector works. Test those paths on the actual serving port;
a loopback propagation probe does not establish this contract. See the version-matched
[Boot endpoint and probe contract](https://docs.spring.io/spring-boot/reference/actuator/endpoints.html).

For a changed access rule, use hostile requests containing a secret canary and a principal
with insufficient authority. Assert response status, absent protected data, unavailable
diagnostic endpoints, and the actual unhealthy probe status. Never put production secrets
in test fixtures. Network reachability, TLS, proxy policy and deployment probe timing
still require checks at their own boundaries.

Use the project's existing Boot integration test for a changed management contract:

| Change             | Discriminating check                                                                                                                    |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------- |
| Metrics access     | Anonymous and insufficient-authority requests are denied; the intended scraper can read only the required endpoint.                     |
| Endpoint exposure  | Sensitive endpoints such as `env` and `heapdump` remain unavailable unless explicitly required and protected.                           |
| Health details     | An authorized or anonymous response contains only the fields permitted for that consumer; seed fake secret data to detect leakage.      |
| Probe membership   | Fail an optional dependency and inspect aggregate health separately from dedicated liveness/readiness groups.                           |
| Availability state | Publish `REFUSING_TRAFFIC` and `BROKEN` in a test and verify the intended probe responds HTTP 503; restore shared test state afterward. |

Adapt statuses to the application's authentication scheme and explicit health mappings.
For example, a form-login redirect is not a universal 401 contract. These are target-project
verification cases, not claims that the bundled propagation probe tests authorization.

Use the target-version [Spring Security reference](https://docs.spring.io/spring-security/reference/servlet/authorization/authorize-http-requests.html)
for matcher/authorization contracts and the Boot endpoint documentation for its management
integration. Domain authorization design remains with the security specialist.
