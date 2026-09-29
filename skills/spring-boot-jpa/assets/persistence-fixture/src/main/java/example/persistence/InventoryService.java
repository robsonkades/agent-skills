package example.persistence;

import java.util.NoSuchElementException;
import org.springframework.orm.ObjectOptimisticLockingFailureException;
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
        required(sku).reserve(quantity);
    }

    @Transactional
    public void changeNote(String sku, Long expectedVersion, String note) {
        if (expectedVersion == null) {
            throw new IllegalArgumentException("The client's expected version is required");
        }
        Inventory item = required(sku);
        if (!expectedVersion.equals(item.getVersion())) {
            throw new ObjectOptimisticLockingFailureException(Inventory.class, sku);
        }
        // Never assign expectedVersion to @Version. Hibernate still detects a race at commit.
        item.changeNote(note);
    }

    private Inventory required(String sku) {
        return inventory.findById(sku).orElseThrow(NoSuchElementException::new);
    }
}
