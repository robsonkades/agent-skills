package com.robsonkades.admin.catalogo.application.castmember.create;

import com.robsonkades.admin.catalogo.domain.castmember.CastMemberType;

public record CreateCastMemberCommand(
        String name,
        CastMemberType type
) {

    public static CreateCastMemberCommand with(final String aName, final CastMemberType aType) {
        return new CreateCastMemberCommand(aName, aType);
    }
}
