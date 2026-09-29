package example.web;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.HashSet;
import java.util.Set;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.AfterEach;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.core.env.Environment;
import org.springframework.test.context.TestConstructor;
import org.springframework.web.servlet.mvc.method.annotation.RequestMappingHandlerMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;
import jakarta.validation.constraints.NotNull;
import io.swagger.v3.oas.annotations.Hidden;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import static org.junit.jupiter.api.Assertions.*;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@TestConstructor(autowireMode = TestConstructor.AutowireMode.ALL)
@Import(ContractTest.ProbeConfiguration.class)
class ContractTest {
    private final String base;
    private final ObjectMapper mapper;
    private final RequestMappingHandlerMapping mappings;
    private final HttpClient client = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).build();

    ContractTest(Environment environment, ObjectMapper mapper,
            @Qualifier("requestMappingHandlerMapping") RequestMappingHandlerMapping mappings) {
        this.base = "http://127.0.0.1:" + environment.getProperty("local.server.port") + "/api";
        this.mapper = mapper;
        this.mappings = mappings;
    }

    @AfterEach
    void closeClient() {
        client.close();
    }

    private HttpResponse<String> request(String method, String path, String body) throws Exception {
        return client.send(HttpRequest.newBuilder(URI.create(path.startsWith("http") ? path : base + path))
                .timeout(Duration.ofSeconds(10))
                .header("Content-Type", "application/json")
                .method(method, body == null ? HttpRequest.BodyPublishers.noBody() : HttpRequest.BodyPublishers.ofString(body))
                .build(), HttpResponse.BodyHandlers.ofString());
    }

    private JsonNode json(HttpResponse<String> response) throws Exception {
        return mapper.readTree(response.body());
    }

    private JsonNode spec(String suffix) throws Exception {
        HttpResponse<String> response = request("GET", "/v3/api-docs" + suffix, null);
        assertEquals(200, response.statusCode(), response.body());
        return json(response);
    }

    private static Set<String> propertyNames(JsonNode node) {
        Set<String> names = new HashSet<>();
        node.properties().forEach(entry -> names.add(entry.getKey()));
        return names;
    }

    @Test
    void inventoryMatchesBothPublishedDocuments() throws Exception {
        Set<String> expected = new HashSet<>();
        mappings.getHandlerMethods().forEach((info, handler) -> {
            if (handler.getBeanType() == ProductController.class) {
                info.getPatternValues().forEach(path -> info.getMethodsCondition().getMethods()
                        .forEach(method -> expected.add(method.name().toLowerCase() + " " + path)));
            }
        });
        assertEquals(5, expected.size());
        for (String suffix : new String[]{"", "/catalog"}) {
            JsonNode document = spec(suffix);
            assertTrue(document.path("openapi").asString().startsWith("3.1."));
            assertEquals("process-local", document.at("/x-fixture/storage").asString());
            Set<String> actual = new HashSet<>();
            Set<String> operationIds = new HashSet<>();
            document.path("paths").properties().forEach(path -> path.getValue().properties().forEach(operation -> {
                actual.add(operation.getKey() + " " + path.getKey());
                assertTrue(operationIds.add(operation.getValue().path("operationId").asString()));
                assertFalse(operation.getValue().path("summary").asString().isBlank());
                assertFalse(operation.getValue().path("description").asString().isBlank());
            }));
            assertEquals(expected, actual);
            Path output = Path.of("target", "contracts", suffix.isEmpty() ? "default.json" : "catalog.json");
            Files.createDirectories(output.getParent());
            Files.writeString(output, document.toPrettyString());
        }
    }

    @Test
    void optionalAndNestedSchemasAreDescribed() throws Exception {
        JsonNode schemas = spec("").at("/components/schemas");
        for (String name : new String[]{"ProductCreate", "Product", "Dimensions", "ProductPatch", "ApiProblem", "Violation"}) {
            JsonNode schema = schemas.path(name);
            assertFalse(schema.path("description").asString().isBlank(), name);
            schema.path("properties").properties().forEach(property ->
                    assertFalse(property.getValue().path("description").asString().isBlank(), name + "." + property.getKey()));
        }
        assertEquals(Set.of("sku", "title", "description", "dimensions"), propertyNames(schemas.at("/ProductCreate/properties")));
        assertEquals(Set.of("width", "height"), propertyNames(schemas.at("/Dimensions/properties")));
        Set<String> createRequired = new HashSet<>();
        schemas.at("/ProductCreate/required").forEach(value -> createRequired.add(value.asString()));
        assertEquals(Set.of("sku", "title"), createRequired);
        assertEquals("^[A-Z0-9-]{3,20}$", schemas.at("/ProductCreate/properties/sku/pattern").asString());
        assertTrue(schemas.at("/ProductPatch/required").isMissingNode() || schemas.at("/ProductPatch/required").isEmpty());
        assertFalse(schemas.at("/ProductPatch/additionalProperties").asBoolean());
        assertTrue(schemas.at("/Product/properties/id/readOnly").asBoolean());
        JsonNode limit = spec("").at("/paths/~1products/get/parameters/0/schema");
        assertEquals("integer", limit.path("type").asString());
        assertTrue(limit.path("default").isIntegralNumber());
        assertEquals(10, limit.path("default").asInt());
        for (String suffix : new String[]{"", "/catalog"}) {
            JsonNode publishedSchemas = spec(suffix).at("/components/schemas");
            for (String model : new String[]{"ProductCreate", "Product"}) {
                JsonNode dimensions = publishedSchemas.path(model).at("/properties/dimensions");
                assertFalse(dimensions.has("$ref"), "No contradictory sibling ref/null constraints");
                assertEquals(2, dimensions.path("oneOf").size());
                assertEquals("#/components/schemas/Dimensions", dimensions.at("/oneOf/0/$ref").asString());
                assertEquals("null", dimensions.at("/oneOf/1/type").asString());
            }
        }
    }

    @Test
    void generatedCreationExamplesWorkAndLocationCanBeFollowed() throws Exception {
        JsonNode examples = spec("").at("/paths/~1products/post/requestBody/content/application~1json/examples");
        assertEquals(Set.of("minimum", "complete"), propertyNames(examples));
        for (var example : examples.properties()) {
            JsonNode input = example.getValue().get("value");
            assertTrue(input.isObject(), "Generated named example must be an object");
            HttpResponse<String> created = request("POST", "/products", input.toString());
            assertEquals(201, created.statusCode(), created.body());
            String location = created.headers().firstValue("Location").orElseThrow();
            assertTrue(location.startsWith(base + "/products/"));
            HttpResponse<String> fetched = request("GET", location, null);
            assertEquals(200, fetched.statusCode());
            JsonNode result = json(fetched);
            assertEquals(input.path("sku"), result.path("sku"));
            assertEquals(Set.of("id", "sku", "title", "description", "dimensions"), propertyNames(result));
            assertEquals(example.getKey().equals("minimum"), result.path("description").isNull());
            if (example.getKey().equals("complete")) {
                assertEquals(120, result.at("/dimensions/width").asInt());
            }
            assertEquals(204, request("DELETE", location, null).statusCode());
        }
    }

    @Test
    void patchPreservesClearsAndRejectsUnknownFields() throws Exception {
        HttpResponse<String> created = request("POST", "/products", "{\"sku\":\"PATCH-01\",\"title\":\"Patch item\",\"description\":\"before\"}");
        assertEquals(201, created.statusCode());
        String location = created.headers().firstValue("Location").orElseThrow();
        assertEquals("before", json(request("PATCH", location, "{}")).path("description").asString());
        assertTrue(json(request("PATCH", location, "{\"description\":null}")).path("description").isNull());
        assertEquals("after", json(request("PATCH", location, "{\"description\":\"after\"}")).path("description").asString());
        assertEquals(400, request("PATCH", location, "{\"id\":\"forged\"}").statusCode());
        assertEquals(400, request("PATCH", location, "{\"description\":42}").statusCode());
        HttpResponse<String> deleted = request("DELETE", location, null);
        assertEquals(204, deleted.statusCode());
        assertTrue(deleted.body().isEmpty());
        assertEquals(404, request("GET", location, null).statusCode());
    }

    @Test
    void multipleViolationsForOneFieldRemainClientErrors() throws Exception {
        HttpResponse<String> response = request("POST", "/products", "{\"sku\":\"ERR-01\",\"title\":\"\"}");
        assertEquals(400, response.statusCode(), response.body());
        assertTrue(response.headers().firstValue("Content-Type").orElseThrow().contains("application/problem+json"));
        JsonNode body = json(response);
        assertEquals(400, body.path("status").asInt());
        assertEquals("/api/products", body.path("instance").asString());
        int titleViolations = 0;
        for (JsonNode violation : body.path("violations")) {
            if (violation.path("field").asString().equals("title")) titleViolations++;
            assertFalse(violation.has("rejectedValue"));
        }
        assertEquals(2, titleViolations);
        JsonNode example = spec("").at("/paths/~1products/post/responses/400/content/application~1problem+json/examples/invalidTitle/value");
        assertEquals(propertyNames(body), propertyNames(example));
        assertEquals(body.path("status"), example.path("status"));
        assertEquals(body.path("detail"), example.path("detail"));
        assertEquals(2, example.path("violations").size());
        HttpResponse<String> nested = request("POST", "/products",
                "{\"sku\":\"NESTED-01\",\"title\":\"Nested input\",\"dimensions\":{\"width\":0,\"height\":80}}");
        assertEquals(400, nested.statusCode(), nested.body());
        assertEquals("dimensions.width", json(nested).at("/violations/0/field").asString());
    }

    @Test
    void bindingAndStateFailuresHaveTheirOwnStatus() throws Exception {
        assertEquals(400, request("POST", "/products", "{").statusCode());
        assertEquals(400, request("POST", "/products", null).statusCode());
        assertEquals(400, request("POST", "/products", "{\"sku\":\"xxxBOX-01xxx\",\"title\":\"Invalid code\"}").statusCode());
        assertEquals(400, request("GET", "/products/not-a-uuid", null).statusCode());
        assertEquals(400, request("GET", "/products?limit=0", null).statusCode());
        assertEquals(404, request("GET", "/products/" + UUID.randomUUID(), null).statusCode());
        String input = "{\"sku\":\"DUP-01\",\"title\":\"Duplicate item\"}";
        HttpResponse<String> created = request("POST", "/products", input);
        assertEquals(201, created.statusCode());
        HttpResponse<String> conflict = request("POST", "/products", input);
        assertEquals(409, conflict.statusCode());
        assertEquals(409, json(conflict).path("status").asInt());
        request("DELETE", created.headers().firstValue("Location").orElseThrow(), null);
        HttpResponse<String> unacceptable = client.send(HttpRequest.newBuilder(URI.create(base + "/products"))
                .timeout(Duration.ofSeconds(10)).header("Accept", "text/plain").GET().build(), HttpResponse.BodyHandlers.ofString());
        assertEquals(406, unacceptable.statusCode());
        assertEquals(406, json(unacceptable).path("status").asInt());
    }

    @Test
    void bootParserConstraintsRejectInputBeforeItCanChangeTheProduct() throws Exception {
        HttpResponse<String> created = request("POST", "/products",
                "{\"sku\":\"PARSER-01\",\"title\":\"Parser limits\",\"description\":\"before\"}");
        assertEquals(201, created.statusCode(), created.body());
        String location = created.headers().firstValue("Location").orElseThrow();
        try {
            String nested = "{\"child\":".repeat(20) + "null" + "}".repeat(20);
            for (String body : new String[]{
                    "{\"description\":" + nested + "}",
                    "{\"description\":\"" + "x".repeat(6000) + "\"}",
                    "{\"description\":" + "1".repeat(101) + "}"}) {
                HttpResponse<String> rejected = request("PATCH", location, body);
                assertEquals(400, rejected.statusCode(), rejected.body());
                assertEquals("Failed to read request", json(rejected).path("detail").asString());
                assertFalse(json(rejected).has("violations"));
                assertFalse(rejected.body().contains("StreamConstraintsException"));
                assertEquals("before", json(request("GET", location, null)).path("description").asString());
            }
            HttpResponse<String> smallInvalidDto = request("POST", "/products",
                    "{\"sku\":\"PARSER-02\",\"title\":\"\"}");
            assertEquals(400, smallInvalidDto.statusCode());
            assertEquals("Input validation failed", json(smallInvalidDto).path("detail").asString());
            assertFalse(json(smallInvalidDto).path("violations").isEmpty());
        } finally {
            assertEquals(204, request("DELETE", location, null).statusCode());
        }
    }

    @Test
    void documentationHasRealStatusesAndNoBodyFor204() throws Exception {
        JsonNode paths = spec("").path("paths");
        assertTrue(paths.at("/~1products/post/responses").has("201"));
        assertTrue(paths.at("/~1products/post/responses").has("409"));
        assertTrue(paths.at("/~1products/post/responses/201/headers").has("Location"));
        assertFalse(paths.at("/~1products~1{id}/delete/responses/204").has("content"));
        assertTrue(paths.at("/~1products~1{id}/get/responses").has("404"));
    }

    @Test
    void supplementaryCharactersUseTheDocumentedCodePointBounds() throws Exception {
        String symbol = "\uD83D\uDE80";
        String acceptedInput = mapper.writeValueAsString(java.util.Map.of(
                "sku", "UNICODE-01", "title", symbol.repeat(80), "description", symbol.repeat(200)));
        HttpResponse<String> created = request("POST", "/products", acceptedInput);
        assertEquals(201, created.statusCode(), created.body());
        String location = created.headers().firstValue("Location").orElseThrow();
        assertEquals(400, request("POST", "/products", mapper.writeValueAsString(java.util.Map.of(
                "sku", "UNICODE-02", "title", symbol.repeat(81)))).statusCode());
        assertEquals(400, request("POST", "/products", mapper.writeValueAsString(java.util.Map.of(
                "sku", "UNICODE-03", "title", "Description boundary", "description", symbol.repeat(201)))).statusCode());
        assertEquals(200, request("PATCH", location, mapper.writeValueAsString(java.util.Map.of(
                "description", symbol.repeat(200)))).statusCode());
        assertEquals(400, request("PATCH", location, mapper.writeValueAsString(java.util.Map.of(
                "description", symbol.repeat(201)))).statusCode());
        JsonNode properties = spec("").at("/components/schemas/ProductCreate/properties");
        assertEquals(80, properties.at("/title/maxLength").asInt());
        assertEquals(200, properties.at("/description/maxLength").asInt());
        assertEquals(204, request("DELETE", location, null).statusCode());
    }

    @Test
    void methodValidationAndCollectionContractsAgree() throws Exception {
        HttpResponse<String> invalid = request("GET", "/products?limit=0", null);
        assertEquals(400, invalid.statusCode());
        JsonNode failure = json(invalid);
        assertEquals("Input validation failed", failure.path("detail").asString());
        assertEquals("limit", failure.at("/violations/0/field").asString());
        assertTrue(failure.path("violations").size() > 0);
        assertEquals("/api/products", failure.path("instance").asString());
        for (String suffix : new String[]{"", "/catalog"}) {
            JsonNode document = spec(suffix);
            JsonNode violations = document.at("/components/schemas/ApiProblem/properties/violations");
            assertEquals("array", violations.path("type").asString());
            assertEquals(1, violations.path("minItems").asInt());
            assertFalse(violations.has("maxItems"), "No artificial error-count cap");
            assertFalse(violations.path("uniqueItems").asBoolean());
            assertEquals("#/components/schemas/Violation", violations.at("/items/$ref").asString());
            assertEquals(2, violations.path("example").size());
            JsonNode list = document.at("/paths/~1products/get/responses/200/content/application~1json/schema");
            assertEquals(0, list.path("minItems").asInt());
            assertEquals(50, list.path("maxItems").asInt());
            assertTrue(list.path("uniqueItems").asBoolean());
            assertEquals("#/components/responses/BadRequest", document.at("/paths/~1products~1{id}/get/responses/400/$ref").asString());
            assertEquals(2, document.at("/paths/~1products/post/responses/400/content/application~1problem+json/examples/invalidTitle/value/violations").size());
            document.path("paths").properties().forEach(path -> path.getValue().properties().forEach(operation ->
                    assertEquals("#/components/responses/InternalServerError", operation.getValue().at("/responses/500/$ref").asString())));
        }
        HttpResponse<String> unsupportedMethod = request("PUT", "/products", null);
        assertEquals(405, unsupportedMethod.statusCode());
        assertTrue(unsupportedMethod.headers().firstValue("Allow").orElseThrow().contains("GET"));
    }

    @Test
    void unexpectedAndReturnValueFailuresStaySafeServerErrors() throws Exception {
        for (String path : new String[]{"/_probe/failure", "/_probe/return-value"}) {
            HttpResponse<String> failure = request("GET", path, null);
            assertEquals(500, failure.statusCode(), failure.body());
            JsonNode body = json(failure);
            assertEquals(500, body.path("status").asInt());
            assertFalse(body.has("violations"));
            assertFalse(failure.body().contains("private-sentinel"));
            assertFalse(failure.body().contains("IllegalStateException"));
            assertFalse(body.has("stackTrace"));
        }
    }

    @Test
    void sharedResponsesRegisterSchemasWithoutControllerErrorAnnotations() {
        var operation = new io.swagger.v3.oas.models.Operation().responses(new io.swagger.v3.oas.models.responses.ApiResponses()
                .addApiResponse("200", new io.swagger.v3.oas.models.responses.ApiResponse().description("Success")));
        var document = new io.swagger.v3.oas.models.OpenAPI().paths(new io.swagger.v3.oas.models.Paths()
                .addPathItem("/products/new-consumer", new io.swagger.v3.oas.models.PathItem().get(operation)));
        new ApiDocumentation().commonMvcErrors().customise(document);
        assertNotNull(document.getComponents().getSchemas().get("ApiProblem"));
        assertNotNull(document.getComponents().getSchemas().get("Violation"));
        assertEquals("#/components/responses/BadRequest", operation.getResponses().get("400").get$ref());
        assertEquals("#/components/responses/InternalServerError", operation.getResponses().get("500").get$ref());
        assertEquals("Success", operation.getResponses().get("200").getDescription());
    }

    @TestConfiguration(proxyBeanMethods = false)
    static class ProbeConfiguration {
        @Bean
        FailureProbe failureProbe() { return new FailureProbe(); }
    }

    // Test-only fault injection: never registered by the runnable application's main source.
    // Excluded from the production API inventory because it is not an application endpoint.
    @RestController
    @Hidden
    static class FailureProbe {
        @GetMapping("/_probe/failure")
        String failure() { throw new IllegalStateException("private-sentinel"); }

        @GetMapping("/_probe/return-value")
        @NotNull(message = "private-sentinel")
        String invalidReturn() { return null; }
    }

    @Test
    void uiAssetsAndConfigAreAvailableWithoutClaimingBrowserExecution() throws Exception {
        HttpResponse<String> ui = request("GET", "/swagger-ui/index.html", null);
        assertEquals(200, ui.statusCode());
        assertTrue(ui.body().contains("swagger-ui"));
        JsonNode configuration = json(request("GET", "/v3/api-docs/swagger-config", null));
        assertFalse(configuration.path("persistAuthorization").asBoolean());
        assertTrue(configuration.path("urls").toString().contains("/api/v3/api-docs/catalog"));
    }
}
