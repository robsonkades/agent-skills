package io.github.robsonkades.customer.application;

import io.github.robsonkades.customer.domain.Customer;

import java.util.Optional;
import java.util.UUID;
import java.util.function.UnaryOperator;

public interface CustomerRepository {

    Customer save(Customer customer);

    Optional<Customer> findById(UUID id);

    Optional<Customer> update(UUID id, UnaryOperator<Customer> change);

    CustomerPage search(CustomerSearch search);
}
