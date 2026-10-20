# Customer documentation coverage

Read with the [implementation guide](customer-pattern.md) and
[complete source index](customer-source-index.md). This matrix describes the current
Customer sources, not capabilities inferred from the names of Swagger annotations.
The emitted reference document is OpenAPI 3.1.0, with six business operations and
19 schemas. Test-only probes are additional test routes, not production APIs.

## Every operation

| Method and path                 | Operation ID       | Inputs and semantics                                                                                                                                                                        | Successful response and business errors                                                                                           |
| ------------------------------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| POST `/customers`               | `createCustomer`   | Required JSON `CustomerRequest`; raw Bean Validation, then business normalization and CPF validation                                                                                        | 201 `Customer`, required absolute `Location`; `consultarCliente` link to `getCustomerById` via `$response.body#/id`; business 400 |
| GET `/customers`                | `listCustomers`    | Optional `name`, `email`, `phone`, `cpf`; partial case-insensitive AND matching, trimmed queries and ignored empty values; page defaults 0/20, size 1–100; deterministic name/UUID ordering | 200 `CustomerPage`, populated/empty/out-of-range examples                                                                         |
| POST `/customers/search`        | `customers:search` | Required JSON `CustomerSearchRequest`; eight filter variants, AND composition, case-insensitive text comparison, page defaults and sort priority                                            | 200 `CustomerPage`; business 400                                                                                                  |
| GET `/customers/{customerId}`   | `getCustomerById`  | Required UUID path parameter                                                                                                                                                                | 200 `Customer`; business 404                                                                                                      |
| PUT `/customers/{customerId}`   | `replaceCustomer`  | Required complete `CustomerRequest`; preserves ID, does not create a missing customer; omitted complement is cleared                                                                        | 200 `Customer`; business 400/404                                                                                                  |
| PATCH `/customers/{customerId}` | `patchCustomer`    | `application/merge-patch+json`; documented `CustomerPatchRequest`, parsed as `JsonNode`; omitted root field is retained, supplied address is a complete replacement                         | 200 `Customer`; business 400/404                                                                                                  |

GET query maximum lengths are name 100, email 254, phone 50 and CPF 11. Do not copy
the create CPF input range to this query parameter. The common conditional error catalog
below is added to every operation in addition to these business-specific responses.

## Every schema and property

Descriptions, examples, requiredness, nullability and constraints are owned by the DTO
records and the targeted schema customizer. Read those files before generating a new DTO;
the table is a coverage map, not a replacement for their full annotations.

| Schema                   | Properties                                                                                                                                                     | Contract to retain                                                                                                                                                                       |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `CustomerRequest`        | `name`, `email`, `phone`, `cpf`, `birthDate`, `address`                                                                                                        | All required; name 1–100, email 5–254 plus pattern/format, phone 1–50, CPF 11–14 plus presentation pattern and runtime check digits; birth date strictly before today; nested validation |
| `CustomerAddressRequest` | `street`, `number`, `complement`, `neighborhood`, `city`, `state`, `postalCode`                                                                                | All except complement required; complement nullable; maxima 150/20/100/100/100 for the five text fields in order; state two letters; CEP eight digits with optional hyphen               |
| `Customer`               | `id`, `name`, `email`, `phone`, `cpf`, `birthDate`, `address`                                                                                                  | All required; read-only UUID ID, normalized fields, CPF 11 digits; birth date may be today; output guarantees common to all write paths                                                  |
| `CustomerAddress`        | `street`, `number`, `complement`, `neighborhood`, `city`, `state`, `postalCode`                                                                                | All required, including nullable complement; normalized text and uppercase two-character state; no create-only text maxima                                                               |
| `CustomerPatchRequest`   | `name`, `email`, `phone`, `cpf`, `birthDate`, `address`                                                                                                        | Optional properties, nonempty object, 1–6 properties, unknown properties rejected; explicit null rejected by runtime for supplied required values; separate constraints from create      |
| `CustomerPatchAddress`   | `street`, `number`, `complement`, `neighborhood`, `city`, `state`, `postalCode`                                                                                | Six required fields, nullable optional complement, 6–7 properties, unknown properties rejected; complete replacement and no create-only text maxima                                      |
| `CustomerSearchRequest`  | `filters`, `page`, `size`, `sort`                                                                                                                              | All optional/nullable; filters at most 20, sort at most 3, null members rejected; page >=0, size 1–100, defaults 0/20; empty filter list means no filtering                              |
| `CustomerSortOrder`      | `field`, `direction`                                                                                                                                           | Required field from `name`, `email`, `birthDate`, `city`; optional/nullable `ASC`/`DESC` direction defaults to ASC; UUID final tie-breaker                                               |
| `CustomerFilter`         | discriminator `_discriminator`                                                                                                                                 | Base component plus mapping to eight variants; search array items select those variants with `oneOf`                                                                                     |
| `NameFilter`             | `_discriminator`, `value`, `operator`                                                                                                                          | Required singleton tag `name` and value 1–254; nullable optional operator `contains`/`exact`, default exact                                                                              |
| `EmailFilter`            | `_discriminator`, `value`, `operator`                                                                                                                          | Same text contract; tag `email`                                                                                                                                                          |
| `PhoneFilter`            | `_discriminator`, `value`, `operator`                                                                                                                          | Same text contract; tag `phone`                                                                                                                                                          |
| `CpfFilter`              | `_discriminator`, `value`, `operator`                                                                                                                          | Same text contract; tag `cpf`; do not infer create CPF validation for a search fragment                                                                                                  |
| `CityFilter`             | `_discriminator`, `value`, `operator`                                                                                                                          | Same text contract; tag `address.city`                                                                                                                                                   |
| `StateFilter`            | `_discriminator`, `value`, `operator`                                                                                                                          | Same text contract; tag `address.state`                                                                                                                                                  |
| `PostalCodeFilter`       | `_discriminator`, `value`, `operator`                                                                                                                          | Same text contract; tag `address.postalCode`                                                                                                                                             |
| `BirthDateRangeFilter`   | `_discriminator`, `from`, `to`                                                                                                                                 | Required tag `birthDateRange`; optional nullable bounds, at least one non-null; `anyOf` permits both bounds; runtime enforces from <= to; no create-only past-date constraint            |
| `CustomerPage`           | `content`, `page`, `size`, `totalElements`, `totalPages`                                                                                                       | All required; content 0–100 Customers, page >=0, size 1–100, nonnegative totals; empty/out-of-range pages still carry metadata                                                           |
| `ProblemDetail`          | `type`, `title`, `status`, `detail`, `instance`, `errors`, `parameter`, `header`, `cookie`, `part`, `supportedMethods`, `supportedMediaTypes`, `maxUploadSize` | First five required, status 400–599; errors items contain required field/message; remaining extensions depend on failure path; flattened extensions, additional properties allowed       |

Create/PUT validate raw input with `@Size` and `@Past`; PATCH follows its tree mapper and
business constructors. Do not silently unify them. For example, PATCH accepts longer names
and today's date, and the domain state check is two characters after normalization rather
than the create request's two-letter constraint. See the exact
[DTO and mapper sources](customer-source-index.md#transport-and-documentation).

`@Size` uses Java string length, while JSON Schema string length counts Unicode code points.
The reference does not add a code-point validator. Preserve that fact and report the edge
case if it matters to a requested contract; do not claim exhaustive Unicode conformance.

## Common errors and their owners

`GlobalErrorOpenApiCustomizer` registers reusable responses for 400, 401, 403, 404, 405,
406, 408, 409, 410, 412, 413, 415, 422, 429, 500, 502, 503 and 504, plus `default`.
They describe conditional situations; not every status is exercised by each Customer route.

| Situation                                                                           | Runtime owner / documentation requirement                                                                                |
| ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Invalid customer or missing customer                                                | Scoped highest-priority `CustomerExceptionHandler`; composed response annotations retain feature URNs and named examples |
| Binding, body/method validation, missing parameters, incompatible method/media type | `GlobalExceptionHandler` framework hooks preserve status/headers and add the documented extensions                       |
| Unexpected failure                                                                  | Safe global 500; log server failure, never expose arbitrary exception detail                                             |
| Servlet `/error` dispatch                                                           | Hidden `GlobalErrorController`, original request URI and safe status description; not a documented business endpoint     |
| Auth, conflict, rate limit, gateway or other conditional infrastructure status      | Catalog component and explanatory text; requires actual implementing layer before claiming runtime enforcement           |

Header descriptions include `Allow`, `Accept`, `Accept-Patch` and `Retry-After` only where
defined in the source catalog. An optional header in a conditional response does not prove
a server policy. Preserve named business examples when adding common examples; never merge
incompatible schemas, overwrite an explicit response reference or attach `examples` beside
a singular `example`. See the [customizer guide](springdoc-customization.md).

## Swagger resources used by this reference

| Resource family           | Verified source use                                                                                                                                           |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| API metadata and tags     | `OpenAPI`/`Info`, detailed Portuguese semantics, tag name/description                                                                                         |
| Operations and parameters | Stable IDs, summaries, descriptions, path/query binding and constraints, defaults                                                                             |
| Request bodies            | Composed `ApiRequestBody` with `@AliasFor`, requiredness, media types, concrete schemas, named examples                                                       |
| Responses                 | Concrete DTO schemas, named examples, response descriptions, required Location header, runtime-expression link                                                |
| Object and array schemas  | Explicit names/descriptions/examples, required properties, null unions, formats, enums, defaults, nested validation, array bounds, additional-property policy |
| Composition               | Eight tagged variants, discriminator mappings, `oneOf`, `allOf`, and date-bound `anyOf`                                                                       |
| Reuse                     | Central example constants, composed business-error annotations, shared ProblemDetail and response components                                                  |
| Spring integration        | Interface-owned contract, async wrapper unwrapping, global error/schema customizers, default and test-group output                                            |
| Visibility                | Hidden error controller; no accidental executor/handler schemas                                                                                               |

There is no production security scheme, upload endpoint, callback/webhook, SSE contract,
XML representation, deprecated operation or explicit production server/group configuration
in this checkout. Do not invent one to increase annotation coverage. Apply additional
Swagger resources when the target API actually has the corresponding behavior and evidence.
