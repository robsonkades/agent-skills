package io.github.robsonkades.customer.controller.documentation;

import io.swagger.v3.oas.annotations.media.ArraySchema;
import io.swagger.v3.oas.annotations.media.Schema;

import java.util.ArrayList;
import java.util.List;

/** Lê as anotações separadamente dos modelos Swagger, que também possuem uma classe Schema. */
public record RecordSchemaMetadata(String name, List<Property> properties) {

    public static RecordSchemaMetadata from(Class<?> type) {
        var definition = type.getAnnotation(Schema.class);
        var name = definition == null || definition.name().isBlank() ? type.getSimpleName() : definition.name();
        var properties = new ArrayList<Property>();
        for (var component : type.getRecordComponents()) {
            var metadata = component.getAccessor().getAnnotation(Schema.class);
            var array = component.getAccessor().getAnnotation(ArraySchema.class);
            if (metadata == null && array != null) {
                metadata = array.arraySchema();
            }
            if (metadata != null) {
                properties.add(new Property(component.getName(), metadata.minLength(),
                        metadata.pattern(), List.of(metadata.types())));
            }
        }
        return new RecordSchemaMetadata(name, List.copyOf(properties));
    }

    public record Property(String name, int minLength, String pattern, List<String> types) {
    }
}
