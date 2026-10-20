package com.robsonkades.admin.catalogo.application.category.create;

import com.robsonkades.admin.catalogo.application.UseCase;
import com.robsonkades.admin.catalogo.domain.validation.handler.Notification;
import io.vavr.control.Either;

public abstract class CreateCategoryUseCase
        extends UseCase<CreateCategoryCommand, Either<Notification, CreateCategoryOutput>> {
}
