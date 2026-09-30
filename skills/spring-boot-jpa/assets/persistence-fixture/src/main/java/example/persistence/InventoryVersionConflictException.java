package example.persistence;

import java.util.Objects;

public final class InventoryVersionConflictException extends InventoryException {
    private final String sku;
    private final long expectedVersion;
    private final long currentVersion;

    public InventoryVersionConflictException(String sku, long expectedVersion, long currentVersion) {
        super("INVENTORY_VERSION_CONFLICT", "Inventory with SKU " + Objects.requireNonNull(sku)
                + " has version " + currentVersion + "; expected " + expectedVersion + ".");
        this.sku = sku;
        this.expectedVersion = expectedVersion;
        this.currentVersion = currentVersion;
    }

    public String sku() { return sku; }
    public long expectedVersion() { return expectedVersion; }
    public long currentVersion() { return currentVersion; }
}
