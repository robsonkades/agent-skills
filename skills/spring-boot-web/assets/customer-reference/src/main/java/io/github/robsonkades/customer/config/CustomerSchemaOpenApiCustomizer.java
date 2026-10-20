package io.github.robsonkades.customer.config;

import io.github.robsonkades.customer.controller.documentation.RecordSchemaMetadata;
import io.github.robsonkades.customer.controller.dto.CustomerAddressRequest;
import io.github.robsonkades.customer.controller.dto.CustomerAddressResponse;
import io.github.robsonkades.customer.controller.dto.CustomerFilterRequest;
import io.github.robsonkades.customer.controller.dto.CustomerPageResponse;
import io.github.robsonkades.customer.controller.dto.CustomerPatchAddressRequest;
import io.github.robsonkades.customer.controller.dto.CustomerPatchRequest;
import io.github.robsonkades.customer.controller.dto.CustomerRequest;
import io.github.robsonkades.customer.controller.dto.CustomerResponse;
import io.github.robsonkades.customer.controller.dto.CustomerSearchRequest;
import io.github.robsonkades.customer.controller.dto.CustomerSortOrderRequest;
import io.swagger.v3.oas.models.OpenAPI;
import io.swagger.v3.oas.models.media.ObjectSchema;
import io.swagger.v3.oas.models.media.Schema;
import io.swagger.v3.oas.models.media.StringSchema;
import org.springdoc.core.customizers.GlobalOpenApiCustomizer;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.stream.Stream;

@Component
public class CustomerSchemaOpenApiCustomizer implements GlobalOpenApiCustomizer {

    private static void preservePropertyMetadata(OpenAPI openApi, Class<?> type) {
        var metadata = RecordSchemaMetadata.from(type);
        Schema<?> schema = openApi.getComponents().getSchemas().get(metadata.name());
        if (schema == null) {
            return;
        }
        var properties = schema.getProperties();
        if (properties == null && schema.getAllOf() != null) {
            for (Schema<?> part : schema.getAllOf()) {
                if (part.getProperties() != null) {
                    properties = part.getProperties();
                    break;
                }
            }
        }
        if (properties == null) {
            return;
        }
        for (var constraint : metadata.properties()) {
            Schema<?> property = properties.get(constraint.name());
            if (property == null) {
                continue;
            }
            if (constraint.minLength() > 0) {
                property.setMinLength(constraint.minLength());
            }
            if (!constraint.pattern().isBlank()) {
                property.setPattern(constraint.pattern());
            }
            if (!constraint.types().isEmpty()) {
                property.setType(null);
                property.setTypes(new LinkedHashSet<>(constraint.types()));
                if (property.getTypes().contains("null") && property.getEnum() != null && !property.getEnum().contains(null)) {
                    // Em JSON Schema, incluir null em type não o inclui automaticamente em enum.
                    allowNullEnum(property);
                }
            }
        }
    }

    private static <T> void allowNullEnum(Schema<T> schema) {
        var values = new ArrayList<>(schema.getEnum());
        values.add(null);
        schema.setEnum(values);
    }

    @Override
    public void customise(OpenAPI openApi) {
        if (openApi.getComponents() == null || openApi.getComponents().getSchemas() == null) {
            return;
        }
        Stream.of(CustomerRequest.class, CustomerAddressRequest.class, CustomerResponse.class,
                        CustomerAddressResponse.class, CustomerPageResponse.class, CustomerSearchRequest.class,
                        CustomerFilterRequest.class, CustomerPatchRequest.class, CustomerPatchAddressRequest.class,
                        CustomerSortOrderRequest.class)
                .flatMap(type -> Stream.concat(Stream.of(type), Arrays.stream(type.getDeclaredClasses())))
                .filter(Class::isRecord)
                .forEach(type -> preservePropertyMetadata(openApi, type));

        Schema<?> dates = openApi.getComponents().getSchemas().get("BirthDateRangeFilter");
        if (dates != null) {
            var from = new ObjectSchema();
            from.addProperty("from", new StringSchema().format("date").description("Início inclusivo não nulo; obrigatório nesta alternativa."));
            from.addRequiredItem("from");
            var to = new ObjectSchema();
            to.addProperty("to", new StringSchema().format("date").description("Fim inclusivo não nulo; obrigatório nesta alternativa."));
            to.addRequiredItem("to");
            // Ao menos uma data deve existir e não ser null; ambas continuam permitidas.
            dates.setAnyOf(List.of(from, to));
        }
    }
}
