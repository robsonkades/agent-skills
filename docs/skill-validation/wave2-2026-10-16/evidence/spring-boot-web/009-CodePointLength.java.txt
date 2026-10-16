package example.web;

import jakarta.validation.Constraint;
import jakarta.validation.ConstraintValidator;
import jakarta.validation.ConstraintValidatorContext;
import jakarta.validation.Payload;
import java.lang.annotation.Retention;
import java.lang.annotation.Target;
import static java.lang.annotation.ElementType.*;
import static java.lang.annotation.RetentionPolicy.RUNTIME;

/** Uses JSON Schema string-length units, rather than Java UTF-16 code units. */
@Target({FIELD, METHOD, PARAMETER, ANNOTATION_TYPE, TYPE_USE, RECORD_COMPONENT})
@Retention(RUNTIME)
@Constraint(validatedBy = CodePointLength.Validator.class)
public @interface CodePointLength {
    String message() default "length must be between {min} and {max} Unicode code points";
    Class<?>[] groups() default {};
    Class<? extends Payload>[] payload() default {};
    int min() default 0;
    int max() default Integer.MAX_VALUE;

    final class Validator implements ConstraintValidator<CodePointLength, String> {
        private int minimum;
        private int maximum;

        @Override
        public void initialize(CodePointLength constraint) {
            minimum = constraint.min();
            maximum = constraint.max();
            if (minimum < 0 || maximum < minimum) {
                throw new IllegalArgumentException("Invalid code point length interval");
            }
        }

        @Override
        public boolean isValid(String value, ConstraintValidatorContext context) {
            if (value == null) return true;
            int length = value.codePointCount(0, value.length());
            return length >= minimum && length <= maximum;
        }
    }
}
