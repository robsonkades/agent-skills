package io.github.robsonkades.customer.controller.dto;

import io.github.robsonkades.customer.application.CustomerSearch;
import io.swagger.v3.oas.annotations.media.ArraySchema;
import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.util.List;

import static io.swagger.v3.oas.annotations.media.Schema.RequiredMode.NOT_REQUIRED;

@Schema(
        name = "CustomerSearchRequest",
        description = """
                Busca paginada; todas as propriedades são opcionais.
                O corpo {} lista todos os clientes, na página 0, com tamanho 20,
                ordenados por nome crescente e UUID para desempate.
                """
)
public record CustomerSearchRequest(
        @ArraySchema(
                arraySchema = @Schema(
                        description = """
                                Até 20 critérios combinados com AND.
                                Omissão, null ou lista vazia não aplicam filtros. Elementos null são rejeitados.
                                """,
                        types = {"array", "null"},
                        requiredMode = NOT_REQUIRED
                ),
                minItems = 0,
                maxItems = 20
        )
        @Size(max = 20)
        List<@NotNull @Valid CustomerFilterRequest> filters,

        @Schema(
                description = """
                        Página baseada em zero. Omissão ou null usam 0;
                        páginas além do total retornam content vazio.
                        """,
                types = {"integer", "null"},
                format = "int32",
                minimum = "0",
                requiredMode = NOT_REQUIRED,
                defaultValue = "0",
                example = "0"
        )
        @Min(0)
        Integer page,

        @Schema(
                description = "Resultados por página, de 1 a 100. Omissão ou null usam 20.",
                types = {"integer", "null"},
                format = "int32",
                minimum = "1",
                maximum = "100",
                requiredMode = NOT_REQUIRED,
                defaultValue = "20",
                example = "20"
        )
        @Min(1)
        @Max(100)
        Integer size,

        @ArraySchema(
                arraySchema = @Schema(
                        description = """
                                Até 3 critérios, em ordem de prioridade.
                                Omissão, null ou lista vazia ordenam por name ASC. UUID crescente sempre desempata.
                                Elementos null são rejeitados.
                                """,
                        types = {"array", "null"},
                        requiredMode = NOT_REQUIRED
                ),
                minItems = 0,
                maxItems = 3,
                schema = @Schema(implementation = CustomerSortOrderRequest.class)
        )
        @Size(max = 3)
        List<@NotNull @Valid CustomerSortOrderRequest> sort
) {

    public CustomerSearchRequest {
        if (page == null) {
            page = 0;
        }
        if (size == null) {
            size = 20;
        }
        if (filters != null) {
            filters = List.copyOf(filters);
        }
        if (sort != null) {
            sort = List.copyOf(sort);
        }
    }

    public CustomerSearch toQuery() {
        return new CustomerSearch(
                filters == null ? List.of() : filters.stream().map(CustomerFilterRequest::toDomain).toList(),
                sort == null ? List.of() : sort.stream().map(CustomerSortOrderRequest::toDomain).toList(),
                page,
                size
        );
    }
}
