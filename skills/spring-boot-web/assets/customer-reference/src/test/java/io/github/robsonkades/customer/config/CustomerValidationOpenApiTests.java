package io.github.robsonkades.customer.config;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.node.ObjectNode;

import java.nio.file.Files;
import java.nio.file.Path;
import java.time.LocalDate;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.asyncDispatch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.request;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest(properties = {
        "springdoc.group-configs[0].group=contract-test",
        "springdoc.group-configs[0].paths-to-match[0]=/**",
        "springdoc.cache.disabled=true"
})
@AutoConfigureMockMvc
class CustomerValidationOpenApiTests {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @ParameterizedTest
    @DisplayName("Creation documents required fields lengths formats and nullable complement")
    @ValueSource(strings = {"/v3/api-docs", "/v3/api-docs/contract-test"})
    void creationDocumentsRequiredFieldsLengthsFormatsAndNullableComplement(String path) throws Exception {
        var document = document(path);
        var customer = schema(document, "CustomerRequest");
        assertRequired(customer, "name", "email", "phone", "cpf", "birthDate", "address");
        assertLengths(customer, "name", 1, 100);
        assertLengths(customer, "email", 5, 254);
        assertLengths(customer, "phone", 1, 50);
        assertLengths(customer, "cpf", 11, 14);
        assertThat(customer.at("/properties/email/format").asString()).isEqualTo("email");
        assertThat(customer.at("/properties/cpf/pattern").asString()).isNotBlank();
        assertThat(customer.at("/properties/birthDate/format").asString()).isEqualTo("date");
        assertThat(customer.at("/properties/birthDate/description").asString()).contains("estritamente anterior");
        assertThat(customer.at("/properties/address/$ref").asString()).isEqualTo("#/components/schemas/CustomerAddressRequest");

        var address = schema(document, "CustomerAddressRequest");
        assertRequired(address, "street", "number", "neighborhood", "city", "state", "postalCode");
        assertLengths(address, "street", 1, 150);
        assertLengths(address, "number", 1, 20);
        assertLengths(address, "neighborhood", 1, 100);
        assertLengths(address, "city", 1, 100);
        assertLengths(address, "state", 2, 2);
        assertLengths(address, "postalCode", 8, 9);
        assertThat(address.at("/properties/complement/maxLength").intValue()).isEqualTo(100);
        assertNullable(address.at("/properties/complement"), "string");
        assertThat(address.at("/properties/state/pattern").asString()).isNotBlank();
        assertThat(address.at("/properties/postalCode/pattern").asString()).isNotBlank();
    }

    @ParameterizedTest
    @DisplayName("Responses declare their guarantees without inheriting creation only limits")
    @ValueSource(strings = {"/v3/api-docs", "/v3/api-docs/contract-test"})
    void responsesDeclareTheirGuaranteesWithoutInheritingCreationOnlyLimits(String path) throws Exception {
        var document = document(path);
        var customer = schema(document, "Customer");
        assertRequired(customer, "id", "name", "email", "phone", "cpf", "birthDate", "address");
        assertThat(customer.at("/properties/id/format").asString()).isEqualTo("uuid");
        assertThat(customer.at("/properties/id/readOnly").asBoolean()).isTrue();
        assertLengths(customer, "id", 36, 36);
        assertLengths(customer, "cpf", 11, 11);
        assertThat(customer.at("/properties/name").has("maxLength")).isFalse();
        assertThat(customer.at("/properties/address/$ref").asString()).isEqualTo("#/components/schemas/CustomerAddress");
        var address = schema(document, "CustomerAddress");
        assertRequired(address, "street", "number", "complement", "neighborhood", "city", "state", "postalCode");
        assertNullable(address.at("/properties/complement"), "string");
        assertThat(address.at("/properties/street").has("maxLength")).isFalse();
        assertLengths(address, "state", 2, 2);
        assertLengths(address, "postalCode", 8, 9);

        var page = schema(document, "CustomerPage");
        assertRequired(page, "content", "page", "size", "totalElements", "totalPages");
        assertThat(page.at("/properties/content/maxItems").intValue()).isEqualTo(100);
        assertThat(page.at("/properties/page/minimum").intValue()).isZero();
        assertThat(page.at("/properties/size/minimum").intValue()).isEqualTo(1);
        assertThat(page.at("/properties/size/maximum").intValue()).isEqualTo(100);
        assertThat(page.at("/properties/totalElements/format").asString()).isEqualTo("int64");
        assertThat(page.at("/properties/totalElements/minimum").intValue()).isZero();
        assertThat(page.at("/properties/totalPages/minimum").intValue()).isZero();
    }

    @ParameterizedTest
    @DisplayName("Patch documents optional non null fields and complete address replacement")
    @ValueSource(strings = {"/v3/api-docs", "/v3/api-docs/contract-test"})
    void patchDocumentsOptionalNonNullFieldsAndCompleteAddressReplacement(String path) throws Exception {
        var document = document(path);
        assertThat(document.at("/paths/~1customers~1{customerId}/patch/requestBody/content/application~1merge-patch+json/schema/$ref")
                .asString()).isEqualTo("#/components/schemas/CustomerPatchRequest");
        var patchSchema = schema(document, "CustomerPatchRequest");
        assertThat(patchSchema.path("required").isMissingNode() || patchSchema.path("required").isEmpty()).isTrue();
        assertThat(patchSchema.path("minProperties").intValue()).isEqualTo(1);
        assertThat(patchSchema.path("maxProperties").intValue()).isEqualTo(6);
        assertThat(patchSchema.path("additionalProperties").isBoolean()).isTrue();
        assertThat(patchSchema.path("additionalProperties").asBoolean()).isFalse();
        assertThat(patchSchema.path("properties")).hasSize(6);
        for (var field : new String[]{"name", "email", "phone", "cpf", "birthDate"}) {
            assertThat(patchSchema.path("properties").path(field).path("type").asString()).isEqualTo("string");
            assertThat(patchSchema.path("properties").path(field).has("maxLength")).isFalse();
        }
        assertThat(patchSchema.at("/properties/birthDate/description").asString()).contains("igual");
        var address = schema(document, "CustomerPatchAddress");
        assertRequired(address, "street", "number", "neighborhood", "city", "state", "postalCode");
        assertNullable(address.at("/properties/complement"), "string");
        assertThat(address.path("additionalProperties").asBoolean()).isFalse();
        assertThat(address.at("/properties/street").has("maxLength")).isFalse();
    }

    @ParameterizedTest
    @DisplayName("Search documents nullable defaults array limits and conditional date bounds")
    @ValueSource(strings = {"/v3/api-docs", "/v3/api-docs/contract-test"})
    void searchDocumentsNullableDefaultsArrayLimitsAndConditionalDateBounds(String path) throws Exception {
        var document = document(path);
        var search = schema(document, "CustomerSearchRequest");
        assertThat(search.path("required").isMissingNode() || search.path("required").isEmpty()).isTrue();
        assertNullable(search.at("/properties/page"), "integer");
        assertNullable(search.at("/properties/size"), "integer");
        assertNullable(search.at("/properties/filters"), "array");
        assertNullable(search.at("/properties/sort"), "array");
        assertThat(search.at("/properties/filters/maxItems").intValue()).isEqualTo(20);
        assertThat(search.at("/properties/sort/maxItems").intValue()).isEqualTo(3);
        assertThat(search.at("/properties/page/default").intValue()).isZero();
        assertThat(search.at("/properties/size/default").intValue()).isEqualTo(20);
        assertThat(search.at("/properties/size/maximum").intValue()).isEqualTo(100);
        var sort = schema(document, "CustomerSortOrder");
        assertRequired(sort, "field");
        assertNullable(sort.at("/properties/direction"), "string");
        assertThat(sort.at("/properties/direction/enum")).anySatisfy(value -> assertThat(value.isNull()).isTrue());
        assertThat(sort.at("/properties/direction/default").asString()).isEqualTo("ASC");
        for (var name : new String[]{"CpfFilter", "EmailFilter", "NameFilter", "PhoneFilter",
                "CityFilter", "StateFilter", "PostalCodeFilter"}) {
            var filter = schema(document, name);
            assertThat(filter.findPath("value").path("minLength").intValue()).as(name).isEqualTo(1);
            assertThat(filter.findPath("value").path("maxLength").intValue()).as(name).isEqualTo(254);
            assertNullable(filter.findPath("operator"), "string");
            assertThat(filter.findPath("operator").path("enum")).anySatisfy(value -> assertThat(value.isNull()).isTrue());
        }
        var dates = schema(document, "BirthDateRangeFilter");
        assertThat(dates.path("anyOf")).hasSize(2);
        for (var boundary : new String[]{"from", "to"}) {
            assertThat(dates.path("anyOf")).anySatisfy(alternative -> {
                assertRequired(alternative, boundary);
                assertThat(alternative.at("/properties/" + boundary + "/type").asString()).isEqualTo("string");
                assertThat(alternative.at("/properties/" + boundary + "/format").asString()).isEqualTo("date");
            });
        }
    }

    @ParameterizedTest
    @DisplayName("Operations declare required bodies path parameters and success metadata")
    @ValueSource(strings = {"/v3/api-docs", "/v3/api-docs/contract-test"})
    void operationsDeclareRequiredBodiesPathParametersAndSuccessMetadata(String path) throws Exception {
        var document = document(path);
        for (var entry : Map.of("/customers", "post", "/customers/search", "post").entrySet()) {
            assertThat(document.path("paths").path(entry.getKey()).path(entry.getValue())
                    .at("/requestBody/required").asBoolean()).isTrue();
        }
        var resource = document.path("paths").path("/customers/{customerId}");
        for (var method : new String[]{"get", "put", "patch"}) {
            var operation = resource.path(method);
            var id = operation.path("parameters").get(0);
            assertThat(id.path("name").asString()).isEqualTo("customerId");
            assertThat(id.path("required").asBoolean()).isTrue();
            assertThat(id.at("/schema/format").asString()).isEqualTo("uuid");
            assertThat(operation.path("description").asString()).isNotBlank();
            if (!method.equals("get")) {
                assertThat(operation.at("/requestBody/required").asBoolean()).isTrue();
            }
        }
        var listing = document.at("/paths/~1customers/get");
        assertThat(listing.path("summary").asString()).isEqualTo("Listar clientes");
        assertThat(listing.path("description").asString()).isNotBlank();
        for (var parameter : listing.path("parameters")) {
            assertThat(parameter.path("required").asBoolean()).isFalse();
            assertThat(parameter.path("description").asString()).isNotBlank();
        }
        var location = document.at("/paths/~1customers/post/responses/201/headers/Location");
        assertThat(location.path("required").asBoolean()).isTrue();
        assertThat(location.at("/schema/format").asString()).isEqualTo("uri");
    }

    @ParameterizedTest
    @DisplayName("Operation ids remain stable and creation link retrieves the created customer")
    @ValueSource(strings = {"/v3/api-docs", "/v3/api-docs/contract-test"})
    void operationIdsRemainStableAndCreationLinkRetrievesTheCreatedCustomer(String path) throws Exception {
        var document = document(path);
        var expectedIds = Map.of(
                "/paths/~1customers/post", "createCustomer",
                "/paths/~1customers/get", "listCustomers",
                "/paths/~1customers~1search/post", "customers:search",
                "/paths/~1customers~1{customerId}/get", "getCustomerById",
                "/paths/~1customers~1{customerId}/put", "replaceCustomer",
                "/paths/~1customers~1{customerId}/patch", "patchCustomer");
        expectedIds.forEach((pointer, id) ->
                assertThat(document.at(pointer).path("operationId").asString()).as(pointer).isEqualTo(id));
        var link = document.at("/paths/~1customers/post/responses/201/links/consultarCliente");
        assertThat(link.path("operationId").asString())
                .isEqualTo(document.at("/paths/~1customers~1{customerId}/get/operationId").asString());
        assertThat(link.has("operationRef")).isFalse();
        var expression = link.at("/parameters/customerId").asString();
        assertThat(expression).isEqualTo("$response.body#/id");

        var targets = document.path("paths").properties().stream()
                .flatMap(pathEntry -> pathEntry.getValue().properties().stream()
                        .filter(operation -> operation.getValue().path("operationId").asString()
                                .equals(link.path("operationId").asString()))
                        .map(operation -> Map.entry(pathEntry.getKey(), operation)))
                .toList();
        assertThat(targets).as("The linked operationId must resolve to exactly one operation").hasSize(1);
        var target = targets.getFirst();
        assertThat(target.getValue().getKey()).isEqualTo("get");
        assertThat(target.getValue().getValue().path("parameters")).anySatisfy(parameter -> {
            assertThat(parameter.path("name").asString()).isEqualTo("customerId");
            assertThat(parameter.path("in").asString()).isEqualTo("path");
            assertThat(parameter.path("required").asBoolean()).isTrue();
        });

        var example = document.at("/paths/~1customers/post/requestBody/content/application~1json/examples")
                .path("Novo cliente").path("value");
        var created = perform(post("/customers").contentType(MediaType.APPLICATION_JSON).content(example.toString()), 201);
        var linkedId = created.at(expression.substring("$response.body#".length())).asString();
        assertThat(linkedId).isNotBlank().isEqualTo(created.path("id").asString());
        var retrieved = perform(get(target.getKey(), linkedId), 200);
        assertThat(retrieved).isEqualTo(created);
    }

    @ParameterizedTest
    @DisplayName("Created location preserves request origin and context without query parameters")
    @ValueSource(strings = {"", "/crm"})
    void createdLocationPreservesRequestOriginAndContextWithoutQueryParameters(String contextPath) throws Exception {
        var document = document("/v3/api-docs");
        var example = document.at("/paths/~1customers/post/requestBody/content/application~1json/examples")
                .path("Novo cliente").path("value");
        var origin = "https://api.example.test:8443";
        var result = mockMvc.perform(post(origin + contextPath + "/customers?source=web")
                        .contextPath(contextPath)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(example.toString()))
                .andExpect(request().asyncStarted())
                .andReturn();
        var response = mockMvc.perform(asyncDispatch(result))
                .andExpect(status().isCreated())
                .andReturn().getResponse();
        var customer = objectMapper.readTree(response.getContentAsString());
        var location = response.getHeader(HttpHeaders.LOCATION);
        assertThat(location).isEqualTo(origin + contextPath + "/customers/" + customer.path("id").asString());
        var retrieved = perform(get(location).contextPath(contextPath), 200);
        assertThat(retrieved).isEqualTo(customer);
    }

    @ParameterizedTest
    @DisplayName("Documented write examples are accepted and responses expose normalized fields")
    @ValueSource(strings = {"/v3/api-docs", "/v3/api-docs/contract-test"})
    void documentedWriteExamplesAreAcceptedAndResponsesExposeNormalizedFields(String path) throws Exception {
        var document = document(path);
        var createOperation = document.at("/paths/~1customers/post");
        var create = createOperation.at("/requestBody/content/application~1json/examples")
                .path("Novo cliente").path("value");
        var customer = perform(post("/customers").contentType(MediaType.APPLICATION_JSON).content(create.toString()), 201);
        var id = customer.path("id").asString();
        assertThat(customer.path("cpf").asString()).isEqualTo("52998224725");
        assertThat(customer).isEqualTo(responseExample(createOperation, "201", "Cliente criado").put("id", id));

        var resource = document.at("/paths/~1customers~1{customerId}");
        var retrieved = perform(get("/customers/{customerId}", id), 200);
        assertThat(retrieved).isEqualTo(responseExample(resource.path("get"), "200", "Cliente encontrado").put("id", id));

        var replace = resource.path("put").at("/requestBody/content/application~1json/examples")
                .path("Cliente atualizado").path("value");
        var replaced = perform(put("/customers/{customerId}", id).contentType(MediaType.APPLICATION_JSON)
                .content(replace.toString()), 200);
        assertThat(replaced).isEqualTo(responseExample(resource.path("put"), "200", "Cliente substituído").put("id", id));

        var patchExamples = resource.path("patch").at("/requestBody/content/application~1merge-patch+json/examples");
        var addressPatch = patchExamples.path("Remover complemento do endereço").path("value");
        var withoutComplement = perform(patch("/customers/{customerId}", id).contentType("application/merge-patch+json")
                .content(addressPatch.toString()), 200);
        assertThat(withoutComplement)
                .isEqualTo(responseExample(resource.path("patch"), "200", "Cliente sem complemento").put("id", id));
        assertThat(withoutComplement.at("/address/complement").isNull()).isTrue();

        var patchExample = patchExamples.path("Atualizar telefone").path("value");
        var patched = perform(patch("/customers/{customerId}", id).contentType("application/merge-patch+json")
                .content(patchExample.toString()), 200);
        assertThat(patched.path("phone").asString()).isEqualTo("+5511888888888");
        assertThat(patched.path("id").asString()).isEqualTo(id);
        assertThat(patched.at("/address/complement").isNull()).isTrue();
    }

    @ParameterizedTest
    @DisplayName("Pagination examples match both listing and search responses")
    @ValueSource(strings = {"/v3/api-docs", "/v3/api-docs/contract-test"})
    void paginationExamplesMatchBothListingAndSearchResponses(String path) throws Exception {
        var document = document(path);
        var create = (ObjectNode) document.at("/paths/~1customers/post/requestBody/content/application~1json/examples")
                .path("Novo cliente").path("value").deepCopy();
        var email = UUID.randomUUID() + "@example.com";
        create.put("email", email);
        var customer = perform(post("/customers").contentType(MediaType.APPLICATION_JSON).content(create.toString()), 201);
        var listing = document.at("/paths/~1customers/get");
        var search = document.at("/paths/~1customers~1search/post");

        for (var exampleName : new String[]{"Página com resultados", "Nenhum resultado", "Página além do final"}) {
            var expected = responseExample(listing, "200", exampleName);
            assertThat(responseExample(search, "200", exampleName)).isEqualTo(expected);
            if (!expected.path("content").isEmpty()) {
                var exampleCustomer = (ObjectNode) expected.at("/content/0");
                exampleCustomer.put("id", customer.path("id").asString()).put("email", email);
            }
            var emailFilter = exampleName.equals("Nenhum resultado") ? "missing-" + email : email;
            var page = Integer.toString(expected.path("page").intValue());
            var size = Integer.toString(expected.path("size").intValue());
            var listed = perform(get("/customers").param("email", emailFilter).param("page", page).param("size", size), 200);
            assertThat(listed).as("GET %s", exampleName).isEqualTo(expected);

            var searchBody = objectMapper.createObjectNode()
                    .put("page", expected.path("page").intValue()).put("size", expected.path("size").intValue());
            searchBody.putArray("filters").addObject().put("_discriminator", "email").put("value", emailFilter);
            var searched = perform(post("/customers/search").contentType(MediaType.APPLICATION_JSON)
                    .content(searchBody.toString()), 200);
            assertThat(searched).as("POST search %s", exampleName).isEqualTo(expected);
        }
    }

    @Test
    @DisplayName("Patch and creation keep their documented validation differences")
    void patchAndCreationKeepTheirDocumentedValidationDifferences() throws Exception {
        var document = document("/v3/api-docs");
        var example = document.at("/paths/~1customers/post/requestBody/content/application~1json/examples")
                .path("Novo cliente").path("value").deepCopy();
        var input = objectMapper.createObjectNode();
        example.properties().forEach(entry -> input.set(entry.getKey(), entry.getValue()));
        var created = perform(post("/customers").contentType(MediaType.APPLICATION_JSON).content(input.toString()), 201);
        var id = created.path("id").asString();
        var today = LocalDate.now().toString();
        var patchBody = objectMapper.createObjectNode().put("name", "A".repeat(101))
                .put("birthDate", today);
        var patched = perform(patch("/customers/{customerId}", id).contentType("application/merge-patch+json")
                .content(patchBody.toString()), 200);
        assertThat(patched.path("name").asString()).hasSize(101);
        assertThat(patched.path("birthDate").asString()).isEqualTo(today);
        input.put("name", "A".repeat(101));
        perform(post("/customers").contentType(MediaType.APPLICATION_JSON).content(input.toString()), 400);
        input.put("name", "Ana Silva").put("birthDate", today);
        perform(post("/customers").contentType(MediaType.APPLICATION_JSON).content(input.toString()), 400);
        for (var invalid : new String[]{"{}", """
                {"name":null}
                """, """
                {"address":{"city":"São Paulo"}}
                """, """
                {"unknown":"value"}
                """}) {
            perform(patch("/customers/{customerId}", id).contentType("application/merge-patch+json").content(invalid), 400);
        }
    }

    private JsonNode perform(MockHttpServletRequestBuilder request, int expectedStatus) throws Exception {
        var result = mockMvc.perform(request).andReturn();
        if (result.getRequest().isAsyncStarted()) {
            result = mockMvc.perform(asyncDispatch(result)).andReturn();
        }
        assertThat(result.getResponse().getStatus()).isEqualTo(expectedStatus);
        return objectMapper.readTree(result.getResponse().getContentAsString());
    }

    private JsonNode document(String path) throws Exception {
        var json = mockMvc.perform(get(path)).andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        var directory = Path.of("target", "openapi");
        Files.createDirectories(directory);
        Files.writeString(directory.resolve(path.endsWith("contract-test") ? "contract-test.json" : "openapi.json"), json);
        return objectMapper.readTree(json);
    }

    private static JsonNode schema(JsonNode document, String name) {
        var schema = document.path("components").path("schemas").path(name);
        assertThat(schema.isObject()).as(name).isTrue();
        return schema;
    }

    private static ObjectNode responseExample(JsonNode operation, String statusCode, String name) {
        var example = operation.path("responses").path(statusCode).at("/content/application~1json/examples")
                .path(name).path("value");
        assertThat(example.isObject()).as("%s response example", name).isTrue();
        return (ObjectNode) example.deepCopy();
    }

    private static void assertRequired(JsonNode schema, String... fields) {
        assertThat(schema.path("required")).extracting(JsonNode::asString).containsExactlyInAnyOrder(fields);
    }

    private static void assertLengths(JsonNode schema, String field, int minimum, int maximum) {
        var property = schema.path("properties").path(field);
        assertThat(property.path("minLength").intValue()).as("%s minLength", field).isEqualTo(minimum);
        assertThat(property.path("maxLength").intValue()).as("%s maxLength", field).isEqualTo(maximum);
    }

    private static void assertNullable(JsonNode schema, String type) {
        assertThat(schema.path("type")).extracting(JsonNode::asString).containsExactlyInAnyOrder(type, "null");
    }
}
