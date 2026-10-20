package io.github.robsonkades.customer.application;

public record FieldPatch<T>(boolean present, T value) {

    public static <T> FieldPatch<T> absent() {
        return new FieldPatch<>(false, null);
    }

    public static <T> FieldPatch<T> of(T value) {
        return new FieldPatch<>(true, value);
    }
}
