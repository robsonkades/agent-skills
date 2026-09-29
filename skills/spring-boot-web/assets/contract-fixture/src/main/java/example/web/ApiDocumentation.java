package example.web;

import io.swagger.v3.oas.models.OpenAPI;
import io.swagger.v3.oas.models.info.Info;
import io.swagger.v3.oas.models.media.ComposedSchema;
import io.swagger.v3.oas.models.media.Schema;
import io.swagger.v3.oas.models.media.Content;
import io.swagger.v3.oas.models.media.MediaType;
import io.swagger.v3.oas.models.examples.Example;
import io.swagger.v3.oas.models.responses.ApiResponse;
import io.swagger.v3.oas.models.responses.ApiResponses;
import io.swagger.v3.core.converter.ModelConverters;
import io.swagger.v3.oas.models.Components;
import java.util.Map;
import java.util.List;
import java.util.Set;
import org.springdoc.core.customizers.GlobalOpenApiCustomizer;
import org.springdoc.core.models.GroupedOpenApi;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration(proxyBeanMethods = false)
public class ApiDocumentation {
    @Bean
    OpenAPI catalogContract() {
        return new OpenAPI().info(new Info().title("Disposable Catalog API").version("1")
                .description("Loopback-only learning fixture. All operations are public; no production data, credentials or persistent storage. Optional and nested fields are part of the contract."));
    }

    @Bean
    GroupedOpenApi catalogGroup() {
        return GroupedOpenApi.builder().group("catalog").pathsToMatch("/products/**", "/products").build();
    }

    @Bean
    GlobalOpenApiCustomizer fixtureProvenance() {
        return api -> api.addExtension("x-fixture", Map.of("storage", "process-local", "audience", "loopback"));
    }

    @Bean
    GlobalOpenApiCustomizer nullableDimensions() {
        // For this tested generator pair, nullable=true on a referenced object creates
        // type:null beside an object $ref: an impossible intersection in OAS 3.1.
        // Express the actual null-or-object union and retain the property description.
        return api -> {
            for (String name : new String[]{"ProductCreate", "Product"}) {
                if (api.getComponents() == null || api.getComponents().getSchemas() == null
                        || !api.getComponents().getSchemas().containsKey(name)) continue;
                var properties = api.getComponents().getSchemas().get(name).getProperties();
                Schema<?> original = (Schema<?>) properties.get("dimensions");
                var union = new ComposedSchema();
                union.setDescription(original.getDescription());
                union.addOneOfItem(new Schema<>().$ref("#/components/schemas/Dimensions"));
                Schema<Object> nullVariant = new Schema<>();
                nullVariant.setTypes(Set.of("null"));
                union.addOneOfItem(nullVariant);
                properties.put("dimensions", union);
            }
        };
    }

    @Bean
    GlobalOpenApiCustomizer commonMvcErrors() {
        return api -> {
            if (api.getComponents() == null) api.setComponents(new Components());
            var components = api.getComponents();
            ModelConverters.getInstance(true).readAll(Models.ApiProblem.class)
                    .forEach((name, schema) -> {
                        if (components.getSchemas() == null || !components.getSchemas().containsKey(name)) {
                            components.addSchemas(name, schema);
                        }
                    });
            // Preserve a typed collection example: this generator pair drops the
            // arraySchema annotation's example when composing the array property.
            Schema<?> problemSchema = components.getSchemas().get("ApiProblem");
            Schema<?> violations = (Schema<?>) problemSchema.getProperties().get("violations");
            violations.setExample(List.of(
                    Map.of("field", "title", "message", "must not be blank"),
                    Map.of("field", "title", "message", "length must be between 3 and 80 Unicode code points")));
            components.addResponses("BadRequest", problemResponse("Request input cannot be bound or validated", "invalidParameter",
                    Map.of("title", "Bad Request", "status", 400, "detail", "Invalid request parameter", "instance", "/api/products/not-a-uuid")));
            components.addResponses("InternalServerError", problemResponse("Unexpected MVC failure or failed response validation; no internal details are exposed", "unexpected",
                    Map.of("title", "Internal Server Error", "status", 500, "detail", "Unexpected server error", "instance", "/api/products")));
            api.getPaths().forEach((path, item) -> {
                if (!path.equals("/products") && !path.startsWith("/products/")) return;
                item.readOperations().forEach(operation -> {
                    if (operation.getResponses() == null) operation.setResponses(new ApiResponses());
                    operation.getResponses().putIfAbsent("400", new ApiResponse().$ref("#/components/responses/BadRequest"));
                    operation.getResponses().putIfAbsent("500", new ApiResponse().$ref("#/components/responses/InternalServerError"));
                });
            });
        };
    }

    private static ApiResponse problemResponse(String description, String exampleName, Map<String, Object> example) {
        return new ApiResponse().description(description).content(new Content().addMediaType("application/problem+json",
                new MediaType().schema(new Schema<>().$ref("#/components/schemas/ApiProblem"))
                        .addExamples(exampleName, new Example().value(example))));
    }
}
