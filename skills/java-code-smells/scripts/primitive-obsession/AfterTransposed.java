// This file is expected NOT to compile. It repeats Before.java's mistake against the
// typed model: a customer id passed where the source account belongs.
public class AfterTransposed {

    record CustomerId(String value) {}

    record AccountId(String value) {}

    record Order(CustomerId customerId, AccountId sourceAccountId, AccountId destinationAccountId) {}

    static void transfer(AccountId from, AccountId to) {}

    public static void main(String[] args) {
        var order = new Order(new CustomerId("CUST-7"), new AccountId("ACCT-31"), new AccountId("ACCT-92"));
        transfer(order.customerId(), order.destinationAccountId());
    }
}
