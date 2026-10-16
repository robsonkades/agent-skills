package example.clean.domain;

import java.util.Objects;

public record Purchase(String id, String customerId, long totalCents) {
    public Purchase {
        Objects.requireNonNull(id, "id");
        Objects.requireNonNull(customerId, "customerId");
        if (id.isBlank() || customerId.isBlank()) {
            throw new IllegalArgumentException("Identity must be present");
        }
        if (totalCents <= 0) {
            throw new IllegalArgumentException("Total must be positive");
        }
    }
}
