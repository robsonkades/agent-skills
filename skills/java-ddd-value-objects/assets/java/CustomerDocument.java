package com.example.domain.order;

import java.util.Objects;
import java.util.regex.Pattern;

public final class CustomerDocument {

    private static final Pattern FORMAT = Pattern.compile("DOC-[0-9]{8}");

    private final String value;

    private CustomerDocument(final String value) {
        this.value = value;
    }

    public static CustomerDocument of(final String raw) {
        Objects.requireNonNull(raw, "customer document is required");
        if (raw.length() != 12 || !FORMAT.matcher(raw).matches()) {
            throw new IllegalArgumentException("customer document must match DOC- and eight ASCII digits");
        }
        return new CustomerDocument(raw);
    }

    public String value() {
        return this.value;
    }

    @Override
    public boolean equals(final Object other) {
        return this == other
                || other instanceof CustomerDocument that && this.value.equals(that.value);
    }

    @Override
    public int hashCode() {
        return this.value.hashCode();
    }

    @Override
    public String toString() {
        return "CustomerDocument[redacted]";
    }
}
