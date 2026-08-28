// Before: every id is a String. The call below passes a customer id where the source
// account is expected. It compiles, runs, and reports a transfer out of something that
// is not an account. Run: java Before.java
public class Before {

    record Order(String customerId, String sourceAccountId, String destinationAccountId) {}

    static String transfer(String fromAccountId, String toAccountId, long amountCents) {
        return "moved " + amountCents + " from " + fromAccountId + " to " + toAccountId;
    }

    public static void main(String[] args) {
        var order = new Order("CUST-7", "ACCT-31", "ACCT-92");

        // customerId is passed where sourceAccountId belongs. Nothing objects.
        System.out.println(transfer(order.customerId(), order.destinationAccountId(), 5_000));

        System.out.println("exit status: 0 - nothing detected this");
    }
}
