package example.clean.outer;

import example.clean.application.PlaceOrder;
import org.springframework.boot.SpringBootConfiguration;
import org.springframework.boot.autoconfigure.EnableAutoConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

@SpringBootConfiguration(proxyBeanMethods = false)
@EnableAutoConfiguration
public class OrderConfiguration {
    @Bean
    JdbcLedger ledger(JdbcTemplate jdbc) {
        return new JdbcLedger(jdbc);
    }

    @Bean
    TransactionalOrders orders(JdbcLedger ledger, PlatformTransactionManager manager) {
        // Only the wrapped entry is injectable; the plain use case remains directly testable.
        return new TransactionalOrders(new PlaceOrder(ledger), new TransactionTemplate(manager));
    }
}
