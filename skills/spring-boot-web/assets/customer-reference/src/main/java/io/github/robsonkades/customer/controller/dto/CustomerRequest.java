package io.github.robsonkades.customer.controller.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Past;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

import java.time.LocalDate;

import static io.swagger.v3.oas.annotations.media.Schema.RequiredMode.REQUIRED;

@Schema(
        name = "CustomerRequest",
        description = "Dados necessários para criar ou substituir um cliente."
)
public record CustomerRequest(
        @Schema(
                description = """
                        Nome obrigatório, não vazio nem composto apenas por espaços.
                        Espaços nas extremidades são removidos.
                        """,
                minLength = 1,
                maxLength = 100,
                requiredMode = REQUIRED,
                example = "Ana Silva"
        )
        @NotBlank(message = "O nome é obrigatório.")
        @Size(
                max = 100,
                message = "O nome deve ter até 100 caracteres."
        )
        String name,

        @Schema(
                description = "E-mail obrigatório, sem espaços, com usuário, domínio e extensão.",
                format = "email",
                minLength = 5,
                maxLength = 254,
                requiredMode = REQUIRED,
                pattern = "^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$",
                example = "ana@example.com"
        )
        @NotBlank(message = "O e-mail é obrigatório.")
        @Pattern(
                regexp = "^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$",
                message = "O e-mail deve ter formato válido."
        )
        @Size(
                max = 254,
                message = "O e-mail deve ter até 254 caracteres."
        )
        String email,

        @Schema(
                description = """
                        Telefone obrigatório, não vazio nem composto apenas por espaços.
                        Texto livre; não há validação de DDI, DDD ou formato E.164.
                        Espaços nas extremidades são removidos.
                        """,
                minLength = 1,
                maxLength = 50,
                requiredMode = REQUIRED,
                example = "+5511999999999"
        )
        @NotBlank(message = "O telefone é obrigatório.")
        @Size(
                max = 50,
                message = "O telefone deve ter até 50 caracteres."
        )
        String phone,

        @Schema(
                description = """
                        CPF obrigatório, com ou sem pontuação. Aceita dígitos, ponto, hífen e barra,
                        com 11 a 14 caracteres. Após remover a pontuação, deve conter 11 dígitos,
                        dígitos verificadores válidos e não pode repetir o mesmo dígito 11 vezes.
                        É armazenado somente com números.
                        """,
                minLength = 11,
                maxLength = 14,
                pattern = "^[0-9.\\-/]{11,14}$",
                requiredMode = REQUIRED,
                example = "529.982.247-25"
        )
        @NotBlank
        @Pattern(
                regexp = "[0-9.\\-/]{11,14}",
                message = "Informe um CPF válido."
        )
        String cpf,

        @Schema(
                description = """
                        Data obrigatória no formato AAAA-MM-DD, estritamente anterior à data atual do servidor.
                        A data de hoje e datas futuras são rejeitadas.
                        """,
                type = "string",
                format = "date",
                requiredMode = REQUIRED,
                example = "1990-05-20"
        )
        @NotNull
        @Past
        LocalDate birthDate,

        @Schema(
                description = "Endereço obrigatório e completo. Apenas complement é opcional.",
                requiredMode = REQUIRED
        )
        @NotNull
        @Valid
        CustomerAddressRequest address
) {
}
