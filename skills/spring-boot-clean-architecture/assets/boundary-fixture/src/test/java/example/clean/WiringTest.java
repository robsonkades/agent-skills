package example.clean;

import example.clean.application.PlaceOrder;
import example.clean.outer.JdbcLedger;
import example.clean.outer.OrderConfiguration;
import example.clean.outer.TransactionalOrders;
import java.util.UUID;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.boot.WebApplicationType;
import org.springframework.boot.builder.SpringApplicationBuilder;
import org.springframework.context.ConfigurableApplicationContext;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import static org.junit.jupiter.api.Assertions.*;

class WiringTest {
    private static ConfigurableApplicationContext context;
    private static JdbcTemplate jdbc;
    private static TransactionalOrders orders;

    @BeforeAll
    static void start() {
        context = new SpringApplicationBuilder(OrderConfiguration.class)
                .web(WebApplicationType.NONE)
                .run("--spring.datasource.url=jdbc:h2:mem:clean-" + UUID.randomUUID(),
                        "--spring.datasource.username=sa", "--spring.datasource.password=",
                        "--spring.sql.init.mode=never", "--spring.main.banner-mode=off");
        jdbc = context.getBean(JdbcTemplate.class);
        orders = context.getBean(TransactionalOrders.class);
        jdbc.execute("create table orders(id varchar(80) primary key, customer_id varchar(80) not null, total_cents bigint not null check(total_cents > 0))");
        jdbc.execute("create table receipts(order_id varchar(80) primary key)");
    }

    @AfterAll
    static void stop() {
        if (context != null) context.close();
    }

    @BeforeEach
    void clear() {
        jdbc.update("delete from receipts");
        jdbc.update("delete from orders");
    }

    @Test
    void actualEntryCommitsBothWritesAndReturnsInnerResult() {
        var result = orders.submit(allowed(), new PlaceOrder.Command("order-1", 1500));
        assertEquals(new PlaceOrder.Result("order-1", 1500), result);
        assertEquals(1, count("orders"));
        assertEquals(1, count("receipts"));
        assertEquals("customer-1", jdbc.queryForObject("select customer_id from orders", String.class));
        assertTrue(context.getBeansOfType(PlaceOrder.class).isEmpty());
    }

    @Test
    void secondActualWriteFailureRollsBackFirstWithoutOuterTestTransaction() {
        jdbc.update("insert into receipts(order_id) values (?)", "order-1");
        assertThrows(PlaceOrder.StorageFailure.class,
                () -> orders.submit(allowed(), new PlaceOrder.Command("order-1", 1500)));
        assertEquals(0, count("orders"));
        assertEquals(1, count("receipts"));
    }

    @Test
    void returnedResultCanStillBeRolledBackByEnclosingCaller() {
        var callerTransaction = new TransactionTemplate(context.getBean(PlatformTransactionManager.class));
        callerTransaction.executeWithoutResult(status -> {
            var result = orders.submit(allowed(), new PlaceOrder.Command("order-1", 1500));
            assertEquals(new PlaceOrder.Result("order-1", 1500), result);
            assertEquals(1, count("orders"));
            assertEquals(1, count("receipts"));
            status.setRollbackOnly();
        });
        assertEquals(0, count("orders"));
        assertEquals(0, count("receipts"));
    }

    @Test
    void forbiddenActorCannotWriteThroughRealBean() {
        assertThrows(PlaceOrder.Forbidden.class,
                () -> orders.submit(new PlaceOrder.Actor("customer-1", false), new PlaceOrder.Command("order-1", 1500)));
        assertEquals(0, count("orders"));
        assertEquals(0, count("receipts"));
    }

    @Test
    void missingWrapperActuallyLeavesPartialState() {
        // Sensitivity control: the same failure exposes the missing transaction.
        jdbc.update("insert into receipts(order_id) values (?)", "order-1");
        var unwrapped = new PlaceOrder(context.getBean(JdbcLedger.class));
        assertThrows(PlaceOrder.StorageFailure.class,
                () -> unwrapped.execute(allowed(), new PlaceOrder.Command("order-1", 1500)));
        assertEquals(1, count("orders"));
        assertEquals(1, count("receipts"));
    }

    private static PlaceOrder.Actor allowed() {
        return new PlaceOrder.Actor("customer-1", true);
    }

    private static int count(String table) {
        return jdbc.queryForObject("select count(*) from " + table, Integer.class);
    }
}
