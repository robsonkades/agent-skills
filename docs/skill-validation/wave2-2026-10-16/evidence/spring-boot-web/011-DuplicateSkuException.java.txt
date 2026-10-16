package example.web;

import java.util.Objects;

public final class DuplicateSkuException extends BusinessException {
    private final String sku;

    public DuplicateSkuException(String sku) {
        super("DUPLICATE_SKU", "Catalog code " + Objects.requireNonNull(sku) + " already exists.");
        this.sku = sku;
    }

    public String sku() {
        return sku;
    }
}
