package example.web;

import java.util.Objects;
import java.util.UUID;

public final class ProductNotFoundException extends BusinessException {
    private final UUID productId;

    public ProductNotFoundException(UUID productId) {
        super("PRODUCT_NOT_FOUND", "Product " + Objects.requireNonNull(productId) + " not found.");
        this.productId = productId;
    }

    public UUID productId() {
        return productId;
    }
}
