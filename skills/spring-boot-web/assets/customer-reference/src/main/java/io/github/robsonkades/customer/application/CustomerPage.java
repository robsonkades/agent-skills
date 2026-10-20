package io.github.robsonkades.customer.application;

import io.github.robsonkades.customer.domain.Customer;

import java.util.List;

public record CustomerPage(List<Customer> content, int page, int size, long totalElements, int totalPages) {

    public CustomerPage {
        content = List.copyOf(content);
    }
}
