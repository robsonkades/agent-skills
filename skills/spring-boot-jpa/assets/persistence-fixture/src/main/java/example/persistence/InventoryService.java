package example.persistence;

import java.util.NoSuchElementException;
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
    public void reserveThenFail(String sku, int quantity) {
        required(sku).reserve(quantity);
        inventory.flush();
        throw new IllegalStateException("Fixture failure after SQL execution");
    }

    @Transactional
    public void reserveWithLock(String sku, int quantity) {
        inventory.findForUpdate(sku).orElseThrow(NoSuchElementException::new).reserve(quantity);
    }

    private Inventory required(String sku) {
        return inventory.findById(sku).orElseThrow(NoSuchElementException::new);
    }
}
