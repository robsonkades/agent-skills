package io.github.robsonkades.customer.config;

import org.junit.jupiter.api.DisplayName;
import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.slf4j.LoggerFactory;
import org.springdoc.core.utils.SpringDocUtils;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.context.request.async.WebAsyncTask;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

import java.util.HashMap;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest(properties = {
        "springdoc.group-configs[0].group=contract-test",
        "springdoc.group-configs[0].paths-to-match[0]=/**",
        "springdoc.cache.disabled=true"
})
@AutoConfigureMockMvc
@Import(GlobalErrorOpenApiTests.UndocumentedController.class)
class GlobalErrorOpenApiTests {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @ParameterizedTest
    @DisplayName("All operations inherit complete standard errors")
    @ValueSource(strings = {"/v3/api-docs", "/v3/api-docs/contract-test"})
    void allOperationsInheritCompleteStandardErrors(String documentPath) throws Exception {
        var document = document(documentPath);
        var standardCodes = new String[]{"400", "401", "403", "404", "405", "406", "408", "409", "410",
                "412", "413", "415", "422", "429", "500", "502", "503", "504", "default"};

        for (var path : document.path("paths").properties()) {
            for (var operation : path.getValue().properties()) {
                var responses = operation.getValue().path("responses");
                for (var code : standardCodes) {
                    var response = resolve(document, responses.path(code));
                    assertThat(response.isMissingNode()).as("%s %s %s", path.getKey(), operation.getKey(), code).isFalse();
                    assertThat(response.path("description").asString()).isNotBlank();
                    var mediaType = response.path("content").path("application/problem+json");
                    assertThat(mediaType.path("schema").path("$ref").asString()).isEqualTo("#/components/schemas/ProblemDetail");
                    assertThat(mediaType.path("examples").isEmpty()).isFalse();
                    for (var example : mediaType.path("examples")) {
                        var value = example.path("value");
                        for (var field : new String[]{"type", "title", "detail", "instance"}) {
                            assertThat(value.path(field).asString()).as(field).isNotBlank();
                        }
                        assertThat(value.path("status").asInt()).isEqualTo("default".equals(code) ? 500 : Integer.parseInt(code));
                        assertThat(value.has("properties")).isFalse();
                    }
                }
            }
        }

        var probe = document.path("paths").path("/documentation-probe").path("get").path("responses");
        assertThat(probe.path("400").path("$ref").asString()).isEqualTo("#/components/responses/Http400");
        assertThat(probe.path("500").path("$ref").asString()).isEqualTo("#/components/responses/Http500");
        assertThat(probe.has("200")).isTrue();
        assertThat(probe.path("200").path("content").has("application/problem+json")).isFalse();
        assertThat(document.at("/components/responses/Http405/headers/Allow/schema/example").asString()).isEqualTo("GET, POST");
        assertThat(document.at("/components/responses/Http415/headers/Accept-Patch").isMissingNode()).isFalse();
        assertThat(document.at("/components/responses/Http503/headers/Retry-After").isMissingNode()).isFalse();
        assertThat(document.at("/components/responses/Http503/content/application~1problem+json/examples/request-timeout/value/type")
                .asString()).isEqualTo("urn:problem:request-timeout");
        assertThat(document.at("/components/responses/Http400/content/application~1problem+json/examples/validation-error/value/errors")
                .isArray()).isTrue();
        assertThat(document.at("/components/schemas/ProblemDetail/additionalProperties").asBoolean()).isTrue();
    }

    @ParameterizedTest
    @DisplayName("Business errors complement defaults without leaking to other operations")
    @ValueSource(strings = {"/v3/api-docs", "/v3/api-docs/contract-test"})
    void businessErrorsComplementDefaultsWithoutLeakingToOtherOperations(String documentPath) throws Exception {
        var document = document(documentPath);
        var customers = document.path("paths").path("/customers");
        var createResponses = customers.path("post").path("responses");
        var badRequest = createResponses.path("400");
        assertThat(badRequest.path("description").asString()).contains("invalid-customer", "Requisição inválida");
        var examples = badRequest.path("content").path("application/problem+json").path("examples");
        assertThat(examples.has("invalid-customer")).isTrue();
        assertThat(examples.has("invalid-request-body")).isTrue();
        assertThat(examples.has("missing-parameter")).isTrue();
        assertThat(createResponses.path("201").path("headers").has("Location")).isTrue();
        assertThat(createResponses.path("201").path("content").path("application/json").path("schema").path("$ref").asString())
                .isEqualTo("#/components/schemas/Customer");
        assertThat(createResponses.has("200")).isFalse();

        var resource = document.path("paths").path("/customers/{customerId}");
        for (var method : new String[]{"get", "put", "patch"}) {
            var responses = resource.path(method).path("responses");
            var notFound = responses.path("404").path("content").path("application/problem+json").path("examples");
            assertThat(notFound.has("customer-not-found")).as(method).isTrue();
            assertThat(notFound.has("resource-not-found")).as(method).isTrue();
            assertThat(responses.path("200").path("content").path("application/json").path("schema").path("$ref").asString())
                    .isEqualTo("#/components/schemas/Customer");
            if (!"get".equals(method)) {
                assertThat(responses.path("400").path("content").path("application/problem+json")
                        .path("examples").has("invalid-customer")).as(method).isTrue();
            }
        }
        assertThat(customers.path("get").path("responses").path("400").path("$ref").asString())
                .isEqualTo("#/components/responses/Http400");
        assertThat(resource.path("get").path("responses").path("400").path("$ref").asString())
                .isEqualTo("#/components/responses/Http400");
        var commonNotFound = document.at("/components/responses/Http404/content/application~1problem+json/examples");
        assertThat(commonNotFound.has("customer-not-found")).isFalse();
        assertThat(document.at("/components/responses/Http400/content/application~1problem+json/examples/invalid-customer")
                .isMissingNode()).isTrue();
    }

    @ParameterizedTest
    @DisplayName("Async responses document their payload without spring infrastructure")
    @ValueSource(strings = {"/v3/api-docs", "/v3/api-docs/contract-test"})
    void asyncResponsesDocumentTheirPayloadWithoutSpringInfrastructure(String documentPath) throws Exception {
        var document = document(documentPath);
        var listingSchema = document.at("/paths/~1customers/get/responses/200/content/application~1json/schema");
        assertThat(listingSchema.path("$ref").asString()).isEqualTo("#/components/schemas/CustomerPage");

        var pageProperties = document.at("/components/schemas/CustomerPage/properties");
        for (var property : new String[]{"content", "page", "size", "totalElements", "totalPages"}) {
            assertThat(pageProperties.has(property)).as(property).isTrue();
        }
        assertThat(pageProperties.at("/content/items/$ref").asString()).isEqualTo("#/components/schemas/Customer");

        var probeSchema = resolve(document,
                document.at("/paths/~1documentation-probe/get/responses/200/content/application~1json/schema"));
        assertThat(probeSchema.path("type").asString()).as("Schema da resposta: %s", probeSchema).isEqualTo("object");
        assertThat(probeSchema.at("/additionalProperties/type").asString()).isEqualTo("string");

        var schemas = document.path("components").path("schemas");
        assertThat(schemas.has("AsyncTaskExecutor")).isFalse();
        assertThat(schemas.has("BeanFactory")).isFalse();
        for (var schema : schemas.properties()) {
            assertThat(schema.getKey()).doesNotStartWith("WebAsyncTask").doesNotStartWith("ResponseEntity");
        }
    }

    @ParameterizedTest
    @DisplayName("Validated parameters keep their constraints without schema conversion warnings")
    @ValueSource(strings = {"/v3/api-docs", "/v3/api-docs/contract-test"})
    void validatedParametersKeepTheirConstraintsWithoutSchemaConversionWarnings(String documentPath) throws Exception {
        var logger = (Logger) LoggerFactory.getLogger(SpringDocUtils.class);
        var events = new ListAppender<ILoggingEvent>();
        events.start();
        logger.addAppender(events);
        try {
            var document = document(documentPath);
            assertThat(document.path("openapi").asString()).startsWith("3.1.");
            var parameters = new HashMap<String, JsonNode>();
            for (var parameter : document.at("/paths/~1customers/get/parameters")) {
                parameters.put(parameter.path("name").asString(), parameter.path("schema"));
            }
            assertThat(parameters).containsKeys("page", "size", "name", "email", "cpf");
            var page = parameters.get("page");
            assertThat(page.path("type").asString()).isEqualTo("integer");
            assertThat(page.path("minimum").intValue()).isZero();
            assertThat(page.path("default").intValue()).isZero();
            assertThat(page.has("maximum")).isFalse();
            var size = parameters.get("size");
            assertThat(size.path("type").asString()).isEqualTo("integer");
            assertThat(size.path("minimum").intValue()).isEqualTo(1);
            assertThat(size.path("maximum").intValue()).isEqualTo(100);
            assertThat(size.path("default").intValue()).isEqualTo(20);
            assertThat(parameters.get("name").path("maxLength").intValue()).isEqualTo(100);
            assertThat(parameters.get("email").path("maxLength").intValue()).isEqualTo(254);
            assertThat(parameters.get("cpf").path("maxLength").intValue()).isEqualTo(11);
            assertThat(events.list).extracting(ILoggingEvent::getFormattedMessage)
                    .noneMatch(message -> message.contains("Json Processing Exception occurred"));
        } finally {
            logger.detachAppender(events);
            events.stop();
        }
    }

    private JsonNode document(String path) throws Exception {
        var json = mockMvc.perform(get(path)).andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        return objectMapper.readTree(json);
    }

    private static JsonNode resolve(JsonNode document, JsonNode response) {
        return response.has("$ref") ? document.at(response.path("$ref").asString().substring(1)) : response;
    }

    @RestController
    static class UndocumentedController {

        @GetMapping(value = "/documentation-probe", produces = MediaType.APPLICATION_JSON_VALUE)
        WebAsyncTask<ResponseEntity<Map<String, String>>> probe() {
            return new WebAsyncTask<>(() -> ResponseEntity.ok(Map.of("status", "ok")));
        }
    }
}
