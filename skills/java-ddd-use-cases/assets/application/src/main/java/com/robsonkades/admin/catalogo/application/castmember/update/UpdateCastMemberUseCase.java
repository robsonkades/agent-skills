package com.robsonkades.admin.catalogo.application.castmember.update;

import com.robsonkades.admin.catalogo.application.UseCase;

public sealed abstract class UpdateCastMemberUseCase
        extends UseCase<UpdateCastMemberCommand, UpdateCastMemberOutput>
        permits DefaultUpdateCastMemberUseCase {
}
