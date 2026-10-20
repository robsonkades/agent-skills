package io.github.robsonkades.customer.controller.dto;

import io.github.robsonkades.customer.domain.CustomerAddress;
import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

import static io.swagger.v3.oas.annotations.media.Schema.RequiredMode.NOT_REQUIRED;
import static io.swagger.v3.oas.annotations.media.Schema.RequiredMode.REQUIRED;

@Schema(
        name = "CustomerAddressRequest",
        description = """
                Endereço completo para criação ou substituição.
                Campos obrigatórios não aceitam null, texto vazio ou somente espaços.
                Espaços nas extremidades são removidos.
                """
)
public record CustomerAddressRequest(
        @Schema(
                description = "Logradouro obrigatório.",
                minLength = 1,
                maxLength = 150,
                requiredMode = REQUIRED,
                example = "Rua das Flores"
        )
        @NotBlank
        @Size(max = 150)
        String street,

        @Schema(
                description = "Número obrigatório como texto; aceita letras e valores como S/N.",
                minLength = 1,
                maxLength = 20,
                requiredMode = REQUIRED,
                example = "123"
        )
        @NotBlank
        @Size(max = 20)
        String number,

        @Schema(
                description = "Complemento opcional. Omissão, null, texto vazio ou somente espaços resultam em null.",
                types = {"string", "null"},
                maxLength = 100,
                requiredMode = NOT_REQUIRED,
                example = "Apto 42"
        )
        @Size(max = 100)
        String complement,

        @Schema(
                description = "Bairro obrigatório.",
                minLength = 1,
                maxLength = 100,
                requiredMode = REQUIRED,
                example = "Centro"
        )
        @NotBlank
        @Size(max = 100)
        String neighborhood,

        @Schema(
                description = "Cidade obrigatória.",
                minLength = 1,
                maxLength = 100,
                requiredMode = REQUIRED,
                example = "São Paulo"
        )
        @NotBlank
        @Size(max = 100)
        String city,

        @Schema(
                description = """
                        Duas letras, maiúsculas ou minúsculas, convertidas para maiúsculas.
                        Não há consulta a um catálogo de UFs.
                        """,
                minLength = 2,
                maxLength = 2,
                pattern = "^[A-Za-z]{2}$",
                requiredMode = REQUIRED,
                example = "SP"
        )
        @NotBlank
        @Pattern(regexp = "[A-Za-z]{2}")
        String state,

        @Schema(
                description = """
                        CEP obrigatório: oito dígitos, com hífen opcional após o quinto dígito.
                        A presença ou ausência do hífen é preservada.
                        """,
                minLength = 8,
                maxLength = 9,
                pattern = "^\\d{5}-?\\d{3}$",
                requiredMode = REQUIRED,
                example = "01001-000"
        )
        @NotBlank
        @Pattern(regexp = "\\d{5}-?\\d{3}")
        String postalCode
) {

    public CustomerAddress toDomain() {
        return new CustomerAddress(
                street,
                number,
                complement,
                neighborhood,
                city,
                state,
                postalCode
        );
    }
}
