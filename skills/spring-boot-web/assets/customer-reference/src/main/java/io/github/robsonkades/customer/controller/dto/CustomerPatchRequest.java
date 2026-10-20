package io.github.robsonkades.customer.controller.dto;

import io.swagger.v3.oas.annotations.media.Schema;

import java.time.LocalDate;

import static io.swagger.v3.oas.annotations.media.Schema.AdditionalPropertiesValue.FALSE;
import static io.swagger.v3.oas.annotations.media.Schema.RequiredMode.NOT_REQUIRED;

@Schema(
        name = "CustomerPatchRequest",
        description = """
                Atualização parcial: envie ao menos um dos seis campos permitidos.
                Campos omitidos ficam inalterados. Nenhum campo da raiz aceita null; textos não podem ser vazios ou só espaços.
                Propriedades desconhecidas são rejeitadas. PATCH não aplica os limites de tamanho de POST/PUT.
                """,
        minProperties = 1,
        maxProperties = 6,
        additionalProperties = FALSE
)
public record CustomerPatchRequest(
        @Schema(
                description = "Novo nome, sem limite máximo de tamanho. Espaços nas extremidades são removidos.",
                minLength = 1,
                requiredMode = NOT_REQUIRED,
                example = "Ana Silva"
        )
        String name,

        @Schema(
                description = """
                        Novo e-mail; após remover espaços nas extremidades, deve conter usuário, domínio e extensão
                        e não conter espaços. Sem limite máximo de tamanho.
                        """,
                format = "email",
                minLength = 5,
                requiredMode = NOT_REQUIRED,
                example = "ana@example.com"
        )
        String email,

        @Schema(
                description = """
                        Novo telefone em texto livre, sem limite máximo ou formato fixo.
                        Espaços nas extremidades são removidos.
                        """,
                minLength = 1,
                requiredMode = NOT_REQUIRED,
                example = "+5511888888888"
        )
        String phone,

        @Schema(
                description = """
                        Novo CPF. Caracteres não numéricos são removidos; devem restar 11 dígitos com
                        verificadores válidos, sem repetir um único dígito 11 vezes. Sem limite máximo do texto de entrada.
                        """,
                minLength = 11,
                requiredMode = NOT_REQUIRED,
                example = "529.982.247-25"
        )
        String cpf,

        @Schema(
                description = """
                        Nova data de nascimento em AAAA-MM-DD, anterior ou igual à data atual do servidor.
                        Ao contrário de POST/PUT, PATCH aceita a data de hoje.
                        """,
                type = "string",
                format = "date",
                requiredMode = NOT_REQUIRED,
                example = "1990-05-20"
        )
        LocalDate birthDate,

        @Schema(
                description = """
                        Substitui o endereço inteiro. Envie todos os campos obrigatórios;
                        omitir complement, enviar null ou texto em branco remove o complemento anterior.
                        """,
                requiredMode = NOT_REQUIRED
        )
        CustomerPatchAddressRequest address
) {
}
