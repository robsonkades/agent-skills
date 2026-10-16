package example.hexagonal.domain;

import java.util.UUID;

public record Order(UUID id, String customerId, int quantity) {
    public Order {
        if (id == null || customerId == null || customerId.isBlank() || customerId.length() > 64) {
            throw new InvalidOrder("An ID and a customer of 1..64 characters are required");
        }
        if (quantity < 1 || quantity > 10) {
            throw new InvalidOrder("Quantity must be between 1 and 10");
        }
    }

    public static final class InvalidOrder extends RuntimeException {
        public InvalidOrder(String message) {
            super(message);
        }
    }
}
