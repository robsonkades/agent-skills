package io.github.robsonkades.customer.controller.dto;

import io.github.robsonkades.customer.application.CustomerSort;
import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotBlank;

import static io.swagger.v3.oas.annotations.media.Schema.RequiredMode.NOT_REQUIRED;
import static io.swagger.v3.oas.annotations.media.Schema.RequiredMode.REQUIRED;

@Schema(
        name = "CustomerSortOrder",
        description = """
                Ordenação por campo permitido.
                Comparações de textos ignoram maiúsculas/minúsculas; city corresponde a address.city.
                """
)
public record CustomerSortOrderRequest(
        @Schema(
                description = "Campo obrigatório, com nome exato e sem espaços nas extremidades.",
                minLength = 4,
                maxLength = 9,
                requiredMode = REQUIRED,
                allowableValues = {"name", "email", "birthDate", "city"},
                example = "name"
        )
        @NotBlank
        String field,

        @Schema(
                description = "Sentido da ordenação. Omissão ou null usam ASC; valores diferenciam maiúsculas/minúsculas.",
                types = {"string", "null"},
                requiredMode = NOT_REQUIRED,
                defaultValue = "ASC",
                allowableValues = {"ASC", "DESC"},
                example = "ASC"
        )
        CustomerSort.Direction direction
) {

    CustomerSort toDomain() {
        return new CustomerSort(field, direction == null ? CustomerSort.Direction.ASC : direction);
    }
}
