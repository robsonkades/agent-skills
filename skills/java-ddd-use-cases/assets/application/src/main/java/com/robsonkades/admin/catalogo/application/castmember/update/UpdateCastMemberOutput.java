package com.robsonkades.admin.catalogo.application.castmember.update;

import com.robsonkades.admin.catalogo.domain.castmember.CastMember;
import com.robsonkades.admin.catalogo.domain.castmember.CastMemberID;

public record UpdateCastMemberOutput(String id) {

    public static UpdateCastMemberOutput from(final CastMemberID anId) {
        return new UpdateCastMemberOutput(anId.getValue());
    }

    public static UpdateCastMemberOutput from(final CastMember aMember) {
        return from(aMember.getId());
    }
}
