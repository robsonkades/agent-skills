package com.robsonkades.admin.catalogo.domain.video;

import com.robsonkades.admin.catalogo.domain.castmember.CastMemberID;
import com.robsonkades.admin.catalogo.domain.category.CategoryID;
import com.robsonkades.admin.catalogo.domain.genre.GenreID;

import java.util.Set;

public record VideoSearchQuery(
        int page,
        int perPage,
        String terms,
        String sort,
        String direction,
        Set<CastMemberID> castMembers,
        Set<CategoryID> categories,
        Set<GenreID> genres
) {
}
