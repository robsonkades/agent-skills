package example.persistence;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class InventoryService {
    private final InventoryRepository inventory;

    public InventoryService(InventoryRepository inventory) {
        this.inventory = inventory;
    }

    @Transactional
    public void reserve(String sku, int quantity) {
        // The managed entity keeps omitted fields; @Version rejects stale competing updates.
        findRequiredBySku(sku).reserve(quantity);
    }

    @Transactional
    public void changeNote(String sku, Long expectedVersion, String note) {
        if (expectedVersion == null) {
            throw new IllegalArgumentException("The client's expected version is required");
        }
        Inventory item = findRequiredBySku(sku);
        if (!expectedVersion.equals(item.getVersion())) {
            throw new InventoryVersionConflictException(sku, expectedVersion, item.getVersion());
        }
        // Never assign expectedVersion to @Version. Hibernate still detects a race at commit.
        item.changeNote(note);
    }

    private Inventory findRequiredBySku(String sku) {
        return inventory.findById(sku).orElseThrow(() -> new InventoryNotFoundException(sku));
    }
}
