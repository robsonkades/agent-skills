# Implement the Customer documentation pattern

Read when implementing or reviewing OpenAPI documentation, placing its classes, or
separating runtime error handling from documented errors. The technical pattern is the
user-selected **current working tree** of C:/git/customer, not its last commit alone.
The [source index](customer-source-index.md) links every shipped source; the
[provenance manifest](../assets/customer-reference/source-provenance.json) records source
hashes. Modified and new files are included; deleted CRM modules are not examples.

The source uses Java 25, Boot 4.1.1, springdoc webmvc-ui 3.1.1 and Jackson 3 databind.
Preserve those APIs when replaying it; inspect a target's actual dependencies before
adapting them. Use explicit imports and simple annotation/type names, as required by
the reference's AGENTS.md. Keep its Portuguese consumer descriptions/examples when
reproducing it. New business vocabulary, constraints and publication metadata require
target evidence, not a change of nouns in a generic CRUD template.

## Place each responsibility where the reference places it

Paths below start at src/main/java/io/github/robsonkades/ in the
[source bundle](../assets/customer-reference/README.md).

| Responsibility                                    | Complete implementation                                                                                                                                                                                                                                                                                                            | What belongs there                                                                                                              |
| ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Document identity and response unwrapping         | [config/OpenApiConfiguration.java](../assets/customer-reference/src/main/java/io/github/robsonkades/config/OpenApiConfiguration.java)                                                                                                                                                                                              | OpenAPI Info, service-wide consumer semantics, early WebAsyncTask registration                                                  |
| Common error schemas and response catalog         | [config/GlobalErrorOpenApiCustomizer.java](../assets/customer-reference/src/main/java/io/github/robsonkades/config/GlobalErrorOpenApiCustomizer.java)                                                                                                                                                                              | ProblemDetail schema, reusable responses/examples/headers, additive operation merging for default and groups                    |
| Business schema corrections                       | [customer/config/CustomerSchemaOpenApiCustomizer.java](../assets/customer-reference/src/main/java/io/github/robsonkades/customer/config/CustomerSchemaOpenApiCustomizer.java)                                                                                                                                                      | Allowlisted Customer record metadata, nullable enums, conditional date-bound schema                                             |
| HTTP contract                                     | [customer/controller/documentation/CustomerApi.java](../assets/customer-reference/src/main/java/io/github/robsonkades/customer/controller/documentation/CustomerApi.java)                                                                                                                                                          | Interface mappings, binding annotations, validation, tags, operation IDs, descriptions, parameters, bodies, responses and links |
| HTTP execution                                    | [customer/controller/CustomerRestController.java](../assets/customer-reference/src/main/java/io/github/robsonkades/customer/controller/CustomerRestController.java)                                                                                                                                                                | Implements the interface, calls the existing service, maps request/output, returns concrete ResponseEntity inside WebAsyncTask  |
| Public representations                            | [customer/controller/dto/](../assets/customer-reference/src/main/java/io/github/robsonkades/customer/controller/dto/)                                                                                                                                                                                                              | Separate create, patch, response, page, search, sort and filter schemas; property semantics and examples                        |
| Named JSON examples                               | [customer/controller/documentation/CustomerApiExamples.java](../assets/customer-reference/src/main/java/io/github/robsonkades/customer/controller/documentation/CustomerApiExamples.java)                                                                                                                                          | Package-private text-block constants for requests, responses, pagination and variants                                           |
| Swagger request-body alias                        | [ApiRequestBody.java](../assets/customer-reference/src/main/java/io/github/robsonkades/customer/controller/documentation/ApiRequestBody.java)                                                                                                                                                                                      | Runtime method annotation forwarding description, required and content via AliasFor                                             |
| Reusable business error documentation             | [CustomerNotFoundResponse.java](../assets/customer-reference/src/main/java/io/github/robsonkades/customer/controller/documentation/CustomerNotFoundResponse.java), [InvalidCustomerResponse.java](../assets/customer-reference/src/main/java/io/github/robsonkades/customer/controller/documentation/InvalidCustomerResponse.java) | Method annotations with specific status, ProblemDetail schema, safe type/title/detail and named examples                        |
| Read annotation metadata without import conflicts | [RecordSchemaMetadata.java](../assets/customer-reference/src/main/java/io/github/robsonkades/customer/controller/documentation/RecordSchemaMetadata.java)                                                                                                                                                                          | Immutable metadata read from record accessors, distinct from Swagger model Schema                                               |
| Business HTTP failures                            | [CustomerExceptionHandler.java](../assets/customer-reference/src/main/java/io/github/robsonkades/customer/controller/CustomerExceptionHandler.java)                                                                                                                                                                                | Customer-only 400/404 handling, explicit scope and highest precedence                                                           |
| Shared MVC failures                               | [exception/GlobalExceptionHandler.java](../assets/customer-reference/src/main/java/io/github/robsonkades/exception/GlobalExceptionHandler.java)                                                                                                                                                                                    | Framework exception hooks, validation details, fallback status/body/header handling and unexpected-error logging                |
| Error vocabulary                                  | [exception/StandardProblem.java](../assets/customer-reference/src/main/java/io/github/robsonkades/exception/StandardProblem.java)                                                                                                                                                                                                  | Stable type/title/detail descriptors, exception/status selection and standard defaults                                          |
| Servlet error dispatch                            | [exception/GlobalErrorController.java](../assets/customer-reference/src/main/java/io/github/robsonkades/exception/GlobalErrorController.java)                                                                                                                                                                                      | Hidden error endpoint using servlet attributes and the same public ProblemDetail fields                                         |

The source index also includes every application/domain collaborator needed to compile
these classes. Their presence makes the example executable; this documentation skill does
not authorize replacing a target's domain, use cases or persistence with this example.

## Add or document an operation

1. Inspect the target's actual operation and its application/domain validation. Inventory
   request and response media, parameters, DTOs, status/header paths and side effects.
   The [coverage map](customer-coverage.md) identifies all six reference operations.
2. Define the corresponding contract on the feature's API interface. Follow CustomerApi:
   class-level RequestMapping and Tag; method mapping, stable unique operationId,
   summary and behavior description; parameter binding, presence, descriptions,
   constraints and examples. Preserve established IDs, including customers:search.
3. Use the distinct public DTO or documentation model for that operation. Annotate every
   property, including optional and nested properties; document omission, null, blank,
   defaults, normalization, formats, limits and array-item behavior where relevant.
   Documentation annotations do not execute validation.
4. Bind through Spring's RequestBody and describe the body with ApiRequestBody. The
   latter wraps Swagger's RequestBody and forwards its three supported attributes using
   AliasFor; same-named attributes without aliases do not reproduce this source.
   Keep the two roles distinct without fully qualified annotations in the method body.
5. Supply named examples from the feature's examples class. Include success variants,
   relevant empty/edge outcomes and safe errors. Keep invalid test inputs outside valid
   request-example sets. Reuse the business response annotations on affected methods.
6. Implement the interface in the controller, retaining constructor injection, mapping
   and delegation. Avoid duplicating interface binding/validation/Swagger annotations
   on the overrides. Return the actual status, concrete body and headers.
7. Verify emitted JSON and final HTTP results. For WebAsyncTask, use asyncDispatch in
   MockMvc when processing is async. Do not infer a 202 job API from a wrapper.
   Source tests show both explicit response schemas and an unannotated async probe.

Creation builds ServletUriComponentsBuilder from the incoming request URI before the
async callback, appends customerId, and returns 201 with an absolute Location. The source
test exercises origin/context preservation and exclusion of query parameters. Its
OpenAPI Link maps $response.body#/id to getCustomerById; neither a link annotation nor
an illustrative api.example.com URL establishes a configured production server.

## Keep request, patch and response contracts distinct

CustomerRequest/CustomerAddressRequest carry create/replace Bean Validation and Schema
metadata. CustomerResponse/CustomerAddressResponse describe normalized output, including
generated read-only ID and an always-present but nullable complement. They do not inherit
maximum text lengths that PATCH can exceed.

CustomerPatchRequest and CustomerPatchAddressRequest are documentation models for the
JsonNode accepted by the controller. The real parser is
[CustomerPatchMapper](../assets/customer-reference/src/main/java/io/github/robsonkades/customer/controller/CustomerPatchMapper.java);
the service/domain enforce the subsequent invariants. Root omission preserves state;
root null/blank values, unknown fields and an empty patch are rejected. A supplied address
replaces the whole address and requires its mandatory members; complement omission/null/
blank clears it. PATCH permits longer text and today's birth date unlike POST/PUT.
Preserve these observed differences. The media type and prose mention JSON Merge Patch;
the complete-address restriction is not proof of a general recursive merge algorithm.
Document it and ask about intent only if a requested change depends on that distinction.

CustomerFilterRequest demonstrates a sealed interface with eight nested record variants.
Keep Jackson JsonTypeInfo/JsonSubTypes IDs synchronized with Schema discriminator mappings
and the synthetic _discriminator SchemaProperty. Each branch requires its own tag value.
The generated search item oneOf selects variants; their allOf shares the common schema.
Do not add another oneOf to the base and create a same-instance composition cycle.
Use the source's exact/contains wire values, default exact, nullable operators, inclusive
date range and sort semantics; the coverage reference maps every variant.

## Separate four parts of the error contract

**Specific runtime advice.** CustomerExceptionHandler has
@RestControllerAdvice(assignableTypes = CustomerRestController.class) and
@Order(Ordered.HIGHEST_PRECEDENCE). It handles only CustomerNotFoundException and
InvalidCustomerException. It returns 404/400 with the respective customer-not-found/
invalid-customer URNs, feature-specific title/detail and request-URI instance.
It does not extend the framework handler or duplicate the generic catch-all.

**Global runtime advice.** GlobalExceptionHandler extends ResponseEntityExceptionHandler
and has no explicit Order in this reference. Its Exception fallback preserves ErrorResponse
status/headers and merged ResponseStatus before using 500. MultipartException gets 400.
Framework overrides collect body/method/cross-parameter validation into errors, using $
for object-level information; return-value validation stays a server failure.
It retains a custom ProblemDetail type/body, fills absent standard information, aligns
body status and request-URI instance, adds applicable exception metadata and logs 5xx.
Inherited behavior handles committed/disconnected responses. Preserve those signatures
and delegation; do not collapse all exceptions to 400 or promise a body after disconnect.

**Servlet dispatch.** GlobalErrorController implements ErrorController and is @Hidden.
It reads ERROR_STATUS_CODE, ERROR_EXCEPTION and ERROR_REQUEST_URI, validates the status,
uses StandardProblem and returns application/problem+json, including when HTML was
requested. It does not expose servlet error-message content. This is separate from
advice and from any absent security/filter error handling.

**OpenAPI documentation.** Specific composed response annotations belong beside the
feature API; the global catalog belongs in GlobalErrorOpenApiCustomizer. Neither handles
an exception at runtime. StandardProblem supplies common descriptors for handlers and
documentation, while Customer URNs remain feature-specific. Keep all parts synchronized
through generated-document assertions and actual error responses.

## Preserve the catalog's merge rules

The source intentionally attaches its full **conditional common catalog** to every
generated operation, in default and grouped documents. Its 18 statuses plus default
are catalog entries, not proof that authentication, rate limits, uploads, versions or
upstream calls are enabled. OpenApiConfiguration explicitly explains this distinction.
Do not silently filter that established catalog or claim every entry is reachable.

GlobalErrorOpenApiCustomizer registers ProblemDetail and reusable response components
without relying on incidental controller references. An absent status receives a $ref.
For an existing inline status it preserves specific content and appends common description
once; examples merge only for the common schema and when a single example is absent.
Existing named examples win collisions. Existing headers win putIfAbsent. An explicit
response $ref is left to its owner. Success schemas, status, Location and links survive.
The source property springdoc.override-with-generic-response=false prevents automatic
advice inference from competing with this policy; it does not affect runtime handling.

ProblemDetail has required type/title/status/detail/instance and optional flattened
errors, parameter/header/cookie/part, supportedMethods, supportedMediaTypes and
maxUploadSize. Unknown extensions remain permitted. Do not add a properties wrapper,
serialize exception internals or hard-code example header values as runtime guarantees.

## Keep schema repairs scoped and evidenced

OpenApiConfiguration registers WebAsyncTask as a response wrapper before generation.
CustomerSchemaOpenApiCustomizer implements GlobalOpenApiCustomizer and visits an
explicit allowlist of records and nested records. RecordSchemaMetadata reads accessor
Schema or ArraySchema.arraySchema metadata. The customizer restores minLength, pattern
and types, including null in nullable enums, and adds two anyOf alternatives so a date
range has at least one non-null bound while allowing both.

These helpers retain the source's limits: Java/public component names must match, the
first allOf part with properties is selected, and missing schemas/properties are skipped.
They are not a general Jackson naming/view/custom-serializer resolver. Tests must detect
missing expected components. Do not extend the allowlist or change output shapes on a
guess; inspect the actual record and generated document first.

## Complete and verify the consumer documentation

Use the [operation/property/feature inventory](customer-coverage.md), not annotation
counts. Copy the [source bundle](../assets/customer-reference/README.md) to a disposable
directory and follow [verification](verification.md). Inspect both generated documents,
examples against their schemas, runtime examples and UI behavior independently.
Record unsupported or absent features from source evidence. A new API with missing
business rules, payloads, error conditions or publication metadata needs a focused
question for that gap; the reference does not authorize invented contracts.
