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
@ApiResponse(responseCode = "400",
        description = """
                Dados de cliente inválidos (`urn:problem:invalid-customer`).
                Verifique as regras dos dados, filtros ou patch descritas nesta operação.
                """,
        content = @Content(mediaType = APPLICATION_PROBLEM_JSON_VALUE,
                schema = @Schema(implementation = ProblemDetail.class),
                examples = @ExampleObject(name = "invalid-customer", summary = "Regra de Customer não atendida",
                        value = """
                                {
                                  "type": "urn:problem:invalid-customer",
                                  "title": "Dados de cliente inválidos",
                                  "status": 400,
                                  "detail": "Informe um CPF válido.",
                                  "instance": "/customers"
                                }
                                """)))
public @interface InvalidCustomerResponse {
}
