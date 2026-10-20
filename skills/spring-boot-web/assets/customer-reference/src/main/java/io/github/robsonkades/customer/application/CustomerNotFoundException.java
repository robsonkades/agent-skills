package io.github.robsonkades.customer.application;

import java.util.UUID;

public class CustomerNotFoundException extends RuntimeException {

    public CustomerNotFoundException(UUID id) {
        super("Cliente com ID '" + id + "' não foi encontrado.");
    }
}
