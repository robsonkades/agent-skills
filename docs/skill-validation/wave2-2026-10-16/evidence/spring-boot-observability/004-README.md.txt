# Probe an existing asynchronous trace boundary

Use this optional probe when a real Boot HTTP request loses its parent across an existing
`@Async` call and managed HTTP client. For a project fix, start with that project's test and
reuse only the relevant configuration/assertions. Do not introduce asynchronous work just
to copy the probe, and do not use the loopback topology as an application template.

The useful choices are visible in ordinary Boot code:

- `AsyncWork` receives the managed `RestClient.Builder`; Boot already instruments its HTTP
  call, so there is no extra observation wrapper around the same work.
- `spring.task.execution.propagate-context=true` configures Boot's executor. The controller
  returns the future to Spring MVC rather than blocking on `get()`.
- `ObservationContractTest` uses `@SpringBootTest` and `@AutoConfigureTracing`. Boot owns
  context/executor lifecycle; the only telemetry replacement is a local terminal exporter.

The two tests verify actual span parentage on success/failure, HTTP outcome metrics, no
context left on the reused worker, bounded meter IDs and absent secret labels. The raw
worker inspection is deliberately test-only: decorating it could hide a prior leak.
The single worker, queue capacity, full sampling and `SimpleSpanProcessor` are deterministic
test choices, not production recommendations. Management endpoints are disabled; access
and probe policy must be tested in the application that owns them.

Requires JDK 25 and Maven 3.9.x with Boot 4.1.1 managed dependencies. No preview features,
Docker, database or telemetry backend. Copy this directory to a new temporary directory:

```text
mvn -B -ntp -Dmaven.repo.local=<temporary-cache> test
```

Set `JAVA_HOME` only for that child process. Run without inherited Java agents or application
configuration overrides. The test properties disable remote exporters and OTel environment
mapping; requests use loopback and a random port. Do not build under the skill or check in
`target/`.

For a sensitivity check, change only `spring.task.execution.propagate-context` to `false`
in the temporary copy and run the journey test. It should fail on parentage even though
the HTTP call still works. Restore the property before using the normal result.

See [verification limits](../../references/verification.md). Local SDK output is not proof
of collector ingestion, deployment policy, production overhead or another executor model.
