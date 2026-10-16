package example.clean.outer;

import example.clean.application.PlaceOrder;
import org.springframework.dao.DataAccessException;
import org.springframework.jdbc.core.JdbcTemplate;

public final class JdbcLedger implements PlaceOrder.Ledger {
    private final JdbcTemplate jdbc;

    public JdbcLedger(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @Override
    public void insertOrder(String id, String customerId, long totalCents) {
        try {
            jdbc.update("insert into orders(id, customer_id, total_cents) values (?, ?, ?)",
                    id, customerId, totalCents);
        } catch (DataAccessException failure) {
            throw new PlaceOrder.StorageFailure(failure);
        }
    }

    @Override
    public void insertReceipt(String id) {
        try {
            jdbc.update("insert into receipts(order_id) values (?)", id);
        } catch (DataAccessException failure) {
            throw new PlaceOrder.StorageFailure(failure);
        }
    }
}
