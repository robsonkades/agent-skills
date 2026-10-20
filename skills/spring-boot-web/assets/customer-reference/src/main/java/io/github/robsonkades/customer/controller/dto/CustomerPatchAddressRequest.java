package io.github.robsonkades.customer.controller.dto;

import io.swagger.v3.oas.annotations.media.Schema;

import static io.swagger.v3.oas.annotations.media.Schema.AdditionalPropertiesValue.FALSE;
import static io.swagger.v3.oas.annotations.media.Schema.RequiredMode.NOT_REQUIRED;
import static io.swagger.v3.oas.annotations.media.Schema.RequiredMode.REQUIRED;

@Schema(
        name = "CustomerPatchAddress",
        description = """
                Endereço completo usado no PATCH.
                Textos obrigatórios não aceitam null, vazio ou somente espaços. Espaços nas extremidades são removidos.
                Sem limites máximos de tamanho para os textos, exceto as regras de estado e CEP após normalização.
                """,
        minProperties = 6,
        maxProperties = 7,
        additionalProperties = FALSE
)
public record CustomerPatchAddressRequest(
        @Schema(
                description = "Logradouro obrigatório.",
                minLength = 1,
                requiredMode = REQUIRED,
                example = "Rua das Flores"
        )
        String street,

        @Schema(
                description = "Número obrigatório como texto; aceita letras e S/N.",
                minLength = 1,
                requiredMode = REQUIRED,
                example = "123"
        )
        String number,

        @Schema(
                description = "Complemento opcional. Omissão, null, vazio ou somente espaços removem o valor anterior.",
                types = {"string", "null"},
                requiredMode = NOT_REQUIRED,
                example = "Apto 42"
        )
        String complement,

        @Schema(
                description = "Bairro obrigatório.",
                minLength = 1,
                requiredMode = REQUIRED,
                example = "Centro"
        )
        String neighborhood,

        @Schema(
                description = "Cidade obrigatória.",
                minLength = 1,
                requiredMode = REQUIRED,
                example = "São Paulo"
        )
        String city,

        @Schema(
                description = """
                        Estado obrigatório. Após remover espaços nas extremidades e converter para maiúsculas,
                        deve ter dois caracteres. PATCH não restringe esses caracteres a letras ou a um catálogo de UFs.
                        """,
                minLength = 1,
                requiredMode = REQUIRED,
                example = "SP"
        )
        String state,

        @Schema(
                description = """
                        CEP obrigatório. Após remover espaços nas extremidades, deve ter oito dígitos
                        com hífen opcional após o quinto dígito.
                        """,
                minLength = 8,
                requiredMode = REQUIRED,
                example = "01001-000"
        )
        String postalCode
) {
}
