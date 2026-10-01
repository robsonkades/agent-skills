package example.hexagonal.application;

import example.hexagonal.domain.Order;
import java.util.HashMap;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;

class UseCaseTest {
    private final FakeStore store = new FakeStore();
    private final Orders useCase = new CreateOrder(store);
    private final UUID id = UUID.randomUUID();

    @Test
    void fakeMeetsTheSharedInsertAndFindContract() {
        OrderStoreContract.assertInsertAndFind(store);
    }

    @Test
    void createsThroughPlainJavaInputPort() {
        Order result = useCase.create(new Orders.Actor("alice"), new Orders.Create(id, "alice", 3));
        assertEquals(new Order(id, "alice", 3), result);
        assertEquals(Optional.of(result), store.find(id));
        assertEquals(1, store.audits);
    }

    @Test
    void authorizationRunsBeforeWritingForEveryCaller() {
        assertThrows(Orders.Forbidden.class,
                () -> useCase.create(new Orders.Actor("mallory"), new Orders.Create(id, "alice", 3)));
        assertThrows(Orders.Forbidden.class,
                () -> useCase.create(null, new Orders.Create(id, "alice", 3)));
        assertTrue(store.orders.isEmpty());
        assertEquals(0, store.audits);
    }

    @Test
    void domainQuantityInvariantRunsWithoutHttpValidation() {
        for (int quantity : new int[] {0, 11}) {
            assertThrows(Order.InvalidOrder.class,
                    () -> useCase.create(new Orders.Actor("alice"), new Orders.Create(id, "alice", quantity)));
        }
        assertTrue(store.orders.isEmpty());
        assertEquals(0, store.audits);
    }

    @Test
    void duplicateIsAConflictAndDoesNotWriteAnotherAudit() {
        useCase.create(new Orders.Actor("alice"), new Orders.Create(id, "alice", 3));
        assertThrows(OrderStore.DuplicateOrder.class,
                () -> useCase.create(new Orders.Actor("alice"), new Orders.Create(id, "alice", 5)));
        assertEquals(3, store.find(id).orElseThrow().quantity());
        assertEquals(1, store.audits);
    }

    /** Single-threaded fake for use-case ordering only; it does not simulate JDBC transactions. */
    private static final class FakeStore implements OrderStore {
        private final Map<UUID, Order> orders = new HashMap<>();
        private int audits;

        public void insert(Order order) {
            if (orders.putIfAbsent(order.id(), order) != null) {
                throw new DuplicateOrder(order.id(), null);
            }
        }

        public void auditCreation(UUID id) {
            audits++;
        }

        public Optional<Order> find(UUID id) {
            return Optional.ofNullable(orders.get(id));
        }
    }
}
