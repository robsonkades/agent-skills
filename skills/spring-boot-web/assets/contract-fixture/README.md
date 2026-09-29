# MVC and OpenAPI contract example

Use this example when comparing a consumer-facing HTTP contract with generated OpenAPI.
It demonstrates five public product operations, optional nested fields, presence-aware PATCH,
Problem Details and a separately published catalog group. It is deliberately more documented
than a minimal controller; do not copy its complete configuration into an ordinary endpoint.

Start with the part that answers the task:

| Task                                                | Read                                         | Why this extra code exists                                                                          |
| --------------------------------------------------- | -------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Implement or document an operation                  | `ProductController`, `Models`, `ApiExamples` | Actual mappings, public DTOs and examples that the tests send over HTTP                             |
| Extend validation errors                            | `ApiErrors`                                  | Consumers require a violations array; standard MVC Problem Details alone would not need this advice |
| Match Unicode length to OpenAPI                     | `CodePointLength`                            | This contract counts code points; standard `@Size` on String counts UTF-16 units                    |
| Diagnose generated schema or grouped-document drift | `ApiDocumentation`                           | Narrow workarounds for observed generator behavior, plus the shared error contract                  |
| Verify HTTP/document agreement                      | `ContractTest`                               | Real server, generated examples and regression assertions; not a reusable test framework            |

`ProductStore` is process-local storage to make create/read/patch examples executable without
a database. It is not a persistence pattern. Java property names match public JSON names and
the query parameter name; the simple advice relies on that condition. If an API renames them,
follow the [public error-location guidance](../../references/mvc-contracts.md).

The example has no security dependency, token issuer, generic field-name resolver or request
buffering advice. Its Boot Jackson parser properties bound depth/string/number lengths.
They do **not** enforce an exact HTTP body-byte ceiling. Authentication and local byte ceilings
need their own project requirements and checks; see [request bounds](../../references/request-bounds.md).

## Run in a disposable copy

Baseline: Java 25 source/runtime, Maven 3.9+, Boot 4.1.1 and springdoc 3.1.1, no preview.
Dependency/cache access is required on a first build. Copy this directory to an isolated
temporary directory before running; Maven writes `target/` and its configured local cache.
No database, external service or real agent configuration is used.

```text
mvn -B test
mvn -B dependency:tree
mvn -B spring-boot:run
```

The application binds to loopback and a random port under `/api`. Read the port from the log:
`http://127.0.0.1:<port>/api/swagger-ui/index.html`. Default/group documents are available at
`/api/v3/api-docs` and `/api/v3/api-docs/catalog`. Stop with Ctrl+C; data disappears on restart.
For a packaged launch, run `mvn -B package`, then
`java -jar target/spring-web-contract-fixture-1.0.0.jar` from the temporary copy.

The tests write generated documents to `target/contracts/`. They compare controller mappings,
public schemas, generated creation examples, Location, PATCH omission/null/string behavior,
duplicate validation messages, safe errors, parser constraints and UI assets/configuration.
See [verification and limits](../../references/verification.md) for what these checks establish.

For a browser check, select catalog, expand createProduct, execute its minimum/complete example
with a fresh catalog code, inspect 201/Location and fetch the product. Try patchProduct with
`{}`, `{"description":null}` and a string value, then deleteProduct. Verify emitted URLs include
`/api`, descriptions/optional fields are visible, and an empty title receives the documented error.
Asset HTTP checks do not execute this browser flow.

These focused assertions are not a general OpenAPI/JSON Schema validator, a production capacity
test, a security assessment or proof that another API is fully documented.
