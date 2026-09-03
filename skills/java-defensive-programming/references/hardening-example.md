# Worked example: hardening one boundary

A refund endpoint: JSON in, refund executed against a ledger. The team, burnt by an NPE,
has been adding checks wherever the stack trace pointed.

## Before

```java
// controller
public ResponseEntity<?> refund(@RequestBody RefundDto dto) {
    if (dto == null || dto.account() == null) return ResponseEntity.badRequest().build();
    return ResponseEntity.ok(refundService.refund(dto));
}

// service
public Receipt refund(RefundDto dto) {
    if (dto == null) throw new IllegalArgumentException("dto");
    String account = dto.account() == null ? "" : dto.account().trim();
    BigDecimal amount = dto.amount() == null ? BigDecimal.ZERO : dto.amount();
    if (amount.compareTo(BigDecimal.ZERO) < 0) amount = amount.negate(); // "fix" sign
    return ledger.post(account, amount, dto.reason());
}

// ledger
public Receipt post(String account, BigDecimal amount, String reason) {
    if (account == null) throw new NullPointerException("account");
    if (amount == null) amount = BigDecimal.ZERO;
    ...
}
```

## Analysis

Every layer defends, yet nothing is defended:

- The null checks are triplicated, so no reader can say which one is authoritative — and
  none checks what matters. An account of `"###"` or a refund of `0.00` passes all three
  layers.
- The service **silently corrects meaning twice**: a missing amount becomes `ZERO` (a
  refund of nothing, reported as success) and a negative amount is sign-flipped —
  converting a caller's bug (or an attack) into a plausible-looking transaction.
- `reason` is never checked anywhere: the one unguarded field is invisible amid nine
  guards.
- The real boundary — the deserialised DTO — is crossed unvalidated; validation is
  smeared across the interior instead.

## After

One boundary, one parse, proof-carrying types. Input failures expose stable field/code metadata,
not raw values or internal exception messages:

```java
public final class RefundInputException extends IllegalArgumentException {
    private final String field;
    private final String code;

    public RefundInputException(String field, String code) {
        super(field + ": " + code);
        this.field = field;
        this.code = code;
    }

    public String field() { return field; }
    public String code() { return code; }
}
```

```java
public record AccountId(String value) {
    private static final Pattern SHAPE = Pattern.compile("[A-Z]{2}\\d{2}[A-Z0-9]{1,30}");

    public AccountId {
        if (value == null) throw new RefundInputException("account", "required");
        if (!SHAPE.matcher(value).matches()) {
            throw new RefundInputException("account", "malformed");
        }
    }

    public static AccountId parse(String raw) {
        if (raw == null) throw new RefundInputException("account", "required");
        if (raw.length() > 128) throw new RefundInputException("account", "too_long");
        return new AccountId(raw.strip().toUpperCase(Locale.ROOT));
    }
}
```

The regex is illustrative shape-checking only — a real IBAN validator adds per-country
lengths and the ISO 7064 mod-97 check digits. The point here is where the check lives,
not its completeness.

```java

public record Money(BigDecimal amount, Currency currency) {
    public Money {
        if (amount == null) throw new RefundInputException("amount", "required");
        if (currency == null) throw new RefundInputException("currency", "required");
        if (amount.signum() <= 0) {
            throw new RefundInputException("amount", "must_be_positive");
        }
    }
}

public record RefundRequest(AccountId account, Money amount, String reason) {
    public RefundRequest {
        if (account == null) throw new RefundInputException("account", "required");
        if (amount == null) throw new RefundInputException("amount", "required");
        if (reason == null) throw new RefundInputException("reason", "required");
        if (reason.length() > 1_000) throw new RefundInputException("reason", "too_long");
        reason = reason.strip();
        if (reason.isEmpty()) {
            throw new RefundInputException("reason", "must_not_be_blank");
        }
        if (reason.codePoints().anyMatch(Character::isISOControl)) {
            throw new RefundInputException("reason", "contains_control_character");
        }
    }
}
```

The controller converts DTO → `RefundRequest`; its boundary handler maps only
`RefundInputException` to a documented 400 body containing `field`, `code` and a correlation id.
Unexpected `IllegalArgumentException`/`NullPointerException` elsewhere remain defects (500), and
raw values/stack traces stay internal. Then the interior sheds its armour:

```java
// service — no null checks, no repairs
public Receipt refund(RefundRequest request) {
    return ledger.post(request);
}

// ledger — trusts the type; checks only ITS OWN invariant, which no boundary covered
public Receipt post(RefundRequest request) {
    if (exceedsOriginalCharge(request)) {
        throw new RefundExceedsChargeException(request.account(), request.amount());
    }
    ...
}
```

The deleted lines are the point of the exercise: seven null/repair checks removed, one
new check added (`reason` blank) that the noise had hidden, and two silent corrections
replaced by rejections.

## Trade-offs

- Three small types and a parse step replace "just pass the DTO through" — more files,
  and mappers must be written where frameworks previously auto-bound. This buys its cost
  only when the data crosses more than one method; a value used once in the controller
  can be checked inline.
- Rejecting where the old code repaired is a behaviour change callers can feel: clients
  that relied on sign-flipping now get 400s. That surfacing is intended, but it belongs
  in the change log, and a metrics count of new 400s for a release cycle tells you who
  was relying on the repair.
- Bean Validation (`@NotNull`, `@Pattern`) could express the format checks
  declaratively; it validates only where a validator runs, while the constructor
  validates on every construction path (tests, message consumers, batch jobs). The
  constructor is the stronger guarantee; use annotations as well when you want
  aggregated field errors in the 400 body.

## Verification

- Grep the interior for `!= null`, `requireNonNull` and default-substitution on the
  refund path: remaining occurrences must each trace to a constructor establishing its
  own invariant or to a distinct interior invariant (balance, state) — not to re-checks
  of the boundary.
- Tests at the boundary, not per layer: `" gb82WEST12345698765432 "` normalises and
  passes; `"###"`, missing/zero/negative amount, blank/oversized/control-bearing reason each yield
  the documented field/code without echoing input—and _no_ ledger write. The negative-amount test asserts rejection, where
  the old suite asserted the sign-flip.
- The interior tests construct `RefundRequest` directly and no longer test null
  permutations — deleted tests are evidence of deleted noise, not lost coverage.
