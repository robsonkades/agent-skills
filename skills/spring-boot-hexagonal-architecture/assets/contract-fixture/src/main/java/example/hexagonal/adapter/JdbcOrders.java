package example.hexagonal.adapter;

import example.hexagonal.application.OrderStore;
import example.hexagonal.domain.Order;
import java.util.Optional;
import java.util.UUID;
import org.springframework.dao.DataAccessException;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.jdbc.core.JdbcTemplate;

public final class JdbcOrders implements OrderStore {
    private final JdbcTemplate jdbc;

    public JdbcOrders(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @Override
    public void insert(Order order) {
        try {
            jdbc.update("insert into orders (id, customer_id, quantity) values (?, ?, ?)",
                    order.id().toString(), order.customerId(), order.quantity());
        } catch (DuplicateKeyException failure) {
            // The fixture schema has only one unique key: the order ID.
            throw new DuplicateOrder(order.id(), failure);
        } catch (DataAccessException failure) {
            throw new StorageFailure(failure);
        }
    }

    @Override
    public void auditCreation(UUID id) {
        try {
            jdbc.update("insert into order_audit (order_id, action) values (?, ?)",
                    id.toString(), "CREATE");
        } catch (DataAccessException failure) {
            // An audit constraint failure is not an order-ID conflict.
            throw new StorageFailure(failure);
        }
    }

    @Override
    public Optional<Order> find(UUID id) {
        try {
            return jdbc.query("select id, customer_id, quantity from orders where id = ?",
                    (row, number) -> new Order(UUID.fromString(row.getString("id")),
                            row.getString("customer_id"), row.getInt("quantity")),
                    id.toString()).stream().findFirst();
        } catch (DataAccessException failure) {
            throw new StorageFailure(failure);
        }
    }
}
