package example.hexagonal.application;

import example.hexagonal.domain.Order;
import java.util.Objects;

public final class CreateOrder implements Orders {
    private final OrderStore store;

    public CreateOrder(OrderStore store) {
        this.store = Objects.requireNonNull(store);
    }

    @Override
    public Order create(Actor actor, Create command) {
        Objects.requireNonNull(command);
        if (actor == null || !actor.customerId().equals(command.customerId())) {
            throw new Forbidden();
        }
        Order order = new Order(command.id(), command.customerId(), command.quantity());
        store.insert(order);
        store.auditCreation(order.id());
        return order;
    }
}
