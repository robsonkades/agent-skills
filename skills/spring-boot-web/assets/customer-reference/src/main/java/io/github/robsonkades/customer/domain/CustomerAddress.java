package io.github.robsonkades.customer.domain;

import java.util.Objects;
import java.util.Locale;

public record CustomerAddress(
        String street,
        String number,
        String complement,
        String neighborhood,
        String city,
        String state,
        String postalCode) {

    public CustomerAddress {
        street = required(street, "rua");
        number = required(number, "número");
        complement = optional(complement);
        neighborhood = required(neighborhood, "bairro");
        city = required(city, "cidade");
        state = required(state, "estado").toUpperCase(Locale.ROOT);
        postalCode = required(postalCode, "CEP");
        if (state.length() != 2) {
            throw new InvalidCustomerException("O estado deve ser informado pela sigla de duas letras.");
        }
        if (!postalCode.matches("\\d{5}-?\\d{3}")) {
            throw new InvalidCustomerException("Informe um CEP válido.");
        }
    }

    private static String required(String value, String field) {
        if (value == null || value.isBlank()) {
            throw new InvalidCustomerException("O campo '" + field + "' é obrigatório.");
        }
        return value.strip();
    }

    private static String optional(String value) {
        return value == null || value.isBlank() ? null : value.strip();
    }
}
