package example.web;

import org.springframework.boot.jackson.autoconfigure.JsonMapperBuilderCustomizer;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import tools.jackson.core.JsonParser;
import tools.jackson.databind.DeserializationContext;
import tools.jackson.databind.ValueDeserializer;
import tools.jackson.databind.cfg.CoercionAction;
import tools.jackson.databind.cfg.CoercionInputShape;
import tools.jackson.databind.module.SimpleModule;

@Configuration(proxyBeanMethods = false)
public class JsonInputConfiguration {
    @Bean
    JsonMapperBuilderCustomizer jsonInputTypes() {
        // Keep Boot's mapper/modules. These input policies belong to this JSON contract.
        return builder -> builder
                .withCoercionConfig(String.class, coercion -> coercion
                        .setCoercion(CoercionInputShape.Integer, CoercionAction.Fail)
                        .setCoercion(CoercionInputShape.Float, CoercionAction.Fail)
                        .setCoercion(CoercionInputShape.Boolean, CoercionAction.Fail))
                .addModule(new SimpleModule("exact-dimension-integers")
                        .addDeserializer(Integer.class, new ExactIntegerDeserializer()));
    }

    private static final class ExactIntegerDeserializer extends ValueDeserializer<Integer> {
        @Override
        public Integer deserialize(JsonParser parser, DeserializationContext context) {
            return switch (parser.currentToken()) {
                case VALUE_NUMBER_INT -> parser.getIntValue();
                case VALUE_NUMBER_FLOAT -> {
                    // JSON Schema integer includes 1.0 and 1e0, but never truncates 1.9.
                    try {
                        yield parser.getDecimalValue().intValueExact();
                    } catch (ArithmeticException invalidInteger) {
                        yield context.reportInputMismatch(Integer.class, "Expected an exact 32-bit integer");
                    }
                }
                default -> (Integer) context.handleUnexpectedToken(Integer.class, parser);
            };
        }
    }
}
