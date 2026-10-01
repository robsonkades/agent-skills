package example.clean;

import example.clean.application.PlaceOrder;
import example.clean.domain.Purchase;
import example.clean.outer.ReceiptViews;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

class PolicyTest {
    @Test
    void rejectsInvalidDomainStateWithoutSpring() {
        assertThrows(IllegalArgumentException.class, () -> new Purchase("o-1", "c-1", 0));
        assertThrows(IllegalArgumentException.class, () -> new Purchase("o-1", "c-1", -1));
        assertThrows(IllegalArgumentException.class, () -> new Purchase("o-1", "", 100));
    }

    @Test
    void denialAndInvalidTotalDoNotRequestWrites() {
        var ledger = new RecordingLedger();
        var useCase = new PlaceOrder(ledger);
        assertThrows(PlaceOrder.Forbidden.class,
                () -> useCase.execute(new PlaceOrder.Actor("c-1", false), new PlaceOrder.Command("o-1", 100)));
        assertThrows(PlaceOrder.Forbidden.class,
                () -> useCase.execute(null, new PlaceOrder.Command("o-1", 100)));
        assertThrows(IllegalArgumentException.class,
                () -> useCase.execute(new PlaceOrder.Actor("c-1", true), new PlaceOrder.Command("o-1", 0)));
        assertTrue(ledger.orders.isEmpty());
        assertTrue(ledger.receipts.isEmpty());
    }

    @Test
    void trustedActorOwnsTheOrderAndResultIsRepresentationIndependent() {
        var ledger = new RecordingLedger();
        var result = new PlaceOrder(ledger).execute(
                new PlaceOrder.Actor("customer-7", true), new PlaceOrder.Command("order-9", 1250));
        assertEquals(List.of(new Purchase("order-9", "customer-7", 1250)), ledger.orders);
        assertEquals(List.of("order-9"), ledger.receipts);
        assertEquals(new PlaceOrder.Result("order-9", 1250), result);
        assertEquals("order-9:1250", ReceiptViews.compact(result));
        assertEquals(new ReceiptViews.Display("order-9", "USD 12.50"), ReceiptViews.formatted(result));
        assertEquals(1250, result.totalCents());
    }

    private static final class RecordingLedger implements PlaceOrder.Ledger {
        private final List<Purchase> orders = new ArrayList<>();
        private final List<String> receipts = new ArrayList<>();

        public void insertOrder(String id, String customerId, long totalCents) {
            orders.add(new Purchase(id, customerId, totalCents));
        }

        public void insertReceipt(String id) {
            receipts.add(id);
        }
    }
}
