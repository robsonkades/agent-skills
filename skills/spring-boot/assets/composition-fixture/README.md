# Boot composition fixture

A small executable fixture for configuration decisions, not a production client or
application template. All code is original to this package. The resource stand-in opens
no network connections; its close counter makes ownership observable.

## Prerequisites and effects

- Maven 3.6.3+ compatible with the pinned Boot parent; authoring environment uses 3.9.15.
- JDK 25 for compilation with `--release 25` and test execution; no preview flags.
- Spring Boot 4.1.1, with validation, Spring and JUnit managed by that parent.
- Dependency access on a cold run. Maven writes its local cache and build output and
  launches a test JVM. There is no Docker, HTTP server, external database or credential.

Read the POM and tests before running. **Copy this directory outside the catalog** so
`target/` cannot be included in a distributed skill. From the temporary copy, run:

```text
mvn -B -ntp test
```

For an isolated dependency cache, add
`-Dmaven.repo.local=<absolute-temporary-directory>`; use the local shell's argument
quoting rules for paths with spaces. No global installation or actual agent configuration
is involved. Do not run `install` or `deploy`. Record `java -version` and `mvn -version`
with the test result. Java 25 is the compilation and runtime baseline. When adapting
this fixture to an existing project targeting another Java version, report the
compatibility difference; do not silently change its wrapper, toolchain or release.

## What the tests discriminate

`CompositionTests` contains 12 tests:

- absent/default, explicit true, explicit false and custom-bean backoff;
- invalid range, zero timeout and malformed duration;
- managed dependency identity and one close on context shutdown;
- full configuration intercepting direct calls versus the deliberately broken lite case;
- actual profile config-data loading, controlled environment override and CLI precedence.

The default auto-configuration receives dependencies through bean-method parameters and
therefore needs no cross-method interception. The broken example is test-only and asserts
the duplicate as a regression demonstration; its unmanaged instance is explicitly closed
by the test. The automatic configuration is loaded directly by the runner or imported
by a minimal bootstrap: no starter JAR discovery/imports-resource behavior is being tested.

The tests should exit successfully with 12 tests and no failure/error/skip. A failed
binding warning is expected in the three negative input tests; inspect the test report,
not log severity alone. Do not claim these tests passed until the command actually ran.

Authoring validation compiled and executed this fixture in a clean isolated copy:
**12 tests passed, no failures, errors or skips**, with Maven 3.9.15, Temurin 25.0.3,
`--release 25` and Boot 4.1.1. Compiler output confirmed release 25 for both main
and test sources. This result applies to this fixture and environment; rerun when
adapting it or changing the managed versions.

This fixture does not exercise real client I/O, partial-startup cleanup, HTTP security,
async/MDC, durable events, Kubernetes draining, native images or performance. Test those
contracts in the consuming project when relevant. It is a teaching fixture, not an
independent agent evaluation or a claim of compatibility with every Boot 4 release.
