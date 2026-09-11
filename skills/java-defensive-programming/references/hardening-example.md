# Worked example: hardening one boundary

A refund endpoint: JSON in, refund executed against a ledger. The team, burnt by an NPE,
has been adding checks wherever the stack trace pointed.

These are partial Java 16+ sketches with omitted DTOs, ledger implementation, imports and
Spring MVC wiring. Import the used `java.math`, `java.util` and `java.util.regex` types;
put each public type in its own file. Inspect the project's actual Spring/JSON mapper
versions instead of assuming constructor failures reach an HTTP handler unwrapped.

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

The example explicitly assumes account IDs accept outer whitespace and case normalization,
and refund reasons accept outer whitespace removal. Verify this policy against the actual
contract before copying it; `Locale.ROOT` uppercasing is not an ASCII-only validation step.
Do not apply these transformations to opaque or signed identifiers.

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

Perform this conversion explicitly after DTO binding, or handle the configured mapper's
documented wrapping exceptions narrowly. Verify malformed JSON and constructor failures with
an HTTP integration test. Enforce body/nesting/numeric token limits before DTO allocation;
the shown `Money` check enforces positivity only, not currency scale, precision or maximum
refund amount. Those domain bounds require an explicit contract before adding them.

```java
// internal service — caller has established a non-null request; no repairs
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

The interior sketch assumes controlled callers always pass a non-null `RefundRequest`.
A published entry point still needs its documented null failure contract; a validated
record's components do not prevent `refund(null)`. Keep authorization and enforce the
charge-limit check atomically with posting under the ledger's concurrency protocol.

## Trade-offs

- Three small types and a parse step replace "just pass the DTO through" — more files,
  and mappers must be written where frameworks previously auto-bound. This buys its cost
  when reusable invariants or safe construction warrant those types; crossing multiple
  methods is a useful signal, not a requirement. A value used once can often be checked
  inline, and an adequate existing validated class need not become a record.
- Rejecting where the old code repaired is a behaviour change callers can feel: clients
  that relied on sign-flipping now get 400s. This example assumes that stricter contract
  is approved; inspect supported consumers and agree a transition before changing it.
  Release notes and observed rejection counts support rollout, but neither alone proves
  compatibility or identifies every affected caller.
- Bean Validation (`@NotNull`, `@Pattern`) could express the format checks
  declaratively; it validates only where the configured validator and groups run.
  Constructor checks cover paths that invoke that constructor. Java serialization invokes
  a record's canonical constructor, but skips an ordinary serializable class's constructors;
  inspect other mapper/reconstitution paths rather than generalizing from these records.
  Keep useful annotation validation for staged or aggregated boundary errors without making
  it a substitute for the completed domain invariant. Serialization hardening belongs to
  java-serialization-hardening.

## Verification

- Grep the interior for `!= null`, `requireNonNull` and default-substitution on the
  refund path: remaining occurrences must each trace to a constructor establishing its
  own invariant, a documented public-entry contract or a distinct interior invariant
  (balance, state) — not to proven-redundant component checks.
- Tests at the boundary, not per layer: `" gb82WEST12345698765432 "` normalises and
  passes; `"###"`, missing/zero/negative amount, blank/oversized/control-bearing reason each yield
  the documented field/code without echoing input—and _no_ ledger write. The negative-amount test asserts rejection, where
  the old suite asserted the sign-flip.
- Construct domain records directly to verify constructor invariants, and keep public
  null-entry tests or move equivalent coverage to the owning boundary. Delete a duplicate
  test only after tracing the same invariant and failure contract to retained coverage.

These are acceptance checks to execute on the concrete endpoint, not recorded HTTP or
ledger test results from the sketches.

For reconstruction semantics, see [Java SE 25 serialization input](https://docs.oracle.com/en/java/javase/25/docs/specs/serialization/input.html).
For validator activation and groups, see [Jakarta Validation 3.1](https://jakarta.ee/specifications/bean-validation/3.1/jakarta-validation-spec-3.1);
use the project's actual framework and version when verifying the HTTP path.
