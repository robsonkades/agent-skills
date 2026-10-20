package io.github.robsonkades.customer.controller.dto;

import io.github.robsonkades.customer.domain.Customer;
import io.swagger.v3.oas.annotations.media.Schema;

import java.time.LocalDate;
import java.util.UUID;

import static io.swagger.v3.oas.annotations.media.Schema.AccessMode.READ_ONLY;
import static io.swagger.v3.oas.annotations.media.Schema.RequiredMode.REQUIRED;

@Schema(
        name = "Customer",
        description = """
                Representação pública de um cliente. Todos os campos são retornados.
                Os limites de tamanho de POST/PUT não limitam a resposta, pois PATCH aceita textos maiores.
                """
)
public record CustomerResponse(
        @Schema(
                description = "Identificador UUID gerado pela API.",
                type = "string",
                format = "uuid",
                minLength = 36,
                maxLength = 36,
                requiredMode = REQUIRED,
                accessMode = READ_ONLY,
                example = "8a5b22af-0c3e-4cd1-96a7-0b0edc3d5510"
        )
        UUID id,

        @Schema(
                description = "Nome sem espaços nas extremidades; nunca vazio. Sem máximo global de tamanho.",
                minLength = 1,
                requiredMode = REQUIRED,
                example = "Ana Silva"
        )
        String name,

        @Schema(
                description = "E-mail sem espaços nas extremidades. Sem máximo global de tamanho.",
                format = "email",
                minLength = 5,
                pattern = "^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$",
                requiredMode = REQUIRED,
                example = "ana@example.com"
        )
        String email,

        @Schema(
                description = """
                        Telefone sem espaços nas extremidades; nunca vazio.
                        Sem máximo global de tamanho ou formato fixo.
                        """,
                minLength = 1,
                requiredMode = REQUIRED,
                example = "+5511999999999"
        )
        String phone,

        @Schema(
                description = "CPF válido normalizado, somente números.",
                minLength = 11,
                maxLength = 11,
                pattern = "^[0-9]{11}$",
                requiredMode = REQUIRED,
                example = "52998224725"
        )
        String cpf,

        @Schema(
                description = "Data de nascimento, nunca posterior à data atual do servidor.",
                type = "string",
                format = "date",
                requiredMode = REQUIRED,
                example = "1990-05-20"
        )
        LocalDate birthDate,

        @Schema(
                description = "Endereço completo do cliente.",
                requiredMode = REQUIRED
        )
        CustomerAddressResponse address
) {

    public static CustomerResponse from(final Customer customer) {
        return new CustomerResponse(
                customer.id(),
                customer.name(),
                customer.email(),
                customer.phone(),
                customer.cpf(),
                customer.birthDate(),
                CustomerAddressResponse.from(customer.address())
        );
    }
}
