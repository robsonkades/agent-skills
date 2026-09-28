# Disposable MVC and OpenAPI fixture

This is an executable learning fixture, not an application template. It has five public
product operations, process-local synchronized storage, generated OpenAPI 3.1, a catalog
group and Swagger UI. No database, identity provider, Spring Security or external service
is configured. It binds to loopback and a random port under `/api`.

Baseline: Java 25 source and runtime, Maven 3.9+, Boot 4.1.1, springdoc 3.1.1. Use the resolved dependency
graph to identify Framework, Jackson, Tomcat, Swagger Core and UI versions. No preview flags.
Internet/dependency cache access is required on a first build. See
[verification and limits](../../references/verification.md) for the exercised contracts and
the exact source/runtime baseline of an execution.

The isolated creation-time clean package build passed all 12 tests with compiler release 25
and Temurin 25.0.3, Maven 3.9.15 and the pinned dependencies.

Copy this directory to an isolated temporary directory **before** building. Commands below
are relative to that copy; Maven writes `target/` and its configured local dependency cache.
There are no agent configuration writes, deployments or installations. Never use production
data or point this fixture at a production service.

```text
mvn -B test
mvn -B dependency:tree
mvn -B spring-boot:run
```

Read the selected port from the startup log. Open
`http://127.0.0.1:<port>/api/swagger-ui/index.html`; default/group documents are at
`/api/v3/api-docs` and `/api/v3/api-docs/catalog`. Stop with Ctrl+C. The fixture's data is lost
when it stops. For a packaged launch, run `mvn -B package`, then
`java -jar target/spring-web-contract-fixture-1.0.0.jar` from the isolated copy.

`ContractTest` sends real HTTP requests and writes the two generated specifications under
`target/contracts/`. It compares actual controller mappings with documented operations,
checks descriptions and optional/nested schema inventory, executes generated creation
examples and follows Location, tests presence-aware PATCH and verifies duplicate validation
messages stay 400. It exercises malformed/missing bodies, invalid parameters, known 404/409,
204 without body, grouped customization and UI asset/config responses.

The application defines common MVC 400/500 responses once, reusing response/schema components
in both documents while retaining operation-specific examples. Method/body validation share
the public violations representation: optional, nonempty when present, with every item
documented and no invented maximum. List output has the actual zero-to-fifty bounds. Unicode
code-point limits are consistent across HTTP and JSON Schema. Test-only failures verify safe
500s and internal diagnostics without adding a failure-trigger endpoint to the runnable app.

Its JSON assertions are **not a general OpenAPI/JSON Schema validator**. Use a compatible
validator/linter from the consumer project to validate full documents and examples, then
compare HTTP responses. No benchmark or performance conclusion follows from these tests.

For an interactive UI check, select catalog, expand createProduct, choose the complete or
minimum example, execute, inspect 201/Location and read the created UUID through getProduct.
Try patchProduct with `{}`, null and a string, then deleteProduct; verify requests target
the loopback server with `/api`. Use a fresh catalog code when creating another record.
Observe descriptions, optional/nested fields and the error response for an empty title.
Asset HTTP checks alone do not execute this browser flow.

Conditional families intentionally absent from this fixture: authentication/scopes, multiple
security alternatives, multipart, polymorphism, callbacks/webhooks, XML, streaming, external
proxy, generated clients and custom UI plugins. Their verification must use an application
or an additional fixture that actually has those contracts. Source guidance covers their
decisions but does not claim runtime validation from this example.

No check here establishes a deployed API's complete documentation. Apply the operation and
property inventory and all applicable feature decisions to that API separately.
