package example.clean.application;

import example.clean.domain.Purchase;
import java.util.Objects;

public final class PlaceOrder {
    private final Ledger ledger;

    public PlaceOrder(Ledger ledger) {
        this.ledger = Objects.requireNonNull(ledger);
    }

    public Result execute(Actor actor, Command command) {
        if (actor == null || !actor.maySubmit()) {
            throw new Forbidden();
        }
        Objects.requireNonNull(command, "command");
        var order = new Purchase(command.id(), actor.customerId(), command.totalCents());
        ledger.insertOrder(order.id(), order.customerId(), order.totalCents());
        ledger.insertReceipt(order.id());
        return new Result(order.id(), order.totalCents());
    }

    // A trusted entry supplies this context; it must never be bound from request JSON.
    public record Actor(String customerId, boolean maySubmit) {}
    public record Command(String id, long totalCents) {}
    public record Result(String id, long totalCents) {}

    // Both effects must commit together; the outer entry implements that requirement.
    public interface Ledger {
        void insertOrder(String id, String customerId, long totalCents);
        void insertReceipt(String id);
    }

    public static final class Forbidden extends RuntimeException {
        public Forbidden() {
            super("Order submission is not permitted");
        }
    }

    public static final class StorageFailure extends RuntimeException {
        public StorageFailure(Throwable cause) {
            super("Order could not be stored", cause);
        }
    }
}
