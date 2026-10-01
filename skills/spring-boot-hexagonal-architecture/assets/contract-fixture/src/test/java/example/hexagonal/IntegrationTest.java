package example.hexagonal;

import example.hexagonal.application.OrderStore;
import example.hexagonal.application.OrderStoreContract;
import example.hexagonal.application.Orders;
import example.hexagonal.domain.Order;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.TestConstructor;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.transaction.support.TransactionTemplate;
import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest(properties = {
        "spring.datasource.url=jdbc:h2:mem:hexagonal;DB_CLOSE_DELAY=-1",
        "spring.datasource.username=sa",
        "spring.datasource.password="
})
@AutoConfigureMockMvc
@TestConstructor(autowireMode = TestConstructor.AutowireMode.ALL)
class IntegrationTest {
    private final MockMvc mvc;
    private final JdbcTemplate jdbc;
    private final OrderStore store;
    private final DirectDriver direct;
    private final TransactionTemplate callerTransaction;

    IntegrationTest(MockMvc mvc, JdbcTemplate jdbc, OrderStore store, Orders orders,
            PlatformTransactionManager manager) {
        this.mvc = mvc;
        this.jdbc = jdbc;
        this.store = store;
        this.direct = new DirectDriver(orders);
        this.callerTransaction = new TransactionTemplate(manager);
    }

    @BeforeEach
    void prepareLocalDatabaseWithoutAnOuterTestTransaction() {
        assertFalse(TransactionSynchronizationManager.isActualTransactionActive());
        jdbc.execute("drop table if exists order_audit");
        jdbc.execute("drop table if exists orders");
        jdbc.execute("create table orders (id varchar(36) primary key, customer_id varchar(64) not null, quantity integer not null)");
        jdbc.execute("create table order_audit (order_id varchar(36) primary key, action varchar(10) not null)");
    }

    @Test
    void bothInputsUseRealWiringAndCommitBothWrites() throws Exception {
        UUID httpId = UUID.randomUUID();
        http(httpId, "alice", "alice", 2)
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.id").value(httpId.toString()))
                .andExpect(jsonPath("$.quantity").value(2));
        UUID directId = UUID.randomUUID();
        assertEquals(new Order(directId, "alice", 4), direct.create(directId, "alice", "alice", 4));
        assertEquals(2, count("orders"));
        assertEquals(2, count("order_audit"));
        assertEquals(2, store.find(httpId).orElseThrow().quantity());
    }

    @Test
    void jdbcAdapterMeetsTheSharedInsertAndFindContract() {
        OrderStoreContract.assertInsertAndFind(store);
    }

    @Test
    void successfulInnerReturnDoesNotCommitTheCallersTransaction() {
        UUID id = UUID.randomUUID();
        callerTransaction.executeWithoutResult(status -> {
            assertEquals(new Order(id, "alice", 3), direct.create(id, "alice", "alice", 3));
            assertEquals(1, count("orders"));
            assertEquals(1, count("order_audit"));
            status.setRollbackOnly();
        });
        assertFalse(TransactionSynchronizationManager.isActualTransactionActive());
        assertTrue(store.find(id).isEmpty());
        assertEquals(0, count("order_audit"));
    }

    @Test
    void hostileCustomerAndInvalidQuantityAreRejectedByBothInputs() throws Exception {
        http(UUID.randomUUID(), "mallory", "alice", 2).andExpect(status().isForbidden());
        assertThrows(Orders.Forbidden.class,
                () -> direct.create(UUID.randomUUID(), "mallory", "alice", 2));
        http(UUID.randomUUID(), "alice", "alice", 11).andExpect(status().isBadRequest());
        assertThrows(Order.InvalidOrder.class,
                () -> direct.create(UUID.randomUUID(), "alice", "alice", 11));
        assertEquals(0, count("orders"));
        assertEquals(0, count("order_audit"));
    }

    @Test
    void absentPrincipalCannotBeReplacedByCustomerFromTheBody() throws Exception {
        mvc.perform(post("/orders").contentType("application/json")
                .content(body(UUID.randomUUID(), "alice", 2))).andExpect(status().isUnauthorized());
        assertEquals(0, count("orders"));
    }

    @Test
    void realPortDistinguishesMissingDuplicateAndFailure() {
        UUID id = UUID.randomUUID();
        assertTrue(store.find(id).isEmpty());
        direct.create(id, "alice", "alice", 2);
        assertThrows(OrderStore.DuplicateOrder.class, () -> direct.create(id, "alice", "alice", 5));
        assertEquals(2, store.find(id).orElseThrow().quantity());
        assertEquals(1, count("order_audit"));
        jdbc.execute("drop table orders");
        assertThrows(OrderStore.StorageFailure.class, () -> store.find(id));
    }

    @Test
    void duplicateHttpRequestIsConflictAndPreservesCommittedData() throws Exception {
        UUID id = UUID.randomUUID();
        http(id, "alice", "alice", 2).andExpect(status().isCreated());
        http(id, "alice", "alice", 5).andExpect(status().isConflict());
        assertEquals(2, store.find(id).orElseThrow().quantity());
        assertEquals(1, count("order_audit"));
    }

    @Test
    void secondWriteFailureRollsBackTheFirstWriteThroughBothInputs() throws Exception {
        jdbc.execute("drop table order_audit");
        UUID directId = UUID.randomUUID();
        assertThrows(OrderStore.StorageFailure.class,
                () -> direct.create(directId, "alice", "alice", 2));
        assertTrue(store.find(directId).isEmpty());
        http(UUID.randomUUID(), "alice", "alice", 2)
                .andExpect(status().isInternalServerError())
                .andExpect(jsonPath("$.detail").value("Order storage failed"));
        assertEquals(0, count("orders"));
        assertFalse(TransactionSynchronizationManager.isActualTransactionActive());
    }

    @Test
    void auditUniqueFailureIsStorageFailureRatherThanAnOrderConflict() {
        UUID id = UUID.randomUUID();
        jdbc.update("insert into order_audit (order_id, action) values (?, ?)", id.toString(), "CREATE");
        assertThrows(OrderStore.StorageFailure.class,
                () -> direct.create(id, "alice", "alice", 2));
        assertTrue(store.find(id).isEmpty());
        assertEquals(1, count("order_audit"));
    }

    private ResultActions http(UUID id, String trustedActor, String customer, int quantity) throws Exception {
        return mvc.perform(post("/orders").principal(() -> trustedActor)
                .contentType("application/json").content(body(id, customer, quantity)));
    }

    private static String body(UUID id, String customer, int quantity) {
        // Test constants only; production serialization does not build JSON by concatenation.
        return "{\"id\":\"" + id + "\",\"customerId\":\"" + customer + "\",\"quantity\":" + quantity + "}";
    }

    private int count(String table) {
        // The two table identifiers are private test constants, never external input.
        return jdbc.queryForObject("select count(*) from " + table, Integer.class);
    }

    /** Controlled second driving adapter; the caller supplies already trusted identity. */
    private record DirectDriver(Orders orders) {
        Order create(UUID id, String trustedActor, String customer, int quantity) {
            return orders.create(new Orders.Actor(trustedActor), new Orders.Create(id, customer, quantity));
        }
    }
}
