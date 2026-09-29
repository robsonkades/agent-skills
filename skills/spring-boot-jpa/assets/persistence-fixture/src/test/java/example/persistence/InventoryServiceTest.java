package example.persistence;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import jakarta.persistence.EntityManager;
import jakarta.persistence.EntityManagerFactory;
import jakarta.persistence.OptimisticLockException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.orm.ObjectOptimisticLockingFailureException;
import org.springframework.test.context.TestConstructor;
import org.springframework.transaction.support.TransactionTemplate;

@SpringBootTest(properties = {
        "spring.datasource.url=jdbc:h2:mem:inventory-service;DB_CLOSE_DELAY=-1",
        "spring.jpa.hibernate.ddl-auto=create-drop"
})
@TestConstructor(autowireMode = TestConstructor.AutowireMode.ALL)
class InventoryServiceTest {
    private final InventoryRepository inventory;
    private final InventoryService service;
    private final TransactionTemplate transactions;
    private final EntityManagerFactory entityManagers;

    InventoryServiceTest(InventoryRepository inventory, InventoryService service,
                         TransactionTemplate transactions, EntityManagerFactory entityManagers) {
        this.inventory = inventory;
        this.service = service;
        this.transactions = transactions;
        this.entityManagers = entityManagers;
    }

    @BeforeEach
    void seedCommittedState() {
        inventory.deleteAll();
        inventory.saveAndFlush(new Inventory("A", "Retain this description", 20));
    }

    @Test
    void reservationCommitsStockAndMovementWithoutReplacingOtherFields() {
        service.reserve("A", 3);

        Inventory result = inventory.findWithMovementsBySku("A").orElseThrow();
        assertEquals(17, result.getAvailable());
        assertEquals("Retain this description", result.getDescription());
        assertEquals(1, result.getMovements().size());
        assertEquals(3, result.getMovements().getFirst().getQuantity());
        assertNotNull(result.getMovements().getFirst().getId());
    }

    @Test
    void failureAfterFlushRollsBackStockAndMovement() {
        assertThrows(IllegalStateException.class, () -> transactions.executeWithoutResult(status -> {
            service.reserve("A", 3);
            inventory.flush();
            throw new IllegalStateException("Fail after SQL execution");
        }));

        Inventory result = inventory.findWithMovementsBySku("A").orElseThrow();
        assertEquals(20, result.getAvailable());
        assertTrue(result.getMovements().isEmpty());
    }

    @Test
    void staleClientVersionIsRejectedEvenWhenTheServiceLoadsCurrentState() {
        Long clientVersion = inventory.findById("A").orElseThrow().getVersion();
        service.changeNote("A", clientVersion, "Committed by another client");
        Long currentVersion = inventory.findById("A").orElseThrow().getVersion();
        assertNotEquals(clientVersion, currentVersion);

        assertThrows(ObjectOptimisticLockingFailureException.class,
                () -> service.changeNote("A", clientVersion, "Stale overwrite"));

        Inventory result = inventory.findById("A").orElseThrow();
        assertEquals("Committed by another client", result.getNote());
        assertEquals(currentVersion, result.getVersion());
        assertEquals("Retain this description", result.getDescription());
    }

    @Test
    void currentVersionAllowsAnEditAndThenClearingTheNote() {
        Long clientVersion = inventory.findById("A").orElseThrow().getVersion();
        service.changeNote("A", clientVersion, "Current edit");

        Inventory edited = inventory.findById("A").orElseThrow();
        assertEquals("Current edit", edited.getNote());
        assertNotEquals(clientVersion, edited.getVersion());
        service.changeNote("A", edited.getVersion(), null);

        Inventory cleared = inventory.findById("A").orElseThrow();
        assertNull(cleared.getNote());
        assertNotEquals(edited.getVersion(), cleared.getVersion());
        assertEquals("Retain this description", cleared.getDescription());
        assertEquals(20, cleared.getAvailable());
    }

    @Test
    void missingVersionCannotBypassTheConditionalEdit() {
        Long version = inventory.findById("A").orElseThrow().getVersion();
        assertThrows(IllegalArgumentException.class, () -> service.changeNote("A", null, "Unchecked"));
        Inventory result = inventory.findById("A").orElseThrow();
        assertNull(result.getNote());
        assertEquals(version, result.getVersion());
    }

    @Test
    void competingTransactionsCannotBothReserveFromTheSameVersion() {
        // Two open persistence contexts model overlapping reads without timing sleeps.
        try (EntityManager first = entityManagers.createEntityManager();
             EntityManager second = entityManagers.createEntityManager()) {
            first.getTransaction().begin();
            second.getTransaction().begin();
            try {
                Inventory firstRead = first.find(Inventory.class, "A");
                Inventory secondRead = second.find(Inventory.class, "A");
                firstRead.reserve(3);
                secondRead.reserve(4);
                first.getTransaction().commit();
                assertThrows(OptimisticLockException.class, second::flush);
            } finally {
                if (first.getTransaction().isActive()) first.getTransaction().rollback();
                if (second.getTransaction().isActive()) second.getTransaction().rollback();
            }
        }
        Inventory result = inventory.findWithMovementsBySku("A").orElseThrow();
        assertEquals(17, result.getAvailable());
        assertEquals(1, result.getMovements().size());
        assertEquals(3, result.getMovements().getFirst().getQuantity());
    }

    @Test
    void optionalNoteAcceptsItsLimitAndRejectsAnOversizedEdit() {
        Inventory initial = inventory.findById("A").orElseThrow();
        assertNull(initial.getNote());
        service.changeNote("A", initial.getVersion(), "n".repeat(500));
        Inventory saved = inventory.findById("A").orElseThrow();
        assertEquals(500, saved.getNote().length());

        assertThrows(IllegalArgumentException.class,
                () -> service.changeNote("A", saved.getVersion(), "n".repeat(501)));
        Inventory result = inventory.findById("A").orElseThrow();
        assertEquals(saved.getNote(), result.getNote());
        assertEquals(saved.getVersion(), result.getVersion());
    }
}
