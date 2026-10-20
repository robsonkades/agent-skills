# Reproduce Customer documentation checks

Read the [executable reference README](../assets/customer-reference/README.md),
[source index](customer-source-index.md) and [coverage matrix](customer-coverage.md).
Copy the bundle to a temporary workspace; build output must not enter the skill package.
It contains all 41 production Java files and seven test classes. The source is the current
working tree, including local changes and new files; removed modules remain excluded.

## Verify source fidelity first

Compare every path in [source-provenance.json](../assets/customer-reference/source-provenance.json)
with the authoritative checkout. Production Java, pom.xml and application.yaml must match.
Test files differ only by the DisplayName import and annotations: strip those additions and
compare the rest. All 56 test methods must have DisplayName; retain assertions and setup.

When refreshing, inventory the checkout again, including new collaborators and tests.
HEAD alone is insufficient for a dirty working tree: preserve hashes and the selection rule.
Never edit the reference project to make a skill example pass or restore deleted classes
from an older commit.

## Execute the packaged source

| Layer         | Reference baseline                                                   | What to observe                                              |
| ------------- | -------------------------------------------------------------------- | ------------------------------------------------------------ |
| Java          | Java 25, no preview                                                  | Compiler release and actual runtime                          |
| Build         | Maven 3.9+, Boot parent 4.1.1                                        | Managed dependency graph and successful compilation          |
| Documentation | springdoc webmvc-ui 3.1.1                                            | Concrete payloads and customization in generated output      |
| Specification | Emitted OpenAPI 3.1.0                                                | Six business operations, 19 schemas, eight filter variants   |
| Runtime       | In-memory repository; no production groups/security/server overrides | Do not infer durability, authentication or an ingress policy |

Run `mvn -B -ntp test` in the temporary copy; use `-o` only with the exact dependencies
already cached. Seven classes contain 56 test methods and produce **126 test executions**.
Both the original working-tree copy and the independently copied packaged files passed
with no failures, errors or skips on Java 25.0.3 and Maven 3.9.15 during this review.
Rerun after subsequent source changes rather than transferring this result automatically.
Expected error logs from injected failures do not
replace the Surefire result.

Tests write `target/openapi/openapi.json` and `target/openapi/contract-test.json`.
The latter is a test-only group. Production declares no GroupedOpenApi bean. The unannotated
documentation probe is also test-only; exclude it when counting production operations.

## What each check establishes

- **Operations and properties:** compare interface mappings and DTO/record properties to
  generated output. Cover every media type, parameter/default, required/null state,
  concrete response, Location and retrieval link. The [matrix](customer-coverage.md)
  inventories all six business operations and 19 schemas.
- **Search composition:** verify all eight singleton tags, discriminator mapping, use-site
  oneOf and variant allOf. Check named examples, nullable enums, both allowed date bounds,
  invalid ranges, sort priority and collection limits.
- **Distinct write paths:** compare create/PUT Bean Validation to tree-based PATCH and
  domain normalization. Preserve different text/date/state rules. Execute complete write
  examples, empty/null/unknown-field PATCH failures and supplied-address requirements.
- **Error ownership:** exercise scoped business advice, framework hooks, unexpected failures
  and hidden servlet dispatch. Assert status/body/media type/instance, headers such as
  405/Allow, validation extensions and committed/disconnected behavior. Conditional
  catalog entries such as 401/429 do not establish runtime enforcement.
- **Customization:** default/group tests cover inherited metadata, ApiRequestBody aliases,
  async unwrapping and business/common error merging. If changing the merge algorithm,
  also test explicit response references, incompatible schemas, singular examples,
  preserved named examples/headers and repeated customization.
- **Readable tests:** retain focused assertions and parameterized cases, with DisplayName
  on every test method. Mockito in the MVC slice comes from this reference and does not
  change the separate no-mocks rule for DDD domain tests.

HTTP tests use MockMvc and asyncDispatch; direct handler tests are not network tests.
No source test establishes DELETE, code-point validation, configured parser limits
or an exact body-byte budget.

## Validate documents, examples and UI separately

Use a compatible OpenAPI validator on both generated documents and a JSON Schema 2020-12
validator on media examples and positive/negative boundaries. Configure format assertions
and resolve local references. A parser or selected JSON assertions are not a general
schema validator. Report warnings by cause, including intentionally absent security.

Execute the [browser flow](../assets/customer-reference/README.md#inspect-swagger-ui) against
the isolated packaged application. Inspect descriptions, examples, schemas, filter variants
and successful/error Try it out calls. An HTML 200 or MockMvc result does not execute UI
JavaScript. Report an unavailable browser as a specific gap.

Customer's @Size versus JSON Schema length units, restricted nested PATCH semantics and
conditional error catalog require precise descriptions; do not hide them to claim exact
conformance. These tests do not establish production ingress, security, durability, uploads,
streaming or generated-client compatibility. Exercise these when a target API contains them.

Application tests do not demonstrate controlled agent improvement. The review cases below
specify decisions to assess; they are not a report of executed agent comparisons.

### Recorded checks for this snapshot

Both generated documents passed Redocly CLI 2.65.0 with its minimal rules. Fourteen warnings
remain across the two files: one generated test-server URL warning and six absent-security
warnings per document. The source has no security scheme; adding one would fabricate policy.
Ajv 8.20.0 with ajv-formats 3.0.1 validated all 102 media-example occurrences and eight
null/enum/date-bound cases per document, with no failures. Shared/repeated examples are
occurrences, not 102 independent consumer scenarios.

The packaged server also passed seven real HTTP exchanges on loopback with a random port:
create, follow Location, list, search, replace, patch and an empty-patch business 400.
Their bodies validated against the emitted response schemas. The UI HTML and bundle reference
were reachable, but no browser was available. Swagger UI rendering and Try it out remain
unverified; use the README flow to complete that check. This limitation does not change the
recorded HTTP, document and schema-validation results.

## Documentation review cases

Use these reproducible cases when reviewing a whole-API documentation change or the
[integration mechanisms](springdoc-customization.md). They are specified behavioral cases,
not a report of executed agent comparisons. Keep expected outcomes separate from an actor's
task input when running an evaluation. Existing application tests can verify the technical
mechanisms without establishing that an agent using the skill will make every correct choice.

| Request and context                                                                                                                        | Expected behavior and required artifact                                                                                                                   | Failure conditions                                                                                                                                |
| ------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Document all operations in an MVC API whose mappings and composed request-body annotations live on an interface; returns use WebAsyncTask. | Inventory effective mappings, retain annotation ownership, verify aliases and unwrapped payloads in default/group output; execute final async responses.  | Empty body docs, missing inherited route, executor schemas, or an invented 202 job protocol.                                                      |
| Document a search body containing eight tagged filter variants, nullable enum defaults, sort priorities and from/to bounds.                | Verify every tag/mapping and branch; validate examples for all variants, null/default states, both allowed date bounds and invalid combinations.          | Base/variant composition loop, overlapping oneOf alternatives, null rejected by enum despite nullable type, or oneOf rejecting both valid bounds. |
| Same tagged union, but a child property is a legitimate recursive tree.                                                                    | Preserve recursive data references with cycle-aware traversal and finite examples; distinguish them from a same-instance composition loop.                | Flattening or banning every circular reference to make the first case pass.                                                                       |
| Create validates a maximum length and past date; tree-based PATCH accepts longer text and today's date.                                    | Separate input and output schemas, trace both validation paths, document normalization and compare responses after both writes.                           | Copying create bounds to PATCH/output or silently tightening runtime behavior.                                                                    |
| PATCH advertises RFC 7396 but replaces a supplied address and requires all its fields.                                                     | Show the implementation/protocol discrepancy and request the intended contract before behavioral changes; document known restrictions.                    | Claiming full recursive merge compliance from the media type or changing the API without resolving intent.                                        |
| A shared error catalog merges with specific responses, references and single examples.                                                     | Verify schema-compatible merges, ownership of refs, example exclusivity, preserved headers/links/successes, idempotence and group isolation.              | Cross-controller business errors, incompatible generic examples, overwritten explicit responses, or claiming catalog 401/429 proves enforcement.  |
| Two handlers share a method/path with different media types, and one published group excludes a linked operation.                          | Inventory both variants, verify both content entries and repair or explicitly resolve the group's operation link.                                         | Using operation count as completeness or publishing a dangling operationId.                                                                       |
| Request all Swagger features, but there is no auth, upload or outbound webhook contract and public server URLs are unknown.                | Complete evidenced operation/property documentation, record inapplicability, ask about genuinely unknown publication data and keep its status unresolved. | Fabricated provider/production URL, unused endpoints added for annotations, or a false complete/verified claim.                                   |

For a documentation delivery, report the inventoried operations/variants and schemas/property
gaps, generated artifacts/groups, checks run and unresolved contract decisions. Separate
document parsing, dialect/schema validation, HTTP conformance, UI interaction and generated
client checks. A pass at one layer is not a pass at the others.

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
