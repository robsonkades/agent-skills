package com.example.domain.order;

import java.math.BigDecimal;
import java.util.Currency;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;

public final class ValueObjectsCheck {

    private static int checks;

    private ValueObjectsCheck() {
    }

    public static void main(final String[] args) {
        final var document = CustomerDocument.of("DOC-00001234");
        final var equalDocument = CustomerDocument.of("DOC-00001234");
        final var thirdDocument = CustomerDocument.of("DOC-00001234");
        check(document != equalDocument, "equal values are independently constructed");
        check(document.equals(document), "document equality is reflexive");
        check(document.equals(equalDocument) && equalDocument.equals(document), "document equality is symmetric");
        check(equalDocument.equals(thirdDocument) && document.equals(thirdDocument), "document equality is transitive");
        check(document.hashCode() == equalDocument.hashCode(), "equal documents have equal hashes");
        check(!document.equals(null), "document does not equal null");
        check(!document.equals(document.value()), "document does not equal raw text");
        check(!document.equals(CustomerDocument.of("DOC-00001235")), "different documents differ");
        check(document.value().equals("DOC-00001234"), "leading zeroes survive");
        check(!document.toString().contains(document.value()), "document diagnostic text is redacted");
        final var documents = new HashSet<CustomerDocument>();
        documents.add(document);
        documents.add(equalDocument);
        check(documents.size() == 1 && documents.contains(thirdDocument), "document hash lookup uses value equality");
        rejects(NullPointerException.class, () -> CustomerDocument.of(null));
        for (final var invalid : List.of("", "DOC-1234", " DOC-00001234", "DOC-00001234 ",
                "doc-00001234", "DOC-0000x1234", "DOC-00001234X", "DOC00001234", "DOC-００００１２３４")) {
            rejects(IllegalArgumentException.class, () -> CustomerDocument.of(invalid));
        }

        final var usd = Currency.getInstance("USD");
        final var eur = Currency.getInstance("EUR");
        final var ten = InvoiceAmount.of("10.0", usd);
        final var equalTen = InvoiceAmount.of("10.00", usd);
        final var thirdTen = InvoiceAmount.of("010.0000", usd);
        check(ten != equalTen, "equal amounts are independently constructed");
        check(ten.equals(ten), "amount equality is reflexive");
        check(ten.equals(equalTen) && equalTen.equals(ten), "amount equality is symmetric");
        check(equalTen.equals(thirdTen) && ten.equals(thirdTen), "amount equality is transitive");
        check(ten.hashCode() == thirdTen.hashCode(), "equivalent scales have equal hashes");
        check(ten.amount().equals(new BigDecimal("10.00")), "amount has canonical scale");
        check(!ten.equals(InvoiceAmount.of("10.00", eur)), "currency participates in equality");
        check(!ten.equals(InvoiceAmount.of("10.01", usd)), "amount participates in equality");
        check(!ten.equals(null) && !ten.equals(new BigDecimal("10.00")), "amount equality rejects other types");
        final var amounts = new HashMap<InvoiceAmount, String>();
        amounts.put(ten, "found");
        check("found".equals(amounts.get(thirdTen)), "amount hash lookup preserves scale equivalence");
        final var sum = ten.add(InvoiceAmount.of("0.01", usd));
        check(sum.equals(InvoiceAmount.of("10.01", usd)), "addition preserves exact cents");
        check(ten.equals(equalTen), "addition leaves the original unchanged");
        check(InvoiceAmount.of("0", usd).amount().equals(new BigDecimal("0.00")), "zero is valid and canonical");
        check(InvoiceAmount.of("999999999.99", usd).currency().equals(usd), "upper bound is valid");
        rejects(IllegalArgumentException.class, () -> ten.add(InvoiceAmount.of("1", eur)));
        rejects(IllegalArgumentException.class, () -> InvoiceAmount.of("999999999.99", usd).add(InvoiceAmount.of("0.01", usd)));
        rejects(IllegalArgumentException.class, () -> InvoiceAmount.of("1", Currency.getInstance("JPY")));
        rejects(NullPointerException.class, () -> InvoiceAmount.of(null, usd));
        rejects(NullPointerException.class, () -> InvoiceAmount.of("1", null));
        rejects(NullPointerException.class, () -> ten.add(null));
        for (final var invalid : List.of("", "-1", "+1", " 1", "1 ", "1,00", "1e2", "NaN",
                "1.001", "1000000000", "1.00000", ".1", "1.", "１.00")) {
            rejects(IllegalArgumentException.class, () -> InvoiceAmount.of(invalid, usd));
        }
        System.out.println("Value object checks passed: " + checks);
    }

    private static void check(final boolean condition, final String message) {
        if (!condition) {
            throw new AssertionError(message);
        }
        checks++;
    }

    private static void rejects(final Class<? extends RuntimeException> expected, final Runnable action) {
        try {
            action.run();
        } catch (final RuntimeException actual) {
            if (!expected.isInstance(actual)) {
                throw new AssertionError("Expected " + expected.getSimpleName() + " but got " + actual, actual);
            }
            checks++;
            return;
        }
        throw new AssertionError("Expected " + expected.getSimpleName());
    }
}
