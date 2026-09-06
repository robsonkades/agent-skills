# Worked example: withdrawal against an overdraft limit

The invariant: an account's balance never falls below its negated overdraft limit.

This is an illustrative scenario. The standalone `Account` below compiles on Java 17 with
`java.math.BigDecimal` and `java.util.Objects` imports. Service/job snippets are partial:
Spring annotations, repository/event APIs and receipt types are placeholders requiring the
project's actual framework and transaction contracts. The service switch requires Java 21.

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
if (acct.getBalance().compareTo(fee) >= 0) {          // fee policy currently excludes overdraft
    acct.setBalance(acct.getBalance().subtract(fee));
}
```

## Analysis

- **The invariant lives nowhere.** `Account` will hold any balance a caller sets. The rule
  exists only at guarded call sites. The fee job uses a different eligibility rule: this is
  drift only if fees are required to share withdrawal eligibility. Establish that requirement
  before changing fee behavior; both shown guards can preserve the balance floor.
- **Ask–decide–mutate is a race window.** Between `getBalance()` and `setBalance(...)`
  another writer can commit; the check validates a balance that no longer exists.
- **The setter is the loophole.** Every `setBalance` in the codebase sits behind a guard;
  the guard is the real operation.
- The decision needs only `Account`'s own data — balance and limit — so it has a single
  owner. It moves.

## After: the account decides

Refusal is an expected outcome, so it is a result, not an exception; a non-positive amount
is a broken caller contract, so it throws.
These are deliberate API/policy choices for the revised example. The old service threw on
insufficient funds and could accept zero/negative amounts. A mechanical refactoring should
preserve the old public mapping until callers adopt the changed contract.

```java
public final class Account {
    private BigDecimal balance;
    private final BigDecimal overdraftLimit;

    public Account(BigDecimal balance, BigDecimal overdraftLimit) {
        this.balance = Objects.requireNonNull(balance, "balance");
        this.overdraftLimit = Objects.requireNonNull(overdraftLimit, "overdraftLimit");
        if (overdraftLimit.signum() < 0 || balance.compareTo(overdraftLimit.negate()) < 0) {
            throw new IllegalArgumentException("invalid balance or overdraft limit");
        }
    }

    public sealed interface Withdrawal permits Withdrawn, Refused {}
    public record Withdrawn(BigDecimal newBalance) implements Withdrawal {}
    public record Refused(BigDecimal shortfall) implements Withdrawal {}

    public Withdrawal withdraw(BigDecimal amount) {
        Objects.requireNonNull(amount, "amount");
        if (amount.signum() <= 0) {
            throw new IllegalArgumentException("amount must be positive: " + amount);
        }
        BigDecimal candidate = balance.subtract(amount);
        BigDecimal floor = overdraftLimit.negate();
        if (candidate.compareTo(floor) < 0) {
            return new Refused(floor.subtract(candidate));
        }
        balance = candidate;
        return new Withdrawn(balance);
    }

    public BigDecimal balance() { return balance; }   // query: statements, reporting
}
```

This mutable class is thread-confined; sharing an instance requires synchronization around all
related reads/writes. It intentionally models only amount arithmetic; currency and scale must
come from the enclosing contract or a money value type. It is a domain class, not a portable
JPA entity definition: use provider-compatible mapping without bypassing invariant checks.

There is no `setBalance`. Do not automatically route the fee job through `withdraw`: fees may
have different overdraft, grace-period or regulatory rules. Share a private invariant-preserving
debit primitive or model a separate `chargeFee` command only after those product semantics are
explicit; merely reusing a method is not domain consistency.

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

The switch is exhaustive over the sealed result with no `default` — recompiling after adding a
third outcome finds the source sites that need policy. An independently deployed old binary may
instead encounter `MatchException`, so use versioned deployment/compatibility discipline rather
than treating source exhaustiveness as runtime forward compatibility. Transaction boundary,
loading, saving, event publication and translation to the API shape remain service concerns;
`Account` knows none of them.

`@Transactional` covers only enlisted resources. It does not make `events.publish(...)` and the
database commit atomic. Persist an outbox record in the same transaction and publish it
idempotently, or define another recovery protocol; otherwise a crash can lose the event or a
retry can duplicate it.

## Trade-offs

- **Concurrency needs explicit control.** An unsynchronized command can race even on one
  shared instance. Confine it to one owner/transaction; independent transactions can still load
  and withdraw the same version, so persistence needs optimistic locking (`@Version`) or an
  equivalent guard. A failed save/commit does not undo an ordinary object's in-memory mutation:
  discard/reload that state before a retry, and re-evaluate against authoritative data.
- **Money is not just `BigDecimal`.** Production code must bind amount to currency, define scale
  and rounding, reject nulls and unsupported currency combinations, and decide whether returned
  balances are immutable snapshots or versioned representations.
- **New public API to keep stable.** `Withdrawal` and its two records are now a contract;
  callers pattern-match on it. Renaming a variant is a breaking change a service-local
  `if` never was.
- **`balance()` survives.** Queries are legitimate — statements and reporting need it.
  What changed is that reading the balance no longer _enables_ writing it.
- The rule is no longer visible inline in the service; the method name `withdraw` and its
  result type must carry that weight.

## Verification

- Use `rg` for raw mutation paths and inspect construction/mapping/SQL updates; zero setters
  alone cannot prove the invariant. Keep necessary database constraints and boundary enforcement.
- Check that external callers no longer rederive withdrawal eligibility; reporting reads of
  the overdraft limit are legitimate and are not duplicate policy by themselves.
- `Account` tests construct the object directly and cover: withdrawal into the overdraft,
  refusal one cent past the floor, `shortfall` arithmetic, non-positive amounts throwing —
  no mocks, no Spring context.
- Fee tests exercise their explicitly chosen `chargeFee`/debit policy, including whether fees may
  consume overdraft; they do not inherit withdrawal semantics accidentally.
- An integration test uses two distinct persistence contexts/transactions (or concurrent
  conditional updates) so both writers load the same version and exactly one commit succeeds.
  Two threads sharing one managed entity do not prove database optimistic locking.

The concurrency distinction follows [JLS 21 happens-before](https://docs.oracle.com/javase/specs/jls/se21/html/jls-17.html#jls-17.4.5).
For an actual JPA adapter, check its version's optimistic-lock/rollback behavior against the
[Jakarta Persistence specification](https://jakarta.ee/specifications/persistence/3.2/jakarta-persistence-spec-3.2.html);
this domain-only example does not validate an ORM or event-delivery protocol.
