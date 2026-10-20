package io.github.robsonkades.customer.application;

public record CustomerSort(String field, Direction direction) {

    public enum Direction { ASC, DESC }
}
