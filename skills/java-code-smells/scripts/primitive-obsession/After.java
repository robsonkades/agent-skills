// After: the two id concepts are distinct types and the amount is a conceptual whole.
// The same call Before.java executed silently is now a compile error -- see
// AfterTransposed.java. Run: java After.java
import java.math.BigDecimal;
import java.util.Currency;
import java.util.Objects;

public class After {

    // Earns its type on confusion risk alone: no rule, but it is routinely passed
    // where an AccountId is expected.
    record CustomerId(String value) {
        CustomerId {
            Objects.requireNonNull(value, "value");
        }
    }

    record AccountId(String value) {
        AccountId {
            Objects.requireNonNull(value, "value");
        }
    }

    // Earns its type on a rule (currencies must match) and a conceptual whole:
    // an amount without its currency is meaningless.
    record Money(BigDecimal amount, Currency currency) {
        Money {
            Objects.requireNonNull(amount, "amount");
            Objects.requireNonNull(currency, "currency");
        }

        Money add(Money other) {
            if (!currency.equals(other.currency)) {
                throw new IllegalArgumentException("cannot add " + other.currency + " to " + currency);
            }
            return new Money(amount.add(other.amount), currency);
        }
    }

    record Order(CustomerId customerId, AccountId sourceAccountId, AccountId destinationAccountId) {}

    static String transfer(AccountId from, AccountId to, Money amount) {
        return "moved " + amount.amount() + " " + amount.currency() + " from " + from.value() + " to " + to.value();
    }

    public static void main(String[] args) {
        var gbp = Currency.getInstance("GBP");
        var order = new Order(new CustomerId("CUST-7"), new AccountId("ACCT-31"), new AccountId("ACCT-92"));

        System.out.println(transfer(order.sourceAccountId(), order.destinationAccountId(),
                new Money(new BigDecimal("50.00"), gbp)));

        try {
            new Money(new BigDecimal("50.00"), gbp)
                    .add(new Money(new BigDecimal("50.00"), Currency.getInstance("EUR")));
        } catch (IllegalArgumentException e) {
            System.out.println("rejected: " + e.getMessage());
        }
    }
}
