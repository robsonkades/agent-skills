package io.github.robsonkades.customer.controller.dto;

import io.github.robsonkades.customer.application.CustomerPage;
import io.swagger.v3.oas.annotations.media.ArraySchema;
import io.swagger.v3.oas.annotations.media.Schema;

import java.util.List;

import static io.swagger.v3.oas.annotations.media.Schema.RequiredMode.REQUIRED;

@Schema(
        name = "CustomerPage",
        description = "Página de clientes e metadados para navegar pela listagem."
)
public record CustomerPageResponse(
        @ArraySchema(
                arraySchema = @Schema(
                        description = """
                                Clientes da página, na ordem solicitada.
                                Pode ser vazio; nunca contém mais elementos do que size.
                                """,
                        requiredMode = REQUIRED
                ),
                minItems = 0,
                maxItems = 100,
                schema = @Schema(implementation = CustomerResponse.class)
        )
        List<CustomerResponse> content,

        @Schema(
                description = "Índice solicitado, baseado em zero. Uma página além do final retorna content vazio.",
                format = "int32",
                minimum = "0",
                requiredMode = REQUIRED,
                example = "0"
        )
        int page,

        @Schema(
                description = "Tamanho solicitado da página.",
                format = "int32",
                minimum = "1",
                maximum = "100",
                requiredMode = REQUIRED,
                example = "20"
        )
        int size,

        @Schema(
                description = "Total de clientes que atendem aos filtros, antes da paginação.",
                format = "int64",
                minimum = "0",
                requiredMode = REQUIRED,
                example = "42"
        )
        long totalElements,

        @Schema(
                description = """
                        Total de páginas: totalElements dividido por size, arredondado para cima.
                        Zero quando não há resultados.
                        """,
                format = "int32",
                minimum = "0",
                requiredMode = REQUIRED,
                example = "3"
        )
        int totalPages
) {

    public static CustomerPageResponse from(CustomerPage page) {
        return new CustomerPageResponse(
                page.content().stream().map(CustomerResponse::from).toList(),
                page.page(),
                page.size(),
                page.totalElements(),
                page.totalPages()
        );
    }
}
