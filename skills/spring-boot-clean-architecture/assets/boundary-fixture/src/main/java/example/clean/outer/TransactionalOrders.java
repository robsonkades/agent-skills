package example.clean.outer;

import example.clean.application.PlaceOrder;
import java.util.Objects;
import org.springframework.transaction.support.TransactionTemplate;

public final class TransactionalOrders {
    private final PlaceOrder useCase;
    private final TransactionTemplate transaction;

    public TransactionalOrders(PlaceOrder useCase, TransactionTemplate transaction) {
        this.useCase = useCase;
        this.transaction = transaction;
    }

    public PlaceOrder.Result submit(PlaceOrder.Actor actor, PlaceOrder.Command command) {
        return Objects.requireNonNull(transaction.execute(status -> useCase.execute(actor, command)));
    }
}
