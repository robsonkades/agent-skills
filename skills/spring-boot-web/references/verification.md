# Reproduce HTTP and documentation checks

Load when using the [executable fixture](../assets/contract-fixture/) or interpreting its
evidence. Read its [README](../assets/contract-fixture/README.md) and source before running.
Copy it to a temporary directory; Maven output belongs in that copy, not in this installed
skill. Its manifest includes source files only, excluding build output.

## Compatibility contract

| Layer          | Fixture baseline                                  | Interpretation                                             |
| -------------- | ------------------------------------------------- | ---------------------------------------------------------- |
| Source/runtime | Java 25, no preview features                      | Flag other project baselines; do not migrate implicitly    |
| Build          | Maven 3.9+, Boot parent 4.1.1                     | BOM controls Framework/Jackson/Tomcat versions             |
| Documentation  | springdoc webmvc-ui 3.1.1                         | Inspect transitive Swagger Core/UI before using extra APIs |
| Specification  | OpenAPI 3.1                                       | Verify the generated dialect and consumer support          |
| Environment    | Loopback, random port, `/api`, process-local data | No database, external service or real agent configuration  |

The 3.1.1 springdoc parent declares Boot 4.1.0. Compatibility of the fixture's 4.1.1 patch
pair requires its actual tests. The source and runtime baseline is Java 25. Record runtime
JDK/Maven, compiler release, resolved dependencies, commands and results with each run rather
than inventing an all-Boot-4 guarantee. An earlier development run does not establish a
new compiler baseline or a changed fixture's result; rerun the relevant checks.

Creation-time validation in an isolated copy passed **12 tests, 0 failures/errors/skips**
during a clean Maven package build with **Java release 25 on Temurin 25.0.3**, Maven 3.9.15,
Boot 4.1.1, springdoc 3.1.1, Tomcat 11.0.24 and Jackson 3.1.5. This verifies the exercised
fixture boundaries on that baseline; it does not establish other versions, advanced features
absent from the fixture, arbitrary consumer schemas or browser interaction by itself.

The runtime/spec comparison found and corrected generation mismatches: a class-level
400 response suppressed the operation's example; the runtime omitted the default ProblemDetail
type; nullable referenced objects needed an explicit 3.1 union; and a numeric query default
needed its integer schema preserved; and the array-property example needed typed programmatic
configuration to survive generation. Regression assertions cover those contracts in the
generated documents. Supplementary-character boundaries also exposed UTF-16/code-point length
differences, now covered by matching HTTP validation and schema bounds. These findings justify
inspecting the output, not applying unconditional overrides to every springdoc version.

## What the maintained test exercises

The actual Servlet server receives requests through Java HttpClient. Tests inventory the
application's controller mappings against default/group paths and methods, require operation
descriptions and unique IDs, inspect optional/nested schema descriptions, execute generated
request examples and compare runtime public property sets. Other tests cover Location,
presence/null/string patch behavior, duplicate violations on one field, malformed/missing
input, known 404/409, numeric parameter validation and 204 with no body.

The expanded tests verify common 400/500 components and their schema registration without
incidental controller annotations, operation overrides in both groups, nonempty validation
arrays with complete item/example contracts, bounded list responses, input-method validation
and safe unexpected/return-value 500s. Test-only fault controllers never ship in the runnable
application's main source. Their expected ERROR logs demonstrate internal diagnostics; those
log entries are not test failures. Known 405 retains its Allow header.

Generated documents are written to `target/contracts/` in the isolated copy. Run the
consumer's OpenAPI/JSON Schema validators and semantic diff tool against those documents
when validating their full dialect and example vocabulary. These focused tests are not a
general validator. The UI HTTP check observes assets/configuration only; use the README's
browser flow to assess actual JavaScript behavior and Try it out requests.

The fixture omits credentials and identity enforcement, multipart, polymorphism, callbacks,
webhooks, XML, streaming, ingress proxy, UI plugins and generated clients because they are
not its public contract. Guidance for those families is conditional, and requires a fixture
or application that actually exercises them. Never count an absent family as a tested one.

## Decision walkthroughs when tools are unavailable

Use these as reasoning checks, explicitly labeled walkthroughs, not executed evaluations:

- Same DTO on create and PATCH: determine whether omission and null differ before reusing
  the required-list. Failure is an example that destroys a value when omission should preserve.
- Same path/verb with two media types: compare generated content against both handlers.
  Failure is counting one operation while silently losing a supported representation.
- Root Bearer requirement with one public operation: inspect the operation override and
  actual filter chain. Failure is a document that promises access the server rejects, or
  a public route accidentally protected only in the document.
- I/O-heavy endpoint versus CPU-bound endpoint: keep resource limits constant and change
  only the measured dominant resource. Failure is proposing more virtual concurrency for
  CPU saturation or ignoring downstream budget for I/O waits.
- Default document is corrected but partner group is stale: inspect customizer scope and
  group inventory. Failure is claiming complete coverage after checking only `/v3/api-docs`.
- Documentation-only review with no runnable server: produce evidence-backed findings and
  explicit pending runtime/UI checks. Failure is editing application policy or claiming an
  unperformed validation.

Independent agent evaluations require fixed inputs, expectations and comparable settings;
they are separate from fixture execution. No percentage of behavioral improvement follows
from these examples or from package validation alone.

Primary compatibility evidence: [Boot dependency versions](https://docs.spring.io/spring-boot/appendix/dependency-versions/coordinates.html),
[springdoc 3.1.1 parent](https://repo.maven.apache.org/maven2/org/springdoc/springdoc-openapi/3.1.1/springdoc-openapi-3.1.1.pom),
[Boot 4 migration](https://github.com/spring-projects/spring-boot/wiki/Spring-Boot-4.0-Migration-Guide).
