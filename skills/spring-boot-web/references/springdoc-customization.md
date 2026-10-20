# Springdoc integration without losing the contract

Read when the application uses controller interfaces, composed annotations, asynchronous
return types, reusable errors or custom schema corrections. Start from the generated
document and runtime behavior; use the smallest change that closes the demonstrated gap.
The reference application resolves Boot 4.1.1, springdoc 3.1.1 and Swagger Core 2.2.55;
the executed checks are identified below. Recheck another resolved pair; do not transplant
workarounds merely by version family.

The complete implementations are packaged in the [Customer source index](customer-source-index.md).
Use [the implementation sequence](customer-pattern.md) for class ownership and exact source
limitations; these are complete reference classes, not pseudocode to reconstruct from prose.

## API interfaces and composed annotations

Preserve an established API interface that owns mappings, parameters, Swagger metadata and
validation, with a concrete controller implementing delegation. Inspect inherited methods
and parameter annotations; scanning only annotations directly on the implementation misses
this contract. Verify effective MVC mappings and generated operations together. Do not
duplicate parameter constraints on overrides without checking Bean Validation inheritance.

Spring binding `RequestBody` and Swagger documentation `RequestBody` are different annotations.
Honor project import conventions. Where the project forbids fully qualified annotations and
the simple names collide, a method-level composed annotation such as `ApiRequestBody` can
wrap Swagger's annotation while the API interface imports Spring's binding annotation.
Use runtime retention, the appropriate target and `@AliasFor` pointing to the exact Swagger
attribute for forwarded `description`, `required` and `content`, with compatible attribute
types/defaults. A same-named member alone is not a verified alias.

Do not assume every annotation reader supports every form of composition. Confirm the
resolved springdoc discovery path, and assert the emitted body presence, description, media
type, schema and named examples. Reusable response annotations need the same check, including
their interaction with `@Operation.responses`, `@ApiResponses` and interface overrides. If an
existing layout works, preserve it; annotation relocation is not a goal in itself.

Keep static examples in named text-block constants when that reduces repeated JSON. Store
typed values in programmatic `Example.value`, not a JSON-encoded string pretending to be
an object. Runtime error descriptors can supply safe titles/types for both handlers and
examples; assert serialized output so a shared mistake is not mistaken for conformance.

## Async wrappers are not response bodies

MVC `Callable`, `DeferredResult` and `WebAsyncTask` change request processing, not necessarily
the consumer protocol. Trace the nested generic result, status and headers to the final
HTTP response. Do not document executor/bean-factory internals, infer a 202 job resource,
or substitute an untyped object merely because generation encountered an unfamiliar wrapper.

For a demonstrated `WebAsyncTask<ResponseEntity<PageDto>>` inference problem, springdoc
3.1.1 exposes `SpringDocUtils.getConfig().addResponseWrapperToIgnore(WebAsyncTask.class)`.
Register a genuine non-wire wrapper before document generation. This unwraps a response
container; hiding its schema or globally replacing it with one DTO loses other payloads.
Keep global registration deterministic and account for shared JVM state in tests.

Verify a typed collection/page and an operation without an explicit response schema; otherwise
an annotation can mask broken generic inference for the next endpoint. Check default/group
documents for the actual payload and absence of infrastructure schemas. For MockMvc, dispatch
an async result before asserting its final body/status. Test timeout behavior separately;
the documentation must use the application's actual timeout status and safe error response.

## Shared errors without losing specific contracts

First establish which error paths apply using the
[error-catalog distinction](springdoc-openapi.md#review-every-applicable-feature-family).
Register reachable schemas and reusable response components explicitly, then attach or merge
them only where the policy applies. `GlobalOpenApiCustomizer` covers default and grouped
documents; verify group selectors and actual output. If disabling advice inference with
`springdoc.override-with-generic-response=false`, provide explicit coverage for the applicable
advice errors; the property changes documentation generation, not runtime error handling.

Merge by response status, media type and schema compatibility:

- Preserve success statuses, Location, links and operation-specific error descriptions.
  For an absent applicable status, a reusable response reference can supply the common part.
- Preserve explicit response `$ref` ownership, including external references. Do not add
  content/examples as siblings and assume they augment the referenced Response Object.
  Enrich its owning component or use an intentionally complete inline response instead.
- For an inline response, keep existing media types, headers, links and schema. Add common
  examples only when they satisfy that schema; a domain-specific envelope may be incompatible
  with the generic Problem Details example. Existing named examples win name collisions.
- Respect the exclusivity of media `example` and `examples`. Do not replace a deliberate
  inline example with a generic example set. Preserve explicit header overrides.
- Do not mutate a shared component to add one endpoint's business error. A new unannotated
  controller must not inherit another module's missing-customer or conflict example.

For Problem Details, describe flattened extension fields at the top level, required versus
optional presence, nested violations, public field paths, localization and unknown-extension
handling. Include parameter/header/cookie/part identifiers, supported methods/media types and
upload limits only where the handler emits them. Preserve applicable protocol headers such
as Allow, Accept-Patch, WWW-Authenticate and Retry-After; do not turn illustrative values into
configured limits or a promise that a header is always supplied. Trace security, servlet error
dispatch and committed-response/disconnect paths independently of MVC advice.

Use regressions with a new unannotated operation, a specific response at a shared status,
an incompatible schema, an explicit `$ref`, an inline `example`, colliding example names and
an unrelated controller. Assert both default and grouped documents. Run a customizer twice
on the same model to catch duplicated text/arrays, and check independent groups for accidental
shared mutations. A generation test proves the catalog, not that every catalog error is reachable.

## Targeted schema repair

Compare three artifacts before adding a fix: the runtime contract, the annotation/model
input and the generated schema. Prefer correct inference or a local metadata correction;
use a customizer/model converter only for a demonstrated lost or contradictory constraint.
Keep the fix scoped to owned schemas/properties and the affected input/output direction.

Common checks include lost `minLength`/pattern metadata after validation inference, nullable
arrays/enums, numeric defaults becoming strings and collection examples disappearing. Use
[schema semantics](schemas-and-examples.md) to choose the correction; setting a keyword
without checking its interaction with `$ref`, `enum` or composition can create an impossible
schema. In Swagger Core's 3.1 models, inspect `types` as well as legacy `type`; verify the
serialized result rather than treating an in-memory setter call as evidence.

If using record metadata, check annotations on accessors/components according to their targets,
explicit `@Schema` component names, public Jackson names and `@ArraySchema.arraySchema` versus
item metadata. An allowlisted record helper is not a general Jackson model resolver: it may
miss naming strategies, views, aliases, inherited models, unwrapped fields or custom serializers.
Customer's helper selects the first `allOf` branch with properties and skips missing models;
its records use aligned Java/public names. Preserve and test those preconditions for this
pattern. A different composition or naming strategy requires an explicit adaptation, not
an unverified claim that the helper resolves arbitrary models. Tests should fail if an expected owned
schema/property disappears instead of accepting silent early returns as success.

Preserve required-lists, descriptions, examples, formats, references and existing constraints.
Test positive and negative boundary values and regenerate every group. Keep a failing case
that explains why each workaround exists, and remove the workaround only after the resolved
generator can produce the correct contract without it. Do not disable inference globally or
overwrite every schema to correct one field.

## Evidence and primary sources

The packaged Customer reference contains all 41 production Java files and seven test classes
from the selected working tree. Its six operations, 19 component schemas and eight filter
variants have a [coverage map](customer-coverage.md). The tests exercise inherited interfaces,
composed request bodies, async unwrapping, default/test-group output, links, null/default
semantics, date bounds and distinct create/PATCH/output contracts. Only `@DisplayName` was
added to tests; runtime and assertions remain from the source.

Follow [verification](verification.md) for reproducible checks and their limits. Selected
assertions are not a general schema validator, MockMvc is not a browser and a passing suite
does not demonstrate controlled agent improvement. The original repository is not required
to execute the packaged example; it remains the authority when refreshing its sources.

- [Springdoc interface support](https://springdoc.org/#_does_this_library_supports_annotations_from_interfaces)
- [Springdoc 3.1.1 request-body discovery](https://github.com/springdoc/springdoc-openapi/blob/v3.1.1/springdoc-openapi-starter-common/src/main/java/org/springdoc/core/service/RequestBodyService.java)
- [Springdoc 3.1.1 wrapper configuration](https://github.com/springdoc/springdoc-openapi/blob/v3.1.1/springdoc-openapi-starter-common/src/main/java/org/springdoc/core/utils/SpringDocUtils.java)
- [Swagger Core 2.2.55 RequestBody](https://docs.swagger.io/swagger-core/v2.2.55/apidocs/io/swagger/v3/oas/annotations/parameters/RequestBody.html)
- [Spring Framework 7.0.9 AliasFor](https://docs.spring.io/spring-framework/docs/7.0.9/javadoc-api/org/springframework/core/annotation/AliasFor.html)
- [Spring MVC async processing](https://docs.spring.io/spring-framework/reference/web/webmvc/mvc-ann-async.html)
- [OpenAPI 3.1.1 Reference Object](https://spec.openapis.org/oas/v3.1.1.html#reference-object)
- [Problem Details, RFC 9457](https://www.rfc-editor.org/rfc/rfc9457.html)
