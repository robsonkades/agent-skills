package io.github.robsonkades.customer.config;

import org.junit.jupiter.api.DisplayName;
import io.github.robsonkades.customer.controller.dto.CustomerFilterRequest;
import io.github.robsonkades.customer.controller.dto.CustomerSearchRequest;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

import java.util.LinkedHashSet;
import java.util.Map;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.asyncDispatch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.request;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest(properties = {
        "springdoc.group-configs[0].group=contract-test",
        "springdoc.group-configs[0].paths-to-match[0]=/**",
        "springdoc.cache.disabled=true"
})
@AutoConfigureMockMvc
class CustomerSearchOpenApiTests {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @ParameterizedTest
    @DisplayName("Filters have non circular schemas and distinct discriminators")
    @ValueSource(strings = {"/v3/api-docs", "/v3/api-docs/contract-test"})
    void filtersHaveNonCircularSchemasAndDistinctDiscriminators(String documentPath) throws Exception {
        var document = document(documentPath);
        var searchSchema = resolve(document, searchBody(document).path("schema"));
        var filters = searchSchema.at("/properties/filters");
        assertThat(filters.path("maxItems").asInt()).isEqualTo(20);
        var items = resolve(document, filters.path("items"));
        assertResolvableComposition(document, filters.path("items"), new LinkedHashSet<>());
        assertThat(items.path("oneOf")).hasSize(8);
        var discriminator = document.at("/components/schemas/CustomerFilter/discriminator");
        assertThat(discriminator.path("propertyName").asString()).isEqualTo("_discriminator");

        var types = Map.of("cpf", "CpfFilter", "email", "EmailFilter", "name", "NameFilter",
                "phone", "PhoneFilter", "address.city", "CityFilter", "address.state", "StateFilter",
                "address.postalCode", "PostalCodeFilter",
                "birthDateRange", "BirthDateRangeFilter");
        for (var entry : types.entrySet()) {
            var reference = "#/components/schemas/" + entry.getValue();
            assertThat(discriminator.path("mapping").path(entry.getKey()).asString()).isEqualTo(reference);
            assertThat(items.path("oneOf")).anySatisfy(schema ->
                    assertThat(schema.path("$ref").asString()).isEqualTo(reference));
            var variant = document.at(reference.substring(1));
            assertThat(variant.path("required")).anySatisfy(field ->
                    assertThat(field.asString()).isEqualTo("_discriminator"));
            assertThat(variant.findPath("_discriminator").path("enum")).singleElement().satisfies(value ->
                    assertThat(value.asString()).isEqualTo(entry.getKey()));
            if (!"birthDateRange".equals(entry.getKey())) {
                assertThat(variant.path("required")).anySatisfy(field -> assertThat(field.asString()).isEqualTo("value"));
                assertThat(variant.path("required")).noneSatisfy(field -> assertThat(field.asString()).isEqualTo("operator"));
                assertThat(variant.findPath("field").isMissingNode()).isTrue();
                assertThat(variant.findPath("value").path("maxLength").asInt()).isEqualTo(254);
                var operator = variant.findPath("operator");
                assertThat(operator.path("default").asString()).isEqualTo("exact");
                assertThat(operator.path("enum")).extracting(value -> value.isNull() ? null : value.asString())
                        .containsExactlyInAnyOrder("contains", "exact", null);
            } else {
                assertThat(variant.findPath("from").path("format").asString()).isEqualTo("date");
                assertThat(variant.findPath("to").path("format").asString()).isEqualTo("date");
            }
        }
    }

    @ParameterizedTest
    @DisplayName("Documented search examples deserialize all variants and are accepted")
    @ValueSource(strings = {"/v3/api-docs", "/v3/api-docs/contract-test"})
    void documentedSearchExamplesDeserializeAllVariantsAndAreAccepted(String documentPath) throws Exception {
        var examples = searchBody(document(documentPath)).path("examples");
        assertThat(examples).hasSize(3);
        var filterTypes = new LinkedHashSet<Class<?>>();
        for (var documentedExample : examples) {
            var example = documentedExample.path("value");
            var search = objectMapper.treeToValue(example, CustomerSearchRequest.class);
            search.filters().forEach(filter -> filterTypes.add(filter.getClass()));

            var result = mockMvc.perform(post("/customers/search").contentType(MediaType.APPLICATION_JSON)
                            .content(example.toString()))
                    .andExpect(request().asyncStarted()).andReturn();
            mockMvc.perform(asyncDispatch(result))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.content").isArray())
                    .andExpect(jsonPath("$.page").value(0))
                    .andExpect(jsonPath("$.size").value(20));
        }
        assertThat(filterTypes).containsExactlyInAnyOrder(
                CustomerFilterRequest.Cpf.class, CustomerFilterRequest.Email.class,
                CustomerFilterRequest.Name.class, CustomerFilterRequest.Phone.class,
                CustomerFilterRequest.City.class, CustomerFilterRequest.State.class,
                CustomerFilterRequest.PostalCode.class, CustomerFilterRequest.BirthDateRange.class);
    }

    private JsonNode document(String path) throws Exception {
        var json = mockMvc.perform(get(path)).andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        return objectMapper.readTree(json);
    }

    private static JsonNode searchBody(JsonNode document) {
        return document.at("/paths/~1customers~1search/post/requestBody/content/application~1json");
    }

    private static JsonNode resolve(JsonNode document, JsonNode schema) {
        return schema.has("$ref") ? document.at(schema.path("$ref").asString().substring(1)) : schema;
    }

    private static void assertResolvableComposition(JsonNode document, JsonNode schema, Set<String> ancestors) {
        assertThat(schema.isObject()).as("Elemento da composição: %s", schema).isTrue();
        if (schema.has("$ref")) {
            var reference = schema.path("$ref").asString();
            assertThat(reference).startsWith("#/components/schemas/");
            assertThat(ancestors).as("Referência circular: %s -> %s", ancestors, reference).doesNotContain(reference);
            ancestors.add(reference);
            assertResolvableComposition(document, resolve(document, schema), ancestors);
            ancestors.remove(reference);
        }
        for (var keyword : new String[]{"allOf", "oneOf", "anyOf"}) {
            if (schema.has(keyword)) {
                assertThat(schema.path(keyword).isArray()).as(keyword).isTrue();
                for (var element : schema.path(keyword)) {
                    assertResolvableComposition(document, element, ancestors);
                }
            }
        }
    }
}
