package example.persistence;

import jakarta.persistence.LockModeType;
import java.util.Optional;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface InventoryRepository extends JpaRepository<Inventory, String> {
    @Query(value = "select i from Inventory i left join fetch i.movements",
           countQuery = "select count(i) from Inventory i")
    Page<Inventory> findWithMovements(Pageable pageable);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select i from Inventory i where i.sku = :sku")
    Optional<Inventory> findForUpdate(@Param("sku") String sku);
}
