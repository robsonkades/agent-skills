package example.hexagonal.application;

import example.hexagonal.domain.Order;
import java.util.Optional;
import java.util.UUID;

/**
 * Output port. Writes join the caller's local transaction; they do not commit it.
 * The ID is globally unique. A duplicate is a conflict, not an idempotent replay.
 * find is an internal storage operation; it is not an authorized public query.
 */
public interface OrderStore {
    void insert(Order order);

    void auditCreation(UUID id);

    Optional<Order> find(UUID id);

    final class DuplicateOrder extends RuntimeException {
        public DuplicateOrder(UUID id, Throwable cause) {
            super("Order already exists: " + id, cause);
        }
    }

    final class StorageFailure extends RuntimeException {
        public StorageFailure(Throwable cause) {
            super("Order storage failed", cause);
        }
    }
}
