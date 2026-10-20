# Complete Customer source index

Read this index when implementing or checking a specific class. All links point to the
packaged [current-file reference](../assets/customer-reference/README.md), not excerpts.
Start with [the organization and implementation sequence](customer-pattern.md), then use
[the operation/property coverage matrix](customer-coverage.md) to check completeness.

The 41 production Java files are grouped below by responsibility. Supporting business code
makes the example executable; it is not a replacement for the approved DDD reference.

## Bootstrap and global documentation

| Complete source                                                                                                                                | Responsibility                                                                                  |
| ---------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| [Main.java](../assets/customer-reference/src/main/java/io/github/robsonkades/Main.java)                                                        | Application bootstrap.                                                                          |
| [OpenApiConfiguration.java](../assets/customer-reference/src/main/java/io/github/robsonkades/config/OpenApiConfiguration.java)                 | Info and consumer semantics; registers WebAsyncTask as a non-wire response wrapper.             |
| [GlobalErrorOpenApiCustomizer.java](../assets/customer-reference/src/main/java/io/github/robsonkades/config/GlobalErrorOpenApiCustomizer.java) | Shared ProblemDetail/response components, conditional catalog, compatible per-operation merges. |
| [StandardProblem.java](../assets/customer-reference/src/main/java/io/github/robsonkades/exception/StandardProblem.java)                        | Standard safe titles, types and descriptions; exception/status classification.                  |
| [GlobalExceptionHandler.java](../assets/customer-reference/src/main/java/io/github/robsonkades/exception/GlobalExceptionHandler.java)          | Framework validation/binding hooks, safe fallback, response headers and extensions.             |
| [GlobalErrorController.java](../assets/customer-reference/src/main/java/io/github/robsonkades/exception/GlobalErrorController.java)            | Hidden servlet error-dispatch endpoint and original request URI.                                |

## Transport and documentation

| Complete source                                                                                                                                                   | Responsibility                                                                                         |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| [CustomerApi.java](../assets/customer-reference/src/main/java/io/github/robsonkades/customer/controller/documentation/CustomerApi.java)                           | All six interface-owned mappings, operations, parameters, request bodies, responses, headers and link. |
| [ApiRequestBody.java](../assets/customer-reference/src/main/java/io/github/robsonkades/customer/controller/documentation/ApiRequestBody.java)                     | Runtime method annotation with exact Swagger @AliasFor forwarding.                                     |
| [CustomerApiExamples.java](../assets/customer-reference/src/main/java/io/github/robsonkades/customer/controller/documentation/CustomerApiExamples.java)           | Central named JSON examples for writes, responses, search and pagination.                              |
| [CustomerNotFoundResponse.java](../assets/customer-reference/src/main/java/io/github/robsonkades/customer/controller/documentation/CustomerNotFoundResponse.java) | Composed business 404 response and example.                                                            |
| [InvalidCustomerResponse.java](../assets/customer-reference/src/main/java/io/github/robsonkades/customer/controller/documentation/InvalidCustomerResponse.java)   | Composed business 400 response and example.                                                            |
| [RecordSchemaMetadata.java](../assets/customer-reference/src/main/java/io/github/robsonkades/customer/controller/documentation/RecordSchemaMetadata.java)         | Record/accessor metadata reader used by the schema customizer.                                         |
| [CustomerRestController.java](../assets/customer-reference/src/main/java/io/github/robsonkades/customer/controller/CustomerRestController.java)                   | Concrete delegation, DTO mapping, async execution and absolute Location.                               |
| [CustomerExceptionHandler.java](../assets/customer-reference/src/main/java/io/github/robsonkades/customer/controller/CustomerExceptionHandler.java)               | Controller-scoped highest-priority business error advice.                                              |
| [CustomerPatchMapper.java](../assets/customer-reference/src/main/java/io/github/robsonkades/customer/controller/CustomerPatchMapper.java)                         | JsonNode parsing, presence tracking and explicit unknown-field/type rejection.                         |
| [CustomerRequest.java](../assets/customer-reference/src/main/java/io/github/robsonkades/customer/controller/dto/CustomerRequest.java)                             | Complete create/replace input and raw-input Bean Validation.                                           |
| [CustomerAddressRequest.java](../assets/customer-reference/src/main/java/io/github/robsonkades/customer/controller/dto/CustomerAddressRequest.java)               | Nested create/replace address input.                                                                   |
| [CustomerResponse.java](../assets/customer-reference/src/main/java/io/github/robsonkades/customer/controller/dto/CustomerResponse.java)                           | Public Customer output; guarantees shared by all write paths.                                          |
| [CustomerAddressResponse.java](../assets/customer-reference/src/main/java/io/github/robsonkades/customer/controller/dto/CustomerAddressResponse.java)             | Normalized address output with required nullable complement.                                           |
| [CustomerPatchRequest.java](../assets/customer-reference/src/main/java/io/github/robsonkades/customer/controller/dto/CustomerPatchRequest.java)                   | Documentation-only PATCH root model; does not replace JsonNode parsing.                                |
| [CustomerPatchAddressRequest.java](../assets/customer-reference/src/main/java/io/github/robsonkades/customer/controller/dto/CustomerPatchAddressRequest.java)     | Complete supplied-address replacement schema.                                                          |
| [CustomerSearchRequest.java](../assets/customer-reference/src/main/java/io/github/robsonkades/customer/controller/dto/CustomerSearchRequest.java)                 | Optional filters, paging and sort; concrete variant array and defaults.                                |
| [CustomerFilterRequest.java](../assets/customer-reference/src/main/java/io/github/robsonkades/customer/controller/dto/CustomerFilterRequest.java)                 | Tagged union and all eight nested variant records.                                                     |
| [CustomerSortOrderRequest.java](../assets/customer-reference/src/main/java/io/github/robsonkades/customer/controller/dto/CustomerSortOrderRequest.java)           | Allowed sort fields/directions and default direction.                                                  |
| [CustomerPageResponse.java](../assets/customer-reference/src/main/java/io/github/robsonkades/customer/controller/dto/CustomerPageResponse.java)                   | Content and pagination metadata.                                                                       |
| [CustomerSchemaOpenApiCustomizer.java](../assets/customer-reference/src/main/java/io/github/robsonkades/customer/config/CustomerSchemaOpenApiCustomizer.java)     | Scoped corrections for record metadata, nullable enums and date-bound anyOf.                           |
| [CustomerApplicationConfiguration.java](../assets/customer-reference/src/main/java/io/github/robsonkades/customer/config/CustomerApplicationConfiguration.java)   | Customer service and in-memory repository wiring.                                                      |

## Executable support and actual business semantics

| Complete source                                                                                                                                                         | Responsibility                                                                   |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| [CustomerService.java](../assets/customer-reference/src/main/java/io/github/robsonkades/customer/application/CustomerService.java)                                      | Create/read/list/search/replace/patch behavior, validation and mapping.          |
| [CustomerRepository.java](../assets/customer-reference/src/main/java/io/github/robsonkades/customer/application/CustomerRepository.java)                                | Persistence port used by the reference service.                                  |
| [CustomerDetails.java](../assets/customer-reference/src/main/java/io/github/robsonkades/customer/application/CustomerDetails.java)                                      | Application output and nested address projection.                                |
| [CustomerCriterion.java](../assets/customer-reference/src/main/java/io/github/robsonkades/customer/application/CustomerCriterion.java)                                  | Text/date search criteria and operators.                                         |
| [CustomerSearch.java](../assets/customer-reference/src/main/java/io/github/robsonkades/customer/application/CustomerSearch.java)                                        | Filter/sort/pagination validation and defaults.                                  |
| [CustomerSort.java](../assets/customer-reference/src/main/java/io/github/robsonkades/customer/application/CustomerSort.java)                                            | Sort field/direction contract.                                                   |
| [CustomerPage.java](../assets/customer-reference/src/main/java/io/github/robsonkades/customer/application/CustomerPage.java)                                            | Generic paged result.                                                            |
| [CustomerPatch.java](../assets/customer-reference/src/main/java/io/github/robsonkades/customer/application/CustomerPatch.java)                                          | Fields involved in a partial root update.                                        |
| [FieldPatch.java](../assets/customer-reference/src/main/java/io/github/robsonkades/customer/application/FieldPatch.java)                                                | Absent-versus-present field representation.                                      |
| [CustomerNotFoundException.java](../assets/customer-reference/src/main/java/io/github/robsonkades/customer/application/CustomerNotFoundException.java)                  | Missing-resource diagnostic exception.                                           |
| [Customer.java](../assets/customer-reference/src/main/java/io/github/robsonkades/customer/domain/Customer.java)                                                         | Canonicalization, CPF/email/date validation and immutable customer data.         |
| [CustomerAddress.java](../assets/customer-reference/src/main/java/io/github/robsonkades/customer/domain/CustomerAddress.java)                                           | Required text, complement, state and CEP normalization/validation.               |
| [InvalidCustomerException.java](../assets/customer-reference/src/main/java/io/github/robsonkades/customer/domain/InvalidCustomerException.java)                         | Business validation failure.                                                     |
| [InMemoryCustomerRepository.java](../assets/customer-reference/src/main/java/io/github/robsonkades/customer/infrastructure/persistence/InMemoryCustomerRepository.java) | Process-local repository, filtering, sorting, pagination and atomic replacement. |

## Tests

All seven classes retain the reference assertions and test configuration. Every one of the
56 test methods has `@DisplayName`; parameterization produces 126 executions. Mockito in
the MVC slice is part of this reference, not a change to the no-mocks rule for DDD domain tests.

| Complete source                                                                                                                                             | Evidence                                                                                                                                                |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [CustomerSearchOpenApiTests.java](../assets/customer-reference/src/test/java/io/github/robsonkades/customer/config/CustomerSearchOpenApiTests.java)         | Default/group schemas for all eight variants; named search examples through deserialization and async HTTP.                                             |
| [CustomerValidationOpenApiTests.java](../assets/customer-reference/src/test/java/io/github/robsonkades/customer/config/CustomerValidationOpenApiTests.java) | Create/PATCH/output schemas, nullability, bounds, examples, operation IDs/link, Location and differing write-path behavior; writes generated documents. |
| [GlobalErrorOpenApiTests.java](../assets/customer-reference/src/test/java/io/github/robsonkades/customer/config/GlobalErrorOpenApiTests.java)               | Common catalog, business-error merging, unannotated test probe, async unwrapping and query constraints.                                                 |
| [CustomerSearchTests.java](../assets/customer-reference/src/test/java/io/github/robsonkades/customer/controller/CustomerSearchTests.java)                   | Actual filters, ranges, sorting, limits and invalid search inputs.                                                                                      |
| [ExceptionHandlersTests.java](../assets/customer-reference/src/test/java/io/github/robsonkades/customer/controller/ExceptionHandlersTests.java)             | MVC slice with real controller/service and mocked repository; business/framework errors and safe unexpected failures.                                   |
| [GlobalExceptionHandlerTests.java](../assets/customer-reference/src/test/java/io/github/robsonkades/customer/controller/GlobalExceptionHandlerTests.java)   | Direct framework error/status/header handling, multipart, committed/disconnected response behavior.                                                     |
| [MainTests.java](../assets/customer-reference/src/test/java/io/github/robsonkades/customer/MainTests.java)                                                  | Context, base document/body metadata and hidden servlet error response behavior.                                                                        |

## Build, configuration and provenance

- [pom.xml](../assets/customer-reference/pom.xml): exact Java, Boot, springdoc and test dependencies.
- [application.yaml](../assets/customer-reference/src/main/resources/application.yaml): application name, Problem Details and disabled generic advice-response inference.
- [source-provenance.json](../assets/customer-reference/source-provenance.json): original source hashes and dirty-working-tree identity.
- [README](../assets/customer-reference/README.md): isolated build and browser procedure.
- [Verification](verification.md): evidence boundaries and reproducible acceptance cases.

No source class is replaced by pseudocode or an ellipsis. Before copying a class, read its
collaborators and tests; never infer missing production configuration from a test-only bean.
