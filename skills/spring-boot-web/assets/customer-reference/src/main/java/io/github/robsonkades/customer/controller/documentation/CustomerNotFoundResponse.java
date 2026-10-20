package io.github.robsonkades.customer.controller.documentation;

import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.ExampleObject;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import org.springframework.http.ProblemDetail;

import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

import static org.springframework.http.MediaType.APPLICATION_PROBLEM_JSON_VALUE;

@Target(ElementType.METHOD)
@Retention(RetentionPolicy.RUNTIME)
@ApiResponse(responseCode = "404",
        description = """
                Cliente não encontrado (`urn:problem:customer-not-found`).
                Nenhum cliente corresponde ao customerId informado.
                """,
        content = @Content(mediaType = APPLICATION_PROBLEM_JSON_VALUE,
                schema = @Schema(implementation = ProblemDetail.class),
                examples = @ExampleObject(name = "customer-not-found", summary = "Cliente inexistente",
                        value = """
                                {
                                  "type": "urn:problem:customer-not-found",
                                  "title": "Cliente não encontrado",
                                  "status": 404,
                                  "detail": "Cliente com ID '8a5b22af-0c3e-4cd1-96a7-0b0edc3d5510' não foi encontrado.",
                                  "instance": "/customers/8a5b22af-0c3e-4cd1-96a7-0b0edc3d5510"
                                }
                                """)))
public @interface CustomerNotFoundResponse {
}
