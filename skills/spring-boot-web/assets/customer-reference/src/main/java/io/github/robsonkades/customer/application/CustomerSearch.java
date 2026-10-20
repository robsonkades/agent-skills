package io.github.robsonkades.customer.application;

import io.github.robsonkades.customer.domain.InvalidCustomerException;

import java.util.List;
import java.util.Set;

public record CustomerSearch(List<CustomerCriterion> filters, List<CustomerSort> sort, int page, int size) {

    private static final Set<String> SORTABLE_FIELDS = Set.of("name", "email", "birthDate", "city");

    public CustomerSearch {
        if (page < 0) {
            throw new InvalidCustomerException("O número da página deve ser zero ou maior.");
        }

        if (size < 1 || size > 100) {
            throw new InvalidCustomerException("O tamanho da página deve estar entre 1 e 100.");
        }

        filters = filters == null ? List.of() : List.copyOf(filters);
        sort = sort == null ? List.of() : List.copyOf(sort);
        sort.forEach(order -> {
            if (order.field() == null || !SORTABLE_FIELDS.contains(order.field())) {
                throw new InvalidCustomerException("Campo de ordenação não permitido: " + order.field() + ".");
            }
        });
    }
}
