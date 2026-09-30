# Reproduce HTTP and documentation checks

Load when using the [executable example](../assets/contract-fixture/) or interpreting its
evidence. Read its [README](../assets/contract-fixture/README.md) and relevant source first.
Copy to a temporary directory; Maven output belongs there. The manifest packages source,
not pre-existing build output.

## Acceptance for a complete API

For a new business service, define executable acceptance around what its consumers need;
the fixture below proves selected MVC mechanisms only. Keep a narrow endpoint/documentation
task focused on its changed contract. For a complete service, coordinate checks with Boot,
persistence and security owners and exercise the assembled application:

- Create valid data, follow Location and recover the same resource after application restart
  against retained storage. Run schema migrations from a clean database. A passing test
  against a process-local map does not satisfy durable registration.
- Race equivalent canonical identifiers through independent transactions/instances using
  shared storage: the invariant must hold, and only the recognized conflict gets its documented
  response. For mutable resources, test the chosen stale-update policy when required.
- Exercise permitted and forbidden operations under the actual access policy. Protected writes
  must reject missing/invalid credentials and insufficient permissions before side effects;
  include object/tenant boundaries when they exist. Public access needs an explicit decision.
- Traverse more data than one page, verify bounded queries and deterministic tie handling,
  and reject invalid bounds. Send malformed, semantically invalid and oversized requests at
  the enforcing layer; assert no mutation. Compare generated schema boundaries and actual
  responses, including optional fields, errors and headers.
- Start with the documented configuration and probe the agreed serving/readiness path, with
  safe diagnostics for failures. The Boot owner selects operational checks; an MVC test alone
  cannot establish service readiness or deployment behavior.

These are checks on requested behavior, not a demand for every CRUD operation, JWT, a new
architecture, Kubernetes or benchmarks. If the user explicitly asks for a disposable demo,
process-local storage and public loopback access can fit that contract. A README disclaimer
cannot silently change an ordinary business-service request into that demo. Report unavailable
database/identity/runtime checks precisely; complete independent work and keep the affected
delivery claim open instead of presenting a test count as service completeness.

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
- The typed business-error family retains the requested ID/SKU without depending on HTTP.
  Tests inspect that context and compare safe 404/409 codes/examples in both published groups;
  local/scoped advice must preserve the shared envelope and leave other controllers to the
  global policy. This does not establish any real application's authorization/existence policy.
- The explicit Unicode contract uses code-point length. HTTP tests exercise supplementary
  characters at/over its limits; replacing it with `@Size` would change the wire contract.
- JSON binding rejects number/boolean-to-text coercion, quoted dimensions and fractional
  truncation while retaining exact integer forms such as `1.0`. HTTP tests compare generated
  types in both groups, check safe 400 responses and no state mutation, and retain create's
  unknown-property ignore policy. This tests MVC binding, not automatic validation of direct
  Java calls; the use-case/domain boundary owns semantic invariants outside HTTP.
- The tested generator pair needed an explicit null-or-object union for referenced dimensions
  and a typed collection example. Targeted customizers preserve both groups. Numeric defaults,
  omitted default ProblemDetail type and operation-specific errors also have regression checks.
  Reuse these corrections only when the target generator exhibits the same mismatch.
- Boot properties configure parser depth/string/number limits. Hostile PATCH bodies must
  produce a parser error while the stored product remains unchanged; a small invalid DTO
  instead produces the documented violations extension. This is not an exact body-byte test.

Test-only fault injection exercises local/scoped exception ownership, unexpected exceptions
and invalid return values through the real MVC boundary. The probes and scoped advice never
ship in the runnable application's main source. Expected ERROR logs are diagnostics, not test failures.

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
