package com.robsonkades.admin.catalogo.application.castmember.delete;

import com.robsonkades.admin.catalogo.application.UnitUseCase;

public sealed abstract class DeleteCastMemberUseCase
    extends UnitUseCase<String>
    permits DefaultDeleteCastMemberUseCase {
}
