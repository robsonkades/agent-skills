package io.github.robsonkades.customer.application;

import io.github.robsonkades.customer.domain.Customer;
import io.github.robsonkades.customer.domain.InvalidCustomerException;

import java.util.UUID;

public class CustomerService {

    private final CustomerRepository repository;

    public CustomerService(final CustomerRepository repository) {
        this.repository = repository;
    }

    public Customer create(CustomerDetails details) {
        return repository.save(new Customer(UUID.randomUUID(), details.name(), details.email(), details.phone(), details.cpf(), details.birthDate(), details.address()));
    }

    public Customer getById(UUID id) {
        return repository.findById(id).orElseThrow(() -> new CustomerNotFoundException(id));
    }

    public Customer replace(UUID id, CustomerDetails details) {
        return repository
                .update(id, current -> current.withDetails(details.name(), details.email(), details.phone(), details.cpf(), details.birthDate(), details.address()))
                .orElseThrow(() -> new CustomerNotFoundException(id));
    }

    public Customer patch(UUID id, CustomerPatch patch) {
        if (patch.isEmpty()) {
            throw new InvalidCustomerException("Informe ao menos um campo para atualizar.");
        }

        return repository.update(id, current -> current.withDetails(
                valueOrCurrent(patch.name(), current.name()),
                valueOrCurrent(patch.email(), current.email()),
                valueOrCurrent(patch.phone(), current.phone()),
                valueOrCurrent(patch.cpf(), current.cpf()),
                valueOrCurrent(patch.birthDate(), current.birthDate()),
                valueOrCurrent(patch.address(), current.address())))
                .orElseThrow(() -> new CustomerNotFoundException(id));
    }

    public CustomerPage search(CustomerSearch search) {
        return repository.search(search);
    }

    private static String valueOrCurrent(FieldPatch<String> patch, String current) {
        if (!patch.present()) {
            return current;
        }
        if (patch.value() == null || patch.value().isBlank()) {
            throw new InvalidCustomerException("Os campos obrigatórios não podem ser nulos ou vazios.");
        }
        return patch.value();
    }

    private static <T> T valueOrCurrent(FieldPatch<T> patch, T current) {
        if (!patch.present()) return current;
        if (patch.value() == null) throw new InvalidCustomerException("Os campos obrigatórios não podem ser nulos.");
        return patch.value();
    }
}
