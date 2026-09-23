// This file is expected NOT to compile. It repeats Before.java's mistake against the
// actual After.java model: a customer id passed where the source account belongs.
// Run verify.sh, which compiles After.java first and supplies its output on the class path.
import java.math.BigDecimal;
import java.util.Currency;

public class AfterTransposed {

    public static void main(String[] args) {
        var order = new After.Order(new After.CustomerId("CUST-7"),
                new After.AccountId("ACCT-31"), new After.AccountId("ACCT-92"));
        After.transfer(order.customerId(), order.destinationAccountId(),
                new After.Money(new BigDecimal("50.00"), Currency.getInstance("GBP")));
    }
}
