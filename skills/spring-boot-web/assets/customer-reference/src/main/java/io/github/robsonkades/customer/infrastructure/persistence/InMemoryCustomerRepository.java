package io.github.robsonkades.customer.infrastructure.persistence;

import io.github.robsonkades.customer.application.CustomerPage;
import io.github.robsonkades.customer.application.CustomerRepository;
import io.github.robsonkades.customer.application.CustomerSearch;
import io.github.robsonkades.customer.application.CustomerSort;
import io.github.robsonkades.customer.domain.Customer;
import org.springframework.stereotype.Repository;

import java.util.Comparator;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentMap;
import java.util.concurrent.atomic.AtomicReference;
import java.util.function.UnaryOperator;

@Repository
public class InMemoryCustomerRepository implements CustomerRepository {

    private static final Comparator<Customer> DEFAULT_ORDER =
            Comparator.comparing(Customer::name, String.CASE_INSENSITIVE_ORDER);

    private final ConcurrentMap<UUID, Customer> customers = new ConcurrentHashMap<>();

    @Override
    public Customer save(Customer customer) {
        customers.put(customer.id(), customer);
        return customer;
    }

    @Override
    public Optional<Customer> findById(UUID id) {
        return Optional.ofNullable(customers.get(id));
    }

    @Override
    public Optional<Customer> update(UUID id, UnaryOperator<Customer> change) {
        var updated = new AtomicReference<Customer>();
        customers.computeIfPresent(id, (key, current) -> {
            var next = change.apply(current);
            updated.set(next);
            return next;
        });
        return Optional.ofNullable(updated.get());
    }

    @Override
    public CustomerPage search(CustomerSearch search) {
        var matches = customers.values().stream()
                .filter(customer -> search.filters().stream().allMatch(criterion -> criterion.matches(customer)))
                .sorted(comparator(search.sort()))
                .toList();

        long offset = (long) search.page() * search.size();
        int start = (int) Math.min(offset, matches.size());
        int end = Math.min(start + search.size(), matches.size());
        int totalPages = (int) ((matches.size() + (long) search.size() - 1) / search.size());

        return new CustomerPage(matches.subList(start, end), search.page(), search.size(),
                matches.size(), totalPages);
    }

    private static Comparator<Customer> comparator(List<CustomerSort> orders) {
        Comparator<Customer> result = orders.isEmpty() ? DEFAULT_ORDER : (left, right) -> 0;
        for (CustomerSort order : orders) {
            Comparator<Customer> next = switch (order.field()) {
                case "name" -> Comparator.comparing(Customer::name, String.CASE_INSENSITIVE_ORDER);
                case "email" -> Comparator.comparing(Customer::email, String.CASE_INSENSITIVE_ORDER);
                case "birthDate" -> Comparator.comparing(Customer::birthDate);
                case "city" -> Comparator.comparing(customer -> customer.address().city(), String.CASE_INSENSITIVE_ORDER);
                default -> throw new IllegalArgumentException("Unsupported sort field: " + order.field());
            };
            result = result.thenComparing(order.direction() == CustomerSort.Direction.DESC ? next.reversed() : next);
        }
        return result.thenComparing(customer -> customer.id().toString());
    }
}
