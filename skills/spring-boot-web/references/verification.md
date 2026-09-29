# Reproduce HTTP and documentation checks

Load when using the [executable example](../assets/contract-fixture/) or interpreting its
evidence. Read its [README](../assets/contract-fixture/README.md) and relevant source first.
Copy to a temporary directory; Maven output belongs there. The manifest packages source,
not pre-existing build output.

## Compatibility contract

| Layer          | Example baseline                                  | Interpretation                                                |
| -------------- | ------------------------------------------------- | ------------------------------------------------------------- |
| Source/runtime | Java 25, no preview                               | Respect another project's baseline; do not migrate implicitly |
| Build          | Maven 3.9+, Boot parent 4.1.1                     | BOM controls Framework/Jackson/Tomcat                         |
| Documentation  | springdoc webmvc-ui 3.1.1                         | Inspect transitive Swagger Core/UI before using extra APIs    |
| Specification  | OpenAPI 3.1                                       | Verify emitted dialect and consumer support                   |
| Environment    | Loopback, random port, `/api`, process-local data | No database, security dependency or external service          |

The springdoc 3.1.1 parent declares Boot 4.1.0. That provenance does not establish the
fixture's 4.1.1 compatibility: run its tests on the actual pair. Record runtime JDK/Maven,
compiler release, resolved dependencies and observed results. A prior result does not
establish a changed example or an all-Boot-4 guarantee.

## Why these examples remain executable

The useful consumer flow is create, follow Location, inspect optional/nested fields, update
without confusing omission and null, and delete with a bodyless 204. Generated examples
are sent to the server; annotations alone cannot prove they work. The contract tests compare
actual MVC mappings with both published documents and check schemas/statuses/examples.

Additional mechanisms each have a specific reason:

- The violations extension must retain multiple messages for a field. The advice uses
  framework exception hooks to preserve statuses and headers, including 405/Allow and
  return-value validation as 500. Its input names match public DTO/binding names; generic
  Jackson path translation is unnecessary for that example.
- The explicit Unicode contract uses code-point length. HTTP tests exercise supplementary
  characters at/over its limits; replacing it with `@Size` would change the wire contract.
- The tested generator pair needed an explicit null-or-object union for referenced dimensions
  and a typed collection example. Targeted customizers preserve both groups. Numeric defaults,
  omitted default ProblemDetail type and operation-specific errors also have regression checks.
  Reuse these corrections only when the target generator exhibits the same mismatch.
- Boot properties configure parser depth/string/number limits. Hostile PATCH bodies must
  produce a parser error while the stored product remains unchanged; a small invalid DTO
  instead produces the documented violations extension. This is not an exact body-byte test.

Test-only fault injection exercises unexpected exceptions and invalid return values through
the real MVC boundary. Those two fault handlers never ship in the runnable application's main
source. Expected ERROR logs are diagnostics, not test failures.

A synthetic JWT issuer, separate security chain, generic field-path resolver and an arbitrary
local byte-buffer policy are intentionally absent. The skill retains their relevant decisions
in [MVC boundaries](mvc-contracts.md) and [request bounds](request-bounds.md); verify them against
a project that actually needs those contracts instead of copying test scaffolding.

## What to verify separately

Generated documents are written to `target/contracts/`. Use the consumer's compatible
OpenAPI/JSON Schema validator and semantic diff tool for full dialect/example validation.
Selected JSON assertions are not a general validator. The UI HTTP check observes assets and
configuration; use the README browser flow to establish JavaScript behavior and Try it out.

No test here establishes authentication/authorization, public error-name translation under
custom Jackson naming, an exact HTTP byte ceiling, slow clients, decompression, ingress,
multipart, polymorphism, streaming, generated clients or browser interaction. The references
explain those conditional contracts; exercise them only when they exist in the target API.
Do not count an absent feature as tested, or add it solely to expand the example.

For unavailable tools, a structured walkthrough can check decisions but must be labeled as
such. Useful pairs include an adequate enforcing ingress versus a bypassable ingress with
an exact local byte guarantee; a simple String field versus an absent/null-sensitive PATCH;
or an I/O-starved endpoint versus CPU saturation with the same capacity. A correct decision
changes only when the governing constraint changes. Agent comparisons require separate
fixed inputs and comparable runs; example tests do not demonstrate behavioral improvement.

Sources: [Boot dependency versions](https://docs.spring.io/spring-boot/appendix/dependency-versions/coordinates.html),
[springdoc 3.1.1 parent](https://repo.maven.apache.org/maven2/org/springdoc/springdoc-openapi/3.1.1/springdoc-openapi-3.1.1.pom),
[Boot Servlet and Problem Details support](https://docs.spring.io/spring-boot/reference/web/servlet.html),
[Boot Jackson parser properties](https://docs.spring.io/spring-boot/appendix/application-properties/index.html),
[Boot 4 migration](https://github.com/spring-projects/spring-boot/wiki/Spring-Boot-4.0-Migration-Guide).
