package io.github.robsonkades.customer.controller.documentation;

import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.parameters.RequestBody;
import org.springframework.core.annotation.AliasFor;

import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

@Target(ElementType.METHOD)
@Retention(RetentionPolicy.RUNTIME)
@RequestBody
public @interface ApiRequestBody {

    @AliasFor(annotation = RequestBody.class, attribute = "description")
    String description() default "";

    @AliasFor(annotation = RequestBody.class, attribute = "required")
    boolean required() default false;

    @AliasFor(annotation = RequestBody.class, attribute = "content")
    Content[] content() default {};
}
