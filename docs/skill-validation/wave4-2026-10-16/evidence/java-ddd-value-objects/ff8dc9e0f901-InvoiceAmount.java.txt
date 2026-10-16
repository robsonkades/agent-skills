package com.example.domain.order;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.Currency;
import java.util.Objects;
import java.util.Set;
import java.util.regex.Pattern;

public final class InvoiceAmount {

    private static final Pattern FORMAT = Pattern.compile("[0-9]{1,9}(?:\\.[0-9]{1,4})?");
    private static final BigDecimal MAXIMUM = new BigDecimal("999999999.99");
    private static final Set<String> CURRENCIES = Set.of("USD", "EUR");

    private final BigDecimal amount;
    private final Currency currency;

    private InvoiceAmount(final BigDecimal amount, final Currency currency) {
        this.amount = amount;
        this.currency = currency;
    }

    public static InvoiceAmount of(final String raw, final Currency currency) {
        Objects.requireNonNull(raw, "amount is required");
        Objects.requireNonNull(currency, "currency is required");
        if (raw.length() > 14 || !FORMAT.matcher(raw).matches()) {
            throw new IllegalArgumentException("amount must use the bounded decimal format");
        }
        if (!CURRENCIES.contains(currency.getCurrencyCode())) {
            throw new IllegalArgumentException("currency is not supported by this invoice contract");
        }
        return checked(new BigDecimal(raw), currency);
    }

    private static InvoiceAmount checked(final BigDecimal amount, final Currency currency) {
        final BigDecimal canonical;
        try {
            canonical = amount.setScale(2, RoundingMode.UNNECESSARY);
        } catch (final ArithmeticException error) {
            throw new IllegalArgumentException("amount must be exact at settlement scale two", error);
        }
        if (canonical.signum() < 0 || canonical.compareTo(MAXIMUM) > 0) {
            throw new IllegalArgumentException("amount is outside the invoice contract's range");
        }
        return new InvoiceAmount(canonical, currency);
    }

    public InvoiceAmount add(final InvoiceAmount other) {
        Objects.requireNonNull(other, "other amount is required");
        if (!this.currency.equals(other.currency)) {
            throw new IllegalArgumentException("addition requires the same currency");
        }
        return checked(this.amount.add(other.amount), this.currency);
    }

    public BigDecimal amount() {
        return this.amount;
    }

    public Currency currency() {
        return this.currency;
    }

    @Override
    public boolean equals(final Object other) {
        return this == other
                || other instanceof InvoiceAmount that
                && this.amount.equals(that.amount)
                && this.currency.equals(that.currency);
    }

    @Override
    public int hashCode() {
        return Objects.hash(this.amount, this.currency);
    }
}
