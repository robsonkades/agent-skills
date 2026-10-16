# MVC and OpenAPI contract example

Use this example when comparing a consumer-facing HTTP contract with generated OpenAPI.
It demonstrates five public product operations, optional nested fields, presence-aware PATCH,
Problem Details and a separately published catalog group. It is deliberately more documented
than a minimal controller; reuse the relevant mechanism, not the whole fixture as a business
service template. A durable business API needs its actual storage, access and operational
contracts assembled and tested; see [service acceptance](../../references/verification.md#acceptance-for-a-complete-api).

Start with the part that answers the task:

| Task                                                | Read                                                                                  | Why this extra code exists                                                                                       |
| --------------------------------------------------- | ------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Implement or document an operation                  | `ProductController`, `Models`, `ApiExamples`                                          | Actual mappings, public DTOs and examples that the tests send over HTTP                                          |
| Extend validation errors                            | `ApiErrors`                                                                           | Consumers require a violations array; standard MVC Problem Details alone would not need this advice              |
| Map business failures without HTTP coupling         | `BusinessException`, `ProductNotFoundException`, `DuplicateSkuException`, `ApiErrors` | Typed ID/SKU context and stable codes; the advice owns safe 404/409 representations                              |
| Match Unicode length to OpenAPI                     | `CodePointLength`                                                                     | This contract counts code points; standard `@Size` on String counts UTF-16 units                                 |
| Preserve JSON scalar types                          | `JsonInputConfiguration`                                                              | Managed-mapper customization rejects scalar coercion and truncation while accepting exact integers such as `1.0` |
| Diagnose generated schema or grouped-document drift | `ApiDocumentation`                                                                    | Narrow workarounds for observed generator behavior, plus the shared error contract                               |
| Verify HTTP/document agreement                      | `ContractTest`                                                                        | Real server, generated examples and regression assertions; not a reusable test framework                         |

`ProductStore` is process-local storage to make create/read/patch examples executable without
a database. A private read/write lock lets `get` and `list` share read access while keeping
SKU-check-plus-insert, patch and delete exclusive. It preserves insertion order and detached
list snapshots; this is not a measured throughput improvement. The lock protects only this
fixture's map and supplies neither durability nor uniqueness across replicas. It is not a
persistence pattern. Java property names match public JSON names and
the query parameter name; the simple advice relies on that condition. If an API renames them,
follow the [public error-location guidance](../../references/mvc-contracts.md).
Bean Validation is invoked through MVC here; directly constructing a request record or calling
the store does not enforce its transport constraints. A business application's use-case/domain
entry must also enforce its semantic invariants for jobs, messaging and other non-HTTP callers.

JSON string fields reject numeric/boolean tokens. Dimensions accept exact 32-bit integers,
including `1.0` or `2e0`, and reject fractional, quoted or out-of-range values without truncation.
The input customizer retains Boot's mapper and modules; this is the fixture's contract, not
a universal coercion policy for existing APIs. Create ignores unknown properties without
storing them; PATCH rejects them so an unrecognized update cannot appear successful.

Controller methods use concrete `ResponseEntity` types for explicit status/body/headers.
The small sealed business-error family is independent of Spring; adding another business
category requires its explicit API mapping. A missing-product exception retains the UUID
in its field and diagnostic message, while the public response keeps safe detail, `instance`
and an optional business `code`. Unexpected failures retain the sanitized 500 policy.

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
The scalar-binding regression compares both schemas with real requests and checks rejected
input leaves storage unchanged. It also preserves integral decimal/exponent forms.
Test-only local and scoped exception handlers verify precedence over the common `ApiErrors`
advice, whose explicit low priority keeps its unexpected-failure handler as a fallback.
Production code needs specific handlers only where business semantics justify them.
`ProductStoreTest` checks concurrent duplicate creation, patch/delete races and ordered,
detached list snapshots. These checks exercise local invariants, not distributed consistency
or all possible thread interleavings.
See [verification and limits](../../references/verification.md) for what these checks establish.

For a browser check, select catalog, expand createProduct, execute its minimum/complete example
with a fresh catalog code, inspect 201/Location and fetch the product. Try patchProduct with
`{}`, `{"description":null}` and a string value, then deleteProduct. Verify emitted URLs include
`/api`, descriptions/optional fields are visible, and an empty title receives the documented error.
Asset HTTP checks do not execute this browser flow.

These focused assertions are not a general OpenAPI/JSON Schema validator, a production capacity
test, a security assessment or proof that another API is fully documented.
