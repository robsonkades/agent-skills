package example.hexagonal.application;

import example.hexagonal.domain.Order;
import java.util.Optional;
import java.util.UUID;
import static org.junit.jupiter.api.Assertions.*;

/** Shared sequential insert/find subset; does not claim audit, transaction or concurrency parity. */
public final class OrderStoreContract {
    private OrderStoreContract() {}

    public static void assertInsertAndFind(OrderStore store) {
        UUID id = UUID.randomUUID();
        Order original = new Order(id, "alice", 3);
        assertTrue(store.find(id).isEmpty());
        store.insert(original);
        assertEquals(Optional.of(original), store.find(id));
        for (Order duplicate : new Order[] {original, new Order(id, "bob", 5)}) {
            assertThrows(OrderStore.DuplicateOrder.class, () -> store.insert(duplicate),
                    "The ID is globally unique; identical payloads are conflicts too");
            assertEquals(Optional.of(original), store.find(id), "A conflict must preserve the original");
        }
    }
}
