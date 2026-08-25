# Worked example: withdrawal against an overdraft limit

The invariant: an account's balance never falls below its negated overdraft limit.

## Before

```java
@Service
public class WithdrawalService {
    public void withdraw(AccountId id, BigDecimal amount) {
        Account acct = accounts.find(id);
        if (acct.getBalance().subtract(amount)
                .compareTo(acct.getOverdraftLimit().negate()) >= 0) {
            acct.setBalance(acct.getBalance().subtract(amount));
            accounts.save(acct);
        } else {
            throw new InsufficientFundsException(id);
        }
    }
}
```

And elsewhere, the monthly fee job:

```java
// MonthlyFeeJob — written a year later
if (acct.getBalance().compareTo(fee) >= 0) {          // forgot the overdraft limit
    acct.setBalance(acct.getBalance().subtract(fee));
}
```

## Analysis

- **The invariant lives nowhere.** `Account` will hold any balance a caller sets. The rule
  exists only in call sites that remember it — and the fee job remembers it differently:
  it refuses withdrawals the overdraft should allow. Two askers, two rules.
- **Ask–decide–mutate is a race window.** Between `getBalance()` and `setBalance(...)`
  another writer can commit; the check validates a balance that no longer exists.
- **The setter is the loophole.** Every `setBalance` in the codebase sits behind a guard;
  the guard is the real operation.
- The decision needs only `Account`'s own data — balance and limit — so it has a single
  owner. It moves.

## After: the account decides

Refusal is an expected outcome, so it is a result, not an exception; a non-positive amount
is a broken caller contract, so it throws.

```java
public final class Account {
    private BigDecimal balance;
    private final BigDecimal overdraftLimit;
    // constructor and persistence mapping elided

    public sealed interface Withdrawal permits Withdrawn, Refused {}
    public record Withdrawn(BigDecimal newBalance) implements Withdrawal {}
    public record Refused(BigDecimal shortfall) implements Withdrawal {}

    public Withdrawal withdraw(BigDecimal amount) {
        if (amount.signum() <= 0) {
            throw new IllegalArgumentException("amount must be positive: " + amount);
        }
        BigDecimal candidate = balance.subtract(amount);
        BigDecimal floor = overdraftLimit.negate();
        if (candidate.compareTo(floor) < 0) {
            return new Refused(floor.subtract(candidate).abs());
        }
        balance = candidate;
        return new Withdrawn(balance);
    }

    public BigDecimal balance() { return balance; }   // query: statements, reporting
}
```

There is no `setBalance`. The fee job calls the same `withdraw` and gets the same rule.

## What stays in the service

Orchestration — everything that is not the rule:

```java
@Service
public class WithdrawalService {
    @Transactional
    public WithdrawalReceipt withdraw(AccountId id, BigDecimal amount) {
        Account account = accounts.findById(id);
        return switch (account.withdraw(amount)) {
            case Account.Withdrawn(var newBalance) -> {
                accounts.save(account);
                events.publish(new FundsWithdrawn(id, amount));
                yield WithdrawalReceipt.approved(newBalance);
            }
            case Account.Refused(var shortfall) -> WithdrawalReceipt.refused(shortfall);
        };
    }
}
```

The switch is exhaustive over the sealed result with no `default` — adding a third outcome
to `Withdrawal` becomes a compile error here, not a silently unhandled case. Transaction
boundary, loading, saving, event publication and translation to the API shape remain
service concerns; `Account` knows none of them.

## Trade-offs

- **Concurrency is narrowed, not solved.** The in-object command removes the getter/setter
  gap in this process, but two transactions on two nodes can still both load and both
  withdraw. The persistence layer still needs optimistic locking (`@Version`) or an
  equivalent database guard. Moving the decision is not a licence to remove them.
- **New public API to keep stable.** `Withdrawal` and its two records are now a contract;
  callers pattern-match on it. Renaming a variant is a breaking change a service-local
  `if` never was.
- **`balance()` survives.** Queries are legitimate — statements and reporting need it.
  What changed is that reading the balance no longer _enables_ writing it.
- The rule is no longer visible inline in the service; the method name `withdraw` and its
  result type must carry that weight.

## Verification

- `grep` for `setBalance` — zero occurrences anywhere; the loophole is gone, not merely
  unused.
- The overdraft rule appears exactly once (search for `overdraftLimit` outside `Account`).
- `Account` tests construct the object directly and cover: withdrawal into the overdraft,
  refusal one cent past the floor, `shortfall` arithmetic, non-positive amounts throwing —
  no mocks, no Spring context.
- The fee job's tests now pass through `withdraw` and gain the overdraft case it used to
  get wrong.
- A concurrency test (two threads, one account, optimistic lock enabled) still fails one
  writer — proving the version column stayed load-bearing.
