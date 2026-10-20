package com.robsonkades.admin.catalogo.application.castmember.create;

import com.robsonkades.admin.catalogo.application.UseCase;

public sealed abstract class CreateCastMemberUseCase
        extends UseCase<CreateCastMemberCommand, CreateCastMemberOutput>
        permits DefaultCreateCastMemberUseCase {
}
