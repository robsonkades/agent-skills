package example.persistence;

import java.util.Optional;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.transaction.annotation.Transactional;

public interface InventoryRepository extends JpaRepository<Inventory, String> {
    @EntityGraph(attributePaths = "movements")
    @Transactional(readOnly = true)
    Optional<Inventory> findWithMovementsBySku(String sku);
}
