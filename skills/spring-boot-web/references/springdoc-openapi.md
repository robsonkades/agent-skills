# Complete springdoc/OpenAPI contracts

Read when OpenAPI is required or already maintained, particularly for springdoc generation.
For a tooling/source-of-truth decision, first read [contract delivery](contract-delivery.md);
this reference does not require adding springdoc to a REST Docs or contract-first project.
Completeness means the documented contract
matches every in-scope public operation and property, including optional information and
applicable advanced features. It does not mean decorating a method with every annotation.

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

Use existing annotation placement, controller interfaces or programmatic models when they
are maintainable. Do not create a second controller interface solely to move annotations.
Prefer generated type information when correct, adding semantic description and explicit
overrides where inference cannot express the contract. Documentation must not invent runtime
validation, defaults, supported formats, authentication or error conditions.

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
3. Use a version-compatible OpenAPI validator for document semantics and a compatible schema
   validator for examples. Existing tooling is preferable; a JSON parser only proves syntax.
   A selected assertion suite has a named coverage limit and is not a universal validator.
4. Execute minimum-valid and all-optionals request examples, representative variants, and
   negative cases against an isolated server. Compare status/headers/body to the contract.
   Validate response examples too; do not label an invalid request a normal valid example.
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
[Swagger annotation APIs](https://docs.swagger.io/swagger-core/v2.2.55/apidocs/).
