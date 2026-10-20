package io.github.robsonkades.customer.domain;

public class InvalidCustomerException extends RuntimeException {

    public InvalidCustomerException(String message) {
        super(message);
    }
}
