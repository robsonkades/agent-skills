package com.robsonkades.admin.catalogo.application;

public abstract class UseCase<IN, OUT> {

    public abstract OUT execute(IN anIn);
}
