# Complete springdoc/OpenAPI contracts

Read when OpenAPI is required or already maintained, particularly for springdoc generation.
For a tooling/source-of-truth decision, first read [contract delivery](contract-delivery.md);
this reference does not require adding springdoc to a REST Docs or contract-first project.
Completeness means the documented contract
matches every in-scope public operation and property, including optional information and
applicable advanced features. It does not mean decorating a method with every annotation.

For work following `C:\git\customer`, use [its implementation pattern](customer-pattern.md),
[complete source index](customer-source-index.md) and [operation/property matrix](customer-coverage.md)
as the technical authority. The packaged sources cover every current production class and
test, not a synthetic substitute. Framework references explain mechanisms without replacing
the repository's chosen organization or business semantics.

## Compatibility and ownership

OpenAPI defines a language-neutral contract; Swagger Core supplies Java annotations/models;
springdoc integrates discovery/generation with Spring; Swagger UI renders and executes that
contract. Verify these four layers independently when one loses information.

Inspect resolved versions and springdoc's Boot compatibility guidance. Boot 4 uses the
springdoc 3 line; the maintained fixture pins Boot 4.1.1 and springdoc 3.1.1, without overriding
Swagger transitive dependencies. The springdoc 3.1.1 parent targets Boot 4.1.0; that provenance
does not replace executing the actual patch pair. Use `springdoc-openapi-starter-webmvc-ui`
when UI is needed, or its webmvc-api counterpart for specification-only delivery. Preserve
the project's dependency baseline; do not silently upgrade to obtain an annotation.

Inspect the emitted `openapi` value and consumer support. springdoc exposes
`springdoc.api-docs.version`; verify the chosen release's supported 3.0/3.1 options. A 3.1
schema uses JSON Schema semantics including null, while 3.0 has different schema vocabulary.
Do not put an unsupported keyword into a document and infer support from UI rendering.

Following the Customer pattern means placing mappings, validation and OpenAPI metadata on
the API interface, with delegation in its concrete controller. Reuse the existing interface;
do not duplicate its annotations on overrides. For an unrelated contract-first/REST Docs
task, preserve its established ownership rather than introducing this layout implicitly.
Prefer generated type information when correct, adding semantic description and explicit
overrides where inference cannot express the contract. Documentation must not invent runtime
validation, defaults, supported formats, authentication or error conditions.

For interfaces, composed annotations, async wrappers and programmatic fixes, use
[integration and customization](springdoc-customization.md). Those mechanisms must preserve
the same public contract; moving annotations or adding a customizer is not coverage by itself.

## Inventory before annotation

Enumerate public MVC handlers from source and, when possible, RequestMappingHandlerMapping:
paths, methods, consumes/produces, header/parameter conditions and interface/inherited mappings.
Define scope exclusions such as framework error handlers or management routes with a reason.
Do not hide an application endpoint to increase reported coverage. Automatically supplied
HEAD/OPTIONS behavior needs a deliberate contract decision; it is not a hidden Java method
that must be fabricated as an independent operation.

Trace request and response DTOs recursively through JSON names, views, inheritance, generic
containers, custom converters and polymorphic variants. Walk references with cycle detection;
recursive schemas are legitimate. Inventory runtime public properties, not only annotated
fields or Bean Validation constraints. Include optional fields and error extensions.

For each operation/property record actual semantics, documentation location and verification
status. A compact table or existing API governance tool is sufficient. Use this inventory
to detect omissions and contract drift; do not turn it into unrelated persistent paperwork.

For an API-wide task, make coverage auditable with these two views, in the project's existing
report/test format. Populate them from the application, then compare the generated document;
using OpenAPI as both inventory and result cannot discover an omitted handler or property.

| Inventory row               | Minimum information                                                                                                                                                                                                             |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Operation and variant       | Handler/interface; method/path; consumes/produces and mapping conditions; published groups; operationId; parameters/body; successes/errors/headers; security; example/test; unresolved gap                                      |
| Public property and variant | Operation and input/output/error direction; JSON path including array items/map values; owning schema or composition branch; presence/null/default; constraints and normalization; description/example; source and verification |

One OpenAPI Path Item has one operation per HTTP method. Multiple Java handlers selected by
headers, parameters or content type may collapse into it. Check that every accepted variant
survives as the appropriate parameters, content entries, schemas and conditional descriptions;
do not equate handler count with operation count or silently discard an overload.

Trace public contracts through converters, validators, constructors, patch mappers, use cases,
domain checks and exception translators. A documentation-only DTO for a `JsonNode` body is
not the runtime validator. A supplied repository is evidence for its current revision, not
universal policy: record the chosen working-tree state when local changes matter, and preserve
its actual behavior while reporting contradictions. Ask only about unresolved decisions that
change the consumer contract, such as intended PATCH semantics or an unknown public server.

## Review every applicable feature family

| Family                | Information to supply when applicable                                                                                                                                         | Discriminating verification                                                                                                                 |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Document              | OpenAPIDefinition/Info, API title/version/description, real contact/license/terms, external documentation and server variables                                                | API version is not implicitly the application build version; do not fabricate institutional metadata or production URLs                     |
| Organization          | Tags with useful descriptions, stable unique operationId, summary, detailed effects/preconditions, deprecation and replacement guidance                                       | Consumers can find operations; client generation retains stable identifiers; no duplicate IDs across published scope                        |
| Parameters            | Path/query/header/cookie location, type/format, description, presence, limits, enum/default, examples, style/explode/allowReserved and deprecation                            | Actual MVC binding accepts the documented wire representation; optional parameters receive the same semantic attention as required ones     |
| Request bodies        | Body presence, media type, Schema/ArraySchema, named examples and form/multipart Encoding per part                                                                            | Distinguish Swagger RequestBody from Spring binding; verify JSON part content type and file shape                                           |
| Schemas               | Primitive/object/array/map/generic types, formats, units/precision, descriptions, bounds/patterns/items, required/null, access mode, defaults/examples, additional properties | Compare generated shape with real Jackson and Bean Validation; see the schema reference                                                     |
| Responses             | Each successful status and known failure, meaningful condition, content types, body/schema/examples, headers and links                                                        | Controller/advice/filter paths agree; 204 has no content; Location, cache, retry/idempotency and rate headers reflect actual implementation |
| Security              | Schemes and operation requirements for Basic/Bearer/API key/OAuth2/OpenID Connect; scopes and mTLS where supported                                                            | Match the configured chain and each public override; do not mistake documentation for enforcement                                           |
| Reusable components   | Schemas, responses, parameters, headers, request bodies, examples, security schemes and links through references                                                              | References resolve and shared text does not erase operation-specific conditions or response differences                                     |
| Groups/customization  | GroupedOpenApi selectors, OpenAPI model beans, customizers, model converters, extensions and grouped/default JSON/YAML outputs                                                | Inspect every published document; a customization attached only to the default document may miss a group                                    |
| UI experience         | Discoverability, schema/example navigation, server/group selection, snippets and safe Try it out; theme/layout when requested                                                 | Test the bundled UI with emitted requests, not just a screenshot or a configuration file                                                    |
| Specialized contracts | Composition/discriminators, callbacks, webhooks, operation links, XML, binary downloads, streaming and supported 3.1 keywords                                                 | Use only for actual contracts, verify generator and consumer support, explain behavior the format cannot fully represent                    |

Supply `@Operation`, `@Parameter`, `@Schema`/`@ArraySchema`, `@ApiResponse`, `@Header`,
`@Content`, `@ExampleObject` or equivalent programmatic structures as appropriate. The
criterion is faithful information in the generated contract, not one prescribed placement.

For each family record applicable, not applicable with evidence, or unresolved. Unsupported
tooling is a verification gap, not proof that the feature is irrelevant. Search for actual
security, upload, streaming and outbound HTTP contracts before classifying them as absent.
Do not fabricate contact details, quotas, OAuth providers or webhook behavior to fill a table.

Document all known applicable status paths, including malformed input, missing resources,
known state conflicts, validation and security rejection. A `default` response can describe
an actual fallback but cannot replace specific known behavior. Inspect response inference
from controller advice; avoid propagating every advice response to every operation when it
does not apply. Examples must be synthetic and must not expose internal identifiers/secrets.

Compare annotation scopes in the emitted document: a class-level response and a method-level
response for the same status can merge or override information unexpectedly. Keep distinct
operation error examples where their semantics differ and test that they survive generation.
For ProblemDetail, inspect actual omission/default rules too; do not make the default
`about:blank` type mandatory if the configured mapper omits it.

Separate the reusable error catalog from errors established for an operation. A component
describing 401, 429 or 502 does not prove authentication, rate limiting or an upstream exists.
If the project deliberately publishes a conditional service-wide catalog, retain that policy
with explicit conditions and distinguish it from exercised behavior; do not install the
missing infrastructure or claim every listed status was observed. When adding documentation,
attach only applicable responses unless such a catalog is an established requirement. Shared
response merging and flattened Problem Details need the
[customization rules](springdoc-customization.md#shared-errors-without-losing-specific-contracts).

## Consumer workflows, pagination and links

Describe enough behavior to compose calls: creation and Location, retrieval of the created
identifier, replacement versus partial update, filtering, ordering and empty results. For a
search API, document filter combination (AND/OR), supported operators and wire values,
case/whitespace handling, date inclusivity, repeated criteria and invalid combinations. Query
filters and JSON search filters can have different defaults and accepted representations.

Document page/cursor origin, default/maximum size, sort allowlist, priority and tie-breaker,
total-count meaning, empty and out-of-range pages, and consistency under concurrent changes
when known. A nullable list, an empty list and a list containing null are separate contracts.
Verify the actual defaults after binding/constructor normalization, not just annotation text.

When an operation relationship helps the consumer, an OpenAPI response `Link` can target
an existing operation with `operationId` or `operationRef`, never both. For example,
`$response.body#/id` can supply the created ID to a retrieval path parameter. Verify unique
target resolution, the target's parameter name/location and the expression against a real
response in every published group. A group can exclude the target while retaining the link;
fix that group's relationship deliberately instead of publishing a dangling operationId.
Follow Location separately: a Link is metadata and does not create a response header,
authorize a call, embed hypermedia in the payload or make Swagger UI execute a workflow.

## Security logic is contract logic

In OpenAPI, scheme names in one Security Requirement Object are combined (AND); multiple
objects in the `security` array are alternatives (OR). Empty operation security overrides
root security to make an operation public. An empty requirement object in an alternatives
array allows anonymous access as an alternative. Verify the emitted form rather than
assuming annotation nesting produced the intended logic.

Describe Bearer using a security scheme, not a normal Authorization header parameter. An
API key's header/query/cookie name and scopes must match enforcement. OAuth2/OpenID Connect
URLs and scopes need the actual provider contract; scopes do not automatically implement
business authorization. mTLS representation depends on OAS and consumer support. Do not
invent a flow or include client secrets to make Authorize work.

Check whether the documentation endpoints, management port and UI are intentionally exposed
to the documented audience. UI authorization storage and external validation services are
publication choices; see [UI and publication](swagger-ui.md).

## Verify and report fidelity

1. For springdoc, generate default and all grouped JSON/YAML documents from an isolated
   application/fixture with the actual profile/configuration. For a maintained contract-first
   file, validate that approved source and compare the implementation with it; adding runtime
   generation is optional. Capture exact versions and inputs. Static reading is a fallback
   with explicit limitations, not proof of generated behavior.
2. Compare path/method sets and variant content against the MVC inventory. Recursively compare
   public property sets and meaning against input/output serialization. Check operation IDs,
   media types, response statuses, security logic, required/null/direction and references.
   Check missing and extra entries in both directions, after explicit framework/test-only
   exclusions. Report operation and property gaps separately; a total endpoint count hides
   an undocumented nested field or an impossible composition branch.
3. Use a version-compatible OpenAPI validator for document semantics and a compatible schema
   validator for examples. Existing tooling is preferable; a JSON parser only proves syntax.
   A selected assertion suite has a named coverage limit and is not a universal validator.
4. Execute minimum-valid and all-optionals request examples, representative variants, and
   negative cases against an isolated server. Compare status/headers/body to the contract.
   Validate response examples too; do not label an invalid request a normal valid example.
   Exercise every polymorphic branch, omission/null/default states, conditional combinations,
   empty/out-of-range pages and applicable boundary violations. Compare normalized responses
   after each write path; passing creation tests does not establish PATCH or output constraints.
5. When a UI is delivered, exercise its groups, descriptions, examples, schemas, authentication, and
   actual Try it out requests behind the intended context/proxy. Separate UI limitations
   from invalid specifications and runtime mismatches.
6. Where a consumer client is generated, compile it and exercise representative use. Add
   semantic contract diffing to existing CI: removed operations/fields, changed types,
   newly required input and changed security can break consumers even when JSON is valid.

Declare complete documentation only when all inventoried operations/properties and applicable
families are verified. State inapplicability with the actual condition (for example, no
outbound asynchronous HTTP contract means callbacks are irrelevant). State any unverified
consumer or dialect support. Do not generate unused endpoints or schemas to demonstrate
every feature. Missing applicable details remain work, not a reason to narrow the inventory.

Primary sources: [springdoc integration, groups and FAQ](https://springdoc.org/),
[springdoc properties](https://springdoc.org/properties.html),
[springdoc 3.1.1 dependency parent](https://repo.maven.apache.org/maven2/org/springdoc/springdoc-openapi/3.1.1/springdoc-openapi-3.1.1.pom),
[OpenAPI 3.1.1 specification](https://spec.openapis.org/oas/v3.1.1.html),
[OpenAPI operation links](https://spec.openapis.org/oas/v3.1.1.html#link-object),
[Swagger annotation APIs](https://docs.swagger.io/swagger-core/v2.2.55/apidocs/).
