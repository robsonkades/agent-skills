package io.github.robsonkades.customer.controller.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import com.fasterxml.jackson.annotation.JsonSubTypes;
import com.fasterxml.jackson.annotation.JsonTypeInfo;
import io.github.robsonkades.customer.application.CustomerCriterion;
import io.swagger.v3.oas.annotations.media.DiscriminatorMapping;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.media.SchemaProperty;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

import java.time.LocalDate;

import static io.swagger.v3.oas.annotations.media.Schema.RequiredMode.NOT_REQUIRED;
import static io.swagger.v3.oas.annotations.media.Schema.RequiredMode.REQUIRED;

@JsonTypeInfo(
        use = JsonTypeInfo.Id.NAME,
        include = JsonTypeInfo.As.PROPERTY,
        property = "_discriminator"
)
@JsonSubTypes({
        @JsonSubTypes.Type(value = CustomerFilterRequest.Cpf.class, name = "cpf"),
        @JsonSubTypes.Type(value = CustomerFilterRequest.Email.class, name = "email"),
        @JsonSubTypes.Type(value = CustomerFilterRequest.Name.class, name = "name"),
        @JsonSubTypes.Type(value = CustomerFilterRequest.Phone.class, name = "phone"),
        @JsonSubTypes.Type(value = CustomerFilterRequest.City.class, name = "address.city"),
        @JsonSubTypes.Type(value = CustomerFilterRequest.State.class, name = "address.state"),
        @JsonSubTypes.Type(value = CustomerFilterRequest.PostalCode.class, name = "address.postalCode"),
        @JsonSubTypes.Type(value = CustomerFilterRequest.BirthDateRange.class, name = "birthDateRange")
})
@Schema(
        name = "CustomerFilter",
        description = """
                Critério polimórfico identificado por _discriminator.
                Cada tipo define o campo pesquisado; filtros textuais usam exact por padrão ou contains para busca parcial.
                Os valores textuais são comparados sem espaços nas extremidades e sem diferenciar maiúsculas/minúsculas.
                """,
        discriminatorProperty = "_discriminator",
        discriminatorMapping = {
                @DiscriminatorMapping(value = "cpf", schema = CustomerFilterRequest.Cpf.class),
                @DiscriminatorMapping(value = "email", schema = CustomerFilterRequest.Email.class),
                @DiscriminatorMapping(value = "name", schema = CustomerFilterRequest.Name.class),
                @DiscriminatorMapping(value = "phone", schema = CustomerFilterRequest.Phone.class),
                @DiscriminatorMapping(value = "address.city", schema = CustomerFilterRequest.City.class),
                @DiscriminatorMapping(value = "address.state", schema = CustomerFilterRequest.State.class),
                @DiscriminatorMapping(value = "address.postalCode", schema = CustomerFilterRequest.PostalCode.class),
                @DiscriminatorMapping(value = "birthDateRange", schema = CustomerFilterRequest.BirthDateRange.class)
        }
)
@SchemaProperty(
        name = "_discriminator",
        schema = @Schema(
                description = "Tipo obrigatório do filtro; determina as propriedades e regras aplicáveis.",
                type = "string",
                requiredMode = REQUIRED,
                allowableValues = {
                        "cpf", "email", "name", "phone",
                        "address.city", "address.state", "address.postalCode", "birthDateRange"
                }
        )
)
public sealed interface CustomerFilterRequest
        permits CustomerFilterRequest.Cpf, CustomerFilterRequest.Email, CustomerFilterRequest.Name,
        CustomerFilterRequest.Phone, CustomerFilterRequest.City, CustomerFilterRequest.State,
        CustomerFilterRequest.PostalCode, CustomerFilterRequest.BirthDateRange {

    private static CustomerCriterion textCriterion(String field, String value, TextOperator operator) {
        return switch (operator == null ? TextOperator.EXACT : operator) {
            case CONTAINS -> new CustomerCriterion.Contains(field, value);
            case EXACT -> new CustomerCriterion.Exact(field, value);
        };
    }

    CustomerCriterion toDomain();

    @Schema(
            description = """
                    Comparação textual sem diferenciar maiúsculas e minúsculas:
                    exact compara o valor completo (padrão); contains busca trechos.
                    """
    )
    enum TextOperator {
        @JsonProperty("contains")
        CONTAINS,

        @JsonProperty("exact")
        EXACT
    }

    @Schema(
            name = "CpfFilter",
            description = "Filtro por CPF, informado somente com números.",
            requiredProperties = "_discriminator"
    )
    @SchemaProperty(
            name = "_discriminator",
            schema = @Schema(
                    description = "Identificador obrigatório e exato do tipo de filtro.",
                    type = "string",
                    requiredMode = REQUIRED,
                    allowableValues = "cpf"
            )
    )
    record Cpf(
            @Schema(
                    description = """
                            CPF completo ou trecho, conforme operator.
                            Use somente os dígitos armazenados; pontuação não é removida da busca.
                            Obrigatório, não vazio nem composto apenas por espaços.
                            """,
                    minLength = 1,
                    maxLength = 254,
                    requiredMode = REQUIRED,
                    example = "52998224725"
            )
            @NotBlank
            @Size(max = 254)
            String value,

            @Schema(
                    description = """
                            Comparação: exact para valor completo, contains para trecho.
                            Omissão ou null usam exact.
                            """,
                    types = {"string", "null"},
                    requiredMode = NOT_REQUIRED,
                    defaultValue = "exact",
                    example = "exact"
            )
            TextOperator operator
    ) implements CustomerFilterRequest {

        @Override
        public CustomerCriterion toDomain() {
            return textCriterion("cpf", value, operator);
        }
    }

    @Schema(
            name = "EmailFilter",
            description = "Filtro por e-mail sem diferenciar maiúsculas e minúsculas.",
            requiredProperties = "_discriminator"
    )
    @SchemaProperty(
            name = "_discriminator",
            schema = @Schema(
                    description = "Identificador obrigatório e exato do tipo de filtro.",
                    type = "string",
                    requiredMode = REQUIRED,
                    allowableValues = "email"
            )
    )
    record Email(
            @Schema(
                    description = """
                            E-mail completo ou trecho, conforme operator.
                            Não exige formato de e-mail para permitir busca parcial.
                            Obrigatório, não vazio nem composto apenas por espaços.
                            """,
                    minLength = 1,
                    maxLength = 254,
                    requiredMode = REQUIRED,
                    example = "ana@example.com"
            )
            @NotBlank
            @Size(max = 254)
            String value,

            @Schema(
                    description = """
                            Comparação: exact para valor completo, contains para trecho.
                            Omissão ou null usam exact.
                            """,
                    types = {"string", "null"},
                    requiredMode = NOT_REQUIRED,
                    defaultValue = "exact",
                    example = "exact"
            )
            TextOperator operator
    ) implements CustomerFilterRequest {

        @Override
        public CustomerCriterion toDomain() {
            return textCriterion("email", value, operator);
        }
    }

    @Schema(
            name = "NameFilter",
            description = "Filtro por nome sem diferenciar maiúsculas e minúsculas.",
            requiredProperties = "_discriminator"
    )
    @SchemaProperty(
            name = "_discriminator",
            schema = @Schema(
                    description = "Identificador obrigatório e exato do tipo de filtro.",
                    type = "string",
                    requiredMode = REQUIRED,
                    allowableValues = "name"
            )
    )
    record Name(
            @Schema(
                    description = """
                            Nome completo ou trecho, conforme operator.
                            Obrigatório, não vazio nem composto apenas por espaços.
                            """,
                    minLength = 1,
                    maxLength = 254,
                    requiredMode = REQUIRED,
                    example = "Ana Silva"
            )
            @NotBlank
            @Size(max = 254)
            String value,

            @Schema(
                    description = """
                            Comparação: exact para valor completo, contains para trecho.
                            Omissão ou null usam exact.
                            """,
                    types = {"string", "null"},
                    requiredMode = NOT_REQUIRED,
                    defaultValue = "exact",
                    example = "exact"
            )
            TextOperator operator
    ) implements CustomerFilterRequest {

        @Override
        public CustomerCriterion toDomain() {
            return textCriterion("name", value, operator);
        }
    }

    @Schema(
            name = "PhoneFilter",
            description = "Filtro por telefone.",
            requiredProperties = "_discriminator"
    )
    @SchemaProperty(
            name = "_discriminator",
            schema = @Schema(
                    description = "Identificador obrigatório e exato do tipo de filtro.",
                    type = "string",
                    requiredMode = REQUIRED,
                    allowableValues = "phone"
            )
    )
    record Phone(
            @Schema(
                    description = """
                            Telefone completo ou trecho, conforme operator. Não exige formato telefônico específico.
                            Obrigatório, não vazio nem composto apenas por espaços.
                            """,
                    minLength = 1,
                    maxLength = 254,
                    requiredMode = REQUIRED,
                    example = "+5511999999999"
            )
            @NotBlank
            @Size(max = 254)
            String value,

            @Schema(
                    description = """
                            Comparação: exact para valor completo, contains para trecho.
                            Omissão ou null usam exact.
                            """,
                    types = {"string", "null"},
                    requiredMode = NOT_REQUIRED,
                    defaultValue = "exact",
                    example = "exact"
            )
            TextOperator operator
    ) implements CustomerFilterRequest {

        @Override
        public CustomerCriterion toDomain() {
            return textCriterion("phone", value, operator);
        }
    }

    @Schema(
            name = "CityFilter",
            description = "Filtro por cidade sem diferenciar maiúsculas e minúsculas.",
            requiredProperties = "_discriminator"
    )
    @SchemaProperty(
            name = "_discriminator",
            schema = @Schema(
                    description = "Identificador obrigatório e exato do tipo de filtro.",
                    type = "string",
                    requiredMode = REQUIRED,
                    allowableValues = "address.city"
            )
    )
    record City(
            @Schema(
                    description = """
                            Cidade completa ou trecho, conforme operator.
                            Obrigatório, não vazio nem composto apenas por espaços.
                            """,
                    minLength = 1,
                    maxLength = 254,
                    requiredMode = REQUIRED,
                    example = "São Paulo"
            )
            @NotBlank
            @Size(max = 254)
            String value,

            @Schema(
                    description = """
                            Comparação: exact para valor completo, contains para trecho.
                            Omissão ou null usam exact.
                            """,
                    types = {"string", "null"},
                    requiredMode = NOT_REQUIRED,
                    defaultValue = "exact",
                    example = "exact"
            )
            TextOperator operator
    ) implements CustomerFilterRequest {

        @Override
        public CustomerCriterion toDomain() {
            return textCriterion("address.city", value, operator);
        }
    }

    @Schema(
            name = "StateFilter",
            description = "Filtro por estado sem diferenciar maiúsculas e minúsculas.",
            requiredProperties = "_discriminator"
    )
    @SchemaProperty(
            name = "_discriminator",
            schema = @Schema(
                    description = "Identificador obrigatório e exato do tipo de filtro.",
                    type = "string",
                    requiredMode = REQUIRED,
                    allowableValues = "address.state"
            )
    )
    record State(
            @Schema(
                    description = """
                            Estado completo ou trecho, conforme operator.
                            Não exige duas letras para permitir busca parcial.
                            Obrigatório, não vazio nem composto apenas por espaços.
                            """,
                    minLength = 1,
                    maxLength = 254,
                    requiredMode = REQUIRED,
                    example = "SP"
            )
            @NotBlank
            @Size(max = 254)
            String value,

            @Schema(
                    description = """
                            Comparação: exact para valor completo, contains para trecho.
                            Omissão ou null usam exact.
                            """,
                    types = {"string", "null"},
                    requiredMode = NOT_REQUIRED,
                    defaultValue = "exact",
                    example = "exact"
            )
            TextOperator operator
    ) implements CustomerFilterRequest {

        @Override
        public CustomerCriterion toDomain() {
            return textCriterion("address.state", value, operator);
        }
    }

    @Schema(
            name = "PostalCodeFilter",
            description = "Filtro por CEP.",
            requiredProperties = "_discriminator"
    )
    @SchemaProperty(
            name = "_discriminator",
            schema = @Schema(
                    description = "Identificador obrigatório e exato do tipo de filtro.",
                    type = "string",
                    requiredMode = REQUIRED,
                    allowableValues = "address.postalCode"
            )
    )
    record PostalCode(
            @Schema(
                    description = """
                            CEP completo ou trecho, conforme operator. O hífen deve corresponder ao valor armazenado.
                            Obrigatório, não vazio nem composto apenas por espaços.
                            """,
                    minLength = 1,
                    maxLength = 254,
                    requiredMode = REQUIRED,
                    example = "01001-000"
            )
            @NotBlank
            @Size(max = 254)
            String value,

            @Schema(
                    description = """
                            Comparação: exact para valor completo, contains para trecho.
                            Omissão ou null usam exact.
                            """,
                    types = {"string", "null"},
                    requiredMode = NOT_REQUIRED,
                    defaultValue = "exact",
                    example = "exact"
            )
            TextOperator operator
    ) implements CustomerFilterRequest {

        @Override
        public CustomerCriterion toDomain() {
            return textCriterion("address.postalCode", value, operator);
        }
    }

    @Schema(
            name = "BirthDateRangeFilter",
            description = """
                    Intervalo inclusivo de data de nascimento.
                    Informe from e/ou to; from não pode ser posterior a to.
                    """,
            requiredProperties = "_discriminator"
    )
    @SchemaProperty(
            name = "_discriminator",
            schema = @Schema(
                    description = "Identificador obrigatório e exato do tipo de filtro.",
                    type = "string",
                    requiredMode = REQUIRED,
                    allowableValues = "birthDateRange"
            )
    )
    record BirthDateRange(
            @Schema(
                    description = """
                            Início inclusivo, em AAAA-MM-DD. Opcional ou null se to tiver valor.
                            Quando ambos existem, from deve ser anterior ou igual a to.
                            """,
                    types = {"string", "null"},
                    format = "date",
                    requiredMode = NOT_REQUIRED,
                    example = "1980-01-01"
            )
            LocalDate from,

            @Schema(
                    description = """
                            Fim inclusivo, em AAAA-MM-DD. Opcional ou null se from tiver valor.
                            Não há restrição em relação à data atual para limites de busca.
                            """,
                    types = {"string", "null"},
                    format = "date",
                    requiredMode = NOT_REQUIRED,
                    example = "2000-12-31"
            )
            LocalDate to
    ) implements CustomerFilterRequest {

        @Override
        public CustomerCriterion toDomain() {
            return new CustomerCriterion.BirthDateRange(from, to);
        }
    }
}
