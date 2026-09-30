package example.persistence;

import java.util.Objects;

public final class InventoryNotFoundException extends InventoryException {
    private final String sku;

    public InventoryNotFoundException(String sku) {
        super("INVENTORY_NOT_FOUND", "Inventory with SKU " + Objects.requireNonNull(sku) + " was not found.");
        this.sku = sku;
    }

    public String sku() { return sku; }
}
