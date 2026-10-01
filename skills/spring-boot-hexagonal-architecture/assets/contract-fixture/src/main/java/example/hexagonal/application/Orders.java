package example.hexagonal.application;

import example.hexagonal.domain.Order;
import java.util.UUID;

/** Input port. Actor identity comes from a trusted adapter, never the request body. */
public interface Orders {
    Order create(Actor actor, Create command);

    record Actor(String customerId) {
        public Actor {
            if (customerId == null || customerId.isBlank()) {
                throw new IllegalArgumentException("A trusted customer identity is required");
            }
        }
    }

    record Create(UUID id, String customerId, int quantity) {}

    final class Forbidden extends RuntimeException {
        public Forbidden() {
            super("The actor cannot create orders for this customer");
        }
    }
}
