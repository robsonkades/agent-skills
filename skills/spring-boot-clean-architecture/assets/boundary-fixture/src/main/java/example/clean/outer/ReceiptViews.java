package example.clean.outer;

import example.clean.application.PlaceOrder;
import java.math.BigDecimal;

public final class ReceiptViews {
    private ReceiptViews() {}

    public static String compact(PlaceOrder.Result result) {
        return result.id() + ":" + result.totalCents();
    }

    public static Display formatted(PlaceOrder.Result result) {
        return new Display(result.id(), "USD " + BigDecimal.valueOf(result.totalCents(), 2).toPlainString());
    }

    public record Display(String orderNumber, String amount) {}
}
