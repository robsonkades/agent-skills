package example.hexagonal;

import example.hexagonal.adapter.HttpOrders;
import example.hexagonal.adapter.JdbcOrders;
import example.hexagonal.application.CreateOrder;
import example.hexagonal.application.OrderStore;
import example.hexagonal.application.Orders;
import org.springframework.boot.SpringBootConfiguration;
import org.springframework.boot.autoconfigure.EnableAutoConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.dao.DataAccessException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionException;
import org.springframework.transaction.support.TransactionTemplate;

@SpringBootConfiguration
@EnableAutoConfiguration
@Import(HttpOrders.class)
public class FixtureApplication {
    @Bean
    OrderStore orderStore(JdbcTemplate jdbc) {
        return new JdbcOrders(jdbc);
    }

    @Bean
    Orders orders(OrderStore store, PlatformTransactionManager manager) {
        CreateOrder useCase = new CreateOrder(store);
        TransactionTemplate transaction = new TransactionTemplate(manager);
        // Both entry adapters receive this decorated port; the undecorated use case is not a bean.
        return (actor, command) -> {
            try {
                return transaction.execute(status -> useCase.create(actor, command));
            } catch (TransactionException | DataAccessException failure) {
                throw new OrderStore.StorageFailure(failure);
            }
        };
    }
}
