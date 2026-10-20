package io.github.robsonkades.customer.controller.dto;

import io.github.robsonkades.customer.domain.CustomerAddress;
import io.swagger.v3.oas.annotations.media.Schema;

import static io.swagger.v3.oas.annotations.media.Schema.RequiredMode.REQUIRED;

@Schema(
        name = "CustomerAddress",
        description = """
                Endereço retornado pela API, com espaços nas extremidades removidos.
                Todos os campos são retornados; complement pode ser null.
                Os textos não têm máximo global de tamanho, pois PATCH não aplica os limites de POST/PUT.
                """
)
public record CustomerAddressResponse(
        @Schema(
                description = "Logradouro não vazio.",
                minLength = 1,
                requiredMode = REQUIRED,
                example = "Rua das Flores"
        )
        String street,

        @Schema(
                description = "Número como texto, não vazio.",
                minLength = 1,
                requiredMode = REQUIRED,
                example = "123"
        )
        String number,

        @Schema(
                description = "Complemento ou null quando não informado, vazio ou composto apenas por espaços.",
                types = {"string", "null"},
                minLength = 1,
                requiredMode = REQUIRED,
                example = "Apto 42"
        )
        String complement,

        @Schema(
                description = "Bairro não vazio.",
                minLength = 1,
                requiredMode = REQUIRED,
                example = "Centro"
        )
        String neighborhood,

        @Schema(
                description = "Cidade não vazia.",
                minLength = 1,
                requiredMode = REQUIRED,
                example = "São Paulo"
        )
        String city,

        @Schema(
                description = "Estado convertido para maiúsculas, com dois caracteres.",
                minLength = 2,
                maxLength = 2,
                requiredMode = REQUIRED,
                example = "SP"
        )
        String state,

        @Schema(
                description = "CEP com oito dígitos, preservando o hífen opcional.",
                minLength = 8,
                maxLength = 9,
                pattern = "^\\d{5}-?\\d{3}$",
                requiredMode = REQUIRED,
                example = "01001-000"
        )
        String postalCode
) {

    public static CustomerAddressResponse from(CustomerAddress address) {
        return new CustomerAddressResponse(
                address.street(),
                address.number(),
                address.complement(),
                address.neighborhood(),
                address.city(),
                address.state(),
                address.postalCode()
        );
    }
}
