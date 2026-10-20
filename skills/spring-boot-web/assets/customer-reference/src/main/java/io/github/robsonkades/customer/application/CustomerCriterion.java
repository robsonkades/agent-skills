package io.github.robsonkades.customer.application;

import io.github.robsonkades.customer.domain.Customer;
import io.github.robsonkades.customer.domain.InvalidCustomerException;

import java.time.LocalDate;
import java.util.Locale;
import java.util.Set;

public sealed interface CustomerCriterion
        permits CustomerCriterion.Contains, CustomerCriterion.Exact, CustomerCriterion.BirthDateRange {

    boolean matches(Customer customer);

    record Contains(String field, String value) implements CustomerCriterion {

        private static final Set<String> FIELDS = Set.of("name", "email", "phone", "cpf", "address.city", "address.state", "address.postalCode");

        public Contains {
            requireField(field, FIELDS);
            requireText(value, "value");
        }

        @Override
        public boolean matches(Customer customer) {
            return valueOf(customer, field)
                    .toLowerCase(Locale.ROOT)
                    .contains(value.strip().toLowerCase(Locale.ROOT));
        }
    }

    record Exact(String field, String value) implements CustomerCriterion {
        private static final Set<String> FIELDS = Set.of("name", "email", "phone", "cpf", "address.city", "address.state", "address.postalCode");

        public Exact {
            requireField(field, FIELDS);
            requireText(value, "value");
        }

        @Override
        public boolean matches(Customer customer) {
            return valueOf(customer, field).equalsIgnoreCase(value.strip());
        }
    }

    record BirthDateRange(LocalDate from, LocalDate to) implements CustomerCriterion {
        public BirthDateRange {
            if (from == null && to == null) {
                throw new InvalidCustomerException("Informe ao menos uma data para o intervalo de nascimento.");
            }
            if (from != null && to != null && from.isAfter(to)) {
                throw new InvalidCustomerException("A data inicial não pode ser posterior à data final.");
            }
        }

        @Override
        public boolean matches(Customer customer) {
            return (from == null || !customer.birthDate().isBefore(from)) && (to == null || !customer.birthDate().isAfter(to));
        }
    }

    private static void requireField(String field, Set<String> allowed) {
        if (field == null || !allowed.contains(field)) {
            throw new InvalidCustomerException("Campo de filtro não permitido: " + field + ".");
        }
    }

    private static void requireText(String value, String field) {
        if (value == null || value.isBlank()) {
            throw new InvalidCustomerException("O valor do critério '" + field + "' é obrigatório.");
        }
    }

    private static String valueOf(Customer customer, String field) {
        return switch (field) {
            case "name" -> customer.name();
            case "email" -> customer.email();
            case "phone" -> customer.phone();
            case "cpf" -> customer.cpf();
            case "address.city" -> customer.address().city();
            case "address.state" -> customer.address().state();
            case "address.postalCode" -> customer.address().postalCode();
            default -> throw new IllegalArgumentException("Unsupported customer filter: " + field);
        };
    }
}
